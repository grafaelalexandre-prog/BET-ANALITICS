const fs = require('fs');
const { CONFIG_PATH, TRACKER_PATH, WATCHLIST_PATH, DEFAULT_KEYS } = require('../config/constants');

function readJson(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function readRuntimeConfig() {
  return { ...DEFAULT_KEYS, ...readJson(CONFIG_PATH, {}) };
}

function writeRuntimeConfig(nextConfig) {
  writeJson(CONFIG_PATH, nextConfig);
}

function readTrackedPicks() {
  return readJson(TRACKER_PATH, []);
}

function writeTrackedPicks(items) {
  writeJson(TRACKER_PATH, items);
}

function readWatchlist() {
  return readJson(WATCHLIST_PATH, []);
}

function writeWatchlist(items) {
  writeJson(WATCHLIST_PATH, items);
}

module.exports = {
  readRuntimeConfig,
  writeRuntimeConfig,
  readTrackedPicks,
  writeTrackedPicks,
  readWatchlist,
  writeWatchlist,
};
