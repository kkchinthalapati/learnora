/* How much of a study session's wall clock actually counts.
 *
 * Reviewing cards and answering quiz questions is real study time, but the
 * elapsed time between the first and last answer is not: a tab left open over
 * lunch would otherwise bank the whole lunch break. Since these minutes feed
 * the friends leaderboard (`get_friends_leaderboard` aggregates
 * study_sessions.minutes server-side), over-crediting isn't just noisy
 * analytics — it's effectively cheating.
 *
 * So each individual stretch of time is capped before anything is summed. Work
 * that keeps flowing is credited in full; a single unexplained gap contributes
 * at most IDLE_CAP_MS, whether it was 3 minutes or 3 hours.
 *
 * Deliberately free of I/O and of Date.now(): callers pass the timestamps in.
 * That keeps this unit-testable without vi.useFakeTimers(), which the view
 * tests avoid because it breaks MSW/userEvent pacing (see the note in
 * components/AppShell.test.tsx). */

/** The most a single uninterrupted gap can contribute. */
export const IDLE_CAP_MS = 120_000;

/** Sessions shorter than this are not logged at all — see toLoggableMinutes. */
export const MIN_LOGGABLE_MINUTES = 1;

function capped(ms: number, capMs: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(ms, capMs);
}

/**
 * Credit from a list of timestamps: the session start, then one mark per unit
 * of work completed (a graded card, say). Each inter-mark gap is capped
 * separately, so a run of ordinary gaps all count in full.
 *
 * Non-monotonic marks — a clock adjustment mid-session — contribute zero rather
 * than subtracting from the total.
 */
export function creditedMsFromMarks(
  marks: number[],
  capMs = IDLE_CAP_MS,
): number {
  let total = 0;
  for (let i = 1; i < marks.length; i++) {
    total += capped(marks[i] - marks[i - 1], capMs);
  }
  return total;
}

/**
 * Credit from durations that were already measured per unit of work — the
 * quiz runner stamps `secondsSpent` into every stored answer, so its sessions
 * need no separate instrumentation.
 */
export function creditedMsFromDurations(
  durationsMs: number[],
  capMs = IDLE_CAP_MS,
): number {
  let total = 0;
  for (const ms of durationsMs) total += capped(ms, capMs);
  return total;
}

/**
 * Whole minutes to log, or null when the session is too short to be worth a
 * row. Returning null rather than 0 keeps the "don't write it" decision in one
 * place instead of at each call site.
 */
export function toLoggableMinutes(ms: number): number | null {
  const minutes = Math.round(ms / 60_000);
  return minutes >= MIN_LOGGABLE_MINUTES ? minutes : null;
}
