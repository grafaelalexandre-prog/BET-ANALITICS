/**
 * Form Analyzer
 * Analisa a forma recente de um time com base nos últimos jogos.
 */

/**
 * Calcula form string e pontuação
 * @param {Array} recentMatches - Últimos jogos do time
 * @param {number} teamId - ID do time
 * @returns {{ form: string, points: number, winRate: number }}
 */
function analyzeForm(recentMatches, teamId) {
  if (!recentMatches || recentMatches.length === 0) {
    return { form: '?????', points: 0, winRate: 0, matches: 0 };
  }

  let points = 0;
  let wins = 0;
  const formLetters = [];

  for (const m of recentMatches) {
    const isHome = m.homeTeam?.id === teamId;
    const score = m.score?.fullTime;
    if (!score || score.home == null || score.away == null) {
      formLetters.push('?');
      continue;
    }

    const teamGoals = isHome ? score.home : score.away;
    const oppGoals = isHome ? score.away : score.home;

    if (teamGoals > oppGoals) {
      formLetters.push('W');
      points += 3;
      wins++;
    } else if (teamGoals === oppGoals) {
      formLetters.push('D');
      points += 1;
    } else {
      formLetters.push('L');
    }
  }

  return {
    form: formLetters.join(''),
    points,
    winRate: recentMatches.length > 0 ? Math.round((wins / recentMatches.length) * 100) : 0,
    matches: recentMatches.length,
  };
}

/**
 * Compara form de dois times e retorna vantagem
 */
function compareForm(homeForm, awayForm) {
  const diff = homeForm.points - awayForm.points;
  if (diff >= 6) return { advantage: 'home', level: 'strong' };
  if (diff >= 3) return { advantage: 'home', level: 'moderate' };
  if (diff <= -6) return { advantage: 'away', level: 'strong' };
  if (diff <= -3) return { advantage: 'away', level: 'moderate' };
  return { advantage: 'neutral', level: 'even' };
}

module.exports = { analyzeForm, compareForm };

