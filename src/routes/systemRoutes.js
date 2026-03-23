const express = require('express');
const { getCacheStatus, clearCache } = require('../services/cacheService');
const { getStatusPayload } = require('../services/runtimeService');

const router = express.Router();

router.get('/cache/status', (req, res) => res.json(getCacheStatus()));
router.delete('/cache/clear', (req, res) => res.json({ ok: true, limpas: clearCache() }));
router.get('/status', (req, res) => res.json(getStatusPayload()));

module.exports = router;
