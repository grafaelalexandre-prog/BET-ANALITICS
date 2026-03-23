const { DEFAULT_KEYS, COMPETITIONS } = require('../config/constants');
const { readRuntimeConfig, writeRuntimeConfig } = require('./storage');
const { clearCache } = require('./cacheService');

const state = {
  keys: { ...DEFAULT_KEYS, ...readRuntimeConfig() },
};

function getKeys() {
  return state.keys;
}

function updateKeys(nextKeys) {
  state.keys = { ...state.keys, ...nextKeys };
  writeRuntimeConfig(state.keys);
  clearCache();
  return state.keys;
}

function getStatusPayload() {
  return {
    status: 'online',
    timestamp: new Date().toISOString(),
    defaultCompetition: 'BSA',
    competitions: Object.keys(COMPETITIONS),
    features: [
      'Multi-campeonatos', 'Jogos da rodada', 'Monte Carlo 10k', 'Over/Under 0.5-3.5', 'BTTS', 'Value bets 1X2/Over 2.5/BTTS', 'Arbitrage finder', 'Line movement tracker', 'Fallback mock', 'Groq IA', 'Consensus AI', 'Tracker WIN/LOSS', 'Pré-Match Intel',
    ],
    apis: {
      footballData: state.keys.footballDataKey !== 'SUA_CHAVE_FOOTBALL_DATA' ? 'ok' : 'mock',
      oddsApi: state.keys.oddsApiKey !== 'SUA_CHAVE_ODDS_API' ? 'ok' : 'mock',
      groq: state.keys.groqApiKey !== 'SUA_CHAVE_GROQ' ? 'ok' : 'fallback',
      gemini: state.keys.geminiApiKey !== 'SUA_CHAVE_GEMINI' ? 'ok' : 'fallback',
      openRouter: state.keys.openRouterApiKey !== 'SUA_CHAVE_OPENROUTER' ? 'ok' : 'fallback',
    },
  };
}

module.exports = {
  state,
  getKeys,
  updateKeys,
  getStatusPayload,
};
