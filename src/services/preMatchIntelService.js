const axios = require('axios');
const { getCache, setCache } = require('./cacheService');
const { normalizeText } = require('../utils/helpers');
const { TTL } = require('../config/constants');

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtml(match?.[1] || '');
}

function extractSource(block) {
  const sourceMatch = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
  if (!sourceMatch) return { source: 'Feed web', sourceUrl: '' };
  return {
    source: decodeHtml(sourceMatch[2] || 'Feed web'),
    sourceUrl: sourceMatch[1] || '',
  };
}

function parseRss(xml = '') {
  const items = String(xml || '').match(/<item>([\s\S]*?)<\/item>/gi) || [];
  return items.map((item) => {
    const { source, sourceUrl } = extractSource(item);
    return {
      title: extractTag(item, 'title'),
      link: extractTag(item, 'link'),
      publishedAt: extractTag(item, 'pubDate'),
      description: extractTag(item, 'description'),
      source,
      sourceUrl,
    };
  }).filter((item) => item.title && item.link);
}

function buildSearchUrls({ home, away, competition }) {
  const queries = [
    `"${home}" "${away}" ${competition} futebol escalação OR lesionado OR dúvida`,
    `"${home}" futebol lesão OR suspenso OR provável escalação`,
    `"${away}" futebol lesão OR suspenso OR provável escalação`,
  ];
  return queries.map((query) => `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`);
}

const KEYWORDS = {
  confirmedOut: ['fora', 'desfalque', 'suspenso', 'banido', 'lesionado', 'lesão confirmada', 'out for', 'ruled out', 'will miss'],
  doubt: ['dúvida', 'duvida', 'questionável', 'incerto', 'late test', 'doubtful', 'questionable'],
  rotation: ['poupar', 'rodar', 'rodízio', 'time misto', 'reserva', 'rotation', 'rested'],
  lineup: ['escalação', 'provável', 'lineup', 'starting xi', 'onze inicial', 'relacionado'],
  tactical: ['esquema', 'formação', 'tática', 'mudança tática', 'formation', 'coach', 'treinador'],
  market: ['odds', 'mercado', 'apost', 'bet', 'cotação', 'price'],
};

function classifySignals(text) {
  const normalized = normalizeText(text);
  const signals = [];
  if (KEYWORDS.confirmedOut.some((k) => normalized.includes(normalizeText(k)))) signals.push('desfalque');
  if (KEYWORDS.doubt.some((k) => normalized.includes(normalizeText(k)))) signals.push('duvida');
  if (KEYWORDS.rotation.some((k) => normalized.includes(normalizeText(k)))) signals.push('rotacao');
  if (KEYWORDS.lineup.some((k) => normalized.includes(normalizeText(k)))) signals.push('escalacao');
  if (KEYWORDS.tactical.some((k) => normalized.includes(normalizeText(k)))) signals.push('tatica');
  if (KEYWORDS.market.some((k) => normalized.includes(normalizeText(k)))) signals.push('mercado');
  return signals;
}

function scoreSignals(signals = []) {
  return signals.reduce((sum, signal) => sum + (
    signal === 'desfalque' ? 30 :
    signal === 'duvida' ? 20 :
    signal === 'rotacao' ? 18 :
    signal === 'escalacao' ? 10 :
    signal === 'tatica' ? 8 :
    signal === 'mercado' ? 4 : 0
  ), 0);
}

function inferTeamSide(item, home, away) {
  const text = normalizeText(`${item.title} ${item.description}`);
  const homeNorm = normalizeText(home);
  const awayNorm = normalizeText(away);
  if (text.includes(homeNorm) && !text.includes(awayNorm)) return 'home';
  if (text.includes(awayNorm) && !text.includes(homeNorm)) return 'away';
  if (text.includes(homeNorm) && text.includes(awayNorm)) return 'match';
  return 'general';
}

function buildMockIntel({ home, away, kickoff }) {
  const now = Date.now();
  const kickoffTs = kickoff ? new Date(kickoff).getTime() : null;
  const diffHours = kickoffTs ? Math.round((kickoffTs - now) / 3600000) : null;
  const urgency = diffHours !== null && diffHours <= 2 ? 'alta' : diffHours !== null && diffHours <= 8 ? 'média' : 'baixa';
  return {
    mode: 'mock',
    status: 'monitorando',
    generatedAt: new Date().toISOString(),
    summary: {
      impactScore: 18,
      impactLabel: 'Impacto leve',
      recommendation: diffHours !== null && diffHours <= 2
        ? 'Conferir escalações oficiais antes da entrada.'
        : 'Acompanhar notícias e lineup provável até perto do jogo.',
      confidence: 'baixa',
      overall: 'Sem notícia confirmada no feed. Manter monitoramento pré-jogo.',
    },
    kickoffWindow: {
      urgency,
      label: diffHours === null ? 'Horário não informado' : `${Math.max(diffHours, 0)}h para o jogo`,
      note: 'Janela útil para revalidar notícias, lineup e movimentação final do mercado.',
    },
    teams: {
      home: { name: home, status: 'Sem confirmação oficial', note: 'Nenhuma ausência confirmada pelo módulo neste momento.' },
      away: { name: away, status: 'Sem confirmação oficial', note: 'Monitoramento aguardando notícias ou lineups mais firmes.' },
    },
    alerts: [
      { level: 'watch', tag: 'Monitorar', title: 'Pré-match ainda sem confirmação forte', text: 'Use o módulo para revalidar perto do jogo e evitar entrar só com estatística fria.' },
    ],
    headlines: [],
    signalBreakdown: { desfalque: 0, duvida: 0, rotacao: 0, escalacao: 0, tatica: 0, mercado: 0 },
  };
}

function buildAlerts(articles, { home, away }) {
  const alerts = [];
  const topRisk = articles.find((item) => item.signals.includes('desfalque'));
  const doubt = articles.find((item) => item.signals.includes('duvida'));
  const rotation = articles.find((item) => item.signals.includes('rotacao'));
  const lineup = articles.find((item) => item.signals.includes('escalacao'));

  if (topRisk) {
    alerts.push({
      level: 'high',
      tag: 'Desfalque',
      title: 'Possível ausência relevante detectada',
      text: `${topRisk.teamSide === 'away' ? away : home} apareceu em manchete com sinal de baixa disponibilidade.`,
    });
  }
  if (doubt) {
    alerts.push({
      level: 'medium',
      tag: 'Dúvida',
      title: 'Jogador/peça ainda em dúvida',
      text: 'Há manchetes sugerindo teste de última hora ou indefinição de disponibilidade.',
    });
  }
  if (rotation) {
    alerts.push({
      level: 'medium',
      tag: 'Rotação',
      title: 'Sinal de time misto ou gestão de elenco',
      text: 'O feed encontrou termos ligados a poupar, rodar ou mexer forte na escalação.',
    });
  }
  if (lineup) {
    alerts.push({
      level: 'low',
      tag: 'Escalação',
      title: 'Escalação provável entrou no radar',
      text: 'Há notícia ou chamada sugerindo lineup provável/confirmada. Vale revisar antes do clique final.',
    });
  }

  if (!alerts.length) {
    alerts.push({
      level: 'watch',
      tag: 'Neutro',
      title: 'Sem alerta forte no feed',
      text: 'O módulo não encontrou manchete crítica, mas ainda recomenda revisão perto do jogo.',
    });
  }

  return alerts.slice(0, 4);
}

function buildIntelFromArticles({ home, away, kickoff, articles }) {
  const enriched = articles.map((item) => {
    const signals = classifySignals(`${item.title} ${item.description}`);
    return {
      ...item,
      signals,
      score: scoreSignals(signals),
      teamSide: inferTeamSide(item, home, away),
    };
  }).filter((item) => item.signals.length || item.title);

  const unique = [];
  const seen = new Set();
  for (const item of enriched) {
    const key = normalizeText(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const ranked = unique.sort((a, b) => b.score - a.score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)).slice(0, 6);
  if (!ranked.length) return buildMockIntel({ home, away, kickoff });

  const breakdown = { desfalque: 0, duvida: 0, rotacao: 0, escalacao: 0, tatica: 0, mercado: 0 };
  ranked.forEach((item) => item.signals.forEach((signal) => { breakdown[signal] += 1; }));

  const homeItems = ranked.filter((item) => item.teamSide === 'home' || item.teamSide === 'match');
  const awayItems = ranked.filter((item) => item.teamSide === 'away' || item.teamSide === 'match');
  const totalImpact = Math.min(92, ranked.reduce((sum, item) => sum + item.score, 0));
  const impactLabel = totalImpact >= 60 ? 'Impacto forte' : totalImpact >= 34 ? 'Impacto moderado' : 'Impacto leve';
  const confidence = ranked.length >= 4 ? 'média' : 'baixa';
  const now = Date.now();
  const kickoffTs = kickoff ? new Date(kickoff).getTime() : null;
  const diffHours = kickoffTs ? Math.round((kickoffTs - now) / 3600000) : null;
  const urgency = diffHours !== null && diffHours <= 2 ? 'alta' : diffHours !== null && diffHours <= 8 ? 'média' : 'baixa';

  const recommendation = totalImpact >= 60
    ? 'Revisar pick e esperar confirmação oficial antes de entrar.'
    : totalImpact >= 34
      ? 'Comparar a pick com o contexto pré-jogo e revalidar 30–60 min antes da partida.'
      : 'Contexto ainda relativamente limpo, mas vale checar lineup perto do início.';

  return {
    mode: 'live_feed',
    status: totalImpact >= 60 ? 'atencao' : totalImpact >= 34 ? 'revisar' : 'monitorando',
    generatedAt: new Date().toISOString(),
    summary: {
      impactScore: totalImpact,
      impactLabel,
      recommendation,
      confidence,
      overall: ranked[0]?.title || 'Feed vivo carregado para o confronto.',
    },
    kickoffWindow: {
      urgency,
      label: diffHours === null ? 'Horário não informado' : `${Math.max(diffHours, 0)}h para o jogo`,
      note: urgency === 'alta'
        ? 'Janela crítica para confirmar escalações oficiais e mudanças finais.'
        : 'Use esta janela para comparar notícia, lineup provável e movimento do preço.',
    },
    teams: {
      home: {
        name: home,
        status: homeItems.some((item) => item.signals.includes('desfalque')) ? 'Atenção com elenco' : homeItems.some((item) => item.signals.includes('escalacao')) ? 'Escalação em pauta' : 'Sem alerta forte',
        note: homeItems[0]?.title || 'Nenhuma manchete específica do mandante se destacou até agora.',
      },
      away: {
        name: away,
        status: awayItems.some((item) => item.signals.includes('desfalque')) ? 'Atenção com elenco' : awayItems.some((item) => item.signals.includes('escalacao')) ? 'Escalação em pauta' : 'Sem alerta forte',
        note: awayItems[0]?.title || 'Nenhuma manchete específica do visitante se destacou até agora.',
      },
    },
    alerts: buildAlerts(ranked, { home, away }),
    headlines: ranked.map((item) => ({
      title: item.title,
      source: item.source,
      link: item.link,
      publishedAt: item.publishedAt,
      signals: item.signals,
      teamSide: item.teamSide,
    })),
    signalBreakdown: breakdown,
  };
}

async function fetchArticles(params) {
  const urls = buildSearchUrls(params);
  const settled = await Promise.allSettled(urls.map((url) => axios.get(url, { timeout: 12000, responseType: 'text' })));
  const articles = [];
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    articles.push(...parseRss(result.value.data));
  });
  return articles;
}

async function getPreMatchIntel({ competition = 'BSA', home, away, kickoff }) {
  const cacheKey = `prematch-${competition}-${normalizeText(home)}-${normalizeText(away)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  if (!home || !away) {
    const fallback = buildMockIntel({ home: home || 'Mandante', away: away || 'Visitante', kickoff });
    setCache(cacheKey, fallback, TTL.preMatchIntel || 8 * 60 * 1000);
    return fallback;
  }

  try {
    const articles = await fetchArticles({ competition, home, away });
    const intel = buildIntelFromArticles({ home, away, kickoff, articles });
    setCache(cacheKey, intel, TTL.preMatchIntel || 8 * 60 * 1000);
    return intel;
  } catch (error) {
    const fallback = buildMockIntel({ home, away, kickoff });
    fallback.mode = 'fallback';
    fallback.summary.overall = 'Feed vivo indisponível agora. O módulo entrou em fallback seguro.';
    setCache(cacheKey, fallback, TTL.preMatchIntel || 8 * 60 * 1000);
    return fallback;
  }
}

module.exports = {
  getPreMatchIntel,
};
