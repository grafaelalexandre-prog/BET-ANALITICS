const express = require('express');
const { apiErr } = require('../utils/helpers');
const { listWatchlist, getWatchlistSummary, addWatchlistEntry, removeWatchlistEntry } = require('../services/watchlistService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const items = listWatchlist({ competition: req.query.competition });
    res.json({ total: items.length, items });
  } catch (e) { apiErr(res, e, 'Erro ao carregar watchlist'); }
});

router.get('/summary', (req, res) => {
  try {
    res.json(getWatchlistSummary());
  } catch (e) { apiErr(res, e, 'Erro ao resumir watchlist'); }
});

router.post('/', (req, res) => {
  try {
    const result = addWatchlistEntry(req.body);
    res.json({ ok: true, ...result });
  } catch (e) { apiErr(res, e, 'Erro ao salvar watchlist'); }
});

router.delete('/:id', (req, res) => {
  try {
    res.json({ ok: true, removed: removeWatchlistEntry(req.params.id) });
  } catch (e) { apiErr(res, e, 'Erro ao remover da watchlist'); }
});

module.exports = router;
