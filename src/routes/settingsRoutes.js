const express = require('express');
const { maskSecret, apiErr } = require('../utils/helpers');
const { getKeys, updateKeys } = require('../services/runtimeService');
const { getHealthSnapshot, resetValidation, testProvider } = require('../services/keyValidationService');

const router = express.Router();

function buildConfigured(keys) {
  return {
    footballData: !keys.footballDataKey.startsWith('SUA_CHAVE_'),
    oddsApi: !keys.oddsApiKey.startsWith('SUA_CHAVE_'),
    groqApi: !keys.groqApiKey.startsWith('SUA_CHAVE_'),
    geminiApi: !keys.geminiApiKey.startsWith('SUA_CHAVE_'),
    openRouterApi: !keys.openRouterApiKey.startsWith('SUA_CHAVE_'),
  };
}

router.get('/keys', (req, res) => {
  try {
    const keys = getKeys();
    res.json({
      footballDataKey: '',
      oddsApiKey: '',
      groqApiKey: '',
      geminiApiKey: '',
      openRouterApiKey: '',
      configured: buildConfigured(keys),
      masked: {
        footballDataKey: maskSecret(keys.footballDataKey),
        oddsApiKey: maskSecret(keys.oddsApiKey),
        groqApiKey: maskSecret(keys.groqApiKey),
        geminiApiKey: maskSecret(keys.geminiApiKey),
        openRouterApiKey: maskSecret(keys.openRouterApiKey),
      },
    });
  } catch (e) {
    apiErr(res, e, 'Erro ao ler chaves');
  }
});

router.get('/keys/health', (req, res) => {
  try {
    const keys = getKeys();
    res.json({
      ok: true,
      providers: getHealthSnapshot(keys),
    });
  } catch (e) {
    apiErr(res, e, 'Erro ao ler diagnóstico das chaves');
  }
});

router.post('/keys', (req, res) => {
  try {
    const { footballDataKey, oddsApiKey, groqApiKey, geminiApiKey, openRouterApiKey } = req.body || {};
    const current = getKeys();
    const changed = [];

    const nextPayload = {
      footballDataKey: footballDataKey?.trim() || current.footballDataKey,
      oddsApiKey: oddsApiKey?.trim() || current.oddsApiKey,
      groqApiKey: groqApiKey?.trim() || current.groqApiKey,
      geminiApiKey: geminiApiKey?.trim() || current.geminiApiKey,
      openRouterApiKey: openRouterApiKey?.trim() || current.openRouterApiKey,
    };

    if (nextPayload.footballDataKey !== current.footballDataKey) changed.push('footballData');
    if (nextPayload.oddsApiKey !== current.oddsApiKey) changed.push('oddsApi');
    if (nextPayload.groqApiKey !== current.groqApiKey) changed.push('groqApi');
    if (nextPayload.geminiApiKey !== current.geminiApiKey) changed.push('geminiApi');
    if (nextPayload.openRouterApiKey !== current.openRouterApiKey) changed.push('openRouterApi');

    const nextKeys = updateKeys(nextPayload);
    resetValidation(changed.length ? changed : Object.keys(getHealthSnapshot(nextKeys)), nextKeys);

    res.json({
      ok: true,
      configured: buildConfigured(nextKeys),
      providers: getHealthSnapshot(nextKeys),
    });
  } catch (e) {
    apiErr(res, e, 'Erro ao salvar chaves');
  }
});

router.post('/keys/test', async (req, res) => {
  try {
    const { provider } = req.body || {};
    const keys = getKeys();

    if (provider) {
      const result = await testProvider(provider, keys);
      return res.json({ ok: true, provider, result, providers: getHealthSnapshot(keys) });
    }

    const providers = {};
    for (const id of Object.keys(getHealthSnapshot(keys))) {
      providers[id] = await testProvider(id, keys);
    }
    return res.json({ ok: true, providers });
  } catch (e) {
    apiErr(res, e, 'Erro ao testar conexão das chaves');
  }
});

router.delete('/keys', (req, res) => {
  try {
    const nextKeys = updateKeys({
      footballDataKey: 'SUA_CHAVE_FOOTBALL_DATA',
      oddsApiKey: 'SUA_CHAVE_ODDS_API',
      groqApiKey: 'SUA_CHAVE_GROQ',
      geminiApiKey: 'SUA_CHAVE_GEMINI',
      openRouterApiKey: 'SUA_CHAVE_OPENROUTER',
    });
    resetValidation(null, nextKeys);
    res.json({ ok: true, configured: buildConfigured(nextKeys), providers: getHealthSnapshot(nextKeys) });
  } catch (e) {
    apiErr(res, e, 'Erro ao resetar chaves');
  }
});

module.exports = router;
