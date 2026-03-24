/**
 * Football Data Provider
 * Busca dados brutos de jogos — adaptável para qualquer fonte (football-data.org, API-Football, etc.)
 */

const FOOTBALL_DATA_BASE = process.env.FOOTBALL_DATA_URL || 'https://api.football-data.org/v4';
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY || '';

/**
 * Busca partidas atuais de uma competição
 * @param {string} competitionCode - Ex: 'BSA', 'PL', 'BL1'
 * @param {object} options - { matchday, dateFrom, dateTo }
 */
async function fetchMatches(competitionCode, options = {}) {
  try {
    let url = `${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/matches`;
    const params = new URLSearchParams();
    if (options.matchday) params.set('matchday', String(options.matchday));
    if (options.dateFrom) params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params.set('dateTo', options.dateTo);
    if (options.status) params.set('status', options.status);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    const res = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALL_DATA_KEY,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[footballDataProvider] ${competitionCode} HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    return (json.matches || []).map(normalizeMatch);
  } catch (err) {
    console.warn(`[footballDataProvider] ${competitionCode} error:`, err.message);
    return [];
  }
}

/**
 * Busca standings/classificação para calcular form
 */
async function fetchStandings(competitionCode) {
  try {
    const res = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${competitionCode}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.standings || [];
  } catch {
    return null;
  }
}

/**
 * Busca últimos jogos de um time para form analysis
 */
async function fetchTeamMatches(teamId, limit = 5) {
  try {
    const res = await fetch(`${FOOTBALL_DATA_BASE}/teams/${teamId}/matches?status=FINISHED&limit=${limit}`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.matches || []).slice(0, limit);
  } catch {
    return [];
  }
}

/** Normaliza match para formato interno */
function normalizeMatch(m) {
  return {
    id: String(m.id),
    competition: m.competition?.name || '',
    competitionCode: m.competition?.code || '',
    homeTeam: m.homeTeam?.name || m.homeTeam?.shortName || '',
    homeTeamId: m.homeTeam?.id,
    awayTeam: m.awayTeam?.name || m.awayTeam?.shortName || '',
    awayTeamId: m.awayTeam?.id,
    utcDate: m.utcDate,
    status: m.status,
    matchday: m.matchday,
    score: m.score?.fullTime
      ? { home: m.score.fullTime.home, away: m.score.fullTime.away }
      : null,
  };
}

module.exports = { fetchMatches, fetchStandings, fetchTeamMatches };

