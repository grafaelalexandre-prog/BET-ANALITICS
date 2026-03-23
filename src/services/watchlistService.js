const { readWatchlist, writeWatchlist } = require('./storage');

let watchlist = readWatchlist();

function sortItems(items) {
  return [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function listWatchlist({ competition } = {}) {
  let items = sortItems(watchlist);
  if (competition) items = items.filter((item) => item.competition === competition);
  return items;
}

function getWatchlistSummary() {
  const items = sortItems(watchlist);
  return {
    total: items.length,
    byCompetition: Object.entries(items.reduce((acc, item) => {
      const key = item.competition || 'OUTROS';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([competition, total]) => ({ competition, total })),
  };
}

function addWatchlistEntry(payload) {
  const { competition = 'BSA', homeTeam, awayTeam, matchDate = null, focus = 'Geral', note = '', confidence = null, opportunityScore = null } = payload || {};
  if (!homeTeam || !awayTeam) throw new Error('homeTeam e awayTeam são obrigatórios.');
  const duplicate = watchlist.find((item) => item.competition === competition && item.homeTeam === homeTeam && item.awayTeam === awayTeam);
  if (duplicate) return { duplicate: true, item: duplicate };
  const entry = {
    id: `watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    competition, homeTeam, awayTeam, matchDate, focus, note,
    confidence: confidence ? Number(confidence) : null,
    opportunityScore: opportunityScore ? Number(opportunityScore) : null,
    createdAt: new Date().toISOString(),
  };
  watchlist.unshift(entry);
  writeWatchlist(watchlist);
  return { duplicate: false, item: entry };
}

function removeWatchlistEntry(id) {
  const before = watchlist.length;
  watchlist = watchlist.filter((item) => item.id !== id);
  writeWatchlist(watchlist);
  return before - watchlist.length;
}

module.exports = { listWatchlist, getWatchlistSummary, addWatchlistEntry, removeWatchlistEntry };
