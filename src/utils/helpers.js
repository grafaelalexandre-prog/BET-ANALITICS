function maskSecret(value = '') {
  if (!value || value.startsWith('SUA_CHAVE_')) return 'não configurada';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function normalizeText(txt = '') {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function oddToProb(odd) {
  return odd > 0 ? +((1 / odd) * 100).toFixed(2) : 0;
}

function apiErr(res, e, msg) {
  console.error(`[ERRO] ${msg}:`, e?.response?.data || e.message);
  return res.status(500).json({ error: msg, detail: e?.response?.data || e.message });
}

module.exports = {
  maskSecret,
  normalizeText,
  oddToProb,
  apiErr,
};
