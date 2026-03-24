/**
 * Scanner Routes
 * GET /api/scanner         — todos os jogos enriquecidos (todas as ligas)
 * GET /api/scanner?league=BSA  — filtrado por liga
 */

const express = require('express');
const { fetchMatches } = require('../services/providers/footballDataProvider');
const { enrichMatches } = require('../services/matchEnrichmentService');

const router = express.Router();

// Ligas suportadas
const LEAGUES = ['BSA', 'BSB', 'PL', 'PD', 'CL', 'CLI', 'BL1', 'SA', 'FL1', 'PPL'];

router.get('/scanner', async (req, res) => {
  try {
    const leagueFilter = req.query.league?.toUpperCase();
    const leagues = leagueFilter && LEAGUES.includes(leagueFilter)
      ? [leagueFilter]
      : LEAGUES;

    console.log(`[scanner] Fetching ${leagues.length} league(s): ${leagues.join(', ')}`);

    // Buscar jogos de todas as ligas em paralelo
    const allMatchesArrays = await Promise.all(
      leagues.map(code => fetchMatches(code, {
        // Buscar jogos de hoje e próximos 3 dias
        dateFrom: todayStr(),
        dateTo: futureStr(3),
      }))
    );

    const allMatches = allMatchesArrays.flat();
    console.log(`[scanner] ${allMatches.length} matches found`);

    if (allMatches.length === 0) {
      return res.json({
        matches: [],
        meta: { total: 0, leagues: leagues.length, enriched: 0, timestamp: new Date().toISOString() },
      });
    }

    // Enriquecer jogos
    const enriched = await enrichMatches(allMatches, 3);

    res.json({
      matches: enriched,
      meta: {
        total: enriched.length,
        leagues: leagues.length,
        enriched: enriched.filter(m => m.analysis?.decision).length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[scanner] Error:', err);
    res.status(500).json({
      error: 'Scanner temporariamente indisponível',
      matches: [],
      meta: { total: 0, timestamp: new Date().toISOString() },
    });
  }
});

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function futureStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

module.exports = router;
