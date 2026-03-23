const axios = require('axios');
const { maskSecret } = require('../utils/helpers');

const PROVIDERS = {
  footballData: {
    id: 'footballData',
    label: 'Football-Data',
    keyField: 'footballDataKey',
    placeholder: 'SUA_CHAVE_FOOTBALL_DATA',
    docs: 'https://www.football-data.org/documentation/api',
  },
  oddsApi: {
    id: 'oddsApi',
    label: 'The Odds API',
    keyField: 'oddsApiKey',
    placeholder: 'SUA_CHAVE_ODDS_API',
    docs: 'https://the-odds-api.com/liveapi/guides/v4/',
  },
  groqApi: {
    id: 'groqApi',
    label: 'Groq',
    keyField: 'groqApiKey',
    placeholder: 'SUA_CHAVE_GROQ',
    docs: 'https://console.groq.com/docs/api-reference',
  },
  geminiApi: {
    id: 'geminiApi',
    label: 'Gemini',
    keyField: 'geminiApiKey',
    placeholder: 'SUA_CHAVE_GEMINI',
    docs: 'https://ai.google.dev/gemini-api/docs/api-key',
  },
  openRouterApi: {
    id: 'openRouterApi',
    label: 'OpenRouter',
    keyField: 'openRouterApiKey',
    placeholder: 'SUA_CHAVE_OPENROUTER',
    docs: 'https://openrouter.ai/docs/api/reference/authentication',
  },
};

const lastResults = {};

function isConfiguredKey(value = '', placeholder = '') {
  const trimmed = String(value || '').trim();
  return !!trimmed && !trimmed.startsWith('SUA_CHAVE_') && trimmed !== placeholder;
}

function nowIso() {
  return new Date().toISOString();
}

function basePayload(provider, key) {
  return {
    provider: provider.id,
    label: provider.label,
    configured: isConfiguredKey(key, provider.placeholder),
    maskedKey: maskSecret(key),
    status: 'pending',
    message: 'Ainda não testado.',
    testedAt: null,
    httpStatus: null,
    mode: 'pending',
    docs: provider.docs,
  };
}

function markPending(providerId, keys) {
  const provider = PROVIDERS[providerId];
  const key = keys?.[provider.keyField] || '';
  const payload = basePayload(provider, key);
  if (!payload.configured) {
    payload.message = 'Chave não configurada. O sistema continua em demo/mock.';
    payload.mode = 'mock';
  } else {
    payload.message = 'Chave salva, mas ainda não validada contra a API.';
    payload.mode = 'configured';
  }
  lastResults[providerId] = payload;
  return payload;
}

function resetValidation(providerIds, keys) {
  const ids = Array.isArray(providerIds) && providerIds.length ? providerIds : Object.keys(PROVIDERS);
  ids.forEach((id) => markPending(id, keys));
}

function classifyError(provider, error) {
  const httpStatus = error?.response?.status || null;
  const apiPayload = error?.response?.data;
  const detail = typeof apiPayload === 'string'
    ? apiPayload
    : apiPayload?.message || apiPayload?.error || apiPayload?.detail || error?.message || 'Falha desconhecida';

  let status = 'error';
  let mode = 'error';
  let message = `Erro ao validar ${provider.label}: ${detail}`;

  if (httpStatus === 401 || httpStatus === 403) {
    status = 'invalid';
    mode = 'invalid';
    message = 'A API rejeitou a chave. Revise o token informado.';
  } else if (httpStatus === 429) {
    status = 'rate_limit';
    mode = 'rate_limit';
    message = 'Limite da API atingido. A chave pode estar válida, mas o serviço bloqueou temporariamente.';
  } else if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    status = 'network';
    mode = 'offline';
    message = 'Não foi possível alcançar a API a partir do ambiente atual.';
  }

  return {
    status,
    mode,
    httpStatus,
    message,
    detail: String(detail).slice(0, 300),
  };
}

async function validateFootballData(key) {
  await axios.get('https://api.football-data.org/v4/competitions', {
    headers: { 'X-Auth-Token': key },
    timeout: 12000,
    validateStatus: () => true,
  }).then((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error('Football-Data retornou erro');
    err.response = response;
    throw err;
  });
}

async function validateOddsApi(key) {
  await axios.get('https://api.the-odds-api.com/v4/sports/', {
    params: { apiKey: key },
    timeout: 12000,
    validateStatus: () => true,
  }).then((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error('The Odds API retornou erro');
    err.response = response;
    throw err;
  });
}

async function validateGroq(key) {
  await axios.get('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: 12000,
    validateStatus: () => true,
  }).then((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error('Groq retornou erro');
    err.response = response;
    throw err;
  });
}

async function validateGemini(key) {
  await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
    params: { key },
    timeout: 12000,
    validateStatus: () => true,
  }).then((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error('Gemini retornou erro');
    err.response = response;
    throw err;
  });
}

async function validateOpenRouter(key) {
  await axios.get('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    timeout: 12000,
    validateStatus: () => true,
  }).then((response) => {
    if (response.status >= 200 && response.status < 300) return response;
    const err = new Error('OpenRouter retornou erro');
    err.response = response;
    throw err;
  });
}

const validators = {
  footballData: validateFootballData,
  oddsApi: validateOddsApi,
  groqApi: validateGroq,
  geminiApi: validateGemini,
  openRouterApi: validateOpenRouter,
};

async function testProvider(providerId, keys) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Provider inválido: ${providerId}`);

  const key = keys?.[provider.keyField] || '';
  const payload = basePayload(provider, key);

  if (!payload.configured) {
    payload.mode = 'mock';
    payload.message = 'Chave pendente. O sistema fica em demo/mock para este módulo.';
    lastResults[providerId] = payload;
    return payload;
  }

  try {
    await validators[providerId](key);
    const result = {
      ...payload,
      status: 'connected',
      mode: 'live',
      message: 'Conexão validada com sucesso.',
      testedAt: nowIso(),
      httpStatus: 200,
    };
    lastResults[providerId] = result;
    return result;
  } catch (error) {
    const classified = classifyError(provider, error);
    const result = {
      ...payload,
      ...classified,
      testedAt: nowIso(),
    };
    lastResults[providerId] = result;
    return result;
  }
}

function getHealthSnapshot(keys) {
  const snapshot = {};
  for (const providerId of Object.keys(PROVIDERS)) {
    const provider = PROVIDERS[providerId];
    const key = keys?.[provider.keyField] || '';
    const current = lastResults[providerId];
    if (!current) {
      snapshot[providerId] = markPending(providerId, keys);
      continue;
    }
    snapshot[providerId] = {
      ...current,
      configured: isConfiguredKey(key, provider.placeholder),
      maskedKey: maskSecret(key),
      docs: provider.docs,
    };
  }
  return snapshot;
}

module.exports = {
  PROVIDERS,
  getHealthSnapshot,
  resetValidation,
  testProvider,
};
