const express = require('express');
const { apiErr } = require('../utils/helpers');
const { analyzeWithGroq, analyzeConsensus } = require('../services/aiService');

const router = express.Router();

router.post('/analisar', async (req, res) => {
  try {
    res.json(await analyzeWithGroq(req.body));
  } catch (e) {
    apiErr(res, e, 'Erro IA');
  }
});

router.post('/analisar-consenso', async (req, res) => {
  try {
    res.json(await analyzeConsensus(req.body));
  } catch (e) {
    apiErr(res, e, 'Erro no consenso IA');
  }
});

module.exports = router;
