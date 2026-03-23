const axios = require('axios');
const { FD_URL, ODDS_URL, BOOKMAKERS, BM_KEYS, COMPETITIONS, TTL } = require('../config/constants');
const { getCache, setCache } = require('./cacheService');
const { normalizeText } = require('../utils/helpers');
const { modelFromStandings, calcValueBets, findArbitrage, deriveConfidenceScore, buildProbabilityExplanation, buildOpportunityScore, buildHumanVerdict, buildDecisionEngine } = require('./analysisService');
const { state: runtimeState } = require('./runtimeService');
const { getPreMatchIntel } = require('./preMatchIntelService');

const lineHistory = new Map();
let runtime = runtimeState;

function bindRuntime(rt) {
  runtime = rt;
}

function getCompetition(code = 'BSA') {
  return COMPETITIONS[code] || COMPETITIONS.BSA;
}

function getRuntimeKeys() {
  return runtime?.keys || runtimeState?.keys || {};
}

function getFDHeaders() {
  return { 'X-Auth-Token': getRuntimeKeys().footballDataKey };
}

function recordLineMovement(key, casas) {
  const history = lineHistory.get(key) || [];
  history.push({ timestamp: Date.now(), casas: JSON.parse(JSON.stringify(casas)) });
  if (history.length > 20) history.shift();
  lineHistory.set(key, history);
}

function getLineMovement(key) {
  return lineHistory.get(key) || [];
}

function extractTotals25(market) {
  if (!market?.outcomes) return null;
  const selection = market.outcomes.filter((o) => Number(o.point) === 2.5 || o.description === '2.5' || o.name?.includes('2.5'));
  const over = selection.find((o) => normalizeText(o.name).includes('over')) || selection.find((o) => normalizeText(o.name).includes('mais'));
  const under = selection.find((o) => normalizeText(o.name).includes('under')) || selection.find((o) => normalizeText(o.name).includes('menos'));
  if (!over && !under) return null;
  return { over: over?.price || null, under: under?.price || null };
}

function extractBTTS(market) {
  if (!market?.outcomes) return null;
  const sim = market.outcomes.find((o) => ['yes', 'sim'].includes(normalizeText(o.name)));
  const nao = market.outcomes.find((o) => ['no', 'nao'].includes(normalizeText(o.name)));
  if (!sim && !nao) return null;
  return { sim: sim?.price || null, nao: nao?.price || null };
}

function normalizeGame(jogo) {
  const casas = {};
  (jogo.bookmakers || []).forEach((bm) => {
    const meta = BOOKMAKERS.find((b) => b.key === bm.key);
    const h2h = bm.markets?.find((m) => m.key === 'h2h');
    const totals25Raw = bm.markets?.find((m) => m.key === 'totals');
    const bttsRaw = bm.markets?.find((m) => m.key === 'btts');
    casas[bm.key] = {
      nome: meta?.nome || bm.title || bm.key,
      cor: meta?.cor || '#7dd3fc',
      h2h: {
        casa: h2h?.outcomes?.find((o) => o.name === jogo.home_team)?.price || null,
        empate: h2h?.outcomes?.find((o) => normalizeText(o.name) === 'draw')?.price || null,
        fora: h2h?.outcomes?.find((o) => o.name === jogo.away_team)?.price || null,
      },
      totals25: extractTotals25(totals25Raw) || { over: null, under: null },
      btts: extractBTTS(bttsRaw) || { sim: null, nao: null },
    };
  });
  return { id: jogo.id, mandante: jogo.home_team, visitante: jogo.away_team, inicio: jogo.commence_time, casas };
}

function buildMockStandings(code) {
  const names = {
    BSA: ['Palmeiras', 'Flamengo', 'Atlético-MG', 'Grêmio', 'São Paulo', 'Fluminense'],
    BSB: ['Santos', 'Ceará', 'Sport', 'Goiás', 'Avaí', 'Coritiba'],
    CLI: ['River Plate', 'Boca Juniors', 'Flamengo', 'Palmeiras', 'Peñarol', 'Nacional'],
    PL: ['Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Tottenham', 'Newcastle'],
    PD: ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Girona', 'Real Sociedad', 'Sevilla'],
    CL: ['Real Madrid', 'Bayern', 'Manchester City', 'PSG', 'Inter', 'Arsenal'],
  }[code] || ['Time A', 'Time B', 'Time C', 'Time D'];

  return {
    competition: getCompetition(code),
    standings: [{ type: 'TOTAL', table: names.map((name, index) => ({ position: index + 1, team: { id: 1000 + index, name }, playedGames: 10, won: Math.max(2, 7 - index), draw: 1 + (index % 3), lost: index % 3, goalsFor: 18 - index, goalsAgainst: 7 + index, goalDifference: (18 - index) - (7 + index), points: 20 - index * 2 })) }],
    source: 'mock',
  };
}

function buildMockMatches(code, status = 'SCHEDULED') {
  const table = buildMockStandings(code).standings[0].table;
  if (status === 'FINISHED') {
    return {
      competition: getCompetition(code),
      matches: [
        { id: 1, status: 'FINISHED', utcDate: new Date(Date.now() - 86400000).toISOString(), homeTeam: table[0].team, awayTeam: table[3].team, matchday: 10, score: { fullTime: { home: 2, away: 0 } } },
        { id: 2, status: 'FINISHED', utcDate: new Date(Date.now() - 2 * 86400000).toISOString(), homeTeam: table[1].team, awayTeam: table[4].team, matchday: 10, score: { fullTime: { home: 1, away: 1 } } },
      ],
      source: 'mock',
    };
  }
  return {
    competition: getCompetition(code),
    matches: [
      { id: 1, status: 'SCHEDULED', utcDate: new Date(Date.now() + 86400000).toISOString(), homeTeam: table[0].team, awayTeam: table[3].team, matchday: 11 },
      { id: 2, status: 'SCHEDULED', utcDate: new Date(Date.now() + 2 * 86400000).toISOString(), homeTeam: table[1].team, awayTeam: table[4].team, matchday: 11 },
      { id: 3, status: 'SCHEDULED', utcDate: new Date(Date.now() + 3 * 86400000).toISOString(), homeTeam: table[2].team, awayTeam: table[5].team, matchday: 11 },
    ],
    source: 'mock',
  };
}

function buildMockTeamMatches(teamId, teamName) {
  return {
    matches: Array.from({ length: 6 }).map((_, i) => ({ id: Number(`${teamId}${i + 1}`), status: 'FINISHED', utcDate: new Date(Date.now() - (i + 1) * 86400000).toISOString(), homeTeam: { id: teamId, name: teamName }, awayTeam: { id: 9000 + i, name: `Adversário ${i + 1}` }, score: { fullTime: { home: Math.max(0, 2 - (i % 2)), away: i % 2 } } })),
    source: 'mock',
  };
}

function buildMockOdds(home, away) {
  const casas = {};
  BOOKMAKERS.forEach((bm, index) => {
    casas[bm.key] = {
      nome: bm.nome,
      cor: bm.cor,
      h2h: { casa: +(1.8 + index * 0.04).toFixed(2), empate: +(3.3 + index * 0.05).toFixed(2), fora: +(4.2 - index * 0.08).toFixed(2) },
      totals25: { over: +(1.75 + index * 0.03).toFixed(2), under: +(2.05 + index * 0.04).toFixed(2) },
      btts: { sim: +(1.9 + index * 0.03).toFixed(2), nao: +(1.95 + index * 0.03).toFixed(2) },
    };
  });
  return { found: true, mandante: home, visitante: away, casas, source: 'mock' };
}

function getMatchTimestamp(match) {
  const raw = match?.utcDate || match?.commence_time || match?.data || null;
  const ts = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function sortRoundGames(a, b) {
  return (getMatchTimestamp(a) - getMatchTimestamp(b))
    || ((b.decisionEngine?.finalScore || b.opportunityScore || 0) - (a.decisionEngine?.finalScore || a.opportunityScore || 0))
    || ((b.destaqueValue?.edge || 0) - (a.destaqueValue?.edge || 0));
}

function buildRoundSelection(matches = []) {
  const now = Date.now();
  const activeStatuses = ['SCHEDULED', 'TIMED', 'LIVE', 'IN_PLAY', 'PAUSED'];
  const schedulable = (matches || [])
    .filter((match) => !['CANCELLED', 'POSTPONED', 'SUSPENDED'].includes(String(match?.status || '').toUpperCase()))
    .filter((match) => Number.isFinite(getMatchTimestamp(match)))
    .sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b));

  if (!schedulable.length) {
    return {
      selected: [],
      others: [],
      roundInfo: {
        mode: 'empty',
        matchday: null,
        label: 'Sem jogos próximos',
        startDate: null,
        endDate: null,
      },
    };
  }

  const liveMatches = schedulable.filter((match) => ['LIVE', 'IN_PLAY', 'PAUSED'].includes(String(match?.status || '').toUpperCase()));
  const nearWindow = schedulable.filter((match) => {
    const ts = getMatchTimestamp(match);
    return ts >= (now - 36 * 60 * 60 * 1000) && ts <= (now + 5 * 24 * 60 * 60 * 1000);
  });
  const upcoming = schedulable.filter((match) => activeStatuses.includes(String(match?.status || '').toUpperCase()) && getMatchTimestamp(match) >= (now - 6 * 60 * 60 * 1000));

  const anchor = liveMatches[0] || nearWindow[0] || upcoming[0] || schedulable[0];
  const anchorTs = getMatchTimestamp(anchor);
  const anchorMatchday = Number.isFinite(Number(anchor?.matchday)) ? Number(anchor.matchday) : null;
  const clusterStart = startOfDay(anchorTs - 36 * 60 * 60 * 1000);
  const clusterEnd = endOfDay(anchorTs + 4 * 24 * 60 * 60 * 1000);

  let selected = [];
  if (anchorMatchday !== null) {
    selected = schedulable
      .filter((match) => Number(match?.matchday) === anchorMatchday)
      .filter((match) => {
        const ts = getMatchTimestamp(match);
        return ts >= clusterStart && ts <= clusterEnd;
      });
  }

  if (!selected.length) {
    selected = schedulable.filter((match) => {
      const ts = getMatchTimestamp(match);
      return ts >= clusterStart && ts <= clusterEnd;
    });
  }

  if (!selected.length) {
    const fallbackStart = startOfDay(anchorTs);
    const fallbackEnd = endOfDay(anchorTs + 3 * 24 * 60 * 60 * 1000);
    selected = schedulable.filter((match) => {
      const ts = getMatchTimestamp(match);
      return ts >= fallbackStart && ts <= fallbackEnd;
    });
  }

  selected = [...selected].sort(sortRoundGames);
  const selectedIds = new Set(selected.map((match) => match.id));
  const others = schedulable.filter((match) => !selectedIds.has(match.id));
  const startDate = selected.length ? new Date(Math.min(...selected.map(getMatchTimestamp))).toISOString() : null;
  const endDate = selected.length ? new Date(Math.max(...selected.map(getMatchTimestamp))).toISOString() : null;
  const hasRecent = selected.some((match) => getMatchTimestamp(match) < now);

  return {
    selected,
    others,
    roundInfo: {
      mode: anchorMatchday !== null ? 'matchday' : 'window',
      matchday: anchorMatchday,
      label: anchorMatchday !== null ? `${hasRecent ? 'Rodada ativa' : 'Próxima rodada'} ${anchorMatchday}` : (hasRecent ? 'Rodada ativa' : 'Próxima janela'),
      startDate,
      endDate,
      anchorDate: anchor?.utcDate || anchor?.commence_time || null,
    },
  };
}

async function fetchStandings(competitionCode = 'BSA') {
  const competition = getCompetition(competitionCode);
  const cKey = `standings-${competition.code}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  if (getRuntimeKeys().footballDataKey === 'SUA_CHAVE_FOOTBALL_DATA') {
    const mock = buildMockStandings(competition.code); setCache(cKey, mock, TTL.standings); return mock;
  }
  try {
    const { data } = await axios.get(`${FD_URL}/competitions/${competition.code}/standings`, { headers: getFDHeaders() });
    setCache(cKey, data, TTL.standings); return data;
  } catch {
    const mock = buildMockStandings(competition.code); setCache(cKey, mock, TTL.standings); return mock;
  }
}

async function fetchMatches({ competitionCode = 'BSA', status } = {}) {
  const competition = getCompetition(competitionCode);
  const cKey = `matches-${competition.code}-${status || 'all'}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  if (getRuntimeKeys().footballDataKey === 'SUA_CHAVE_FOOTBALL_DATA') {
    const mock = buildMockMatches(competition.code, status); setCache(cKey, mock, TTL.matches); return mock;
  }
  try {
    const { data } = await axios.get(`${FD_URL}/competitions/${competition.code}/matches`, { headers: getFDHeaders(), params: status ? { status } : undefined });
    setCache(cKey, data, TTL.matches); return data;
  } catch {
    const mock = buildMockMatches(competition.code, status); setCache(cKey, mock, TTL.matches); return mock;
  }
}

async function fetchTeamMatches(teamId, teamName = 'Time') {
  const cKey = `team-${teamId}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  if (getRuntimeKeys().footballDataKey === 'SUA_CHAVE_FOOTBALL_DATA') {
    const mock = buildMockTeamMatches(teamId, teamName); setCache(cKey, mock, TTL.teamMatches); return mock;
  }
  try {
    const { data } = await axios.get(`${FD_URL}/teams/${teamId}/matches`, { headers: getFDHeaders(), params: { status: 'FINISHED', limit: 6 } });
    setCache(cKey, data, TTL.teamMatches); return data;
  } catch {
    const mock = buildMockTeamMatches(teamId, teamName); setCache(cKey, mock, TTL.teamMatches); return mock;
  }
}

async function fetchOddsByCompetition(competitionCode = 'BSA') {
  const competition = getCompetition(competitionCode);
  const cKey = `odds-${competition.code}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  if (!competition.oddsSportKey || getRuntimeKeys().oddsApiKey === 'SUA_CHAVE_ODDS_API') {
    const fallback = { source: 'mock', games: [] }; setCache(cKey, fallback, TTL.odds); return fallback;
  }
  try {
    const { data } = await axios.get(`${ODDS_URL}/sports/${competition.oddsSportKey}/odds`, { params: { apiKey: getRuntimeKeys().oddsApiKey, regions: 'eu,uk,us', markets: 'h2h,totals,btts', bookmakers: BM_KEYS, oddsFormat: 'decimal' } });
    const payload = { source: 'api', games: data.map(normalizeGame) };
    setCache(cKey, payload, TTL.odds); return payload;
  } catch {
    const fallback = { source: 'mock', games: [] }; setCache(cKey, fallback, TTL.odds); return fallback;
  }
}

async function fetchOddsMatch({ competitionCode = 'BSA', home, away }) {
  const cKey = `odds-match-${competitionCode}-${home}-${away}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  const odds = await fetchOddsByCompetition(competitionCode);
  const game = odds.games.find((item) => normalizeText(item.mandante) === normalizeText(home) && normalizeText(item.visitante) === normalizeText(away));
  const payload = game || buildMockOdds(home, away);
  const lineKey = `${competitionCode}-${normalizeText(home)}-${normalizeText(away)}`;
  recordLineMovement(lineKey, payload.casas);
  const response = { ...payload, lineMovement: getLineMovement(lineKey), arbitrage: findArbitrage(payload.casas) };
  setCache(cKey, response, TTL.oddsMatch);
  return response;
}

async function buildRoundPayload(competitionCode = 'BSA') {
  const cKey = `round-${competitionCode}`;
  const cached = getCache(cKey);
  if (cached) return cached;
  const competition = getCompetition(competitionCode);
  const [standings, matches, odds] = await Promise.all([
    fetchStandings(competitionCode),
    fetchMatches({ competitionCode }),
    fetchOddsByCompetition(competitionCode),
  ]);
  const table = standings.standings?.[0]?.table || [];
  const { selected: selectedMatches, others: otherMatches, roundInfo } = buildRoundSelection(matches.matches || []);

  const baseGames = selectedMatches.map((match) => {
    const home = match.homeTeam?.name || match.home_team;
    const away = match.awayTeam?.name || match.away_team;
    const { model, homeStrength, awayStrength } = modelFromStandings({
      table,
      homeTeam: match.homeTeam || { name: home },
      awayTeam: match.awayTeam || { name: away },
    });
    const oddsMatch = odds.games.find((item) => normalizeText(item.mandante) === normalizeText(home) && normalizeText(item.visitante) === normalizeText(away)) || buildMockOdds(home, away);
    const valueBets = calcValueBets(model, oddsMatch.casas);
    const confidence = deriveConfidenceScore({ model, homeStrength, awayStrength, valueBets });
    const explanation = buildProbabilityExplanation({ homeTeam: { name: home }, awayTeam: { name: away }, homeStrength, awayStrength, model, valueBets, competition });
    const opportunityScore = buildOpportunityScore({ model, valueBets, confidence });
    const verdict = buildHumanVerdict({ homeTeam: home, awayTeam: away, model, valueBets, confidence, explanation });
    const game = {
      id: match.id,
      mandante: home,
      visitante: away,
      data: match.utcDate || match.commence_time,
      status: match.status,
      rodada: match.matchday || null,
      probabilidades: { casa: model.mandante, empate: model.empate, fora: model.visitante },
      gols: model.gols,
      odds: oddsMatch.casas,
      valueBets,
      destaqueValue: valueBets[0] || null,
      confidence,
      explanation,
      verdict,
      opportunityScore,
    };
    return {
      ...game,
      decisionEngine: buildDecisionEngine({ game }),
    };
  });

  const enrichedGames = await Promise.all(baseGames.map(async (game) => {
    try {
      const intel = await getPreMatchIntel({ competition: competition.code, home: game.mandante, away: game.visitante, kickoff: game.data });
      return {
        ...game,
        preMatchIntel: intel,
        decisionEngine: buildDecisionEngine({ game, intel }),
      };
    } catch {
      return game;
    }
  }));

  const games = enrichedGames.sort(sortRoundGames);
  const topOpportunities = [...games]
    .sort((a, b) => ((b.decisionEngine?.finalScore || b.opportunityScore || 0) - (a.decisionEngine?.finalScore || a.opportunityScore || 0))
      || ((getMatchTimestamp(a) - getMatchTimestamp(b)))
      || ((b.destaqueValue?.edge || 0) - (a.destaqueValue?.edge || 0)))
    .slice(0, 6);

  const payload = {
    competition,
    totalGames: games.length,
    games,
    topOpportunities,
    activeRound: roundInfo?.matchday,
    roundLabel: roundInfo?.label || 'Rodada atual',
    roundMode: roundInfo?.mode || 'window',
    roundWindow: {
      startDate: roundInfo?.startDate || null,
      endDate: roundInfo?.endDate || null,
    },
    otherDatesCount: otherMatches.length,
  };
  setCache(cKey, payload, TTL.round);
  return payload;
}

module.exports = {
  bindRuntime,
  getCompetition,
  fetchStandings,
  fetchMatches,
  fetchTeamMatches,
  fetchOddsByCompetition,
  fetchOddsMatch,
  buildRoundPayload,
  buildMockOdds,
  calcValueBets,
  modelFromStandings,
  findArbitrage,
};
