const express = require('express');
const { apiErr } = require('../utils/helpers');
const { settleTrackedPicks, listTracked, getSummary, getPerformance, trackEntry, trackFavorite, removeEntry } = require('../services/resultsService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await settleTrackedPicks();
    const items = listTracked({ competition: req.query.competition, status: req.query.status });
    res.json({ total: items.length, items });
  } catch (e) { apiErr(res, e, 'Erro ao carregar resultados'); }
});

router.get('/summary', async (req, res) => {
  try {
    await settleTrackedPicks();
    res.json(getSummary());
  } catch (e) { apiErr(res, e, 'Erro ao resumir resultados'); }
});

router.get('/performance', async (req, res) => {
  try {
    await settleTrackedPicks();
    res.json(getPerformance());
  } catch (e) { apiErr(res, e, 'Erro ao gerar performance'); }
});

router.post('/track', async (req, res) => {
  try {
    const { homeTeam, awayTeam, selection } = req.body || {};
    if (!homeTeam || !awayTeam || !selection) return res.status(400).json({ ok: false, error: 'homeTeam, awayTeam e selection são obrigatórios.' });
    const result = trackEntry(req.body);
    res.json({ ok: true, ...result });
  } catch (e) { apiErr(res, e, 'Erro ao salvar entrada monitorada'); }
});

router.post('/track-favorite', async (req, res) => {
  try {
    const { homeTeam, awayTeam, model } = req.body || {};
    if (!homeTeam || !awayTeam || !model) return res.status(400).json({ ok: false, error: 'homeTeam, awayTeam e model são obrigatórios.' });
    const result = trackFavorite(req.body);
    res.json({ ok: true, ...result });
  } catch (e) { apiErr(res, e, 'Erro ao monitorar favorito'); }
});

router.post('/settle', async (req, res) => {
  try {
    const before = listTracked({ status: 'OPEN' }).length;
    await settleTrackedPicks();
    const after = listTracked({ status: 'OPEN' }).length;
    res.json({ ok: true, checked: before, closed: before - after, items: listTracked() });
  } catch (e) { apiErr(res, e, 'Erro ao fechar resultados'); }
});

router.delete('/:id', (req, res) => {
  try {
    res.json({ ok: true, removed: removeEntry(req.params.id) });
  } catch (e) { apiErr(res, e, 'Erro ao remover entrada'); }
});

module.exports = router;
