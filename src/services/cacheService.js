const cache = new Map();

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function clearCache() {
  const total = cache.size;
  cache.clear();
  return total;
}

function getCacheStatus() {
  const entries = {};
  cache.forEach((value, key) => {
    entries[key] = { expiraEm: `${Math.max(0, Math.round((value.expiresAt - Date.now()) / 1000))}s` };
  });
  return { totalEntradas: cache.size, entries };
}

module.exports = {
  cache,
  setCache,
  getCache,
  clearCache,
  getCacheStatus,
};
