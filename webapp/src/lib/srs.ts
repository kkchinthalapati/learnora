/* Spaced-repetition scheduling — ports the `scoreCard` maths from
 * js/router.js (:753-778).
 *
 * It is an SM-2 approximation, not SM-2: the vanilla's own comment says
 * "Basic SRS approximation". It is ported exactly rather than corrected,
 * because every existing card in the database carries an `srs_interval` and
 * `ease_factor` this function produced — "fixing" the curve would silently
 * reschedule every deck a student already has. Two consequences worth naming
 * so nobody mistakes them for bugs introduced here:
 *
 *  - A failed card (`Again`/`Hard`) gets `interval = 0`, so `next_review_date`
 *    is *now* and it is due again immediately. It is not re-queued inside the
 *    current session — the session works from the list it fetched on entry —
 *    so it comes back on the next visit, not this one.
 *  - `ease` grows without a ceiling on every pass. Real SM-2 caps it; this
 *    doesn't, and a long-running card's intervals grow faster than SM-2's
 *    would.
 */

/** The four buttons, in the order the review screen shows them. */
export const REVIEW_SCORES = [
  { quality: 1, label: "Again", key: "1" },
  { quality: 2, label: "Hard", key: "2" },
  { quality: 3, label: "Good", key: "3" },
  { quality: 4, label: "Easy", key: "4" },
] as const;

export type ReviewQuality = (typeof REVIEW_SCORES)[number]["quality"];

/** The vanilla's fallbacks for a card that has never been reviewed
 *  (`card.ease_factor || 2.5`, `card.srs_interval || 0`). */
export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

export interface ScheduleInput {
  interval: number | null | undefined;
  ease: number | null | undefined;
  quality: number;
  /** Injectable so tests don't depend on the wall clock. */
  now?: Date;
}

export interface Schedule {
  /** Whole days until the card is due again. */
  interval: number;
  ease: number;
  /** ISO timestamp written to `flashcards.next_review_date`. */
  nextReviewDate: string;
}

export function scheduleCard({
  interval,
  ease,
  quality,
  now = new Date(),
}: ScheduleInput): Schedule {
  let nextEase = ease || DEFAULT_EASE;
  let nextInterval = interval || 0;

  if (quality < 3) {
    nextInterval = 0;
    nextEase = Math.max(MIN_EASE, nextEase - 0.2);
  } else {
    nextInterval =
      nextInterval === 0
        ? 1
        : nextInterval === 1
          ? 3
          : Math.round(nextInterval * nextEase);
    nextEase += 0.1;
  }

  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + nextInterval);

  return {
    interval: nextInterval,
    ease: nextEase,
    nextReviewDate: nextDate.toISOString(),
  };
}

/** A card is due when it has never been reviewed or its next review has
 *  passed. The NULL case matters: `.lte()` alone excludes never-reviewed
 *  cards, which is the bug `fetchDueCount` documents. */
export function isDue(
  nextReviewDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (!nextReviewDate) return true;
  return new Date(nextReviewDate) <= now;
}
