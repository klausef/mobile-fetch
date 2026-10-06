/**
 * How a rider is rated, and what the number is called.
 *
 * Five stars is the whole vocabulary. Kept as plain functions because the
 * average appears in three places — the receipt, the rider's dashboard and the
 * console — and three copies of an average is three chances to round
 * differently.
 */

/** The only scores a rider can be given. */
export const SCORE_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * The average of a set of scores, rounded to one decimal, or null.
 *
 * Null rather than zero for "no ratings yet": a rider with one five-star trip
 * and a rider nobody has rated are not the same, and a 0.0 next to a new
 * rider's name would read as a warning.
 */
export function averageScore(
  scores: readonly number[],
): number | null {
  const valid = scores.filter(
    (score) => Number.isFinite(score) && score >= 1 && score <= 5,
  );
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, score) => sum + score, 0);
  return Math.round((total / valid.length) * 10) / 10;
}

/** "4.7" for the number, and the count beside it: "4.7 (23)". */
export function formatAverage(
  scores: readonly number[],
): string {
  const average = averageScore(scores);
  if (average === null) return "No ratings yet";
  return `${average.toFixed(1)} (${scores.length})`;
}

/**
 * What a score means in words.
 *
 * The console is the one place a number is shown to somebody who has to act on
 * it, and "3.0" does not say whether a rider needs a word or a suspension.
 */
export function scoreLabel(score: number): string {
  if (score >= 4.5) return "Excellent";
  if (score >= 4) return "Good";
  if (score >= 3) return "Fair";
  if (score >= 2) return "Poor";
  return "Needs attention";
}
