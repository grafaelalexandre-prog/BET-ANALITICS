const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'runtime-config.json');
const TRACKER_PATH = path.join(ROOT_DIR, 'tracked-picks.json');
const WATCHLIST_PATH = path.join(ROOT_DIR, 'watchlist.json');

const DEFAULT_KEYS = {
  footballDataKey: process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_KEY || 'SUA_CHAVE_FOOTBALL_DATA',
  oddsApiKey: process.env.ODDS_API_KEY || 'SUA_CHAVE_ODDS_API',
  groqApiKey: process.env.GROQ_API_KEY || 'SUA_CHAVE_GROQ',
  geminiApiKey: process.env.GEMINI_API_KEY || 'SUA_CHAVE_GEMINI',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || 'SUA_CHAVE_OPENROUTER',
};

const FD_URL = 'https://api.football-data.org/v4';
const ODDS_URL = 'https://api.the-odds-api.com/v4';

const BOOKMAKERS = [
  { key: 'bet365', nome: 'Bet365', cor: '#FFD700' },
  { key: 'betano', nome: 'Betano', cor: '#FF6B35' },
  { key: 'sportingbet', nome: 'Sportingbet', cor: '#00A86B' },
  { key: 'betcris', nome: 'KTO', cor: '#E91E8C' },
];

const BM_KEYS = BOOKMAKERS.map((b) => b.key).join(',');

const COMPETITIONS = {
  BSA: { code: 'BSA', name: 'Brasileirão Série A', country: 'Brasil', oddsSportKey: 'soccer_brazil_campeonato', featured: true },
  BSB: { code: 'BSB', name: 'Brasileirão Série B', country: 'Brasil', oddsSportKey: null, featured: true },
  CLI: { code: 'CLI', name: 'Libertadores', country: 'América do Sul', oddsSportKey: 'soccer_conmebol_copa_libertadores', featured: true },
  PL: { code: 'PL', name: 'Premier League', country: 'Inglaterra', oddsSportKey: 'soccer_epl', featured: true },
  PD: { code: 'PD', name: 'La Liga', country: 'Espanha', oddsSportKey: 'soccer_spain_la_liga', featured: true },
  CL: { code: 'CL', name: 'Champions League', country: 'Europa', oddsSportKey: 'soccer_uefa_champs_league', featured: true },
};

const TTL = {
  competitions: 12 * 60 * 60 * 1000,
  standings: 60 * 60 * 1000,
  matches: 30 * 60 * 1000,
  teamMatches: 15 * 60 * 1000,
  odds: 10 * 60 * 1000,
  oddsMatch: 5 * 60 * 1000,
  round: 10 * 60 * 1000,
  preMatchIntel: 8 * 60 * 1000,
};

module.exports = {
  ROOT_DIR,
  CONFIG_PATH,
  TRACKER_PATH,
  WATCHLIST_PATH,
  DEFAULT_KEYS,
  FD_URL,
  ODDS_URL,
  BOOKMAKERS,
  BM_KEYS,
  COMPETITIONS,
  TTL,
};
