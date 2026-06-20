const WEIGHTS = [0.15, 0.2, 0.3, 0.35];
const THRESHOLD = 0.5;
const MAX_PENALTY_MINUTES = 240;

export function getRatingsForLevel(level: number): number[] {
  const baseRating = 800 + (Math.floor(level) - 1) * 50;
  return [baseRating, baseRating + 200, baseRating + 400, baseRating + 600];
}

export function calculateLevelDelta(
  results: Array<{ solved: boolean; solveTimeMinutes: number; wrongAttempts: number }>
): number {
  const sum = results.reduce((acc, result, index) => {
    const weight = WEIGHTS[index] ?? 0;

    if (!result.solved) {
      return acc;
    }

    const penaltyTime = result.solveTimeMinutes + result.wrongAttempts * 10;
    const decayFactor = Math.max(0.5, 1.0 - penaltyTime / MAX_PENALTY_MINUTES);
    const effectiveScore = weight * decayFactor;

    return acc + effectiveScore;
  }, 0);

  // TA-CPD scales normalized performance around the threshold into a level-space delta.
  return Number((2.0 * (sum - THRESHOLD)).toFixed(2));
}
