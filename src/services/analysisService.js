const { normalizeText } = require('../utils/helpers');

function poissonRandom(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function monteCarloExpanded(lM, lV, simulations = 10000) {
  let pM = 0;
  let pE = 0;
  let pV = 0;
  let over05 = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsSim = 0;
  const placarMap = {};

  for (let i = 0; i < simulations; i += 1) {
    const gM = poissonRandom(Math.max(0.15, lM));
    const gV = poissonRandom(Math.max(0.15, lV));
    const total = gM + gV;

    if (gM > gV) pM += 1;
    else if (gM === gV) pE += 1;
    else pV += 1;

    if (total > 0.5) over05 += 1;
    if (total > 1.5) over15 += 1;
    if (total > 2.5) over25 += 1;
    if (total > 3.5) over35 += 1;
    if (gM > 0 && gV > 0) bttsSim += 1;

    const key = `${gM}-${gV}`;
    placarMap[key] = (placarMap[key] || 0) + 1;
  }

  const topPlacar = Object.entries(placarMap)
    .map(([placar, count]) => {
      const [gM, gV] = placar.split('-').map(Number);
      return { gM, gV, placar: `${gM}x${gV}`, prob: +((count / simulations) * 100).toFixed(2) };
    })
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 8);

  return {
    lM: +lM.toFixed(2),
    lV: +lV.toFixed(2),
    mandante: +((pM / simulations) * 100).toFixed(2),
    empate: +((pE / simulations) * 100).toFixed(2),
    visitante: +((pV / simulations) * 100).toFixed(2),
    gols: {
      over05: +((over05 / simulations) * 100).toFixed(2),
      over15: +((over15 / simulations) * 100).toFixed(2),
      over25: +((over25 / simulations) * 100).toFixed(2),
      over35: +((over35 / simulations) * 100).toFixed(2),
      btts: +((bttsSim / simulations) * 100).toFixed(2),
    },
    topPlacar,
    simulations,
  };
}

function deriveLeagueMetrics(table = []) {
  const valid = table.filter((row) => row.playedGames > 0);
  const totalFor = valid.reduce((sum, row) => sum + (row.goalsFor || 0), 0);
  const totalAgainst = valid.reduce((sum, row) => sum + (row.goalsAgainst || 0), 0);
  const totalGames = valid.reduce((sum, row) => sum + (row.playedGames || 0), 0);
  const avgGoals = totalGames > 0 ? (totalFor + totalAgainst) / totalGames / 2 : 1.2;
  return { avgGoals: Math.max(0.8, avgGoals) };
}

function strengthFromStandings(table = [], teamLike) {
  const metrics = deriveLeagueMetrics(table);
  const normNeedle = normalizeText(teamLike?.name || teamLike || '');
  const row = table.find((item) => item.team?.id === teamLike?.id)
    || table.find((item) => normalizeText(item.team?.name) === normNeedle)
    || table.find((item) => normalizeText(item.team?.shortName) === normNeedle);

  if (!row || !row.playedGames) return { atk: 1, def: 1, row: null };

  const gf = (row.goalsFor || 0) / Math.max(1, row.playedGames);
  const ga = (row.goalsAgainst || 0) / Math.max(1, row.playedGames);
  return {
    atk: +(gf / metrics.avgGoals).toFixed(2),
    def: +(ga / metrics.avgGoals).toFixed(2),
    row,
  };
}

function modelFromStandings({ table, homeTeam, awayTeam }) {
  const m = strengthFromStandings(table, homeTeam);
  const v = strengthFromStandings(table, awayTeam);
  const league = deriveLeagueMetrics(table);
  const homeAdv = 1.12;
  const lM = Math.max(0.2, league.avgGoals * m.atk * Math.max(0.65, v.def) * homeAdv);
  const lV = Math.max(0.2, league.avgGoals * v.atk * Math.max(0.65, m.def) * 0.92);
  return {
    model: monteCarloExpanded(lM, lV, 10000),
    homeStrength: m,
    awayStrength: v,
  };
}

function bestOutcomeOdds(casas, market, outcomeKey) {
  let best = null;
  Object.values(casas || {}).forEach((casa) => {
    const odd = casa?.[market]?.[outcomeKey];
    if (odd && (!best || odd > best.odd)) best = { casa: casa.nome, cor: casa.cor, odd };
  });
  return best;
}

function calcValueBets(model, casas) {
  const values = [];
  const pushValue = (marketType, selection, probReal, best) => {
    if (!best?.odd || !probReal) return;
    const probImplicita = 100 / best.odd;
    const edge = +(probReal - probImplicita).toFixed(2);
    if (edge > 1.5) values.push({ marketType, selection, casa: best.casa, odd: best.odd, probReal: +probReal.toFixed(2), probImplicita: +probImplicita.toFixed(2), edge });
  };
  pushValue('1X2', 'Casa', model.mandante, bestOutcomeOdds(casas, 'h2h', 'casa'));
  pushValue('1X2', 'Empate', model.empate, bestOutcomeOdds(casas, 'h2h', 'empate'));
  pushValue('1X2', 'Fora', model.visitante, bestOutcomeOdds(casas, 'h2h', 'fora'));
  pushValue('Gols', 'Over 2.5', model.gols.over25, bestOutcomeOdds(casas, 'totals25', 'over'));
  pushValue('Gols', 'Under 2.5', 100 - model.gols.over25, bestOutcomeOdds(casas, 'totals25', 'under'));
  pushValue('BTTS', 'Sim', model.gols.btts, bestOutcomeOdds(casas, 'btts', 'sim'));
  pushValue('BTTS', 'Não', 100 - model.gols.btts, bestOutcomeOdds(casas, 'btts', 'nao'));
  return values.sort((a, b) => b.edge - a.edge);
}

function findArbitrage(casas) {
  const bestHome = bestOutcomeOdds(casas, 'h2h', 'casa');
  const bestDraw = bestOutcomeOdds(casas, 'h2h', 'empate');
  const bestAway = bestOutcomeOdds(casas, 'h2h', 'fora');
  const opportunities = [];
  if (bestHome?.odd && bestDraw?.odd && bestAway?.odd) {
    const margin = 1 / bestHome.odd + 1 / bestDraw.odd + 1 / bestAway.odd;
    if (margin < 1) opportunities.push({ tipo: '1X2', margem: +margin.toFixed(4), lucroGarantido: +(((1 / margin) - 1) * 100).toFixed(2), entradas: [bestHome, bestDraw, bestAway] });
  }
  return opportunities;
}


function deriveConfidenceScore({ model, homeStrength, awayStrength, valueBets = [] }) {
  const probs = [model?.mandante || 0, model?.empate || 0, model?.visitante || 0].sort((a, b) => b - a);
  const gap = (probs[0] || 0) - (probs[1] || 0);
  const atkGap = Math.abs((homeStrength?.atk || 1) - (awayStrength?.atk || 1));
  const defGap = Math.abs((homeStrength?.def || 1) - (awayStrength?.def || 1));
  const edgeBoost = Math.min(10, (valueBets[0]?.edge || 0) * 0.7);
  const goalsBalancePenalty = Math.abs((model?.gols?.btts || 50) - 50) < 6 ? 4 : 0;
  const score = 44 + gap * 0.65 + atkGap * 10 + defGap * 8 + edgeBoost - goalsBalancePenalty;
  const numeric = Math.max(48, Math.min(94, Math.round(score)));
  const level = numeric >= 82 ? 'Alta' : numeric >= 68 ? 'Boa' : numeric >= 58 ? 'Moderada' : 'Baixa';
  return { score: numeric, level };
}

function buildProbabilityExplanation({ homeTeam, awayTeam, homeStrength, awayStrength, model, valueBets = [], competition }) {
  const favorite = (model?.mandante || 0) >= (model?.visitante || 0)
    ? { side: 'Casa', name: homeTeam?.name || homeTeam || 'Mandante', attack: homeStrength?.atk || 1, oppDefense: awayStrength?.def || 1 }
    : { side: 'Fora', name: awayTeam?.name || awayTeam || 'Visitante', attack: awayStrength?.atk || 1, oppDefense: homeStrength?.def || 1 };

  const reasons = [];
  if ((favorite.attack || 1) >= 1.15) reasons.push(`${favorite.name} chega com ataque acima da média do campeonato`);
  if ((favorite.oppDefense || 1) >= 1.08) reasons.push(`o adversário vem cedendo gols em nível acima da média defensiva`);
  if (favorite.side === 'Casa' && (model?.mandante || 0) > (model?.visitante || 0)) reasons.push('o mando de campo reforça a leitura do modelo');
  if ((model?.gols?.over25 || 0) >= 58) reasons.push('o confronto projeta boa pressão ofensiva para um jogo mais aberto');
  if ((model?.gols?.btts || 0) >= 56) reasons.push('há espaço para ambas equipes marcarem, o que aumenta volatilidade de gols');
  if (valueBets?.[0]) reasons.push(`a melhor distorção de preço aparece em ${valueBets[0].selection} na ${valueBets[0].casa}`);

  const risks = [];
  if (Math.abs((model?.mandante || 0) - (model?.visitante || 0)) < 10) risks.push('a distância entre os lados ainda não é ampla, então o jogo pede gestão de risco');
  if (((model?.gols?.btts || 0) > 48) && ((model?.gols?.btts || 0) < 58)) risks.push('o mercado de ambas marcam está equilibrado e pode aumentar a variância');
  if (!valueBets?.length) risks.push('não há edge forte confirmado nas odds disponíveis neste momento');

  const summary = `${favorite.name} aparece na frente porque o motor vê vantagem técnica${competition?.name ? ` em ${competition.name}` : ''}${reasons.length ? `, apoiada por ${reasons.slice(0, 2).join(' e ')}` : ''}.`;

  return {
    favorite: favorite.name,
    summary,
    reasons: reasons.slice(0, 4),
    risks: risks.slice(0, 3),
  };
}

function buildOpportunityScore({ model, valueBets = [], confidence }) {
  const top1x2 = Math.max(model?.mandante || 0, model?.empate || 0, model?.visitante || 0);
  const edge = valueBets?.[0]?.edge || 0;
  const score = Math.round((top1x2 * 0.45) + ((model?.gols?.over25 || 0) * 0.1) + ((model?.gols?.btts || 0) * 0.05) + (edge * 2.2) + ((confidence?.score || 60) * 0.25));
  return Math.max(45, Math.min(99, score));
}


function buildHumanVerdict({ homeTeam, awayTeam, model, valueBets = [], confidence, explanation }) {
  const probs = [
    { key: 'Casa', label: homeTeam?.name || homeTeam || 'Mandante', prob: model?.mandante || 0 },
    { key: 'Empate', label: 'Empate', prob: model?.empate || 0 },
    { key: 'Fora', label: awayTeam?.name || awayTeam || 'Visitante', prob: model?.visitante || 0 },
  ].sort((a, b) => b.prob - a.prob);

  const primary = probs[0];
  const gap = (probs[0]?.prob || 0) - (probs[1]?.prob || 0);
  const topValue = valueBets?.[0] || null;
  const bestGoals = [
    { label: 'Over 1.5', prob: model?.gols?.over15 || 0 },
    { label: 'Over 2.5', prob: model?.gols?.over25 || 0 },
    { label: 'Over 3.5', prob: model?.gols?.over35 || 0 },
    { label: 'BTTS Sim', prob: model?.gols?.btts || 0 },
  ].sort((a, b) => b.prob - a.prob)[0];

  const action = topValue
    ? `${topValue.selection} na ${topValue.casa} aparece como melhor distorção de preço agora.`
    : `${primary.label} sustenta a melhor leitura base, mas sem edge forte confirmado nas odds.`;

  const style = gap >= 16 ? 'agressiva' : gap >= 9 ? 'moderada' : 'conservadora';
  const riskLevel = (confidence?.score || 0) >= 82 ? 'Controlado' : (confidence?.score || 0) >= 68 ? 'Médio' : 'Elevado';

  return {
    favorito: primary.label,
    mercadoBase: primary.key === 'Casa' ? `Vitória ${homeTeam?.name || homeTeam || 'mandante'}` : primary.key === 'Fora' ? `Vitória ${awayTeam?.name || awayTeam || 'visitante'}` : 'Empate',
    mercadoAlternativo: bestGoals?.label || 'Mercado de gols',
    recomendacao: action,
    estiloEntrada: style,
    risco: riskLevel,
    resumoCurto: `${primary.label} lidera o modelo com ${primary.prob.toFixed(1)}% e confiança ${String(confidence?.level || 'moderada').toLowerCase()}.`,
    vereditoFinal: `${primary.label} aparece como lado principal do confronto${topValue ? `, enquanto ${topValue.selection} entrega o melhor valor disponível` : ''}.`,
    pontosChave: [
      ...(explanation?.reasons || []).slice(0, 3),
      bestGoals?.prob >= 58 ? `${bestGoals.label} ganhou força no bloco de gols.` : null,
    ].filter(Boolean).slice(0, 4),
    alertas: (explanation?.risks || []).slice(0, 3),
  };
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getIntelPenalty(intel = {}) {
  const impact = Number(intel?.summary?.impactScore || 0);
  const breakdown = intel?.signalBreakdown || {};
  const strongAlerts = (intel?.alerts || []).filter((item) => item.level === 'high').length;
  const mediumAlerts = (intel?.alerts || []).filter((item) => item.level === 'medium').length;
  let penalty =
    (impact * 0.22)
    + ((breakdown.desfalque || 0) * 7)
    + ((breakdown.duvida || 0) * 4)
    + ((breakdown.rotacao || 0) * 5)
    + ((breakdown.escalacao || 0) * 2)
    + (strongAlerts * 6)
    + (mediumAlerts * 3)
    + (intel?.mode === 'fallback' ? 3 : 0)
    + (intel?.status === 'atencao' ? 6 : intel?.status === 'revisar' ? 3 : 0);
  if (intel?.mode === 'mock' && impact <= 20) penalty -= 2;
  return clamp(Math.round(penalty), 0, 26);
}

function buildDecisionEngine({ game = {}, intel = null } = {}) {
  const baseScore = Number(game?.opportunityScore || 0);
  const confidenceScore = Number(game?.confidence?.score || 0);
  const edge = Number(game?.destaqueValue?.edge || game?.valueBets?.[0]?.edge || 0);
  const goalsHeat = Number(game?.gols?.over25 || 0);
  const btts = Number(game?.gols?.btts || 0);
  const riskText = normalizeText(game?.verdict?.risco || '');
  const volatilityPenalty = riskText.includes('elev') || riskText.includes('alto') ? 8 : riskText.includes('medio') ? 4 : 0;
  const balancePenalty = Math.abs(btts - 50) < 6 ? 3 : 0;
  const valueBoost = clamp(Math.round(edge * 0.95), 0, 8);
  const confidenceBoost = confidenceScore >= 82 ? 6 : confidenceScore >= 74 ? 4 : confidenceScore >= 66 ? 1 : -4;
  const goalsBoost = goalsHeat >= 60 ? 2 : goalsHeat >= 54 ? 1 : 0;
  const intelPenalty = getIntelPenalty(intel);
  const finalScore = clamp(Math.round((baseScore * 0.72) + (confidenceScore * 0.22) + valueBoost + confidenceBoost + goalsBoost + 6 - volatilityPenalty - balancePenalty - intelPenalty), 42, 97);

  let action = 'manter';
  let label = 'Manter';
  let color = 'green';
  if (intelPenalty >= 18 || finalScore < 54) {
    action = 'evitar';
    label = 'Evitar';
    color = 'red';
  } else if (intelPenalty >= 11 || finalScore < 62) {
    action = 'revisar';
    label = 'Revisar';
    color = 'red';
  } else if (intelPenalty >= 6 || finalScore < 70) {
    action = 'atencao';
    label = 'Atenção';
    color = 'amber';
  }

  const reasons = [];
  if (confidenceScore >= 74) reasons.push('base estatística sustenta boa confiança');
  if (edge >= 4) reasons.push(`odd ainda oferece edge +${edge}%`);
  if (goalsHeat >= 60) reasons.push('mercado de gols segue aquecido');
  if (!intelPenalty) reasons.push('pré-jogo sem ruído forte no radar');
  if (intelPenalty >= 6 && intel?.summary?.overall) reasons.push(`contexto pré-jogo pede cautela: ${intel.summary.overall}`);
  if (!reasons.length && game?.verdict?.resumoCurto) reasons.push(game.verdict.resumoCurto);

  const caution = [];
  if (volatilityPenalty >= 8) caution.push('leitura estatística já vinha mais volátil');
  if (balancePenalty) caution.push('BTTS equilibrado aumenta a variância');
  if (intelPenalty >= 11) caution.push('intel pré-jogo derrubou a força da pick');
  if (!caution.length && game?.explanation?.risks?.length) caution.push(...game.explanation.risks.slice(0, 2));

  const justification = action === 'manter'
    ? `Boa forma do motor${edge >= 4 ? ', preço ainda saudável' : ''}${intelPenalty ? ', mas com monitoramento leve' : ' e cenário pré-jogo estável'}.`
    : action === 'atencao'
      ? `A pick continua viva, mas o contexto pré-jogo e/ou a margem estatística pedem atenção antes da entrada.`
      : action === 'revisar'
        ? `O pick perdeu força com o contexto atual. Vale revalidar lineup, preço e risco antes de confirmar.`
        : `A leitura ficou fraca para execução agora. Melhor evitar até nova confirmação.`;

  return {
    finalScore,
    baseScore,
    confidenceScore,
    intelPenalty,
    action,
    label,
    color,
    recommendation: action === 'manter' ? 'Manter pick' : action === 'atencao' ? 'Atenção pré-jogo' : action === 'revisar' ? 'Revisar pick' : 'Evitar por enquanto',
    justification,
    reasons: reasons.slice(0, 3),
    caution: caution.slice(0, 3),
    weights: {
      valor: valueBoost,
      confianca: confidenceBoost,
      gols: goalsBoost,
      risco: volatilityPenalty + balancePenalty,
      intel: intelPenalty,
    },
  };
}

function getTopSelectionFromModel(model) {
  return [
    { marketType: '1X2', selection: 'Casa', probReal: model?.mandante || 0 },
    { marketType: '1X2', selection: 'Empate', probReal: model?.empate || 0 },
    { marketType: '1X2', selection: 'Fora', probReal: model?.visitante || 0 },
  ].sort((a, b) => b.probReal - a.probReal)[0];
}

module.exports = {
  monteCarloExpanded,
  modelFromStandings,
  bestOutcomeOdds,
  calcValueBets,
  findArbitrage,
  getTopSelectionFromModel,
  deriveConfidenceScore,
  buildProbabilityExplanation,
  buildOpportunityScore,
  buildHumanVerdict,
  buildDecisionEngine,
};
