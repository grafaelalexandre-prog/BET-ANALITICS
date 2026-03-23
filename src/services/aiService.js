const axios = require('axios');
const { getKeys } = require('./runtimeService');

const AI_WEIGHTS = { Groq: 1.0, Gemini: 1.0, OpenRouter: 0.9 };

function stripJson(raw) {
  return JSON.parse(String(raw || '{}').replace(/```json|```/g, '').trim());
}

function buildReasonList({ nomeM, nomeV, probs, valueBets }) {
  const reasons = [];
  const favorito = probs?.mandante >= probs?.visitante ? nomeM : nomeV;
  const favoritoProb = Math.max(probs?.mandante || 0, probs?.visitante || 0);
  if (favoritoProb >= 55) reasons.push(`favoritismo estatístico de ${favorito} acima de ${favoritoProb.toFixed(1)}%`);
  if ((probs?.gols?.over25 || 0) >= 58) reasons.push('cenário com boa pressão para over 2.5');
  if ((probs?.gols?.btts || 0) >= 54) reasons.push('ambas marcam aparece viável no modelo');
  if (valueBets?.[0]) reasons.push(`o melhor edge atual está em ${valueBets[0].selection}`);
  return reasons.slice(0, 3);
}

function fallbackSingle(label, payload) {
  const { nomeM, nomeV, probs, valueBets } = payload;
  const favorito = probs?.mandante >= probs?.visitante ? nomeM : nomeV;
  const market = valueBets?.[0]?.selection || `Vitória ${favorito}`;
  const reasons = buildReasonList(payload);
  return {
    provider: label,
    source: 'fallback',
    veredito: `Leitura favorável para ${favorito}`,
    mercado_preferido: market,
    confianca: Math.min(90, Math.max(58, Math.round(Math.max(probs?.mandante || 0, probs?.visitante || 0)))),
    motivos: reasons,
    riscos: ['odd pode estar comprimida', 'mercado pode ajustar perto do jogo'],
    resumo: `${label}: ${favorito} aparece com vantagem no motor e contexto suficiente para sustentar leitura positiva.`,
  };
}

function buildPrompt(payload, providerName) {
  const { nomeM, nomeV, probs, oddsData, valueBets, contextNotes } = payload;
  return `Você é um analista de apostas esportivas. Use APENAS os dados fornecidos e responda SOMENTE JSON válido.
Provedor: ${providerName}
Jogo: ${nomeM} x ${nomeV}
Probabilidades 1X2: casa ${probs.mandante}% | empate ${probs.empate}% | fora ${probs.visitante}%
Mercados: over 2.5 ${probs.gols?.over25}% | BTTS ${probs.gols?.btts}% | over 1.5 ${probs.gols?.over15}%
Top placares: ${JSON.stringify(probs.topPlacar || [])}
Value bets: ${JSON.stringify(valueBets || [])}
Odds: ${JSON.stringify(oddsData || {})}
Contexto adicional: ${contextNotes || 'sem notícias adicionais; usar apenas motor + odds + contexto de mercado'}
Formato obrigatório:
{
  "veredito": "",
  "mercado_preferido": "",
  "confianca": 0,
  "motivos": ["", "", ""],
  "riscos": ["", ""],
  "resumo": ""
}`;
}

async function callGroq(payload) {
  const { groqApiKey } = getKeys();
  if (groqApiKey.startsWith('SUA_CHAVE_')) return fallbackSingle('Groq', payload);
  const prompt = buildPrompt(payload, 'Groq');
  const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', { model: 'llama-3.3-70b-versatile', temperature: 0.2, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }, { headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' } });
  return { provider: 'Groq', source: 'real', ...stripJson(data?.choices?.[0]?.message?.content) };
}

async function callGemini(payload) {
  const { geminiApiKey } = getKeys();
  if (geminiApiKey.startsWith('SUA_CHAVE_')) return fallbackSingle('Gemini', payload);
  const prompt = buildPrompt(payload, 'Gemini');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 700 } }, { headers: { 'Content-Type': 'application/json' } });
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n') || '{}';
  return { provider: 'Gemini', source: 'real', ...stripJson(text) };
}

async function callOpenRouter(payload) {
  const { openRouterApiKey } = getKeys();
  if (openRouterApiKey.startsWith('SUA_CHAVE_')) return fallbackSingle('OpenRouter', payload);
  const prompt = buildPrompt(payload, 'OpenRouter');
  const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', { model: 'meta-llama/llama-3.3-70b-instruct:free', temperature: 0.2, messages: [{ role: 'user', content: prompt }] }, { headers: { Authorization: `Bearer ${openRouterApiKey}`, 'Content-Type': 'application/json' } });
  return { provider: 'OpenRouter', source: 'real', ...stripJson(data?.choices?.[0]?.message?.content) };
}

async function analyzeWithGroq(payload) {
  const single = await callGroq(payload);
  return {
    resumo: single.resumo,
    analise_pre_jogo: `${single.provider} vê ${single.veredito.toLowerCase()} como leitura base do jogo.`,
    leitura_probabilidades: `Mercado preferido: ${single.mercado_preferido}. Motivos: ${(single.motivos || []).join('; ')}.`,
    avaliacao_risco: (single.riscos || []).join('; '),
    melhor_entrada: single.mercado_preferido,
    arbitrage_insight: 'Use arbitragem e edge do motor como filtro antes de executar.',
    veredicto: single.veredito,
    confianca: single.confianca,
    provider: single.provider,
  };
}

function normalizeVote(text='') {
  const t = String(text || '').toLowerCase();
  if (t.includes('empate')) return 'Empate';
  if (t.includes('fora') || t.includes('visitante')) return 'Fora';
  if (t.includes('over')) return 'Over 2.5';
  if (t.includes('btts')) return 'BTTS';
  if (t.includes('casa') || t.includes('mandante') || t.includes('vitória')) return 'Casa';
  return text || 'Indefinido';
}

function modelVote(payload) {
  const mandante = Number(payload?.probs?.mandante || 0);
  const empate = Number(payload?.probs?.empate || 0);
  const visitante = Number(payload?.probs?.visitante || 0);
  if (mandante >= empate && mandante >= visitante) return 'Casa';
  if (visitante >= mandante && visitante >= empate) return 'Fora';
  return 'Empate';
}

function buildConsensusBadge(consensus, alignment, weightedGap) {
  if (consensus === 'Unanimidade' && alignment) return 'Consenso Forte';
  if (consensus === 'Maioria' && weightedGap >= 0.8) return 'Consenso Moderado';
  if (consensus === 'Dividido') return 'Divergente';
  return alignment ? 'Alinhado ao Motor' : 'Atenção';
}

async function analyzeConsensus(payload) {
  const runners = [callGroq(payload), callGemini(payload), callOpenRouter(payload)];
  const labels = ['Groq', 'Gemini', 'OpenRouter'];
  const settled = await Promise.allSettled(runners);
  const analyses = settled.map((r, idx) => {
    const base = r.status === 'fulfilled' ? r.value : fallbackSingle(labels[idx], payload);
    const vote = normalizeVote(base.mercado_preferido || base.veredito);
    const weight = AI_WEIGHTS[base.provider] || 1;
    return { ...base, vote, weight };
  });

  const weightedVotes = {};
  const rawVotes = {};
  analyses.forEach((item) => {
    weightedVotes[item.vote] = (weightedVotes[item.vote] || 0) + item.weight;
    rawVotes[item.vote] = (rawVotes[item.vote] || 0) + 1;
  });

  const orderedWeighted = Object.entries(weightedVotes).sort((a, b) => b[1] - a[1]);
  const orderedRaw = Object.entries(rawVotes).sort((a, b) => b[1] - a[1]);
  const topVote = orderedWeighted[0]?.[0] || 'Indefinido';
  const topWeight = Number(orderedWeighted[0]?.[1] || 0);
  const secondWeight = Number(orderedWeighted[1]?.[1] || 0);
  const topCount = orderedRaw[0]?.[1] || 0;
  const consensus = topCount === analyses.length ? 'Unanimidade' : topCount >= 2 ? 'Maioria' : 'Dividido';
  const avgConfidence = Math.round(analyses.reduce((sum, a) => sum + Number(a.confianca || 0), 0) / Math.max(1, analyses.length));
  const motorDirection = modelVote(payload);
  const alignedWithMotor = topVote === motorDirection;
  const divergence = analyses.filter((item) => item.vote !== topVote).map((item) => ({
    provider: item.provider,
    vote: item.vote,
    confidence: item.confianca,
    source: item.source,
  }));
  const weightedGap = Number((topWeight - secondWeight).toFixed(2));
  const totalWeight = Number(Object.values(weightedVotes).reduce((a, b) => a + b, 0).toFixed(2));
  const badge = buildConsensusBadge(consensus, alignedWithMotor, weightedGap);

  return {
    analyses,
    summary: {
      consenso: consensus,
      selo: badge,
      voto_final: topVote,
      apoio: `${topCount}/${analyses.length}`,
      peso_vencedor: topWeight,
      gap_ponderado: weightedGap,
      peso_total: totalWeight,
      confianca_media: avgConfidence,
      alinhado_ao_motor: alignedWithMotor,
      voto_motor: motorDirection,
      providers_reais: analyses.filter((a) => a.source === 'real').length,
      providers_fallback: analyses.filter((a) => a.source !== 'real').length,
      divergencia: divergence,
      motivos_chave: analyses.flatMap((a) => a.motivos || []).filter(Boolean).slice(0, 6),
      riscos_chave: analyses.flatMap((a) => a.riscos || []).filter(Boolean).slice(0, 5),
      veredito_final: consensus === 'Dividido'
        ? 'Leituras divididas entre as IAs. Priorize gestão de risco e exija edge claro antes de entrar.'
        : `Consenso ${consensus.toLowerCase()} para ${topVote}${alignedWithMotor ? ', alinhado ao motor estatístico.' : ', mas com divergência em relação ao motor.'}`,
    }
  };
}

module.exports = { analyzeWithGroq, analyzeConsensus, normalizeVote };
