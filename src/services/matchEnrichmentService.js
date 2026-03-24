/**
 * Match Enrichment Service
 * Orquestra providers e analyzers para enriquecer cada jogo.
 */

const { fetchTeamMatches } = require('./providers/footballDataProvider');
const { analyzeForm, compareForm } = require('./analyzers/formAnalyzer');
const { analyzeGoals, fallbackGoals } = require('./analyzers/goalsAnalyzer');
const { generateAnalysis, fallbackAnalysis } = require('./analyzers/marketEngine');

/**
 * Enriquece um jogo com métricas e análise
 * @param {object} match - Match normalizado do provider
 * @returns {object} Match enriquecido
 */
async function enrichMatch(match) {
  try {
    // Buscar últimos jogos de cada time (em paralelo)
    const [homeRecent, awayRecent] = await Promise.all([
      match.homeTeamId ? fetchTeamMatches(match.homeTeamId, 5) : Promise.resolve([]),
      match.awayTeamId ? fetchTeamMatches(match.awayTeamId, 5) : Promise.resolve([]),
    ]);

    // Analisar form
    const homeForm = analyzeForm(homeRecent, match.homeTeamId);
    const awayForm = analyzeForm(awayRecent, match.awayTeamId);
    const formComparison = compareForm(homeForm, awayForm);

    // Analisar gols
    const goals = (homeRecent.length > 0 || awayRecent.length > 0)
      ? analyzeGoals(homeRecent, awayRecent, match.homeTeamId, match.awayTeamId)
      : fallbackGoals();

    // Gerar análise
    const analysis = generateAnalysis({ formComparison, goals, homeForm, awayForm });

    return {
      ...match,
      metrics: {
        homeForm: homeForm.form,
        awayForm: awayForm.form,
        homeGoalsAvg: goals.homeGoalsAvg,
        awayGoalsAvg: goals.awayGoalsAvg,
        over25Rate: goals.over25Rate,
        bttsRate: goals.bttsRate,
      },
      analysis,
    };
  } catch (err) {
    console.warn(`[enrichMatch] ${match.homeTeam} vs ${match.awayTeam} fallback:`, err.message);
    return {
      ...match,
      metrics: {
        homeForm: '?????',
        awayForm: '?????',
        ...fallbackGoals(),
      },
      analysis: fallbackAnalysis(),
    };
  }
}

/**
 * Enriquece uma lista de jogos em paralelo (com concurrency limit)
 */
async function enrichMatches(matches, concurrency = 3) {
  const results = [];

  for (let i = 0; i < matches.length; i += concurrency) {
    const batch = matches.slice(i, i + concurrency);
    const enriched = await Promise.all(batch.map(enrichMatch));
    results.push(...enriched);
  }

  // Ordenar por score desc
  results.sort((a, b) => (b.analysis?.score || 0) - (a.analysis?.score || 0));
  return results;
}

module.exports = { enrichMatch, enrichMatches };
