/**
 * Scanner Routes
 * GET /api/scanner         — todos os jogos enriquecidos (todas as ligas)
 * GET /api/scanner?league=BSA  — filtrado por liga
 */

const express = require('express');
const { fetchMatches } = require('../services/footballDataProvider');
const { enrichMatches } = require('../services/matchEnrichmentService');

const router = express.Router();

// Ligas suportadas
const LEAGUES = ['BSA', 'BSB', 'PL', 'PD', 'CL', 'CLI', 'BL1', 'SA', 'FL1', 'PPL'];

router.get('/scanner', async (req, res) => {
  console.log('[scanner] route hit');

  return res.json({
    ok: true,
    message: 'scanner funcionando',
    timestamp: new Date().toISOString()
  });
});
    
module.exports = router;
