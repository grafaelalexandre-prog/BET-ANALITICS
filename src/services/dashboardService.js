function buildDashboardBoards({ payload, summary, watchlist }) {
  const top = payload?.topOpportunities || payload?.games || [];
  const spotlight = top[0] || null;
  const strongest = [...top].sort((a, b) => (b.decisionEngine?.finalScore || 0) - (a.decisionEngine?.finalScore || 0) || (b.confidence?.score || 0) - (a.confidence?.score || 0) || (b.opportunityScore || 0) - (a.opportunityScore || 0))[0] || spotlight;
  const value = top.find((item) => item.destaqueValue?.edge > 4) || top.find((item) => item.destaqueValue) || spotlight;
  const danger = [...top].sort((a, b) => (((a.decisionEngine?.intelPenalty || 0) * 0.7) + ((100 - (a.confidence?.score || 0)) * 0.2) + ((a.gols?.btts || 0) * 0.1)) - (((b.decisionEngine?.intelPenalty || 0) * 0.7) + ((100 - (b.confidence?.score || 0)) * 0.2) + ((b.gols?.btts || 0) * 0.1)))[0] || spotlight;
  const hotGoals = [...top].sort((a, b) => (b.gols?.over25 || 0) - (a.gols?.over25 || 0))[0] || spotlight;
  const safe = top.find((item) => (item.confidence?.score || 0) >= 74) || strongest || spotlight;
  const datedGames = [...(payload?.games || [])].sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));
  const nextGame = datedGames[0] || spotlight;

  const timingBoard = {
    nextGame: nextGame ? {
      ...nextGame,
      title: 'Próximo jogo do radar',
      note: nextGame.verdict?.mercadoBase || nextGame.explanation?.summary || 'Abrir primeiro pela proximidade do início.',
      action: 'Revisar cenário antes da abertura do jogo',
    } : null,
    bestWindow: safe ? {
      ...safe,
      title: 'Melhor janela de execução',
      note: safe.destaqueValue ? `${safe.destaqueValue.selection} ainda carrega o melhor edge do painel.` : safe.verdict?.gatilho || 'Cenário com leitura mais estável para execução.',
      action: 'Comparar preço e confirmar entrada',
    } : null,
    watchWindow: hotGoals ? {
      ...hotGoals,
      title: 'Janela de observação',
      note: hotGoals.verdict?.mercadoAlternativo || `Over 2.5 em ${(hotGoals.gols?.over25 || 0)}%`,
      action: 'Monitorar bloco de gols e timing do mercado',
    } : null,
    holdWindow: danger ? {
      ...danger,
      title: 'Segurar e observar',
      note: danger.verdict?.risco || danger.explanation?.risks?.[0] || 'Leitura mais sensível do painel.',
      action: 'Evitar execução precoce até nova confirmação',
    } : null,
  };

  const marketPulse = {
    valuePulse: value?.destaqueValue?.edge >= 6 ? 'forte' : value?.destaqueValue?.edge >= 3 ? 'moderado' : 'fraco',
    goalsPulse: (hotGoals?.gols?.over25 || 0) >= 62 ? 'quente' : (hotGoals?.gols?.over25 || 0) >= 52 ? 'ativo' : 'morno',
    riskPulse: (danger?.confidence?.score || 0) >= 70 ? 'controlado' : (danger?.confidence?.score || 0) >= 60 ? 'médio' : 'elevado',
    confidencePulse: (strongest?.confidence?.score || 0) >= 82 ? 'alta' : (strongest?.confidence?.score || 0) >= 68 ? 'boa' : 'sensível',
    summary:
      value?.destaqueValue
        ? `${value.destaqueValue.selection} lidera o pulso de valor, enquanto ${hotGoals?.mandante || 'o radar'} mantém o mercado de gols ${((hotGoals?.gols?.over25 || 0) >= 62) ? 'quente' : 'ativo'}.`
        : `${strongest?.mandante || 'O radar'} sustenta a leitura principal, mas o pulso de valor ainda não abriu com força total.`,
  };

  const decisionFlow = [
    strongest ? {
      step: '1',
      title: 'Ler a base do confronto',
      game: `${strongest.mandante} x ${strongest.visitante}`,
      note: strongest.verdict?.mercadoBase || 'Definir o lado principal do radar.',
      tone: 'base',
    } : null,
    value ? {
      step: '2',
      title: 'Conferir preço e edge',
      game: `${value.mandante} x ${value.visitante}`,
      note: value.destaqueValue ? `${value.destaqueValue.selection} com edge +${value.destaqueValue.edge}%` : 'Sem edge forte confirmado no momento.',
      tone: 'value',
    } : null,
    hotGoals ? {
      step: '3',
      title: 'Passar pelo bloco de gols',
      game: `${hotGoals.mandante} x ${hotGoals.visitante}`,
      note: hotGoals.verdict?.mercadoAlternativo || `Over 2.5 ${hotGoals.gols?.over25 || 0}%`,
      tone: 'goals',
    } : null,
    danger ? {
      step: '4',
      title: 'Definir se entra ou evita',
      game: `${danger.mandante} x ${danger.visitante}`,
      note: danger.verdict?.evitarEntrada || 'Se o risco não aliviar, manter em observação.',
      tone: 'risk',
    } : null,
  ].filter(Boolean);

  return {
    spotlight,
    strongest,
    value,
    danger,
    hotGoals,
    safe,
    timingBoard,
    marketPulse,
    decisionFlow,
    cards: {
      totalGames: payload?.games?.length || 0,
      openResults: summary?.open || 0,
      hitRate: summary?.hitRate || 0,
      watchlist: watchlist?.total || 0,
    },
  };
}

module.exports = { buildDashboardBoards };
