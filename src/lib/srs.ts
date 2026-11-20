/**
 * Tiny spaced-repetition schedule.
 *
 * When you mark an answer done, it comes back for a quick refresher after
 * 2 days. At each review you grade how it went, the way Anki does:
 *
 * - Again: not there yet. The answer goes back on your to-do list.
 * - Hard: you got there, but slowly. Same interval again.
 * - Good: the next interval on the ladder.
 * - Easy: skip one rung.
 *
 * Deliberately simpler than SM-2/FSRS: interview prep is weeks long, not
 * years, and a fixed ladder is easy to explain, to preview on the buttons
 * and to trust.
 */
export const REVIEW_INTERVAL_DAYS = [2, 5, 12, 30, 75] as const;

export const DAY_MS = 86_400_000;

export function intervalDays(stage: number): number {
  const last = REVIEW_INTERVAL_DAYS[REVIEW_INTERVAL_DAYS.length - 1] ?? 75;
  return REVIEW_INTERVAL_DAYS[Math.max(0, Math.min(stage, REVIEW_INTERVAL_DAYS.length - 1))] ?? last;
}

export function nextDueAt(stage: number, now: number): number {
  return now + intervalDays(stage) * DAY_MS;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export const REVIEW_GRADES: readonly ReviewGrade[] = ['again', 'hard', 'good', 'easy'];

const MAX_STAGE = REVIEW_INTERVAL_DAYS.length - 1;
const STAGE_STEP = { hard: 0, good: 1, easy: 2 } as const;

/** The ladder stage after a review, or null when "again" sends the answer back to the to-do list. */
export function stageAfter(stage: number, grade: ReviewGrade): number | null {
  if (grade === 'again') return null;
  return Math.min(Math.max(0, stage) + STAGE_STEP[grade], MAX_STAGE);
}

/** Days until the next review if you chose this grade now; null for "again". Shown on the buttons. */
export function previewDays(stage: number, grade: ReviewGrade): number | null {
  const next = stageAfter(stage, grade);
  return next === null ? null : intervalDays(next);
}
