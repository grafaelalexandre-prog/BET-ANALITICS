/**
 * Goals Analyzer
 * Calcula métricas de gols: média, over 2.5, BTTS.
 */

/**
 * Analisa padrões de gols dos últimos jogos
 * @param {Array} homeMatches - Últimos jogos do mandante
 * @param {Array} awayMatches - Últimos jogos do visitante
 * @param {number} homeTeamId
 * @param {number} awayTeamId
 */
function analyzeGoals(homeMatches, awayMatches, homeTeamId, awayTeamId) {
  const homeStats = computeTeamGoals(homeMatches, homeTeamId);
  const awayStats = computeTeamGoals(awayMatches, awayTeamId);

  const combinedOver25 = Math.round((homeStats.over25Rate + awayStats.over25Rate) / 2);
  const combinedBtts = Math.round((homeStats.bttsRate + awayStats.bttsRate) / 2);
  const expectedGoals = Number(((homeStats.goalsAvg + awayStats.goalsAvg) / 2).toFixed(2));

  return {
    homeGoalsAvg: homeStats.goalsAvg,
    awayGoalsAvg: awayStats.goalsAvg,
    homeConcededAvg: homeStats.concededAvg,
    awayConcededAvg: awayStats.concededAvg,
    over25Rate: combinedOver25,
    bttsRate: combinedBtts,
    expectedGoals,
  };
}

function computeTeamGoals(matches, teamId) {
  if (!matches || matches.length === 0) {
    return { goalsAvg: 0, concededAvg: 0, over25Rate: 50, bttsRate: 50 };
  }

  let totalScored = 0;
  let totalConceded = 0;
  let over25Count = 0;
  let bttsCount = 0;
  let validMatches = 0;

  for (const m of matches) {
    const score = m.score?.fullTime;
    if (!score || score.home == null) continue;

    const isHome = m.homeTeam?.id === teamId;
    const scored = isHome ? score.home : score.away;
    const conceded = isHome ? score.away : score.home;
    const totalGoals = score.home + score.away;

    totalScored += scored;
    totalConceded += conceded;
    if (totalGoals >= 3) over25Count++;
    if (score.home > 0 && score.away > 0) bttsCount++;
    validMatches++;
  }

  if (validMatches === 0) {
    return { goalsAvg: 0, concededAvg: 0, over25Rate: 50, bttsRate: 50 };
  }

  return {
    goalsAvg: Number((totalScored / validMatches).toFixed(2)),
    concededAvg: Number((totalConceded / validMatches).toFixed(2)),
    over25Rate: Math.round((over25Count / validMatches) * 100),
    bttsRate: Math.round((bttsCount / validMatches) * 100),
  };
}

/**
 * Fallback conservador quando não há dados
 */
function fallbackGoals() {
  return {
    homeGoalsAvg: 1.2,
    awayGoalsAvg: 1.0,
    homeConcededAvg: 1.0,
    awayConcededAvg: 1.2,
    over25Rate: 50,
    bttsRate: 45,
    expectedGoals: 2.2,
  };
}

module.exports = { analyzeGoals, fallbackGoals };

