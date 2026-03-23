const { readTrackedPicks, writeTrackedPicks } = require('./storage');
const { normalizeText } = require('../utils/helpers');
const { fetchMatches } = require('./dataService');
const { getTopSelectionFromModel, bestOutcomeOdds } = require('./analysisService');

let trackedPicks = readTrackedPicks();

function resolveSelectionResult(entry, match) {
  const homeGoals = Number(match?.score?.fullTime?.home ?? match?.score?.fullTime?.homeTeam ?? 0);
  const awayGoals = Number(match?.score?.fullTime?.away ?? match?.score?.fullTime?.awayTeam ?? 0);
  let status = 'OPEN';
  if (entry.marketType === '1X2') {
    if (entry.selection === 'Casa') status = homeGoals > awayGoals ? 'WIN' : 'LOSS';
    else if (entry.selection === 'Empate') status = homeGoals === awayGoals ? 'WIN' : 'LOSS';
    else if (entry.selection === 'Fora') status = awayGoals > homeGoals ? 'WIN' : 'LOSS';
  } else if (entry.marketType === 'Gols') {
    const total = homeGoals + awayGoals;
    if (entry.selection === 'Over 2.5') status = total > 2.5 ? 'WIN' : 'LOSS';
    else if (entry.selection === 'Under 2.5') status = total < 2.5 ? 'WIN' : 'LOSS';
  } else if (entry.marketType === 'BTTS') {
    const both = homeGoals > 0 && awayGoals > 0;
    if (entry.selection === 'Sim') status = both ? 'WIN' : 'LOSS';
    else status = both ? 'LOSS' : 'WIN';
  }
  // Use 'resultadoFinal' (not 'finalScore') to avoid overwriting the motor's numeric finalScore
  return { status, resultadoFinal: `${homeGoals}x${awayGoals}`, homeGoals, awayGoals };
}

async function settleTrackedPicks() {
  const openEntries = trackedPicks.filter((item) => item.status === 'OPEN');
  if (!openEntries.length) return trackedPicks;
  const competitionCodes = [...new Set(openEntries.map((item) => item.competition || 'BSA'))];
  for (const code of competitionCodes) {
    const finished = await fetchMatches({ competitionCode: code, status: 'FINISHED' });
    const finishedMatches = finished.matches || [];
    trackedPicks = trackedPicks.map((entry) => {
      if (entry.status !== 'OPEN' || (entry.competition || 'BSA') !== code) return entry;
      const match = finishedMatches.find((m) => normalizeText(m.homeTeam?.name || m.home_team) === normalizeText(entry.homeTeam) && normalizeText(m.awayTeam?.name || m.away_team) === normalizeText(entry.awayTeam));
      if (!match) return entry;
      return { ...entry, ...resolveSelectionResult(entry, match), finishedAt: match.utcDate || new Date().toISOString(), source: finished.source || 'api' };
    });
  }
  writeTrackedPicks(trackedPicks);
  return trackedPicks;
}

function listTracked({ competition, status } = {}) {
  let items = [...trackedPicks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (competition) items = items.filter((item) => item.competition === competition);
  if (status) items = items.filter((item) => item.status === status);
  return items;
}

function getSummary() {
  const items = [...trackedPicks];
  const settled = items.filter((item) => ['WIN', 'LOSS'].includes(item.status));
  const wins = settled.filter((item) => item.status === 'WIN').length;
  const losses = settled.filter((item) => item.status === 'LOSS').length;
  const open = items.filter((item) => item.status === 'OPEN').length;
  const hitRate = settled.length ? +((wins / settled.length) * 100).toFixed(2) : 0;
  return { total: items.length, open, wins, losses, settled: settled.length, hitRate };
}

function trackEntry(payload) {
  const { competition = 'BSA', homeTeam, awayTeam, matchDate, marketType = '1X2', selection, probReal, odd, casa, edge, finalScore, source = 'manual' } = payload;
  const duplicate = trackedPicks.find((item) => item.competition === competition && item.homeTeam === homeTeam && item.awayTeam === awayTeam && item.marketType === marketType && item.selection === selection && item.status === 'OPEN');
  if (duplicate) return { duplicate: true, item: duplicate };
  const entry = {
    id: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    competition,
    homeTeam,
    awayTeam,
    matchDate: matchDate || null,
    marketType,
    selection,
    probReal: Number(probReal || 0),
    odd: odd ? Number(odd) : null,
    casa: casa || null,
    edge: edge ? Number(edge) : null,
    // finalScore persisted for future correlation analysis (quality of reading vs actual result)
    // null for picks registered before this change — backward compatible
    finalScore: finalScore != null ? Number(finalScore) : null,
    status: 'OPEN',
    source,
    createdAt: new Date().toISOString(),
  };
  trackedPicks.unshift(entry);
  writeTrackedPicks(trackedPicks);
  return { duplicate: false, item: entry };
}

function trackFavorite({ competition = 'BSA', homeTeam, awayTeam, matchDate, model, casas }) {
  const favorite = getTopSelectionFromModel(model);
  const best = favorite.selection === 'Casa' ? bestOutcomeOdds(casas, 'h2h', 'casa') : favorite.selection === 'Empate' ? bestOutcomeOdds(casas, 'h2h', 'empate') : bestOutcomeOdds(casas, 'h2h', 'fora');
  return trackEntry({ competition, homeTeam, awayTeam, matchDate, marketType: favorite.marketType, selection: favorite.selection, probReal: favorite.probReal, odd: best?.odd || null, casa: best?.casa || null, edge: best?.odd ? +(favorite.probReal - (100 / best.odd)).toFixed(2) : null, source: 'favorite' });
}



function summarizeBucket(items, labelKey, labelValue) {
  const settled = items.filter((item) => ['WIN', 'LOSS'].includes(item.status));
  const wins = settled.filter((item) => item.status === 'WIN').length;
  const losses = settled.filter((item) => item.status === 'LOSS').length;
  return {
    [labelKey]: labelValue,
    total: items.length,
    settled: settled.length,
    open: items.filter((item) => item.status === 'OPEN').length,
    wins,
    losses,
    hitRate: settled.length ? +((wins / settled.length) * 100).toFixed(2) : 0,
  };
}

function getPerformance() {
  const items = [...trackedPicks];
  const settled = items.filter((item) => ['WIN', 'LOSS'].includes(item.status));
  const sortedSettled = [...settled].sort((a, b) => new Date(a.finishedAt || a.createdAt) - new Date(b.finishedAt || b.createdAt));
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let bestWinStreak = 0;
  let bestLossStreak = 0;

  sortedSettled.forEach((item) => {
    if (item.status === 'WIN') {
      currentWinStreak += 1;
      currentLossStreak = 0;
      bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
    } else {
      currentLossStreak += 1;
      currentWinStreak = 0;
      bestLossStreak = Math.max(bestLossStreak, currentLossStreak);
    }
  });

  const byCompetition = Object.entries(items.reduce((acc, item) => {
    const key = item.competition || 'OUTROS';
    (acc[key] ||= []).push(item);
    return acc;
  }, {})).map(([competition, list]) => summarizeBucket(list, 'competition', competition)).sort((a, b) => b.hitRate - a.hitRate || b.settled - a.settled);

  const byMarket = Object.entries(items.reduce((acc, item) => {
    const key = item.marketType || 'Geral';
    (acc[key] ||= []).push(item);
    return acc;
  }, {})).map(([marketType, list]) => summarizeBucket(list, 'marketType', marketType)).sort((a, b) => b.hitRate - a.hitRate || b.settled - a.settled);

  const recentSettled = [...sortedSettled].reverse().slice(0, 12).map((item) => ({
    id: item.id,
    label: `${item.homeTeam} x ${item.awayTeam}`,
    competition: item.competition,
    marketType: item.marketType,
    selection: item.selection,
    status: item.status,
    finishedAt: item.finishedAt || item.createdAt,
    probReal: item.probReal || 0,
    edge: item.edge || 0,
  }));

  const closed1x2 = settled.filter((item) => item.marketType === '1X2');
  const highConfidence = settled.filter((item) => Number(item.probReal || 0) >= 70);
  const highEdge = settled.filter((item) => Number(item.edge || 0) >= 4);
  const highConfidenceWins = highConfidence.filter((item) => item.status === 'WIN').length;
  const highEdgeWins = highEdge.filter((item) => item.status === 'WIN').length;
  const latestClosed = recentSettled[0] || null;
  const bestCompetition = byCompetition.find((item) => item.settled > 0) || null;
  const weakestCompetition = [...byCompetition].reverse().find((item) => item.settled > 0) || null;
  const bestMarket = byMarket.find((item) => item.settled > 0) || null;
  const weakestMarket = [...byMarket].reverse().find((item) => item.settled > 0) || null;

  const systemInsights = {
    strongestArea: bestCompetition
      ? `${bestCompetition.competition} lidera com ${bestCompetition.hitRate}% de acerto.`
      : 'Ainda sem base fechada suficiente por campeonato.',
    strongestMarket: bestMarket
      ? `${bestMarket.marketType} está com ${bestMarket.hitRate}% de acerto.`
      : 'Ainda sem base fechada suficiente por mercado.',
    cautionArea: weakestCompetition && weakestCompetition.hitRate < 50
      ? `${weakestCompetition.competition} pede cautela com ${weakestCompetition.hitRate}% de acerto.`
      : 'Nenhum campeonato entrou em zona crítica até aqui.',
    confidenceRead: highConfidence.length
      ? `Picks com 70%+ de probabilidade fecharam em ${((highConfidenceWins / highConfidence.length) * 100).toFixed(1)}% de acerto.`
      : 'Ainda não há amostra suficiente de picks com confiança alta.',
    valueRead: highEdge.length
      ? `Picks com edge 4%+ fecharam em ${((highEdgeWins / highEdge.length) * 100).toFixed(1)}% de acerto.`
      : 'Ainda não há amostra suficiente de picks com edge alto.',
  };

  const comparisonBoard = {
    latestClosed,
    bestCompetition,
    weakestCompetition,
    bestMarket,
    weakestMarket,
    confidenceBucket: {
      total: highConfidence.length,
      wins: highConfidenceWins,
      hitRate: highConfidence.length ? +((highConfidenceWins / highConfidence.length) * 100).toFixed(2) : 0,
    },
    valueBucket: {
      total: highEdge.length,
      wins: highEdgeWins,
      hitRate: highEdge.length ? +((highEdgeWins / highEdge.length) * 100).toFixed(2) : 0,
    },
    oneXtwoBucket: {
      total: closed1x2.length,
      wins: closed1x2.filter((item) => item.status === 'WIN').length,
      hitRate: closed1x2.length ? +((closed1x2.filter((item) => item.status === 'WIN').length / closed1x2.length) * 100).toFixed(2) : 0,
    },
  };

  return {
    overview: getSummary(),
    byCompetition,
    byMarket,
    streaks: {
      currentWinStreak,
      currentLossStreak,
      bestWinStreak,
      bestLossStreak,
    },
    recentSettled,
    systemInsights,
    comparisonBoard,
  };
}

function removeEntry(id) {
  const before = trackedPicks.length;
  trackedPicks = trackedPicks.filter((item) => item.id !== id);
  writeTrackedPicks(trackedPicks);
  return before - trackedPicks.length;
}

module.exports = {
  settleTrackedPicks,
  listTracked,
  getSummary,
  getPerformance,
  trackEntry,
  trackFavorite,
  removeEntry,
};
