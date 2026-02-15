export function streakScore(completions: boolean[]): number {
  let streak = 0;

  for (const completed of completions) {
    if (!completed) {
      break;
    }

    streak += 1;
  }

  return streak;
}
