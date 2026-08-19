import type { Flashcard } from "../../api/types";

/* Ports js/router.js's `scoreCard` (:753-770) and `startReview`'s due-filter
 * (:658-660) as pure functions, matching the precedent lib/timer.ts and
 * quiz/quizMeta.ts already set: the SRS math and the due-date rule are
 * testable without a clock, a card list, or a mounted component. */

export interface SrsResult {
  interval: number;
  ease: number;
  nextReviewDate: string;
}

/** Basic SM-2 approximation — a wrong/hard answer (quality < 3) resets the
 *  interval to zero and softens the ease factor, floored at 1.3 so a string
 *  of misses can't make the deck impossibly frequent; a good/easy answer
 *  grows the interval (1 day, then 3, then interval * ease) and nudges the
 *  ease up. */
export function nextReviewState(
  card: Pick<Flashcard, "srs_interval" | "ease_factor">,
  quality: number,
  now = new Date(),
): SrsResult {
  let ease = card.ease_factor || 2.5;
  let interval = card.srs_interval || 0;

  if (quality < 3) {
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    interval =
      interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
    ease += 0.1;
  }

  /* Due dates are day-granular, not clock-granular.
   *
   * The vanilla scheduled `now + N days` at the exact time of review, and
   * every due filter (`flashcardsApi.fetchDueCount`/`fetchAllDue`,
   * `dueCardsFrom` below) compares against the current instant. So a deck
   * reviewed at 20:00 was not due again until 20:00 on its due day — a
   * student sitting down at 19:00 that day was told "0 due" — and because
   * the next review then stamped an even later time, the deck drifted later
   * every session until it fell off the end of the study day.
   *
   * Anchoring to local midnight makes "due in 1 day" mean "due tomorrow",
   * whenever tomorrow's session happens to start. A missed card (interval 0)
   * keeps the exact timestamp: it is due again in this same sitting, not at
   * the start of today. */
  const nextDate = new Date(now);
  if (interval > 0) {
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + interval);
  }

  return { interval, ease, nextReviewDate: nextDate.toISOString() };
}

/** Only cards due today or earlier. A NULL `next_review_date` is a card
 *  that's never been reviewed, and is due immediately — same rule
 *  `flashcardsApi.fetchDueCount`/`fetchAllDue` already apply, so a brand-new
 *  deck doesn't report cards due while the review screen (which used
 *  `.lte()`'s absence the same way) serves none. */
export function dueCardsFrom(
  cards: Flashcard[],
  now = new Date(),
): Flashcard[] {
  return cards.filter(
    (c) => !c.next_review_date || new Date(c.next_review_date) <= now,
  );
}
