const express = require('express');
const { COMPETITIONS } = require('../config/constants');
const { getSummary } = require('../services/resultsService');
const { getWatchlistSummary } = require('../services/watchlistService');
const { apiErr } = require('../utils/helpers');
const { fetchStandings, fetchMatches, fetchTeamMatches, fetchOddsByCompetition, fetchOddsMatch, buildRoundPayload, getCompetition } = require('../services/dataService');
const { modelFromStandings, calcValueBets, deriveConfidenceScore, buildProbabilityExplanation, buildOpportunityScore, buildHumanVerdict, buildDecisionEngine } = require('../services/analysisService');
const { buildDashboardBoards } = require('../services/dashboardService');
const { getPreMatchIntel } = require('../services/preMatchIntelService');

const router = express.Router();

router.get('/competitions', (req, res) => {
  res.json({ defaultCompetition: 'BSA', competitions: Object.values(COMPETITIONS) });
});

router.get('/standings', async (req, res) => {
  try {
    res.json(await fetchStandings(req.query.competition || 'BSA'));
  } catch (e) { apiErr(res, e, 'Erro standings'); }
});

router.get('/matches', async (req, res) => {
  try {
    res.json(await fetchMatches({ competitionCode: req.query.competition || 'BSA', status: req.query.status }));
  } catch (e) { apiErr(res, e, 'Erro matches'); }
});

router.get('/team/:id/matches', async (req, res) => {
  try {
    res.json(await fetchTeamMatches(req.params.id, req.query.teamName || 'Time'));
  } catch (e) { apiErr(res, e, 'Erro forma do time'); }
});

router.get('/odds', async (req, res) => {
  try {
    res.json(await fetchOddsByCompetition(req.query.competition || 'BSA'));
  } catch (e) { apiErr(res, e, 'Erro odds'); }
});

router.get('/odds/match', async (req, res) => {
  try {
    res.json(await fetchOddsMatch({ competitionCode: req.query.competition || 'BSA', home: req.query.home, away: req.query.away }));
  } catch (e) { apiErr(res, e, 'Erro odds confronto'); }
});

router.get('/round', async (req, res) => {
  try {
    res.json(await buildRoundPayload(req.query.competition || 'BSA'));
  } catch (e) { apiErr(res, e, 'Erro jogos da rodada'); }
});

router.get('/pre-match-intel', async (req, res) => {
  try {
    res.json(await getPreMatchIntel({
      competition: req.query.competition || 'BSA',
      home: req.query.home,
      away: req.query.away,
      kickoff: req.query.kickoff,
    }));
  } catch (e) { apiErr(res, e, 'Erro inteligência pré-jogo'); }
});


router.get('/opportunities', async (req, res) => {
  try {
    const payload = await buildRoundPayload(req.query.competition || 'BSA');
    res.json({ competition: payload.competition, generatedAt: new Date().toISOString(), items: payload.topOpportunities || payload.games || [] });
  } catch (e) { apiErr(res, e, 'Erro oportunidades'); }
});



router.get('/dashboard-summary', async (req, res) => {
  try {
    const competitionCode = req.query.competition || 'BSA';
    const payload = await buildRoundPayload(competitionCode);
    const summary = getSummary();
    const watchlist = getWatchlistSummary();
    const boards = buildDashboardBoards({ payload, summary, watchlist });
    const top = payload.topOpportunities || payload.games || [];
    const spotlight = boards.spotlight;
    const strongest = boards.strongest;
    const value = boards.value;
    const danger = boards.danger;
    const hotGoals = boards.hotGoals;
    const safe = boards.safe;

    const operationBoard = {
      strongestGame: strongest ? {
        ...strongest,
        title: 'Jogo mais forte',
        note: strongest.verdict?.mercadoBase || 'Favoritismo principal do radar',
        badge: `Confiança ${strongest.confidence?.score || 0}/100`,
      } : null,
      bestValueGame: value ? {
        ...value,
        title: 'Melhor odd com valor',
        note: value.destaqueValue ? `${value.destaqueValue.selection} com edge +${value.destaqueValue.edge}%` : 'Sem edge forte confirmado',
        badge: value.destaqueValue ? `${value.destaqueValue.casa || 'Casa'} • +${value.destaqueValue.edge}%` : 'Em observação',
      } : null,
      dangerGame: danger ? {
        ...danger,
        title: 'Jogo mais perigoso',
        note: danger.verdict?.risco ? `Risco ${danger.verdict.risco}` : 'Leitura mais volátil do painel',
        badge: `BTTS ${danger.gols?.btts || 0}%`,
      } : null,
      hotGoalsGame: hotGoals ? {
        ...hotGoals,
        title: 'Jogo quente de gols',
        note: hotGoals.verdict?.mercadoAlternativo || 'Mercado de gols em destaque',
        badge: `Over 2.5 ${hotGoals.gols?.over25 || 0}%`,
      } : null,
    };

    const premiumPick = spotlight ? {
      ...spotlight,
      seal:
        (spotlight.destaqueValue?.edge || 0) >= 6 && (spotlight.confidence?.score || 0) >= 74
          ? 'Entrada Premium'
          : (spotlight.confidence?.score || 0) >= 82
            ? 'Entrada Segura'
            : (spotlight.destaqueValue?.edge || 0) >= 5
              ? 'Entrada de Valor'
              : 'Somente Observação',
      lane:
        (spotlight.confidence?.score || 0) >= 82
          ? 'Abrir primeiro'
          : (spotlight.destaqueValue?.edge || 0) >= 5
            ? 'Checar preço'
            : 'Monitorar antes de entrar',
      execution:
        spotlight.verdict?.estiloEntrada === 'agressiva'
          ? 'Mercado com folga estatística maior, permite execução mais firme.'
          : spotlight.verdict?.estiloEntrada === 'moderada'
            ? 'Cenário bom, mas ainda pede leitura de preço e confirmação final.'
            : 'Cenário útil para radar, mas com risco mais sensível e menor margem de erro.',
    } : null;

    const operationalPriority = [
      strongest ? {
        tier: 'P1',
        label: `${strongest.mandante} x ${strongest.visitante}`,
        action: 'Abrir e ler cenário base',
        focus: strongest.verdict?.mercadoBase || 'Mercado principal',
        tag: 'Força do motor',
        score: strongest.confidence?.score || strongest.opportunityScore || 0,
      } : null,
      value ? {
        tier: 'P2',
        label: `${value.mandante} x ${value.visitante}`,
        action: 'Comparar preço e edge',
        focus: value.destaqueValue ? `${value.destaqueValue.selection} +${value.destaqueValue.edge}%` : 'Sem edge confirmado',
        tag: 'Valor de mercado',
        score: value.destaqueValue?.edge || value.opportunityScore || 0,
      } : null,
      hotGoals ? {
        tier: 'P3',
        label: `${hotGoals.mandante} x ${hotGoals.visitante}`,
        action: 'Checar bloco de gols',
        focus: hotGoals.verdict?.mercadoAlternativo || `Over 2.5 ${hotGoals.gols?.over25 || 0}%`,
        tag: 'Mercado de gols',
        score: hotGoals.gols?.over25 || 0,
      } : null,
      danger ? {
        tier: 'P4',
        label: `${danger.mandante} x ${danger.visitante}`,
        action: 'Manter em observação',
        focus: danger.verdict?.risco ? `Risco ${danger.verdict.risco}` : 'Leitura volátil',
        tag: 'Cautela',
        score: 100 - (danger.confidence?.score || 0),
      } : null,
    ].filter(Boolean);

    const quickWarnings = [
      value?.destaqueValue?.edge > 6 ? {
        level: 'value',
        title: 'Edge acima do padrão',
        text: `${value.mandante} x ${value.visitante} abriu a melhor distorção do radar em ${value.destaqueValue.selection}.`,
      } : null,
      danger && (danger.confidence?.score || 0) < 62 ? {
        level: 'risk',
        title: 'Jogo com leitura instável',
        text: `${danger.mandante} x ${danger.visitante} combina confiança mais baixa com variância elevada de gols.`,
      } : null,
      hotGoals && (hotGoals.gols?.over25 || 0) >= 60 ? {
        level: 'goals',
        title: 'Mercado de gols aquecido',
        text: `${hotGoals.mandante} x ${hotGoals.visitante} chegou forte para Over 2.5.`,
      } : null,
      strongest && (strongest.confidence?.score || 0) >= 82 ? {
        level: 'strong',
        title: 'Favoritismo bem sustentado',
        text: `${strongest.mandante} x ${strongest.visitante} lidera o painel com confiança alta do motor.`,
      } : null,
    ].filter(Boolean);

    const nowWorking = [];
    if (strongest) nowWorking.push({
      type: 'forca',
      title: 'O que está funcionando agora',
      label: `${strongest.mandante} x ${strongest.visitante}`,
      text: strongest.verdict?.vereditoFinal || strongest.explanation?.summary || 'Favoritismo mais limpo do painel.',
      badge: `Confiança ${strongest.confidence?.score || 0}`,
    });
    if (value && value.destaqueValue) nowWorking.push({
      type: 'valor',
      title: 'Onde o preço está sorrindo',
      label: `${value.mandante} x ${value.visitante}`,
      text: `${value.destaqueValue.selection} apareceu com edge +${value.destaqueValue.edge}% em ${value.destaqueValue.casa || 'casa disponível'}.`,
      badge: `Edge +${value.destaqueValue.edge}%`,
    });
    if (hotGoals) nowWorking.push({
      type: 'gols',
      title: 'Mercado de gols em bom ponto',
      label: `${hotGoals.mandante} x ${hotGoals.visitante}`,
      text: hotGoals.verdict?.mercadoAlternativo || `Over 2.5 em ${hotGoals.gols?.over25 || 0}% no motor.`,
      badge: `Over 2.5 ${hotGoals.gols?.over25 || 0}%`,
    });

    const cautionBoard = [];
    if (danger) cautionBoard.push({
      title: 'Onde está a maior cautela',
      label: `${danger.mandante} x ${danger.visitante}`,
      text: danger.verdict?.risco ? `Risco ${danger.verdict.risco}. ${danger.verdict?.evitarEntrada || ''}`.trim() : (danger.explanation?.risks?.[0] || 'Leitura mais volátil no radar.'),
      badge: `Confiança ${danger.confidence?.score || 0}`,
    });
    if (!value?.destaqueValue) cautionBoard.push({
      title: 'Pulso de preço ainda curto',
      label: payload.competition?.name || 'Competição',
      text: 'O radar não encontrou edge forte o bastante para priorizar execução agressiva agora.',
      badge: 'Sem edge alto',
    });

    const focusNow = [
      strongest ? {
        title: 'O que merece prioridade hoje',
        label: `${strongest.mandante} x ${strongest.visitante}`,
        text: 'Abrir primeiro, validar mercado-base e só depois comparar preço.',
        badge: 'Abrir primeiro',
      } : null,
      value ? {
        title: 'Onde comparar preço com calma',
        label: `${value.mandante} x ${value.visitante}`,
        text: value.destaqueValue ? `Conferir se ${value.destaqueValue.selection} segura o edge até a entrada.` : 'Revisar a cotação antes de avançar.',
        badge: value.destaqueValue ? `+${value.destaqueValue.edge}%` : 'Checar preço',
      } : null,
    ].filter(Boolean);

    const actionQueue = [
      strongest ? { type: 'Abrir primeiro', label: `${strongest.mandante} x ${strongest.visitante}`, note: strongest.verdict?.resumoCurto || strongest.explanation?.summary, score: strongest.confidence?.score || strongest.opportunityScore || 0 } : null,
      value ? { type: 'Checar valor', label: `${value.mandante} x ${value.visitante}`, note: value.destaqueValue ? `${value.destaqueValue.selection} em ${value.destaqueValue.casa || 'casa disponível'}` : 'Sem edge forte no momento', score: value.destaqueValue?.edge || value.opportunityScore || 0 } : null,
      hotGoals ? { type: 'Acompanhar', label: `${hotGoals.mandante} x ${hotGoals.visitante}`, note: hotGoals.verdict?.mercadoAlternativo || `Over 2.5 ${hotGoals.gols?.over25 || 0}%`, score: hotGoals.gols?.over25 || 0 } : null,
    ].filter(Boolean);

    const quickPicks = {
      principal: strongest || spotlight,
      conservadora: safe || strongest || spotlight,
      valor: value || spotlight,
      gols: hotGoals || spotlight,
    };

    const trackerStatus = (summary.hitRate || 0) >= 60 ? 'positivo' : (summary.total || 0) >= 5 ? 'neutro' : 'amostra curta';
    const radarStatus = (strongest?.confidence?.score || 0) >= 80 ? 'forte' : (strongest?.confidence?.score || 0) >= 65 ? 'equilibrado' : 'sensível';
    const valueStatus = value?.destaqueValue?.edge >= 5 ? 'ativo' : value?.destaqueValue?.edge >= 2 ? 'moderado' : 'fraco';
    const modeStatus = payload?.source === 'api' ? 'ativo' : 'seguro';
    const engineHealth = {
      radarStatus,
      trackerStatus,
      valueStatus,
      modeStatus,
      summary: strongest
        ? `${strongest.mandante} x ${strongest.visitante} sustenta o radar em modo ${radarStatus}, enquanto o tracker segue ${trackerStatus} e o value está ${valueStatus}.`
        : 'Sem leitura consolidada do radar no momento.',
    };

    const executionChecklist = [
      { step: '1', title: 'Abrir jogo principal', note: strongest ? `${strongest.mandante} x ${strongest.visitante} lidera o painel.` : 'Sem jogo forte confirmado ainda.' },
      { step: '2', title: 'Conferir preço', note: value?.destaqueValue ? `${value.destaqueValue.selection} com edge +${value.destaqueValue.edge}% em ${value.destaqueValue.casa || 'casa disponível'}.` : 'Nenhum edge forte confirmado agora.' },
      { step: '3', title: 'Passar no bloco de gols', note: hotGoals ? `${hotGoals.mandante} x ${hotGoals.visitante} aparece quente para gols.` : 'Sem jogo quente de gols agora.' },
      { step: '4', title: 'Definir observação ou entrada', note: danger?.verdict?.evitarEntrada || 'Se o risco continuar alto, manter em observação.' },
    ];

    res.json({
      competition: payload.competition,
      source: payload.source,
      generatedAt: new Date().toISOString(),
      spotlight,
      cards: boards.cards,
      quickPicks,
      actionQueue,
      operationBoard,
      premiumPick,
      operationalPriority,
      quickWarnings,
      focusBoard: { nowWorking, cautionBoard, focusNow },
      executionChecklist,
      engineHealth,
      timingBoard: boards.timingBoard,
      marketPulse: boards.marketPulse,
      decisionFlow: boards.decisionFlow,
    });
  } catch (e) { apiErr(res, e, 'Erro painel principal'); }
});

router.post('/analisar-completo', async (req, res) => {
  try {
    const { competition = 'BSA', nomeM, nomeV, teamIdM, teamIdV, table } = req.body;
    const competitionMeta = getCompetition(competition);
    const standings = table ? { standings: [{ table }] } : await fetchStandings(competition);
    const effectiveTable = standings.standings?.[0]?.table || [];
    const { model, homeStrength, awayStrength } = modelFromStandings({ table: effectiveTable, homeTeam: { id: teamIdM, name: nomeM }, awayTeam: { id: teamIdV, name: nomeV } });
    const oddsMatch = await fetchOddsMatch({ competitionCode: competition, home: nomeM, away: nomeV });
    const valueBets = calcValueBets(model, oddsMatch.casas);
    const confidence = deriveConfidenceScore({ model, homeStrength, awayStrength, valueBets });
    const explanation = buildProbabilityExplanation({ homeTeam: { id: teamIdM, name: nomeM }, awayTeam: { id: teamIdV, name: nomeV }, homeStrength, awayStrength, model, valueBets, competition: competitionMeta });
    const opportunityScore = buildOpportunityScore({ model, valueBets, confidence });
    const verdict = buildHumanVerdict({ homeTeam: nomeM, awayTeam: nomeV, model, valueBets, confidence, explanation });
    const preMatchIntel = await getPreMatchIntel({ competition, home: nomeM, away: nomeV, kickoff: req.body?.kickoff });
    const decisionEngine = buildDecisionEngine({ game: { oportunidadeScore: opportunityScore, opportunityScore, confidence, destaqueValue: valueBets[0] || null, valueBets, gols: model.gols, verdict, explanation }, intel: preMatchIntel });
    res.json({ competition: competitionMeta, homeTeam: nomeM, awayTeam: nomeV, strengths: { mandante: homeStrength, visitante: awayStrength }, ...model, valueBets, confidence, explanation, verdict, opportunityScore, preMatchIntel, decisionEngine, generatedAt: new Date().toISOString() });
  } catch (e) { apiErr(res, e, 'Erro análise completa'); }
});

module.exports = router;
