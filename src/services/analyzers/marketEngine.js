/**
 * Market Engine
 * Gera decisão final, mercado sugerido, confiança e score.
 */

/**
 * @param {object} params
 * @param {object} params.formComparison - { advantage, level }
 * @param {object} params.goals - goalsAnalyzer output
 * @param {object} params.homeForm - { form, points, winRate }
 * @param {object} params.awayForm - { form, points, winRate }
 * @returns {object} analysis
 */
function generateAnalysis({ formComparison, goals, homeForm, awayForm }) {
  let score = 50; // base
  const reasons = [];
  const riskFlags = [];

  // --- Form impact ---
  if (formComparison.advantage === 'home') {
    score += formComparison.level === 'strong' ? 15 : 8;
    reasons.push(`Mandante em boa fase (${homeForm.form})`);
  } else if (formComparison.advantage === 'away') {
    score += formComparison.level === 'strong' ? 10 : 5;
    reasons.push(`Visitante em boa fase (${awayForm.form})`);
  } else {
    riskFlags.push('Times com form equilibrada');
  }

  // --- Goals impact ---
  if (goals.over25Rate >= 70) {
    score += 8;
    reasons.push(`Alta taxa over 2.5 (${goals.over25Rate}%)`);
  }
  if (goals.bttsRate >= 65) {
    score += 5;
    reasons.push(`Tendência BTTS (${goals.bttsRate}%)`);
  }
  if (goals.expectedGoals < 1.8) {
    riskFlags.push('Expectativa de poucos gols');
  }

  // --- Win rate bonus ---
  const bestWinRate = Math.max(homeForm.winRate, awayForm.winRate);
  if (bestWinRate >= 80) {
    score += 10;
    reasons.push('Time com win rate > 80%');
  } else if (bestWinRate >= 60) {
    score += 5;
  }

  // --- Low data penalty ---
  if (homeForm.matches < 3 || awayForm.matches < 3) {
    score -= 10;
    riskFlags.push('Poucos jogos para análise confiável');
  }

  // Clamp
  score = Math.max(15, Math.min(95, score));

  // --- Decision ---
  let decision, confidence;
  if (score >= 72) {
    decision = 'OPORTUNIDADE';
    confidence = Math.min(90, score);
  } else if (score >= 55) {
    decision = 'ACOMPANHAR';
    confidence = Math.min(70, score - 5);
  } else {
    decision = 'EVITAR';
    confidence = Math.max(20, score - 10);
  }

  // --- Market suggestion ---
  const market = suggestMarket({ formComparison, goals, homeForm, awayForm });

  return {
    decision,
    market,
    confidence,
    score,
    reasons,
    riskFlags,
  };
}

function suggestMarket({ formComparison, goals, homeForm, awayForm }) {
  // Strong home advantage
  if (formComparison.advantage === 'home' && formComparison.level === 'strong' && homeForm.winRate >= 60) {
    return { type: 'ML', selection: 'Home', label: 'Vitória mandante' };
  }
  // Strong away advantage
  if (formComparison.advantage === 'away' && formComparison.level === 'strong' && awayForm.winRate >= 60) {
    return { type: 'ML', selection: 'Away', label: 'Vitória visitante' };
  }
  // High over rate
  if (goals.over25Rate >= 65) {
    return { type: 'OVER', selection: 'Over 2.5', label: 'Over 2.5 gols' };
  }
  // High BTTS rate
  if (goals.bttsRate >= 60) {
    return { type: 'BTTS', selection: 'Yes', label: 'Ambas marcam' };
  }
  // Default conservative
  return { type: 'WAIT', selection: '-', label: 'Sem mercado claro' };
}

/**
 * Fallback conservador
 */
function fallbackAnalysis() {
  return {
    decision: 'ACOMPANHAR',
    market: { type: 'WAIT', selection: '-', label: 'Dados insuficientes' },
    confidence: 30,
    score: 40,
    reasons: ['Análise baseada em dados limitados'],
    riskFlags: ['Dados externos indisponíveis'],
  };
}

module.exports = { generateAnalysis, fallbackAnalysis };

