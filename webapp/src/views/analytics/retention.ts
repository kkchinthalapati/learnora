import type { Flashcard, FlashcardDeck } from "../../api/types";
import {
  calculateRetrievability,
  DEFAULT_FSRS_PARAMETERS,
} from "../review/srs";

/* Retention insights — what the scheduler already believes about each card,
 * read back and summed up. No new model and no AI: every number below is the
 * FSRS forgetting curve in views/review/srs.ts, fed the memory state the
 * scheduler itself wrote to the card.
 *
 * WHAT A CARD TELLS US. There is no per-review history table, but the
 * scheduler leaves enough on each row to recover the one thing a forgetting
 * curve needs — when the card was last reviewed:
 *
 *   next_review_date = local midnight of the review day + srs_interval days
 *                      (or the review instant itself when the interval is 0,
 *                      i.e. an "Again")
 *
 * so the review day is `next_review_date - srs_interval`. Stability is the
 * persisted FSRS value, falling back exactly as the scheduler does for rows
 * reviewed before the column existed: stability → previous interval → 1 day
 * (computeFsrsCardState). Recall at any moment is then
 * calculateRetrievability(days since that review, stability).
 *
 * A card with no next_review_date has never been reviewed. It has no memory
 * state, so it is counted as new and kept out of every recall figure rather
 * than being guessed at. */

const DAY_MS = 86_400_000;

/** The scheduler's target: a card falls due when predicted recall reaches it. */
export const TARGET_RECALL = DEFAULT_FSRS_PARAMETERS.requestRetention;

/** Fewer reviewed cards than this and a deck's average is one or two cards'
 *  worth of noise — reported as "not enough reviews yet" instead. */
export const MIN_REVIEWED_PER_DECK = 3;

/** Days the forgetting curve is projected forward. */
export const CURVE_DAYS = 30;

export interface CardMemory {
  lastReview: Date;
  stability: number;
  due: Date;
}

/** The memory state the scheduler left on a card, or null if it has never
 *  been reviewed. */
export function cardMemory(card: Flashcard): CardMemory | null {
  if (!card.next_review_date) return null;
  const due = new Date(card.next_review_date);
  if (Number.isNaN(due.getTime())) return null;

  const interval =
    typeof card.srs_interval === "number" && card.srs_interval > 0
      ? card.srs_interval
      : 0;
  // Calendar days, as the scheduler added them — not 24h blocks, which
  // drift an hour across a daylight-saving change.
  const lastReview = new Date(due);
  if (interval > 0) lastReview.setDate(lastReview.getDate() - interval);

  const stability =
    typeof card.stability === "number" && card.stability > 0
      ? card.stability
      : interval || 1;
  return { lastReview, stability, due };
}

/** Predicted probability of recalling the card at `at`. */
export function recallAt(memory: CardMemory, at: Date): number {
  const elapsedDays = (at.getTime() - memory.lastReview.getTime()) / DAY_MS;
  return calculateRetrievability(Math.max(0, elapsedDays), memory.stability);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export interface DueCounts {
  /** Due before today began. */
  overdue: number;
  /** Due at or before now (includes overdue). */
  dueNow: number;
  /** Falling due after now, within the next 7 days. */
  dueNext7: number;
  /** Never reviewed: due whenever the student starts them. */
  newCards: number;
}

export interface DeckRetention {
  deckId: string;
  title: string;
  totalCards: number;
  reviewedCards: number;
  due: DueCounts;
  /** False below MIN_REVIEWED_PER_DECK — recall figures are then null. */
  enoughData: boolean;
  recallNow: number | null;
  recallIn7Days: number | null;
  /** Mean predicted recall for day 0..CURVE_DAYS if nothing is reviewed. */
  curve: number[] | null;
  /** When the scheduler next wants this deck: the earliest due card. */
  nextReview: Date | null;
  /** Mean FSRS difficulty (1..10) of the reviewed cards, where recorded. */
  difficulty: number | null;
}

export interface RetentionSummary {
  totalCards: number;
  reviewedCards: number;
  due: DueCounts;
  /** Reviews falling due on each of the next 7 days; index 0 is today and
   *  includes everything already overdue. */
  dueByDay: { date: Date; count: number }[];
  recallNow: number | null;
  /** The earliest due review, and how many are due by then. */
  nextReview: { at: Date; count: number } | null;
  decks: DeckRetention[];
  /** Decks with enough data, lowest predicted recall first. */
  weakestDecks: DeckRetention[];
}

function countDue(
  memories: (CardMemory | null)[],
  now: Date,
): DueCounts {
  const today = startOfDay(now).getTime();
  const weekOut = now.getTime() + 7 * DAY_MS;
  const counts: DueCounts = { overdue: 0, dueNow: 0, dueNext7: 0, newCards: 0 };
  for (const m of memories) {
    if (!m) {
      counts.newCards++;
      continue;
    }
    const due = m.due.getTime();
    if (due <= now.getTime()) {
      counts.dueNow++;
      if (due < today) counts.overdue++;
    } else if (due <= weekOut) {
      counts.dueNext7++;
    }
  }
  return counts;
}

export function computeRetention(
  cards: Flashcard[],
  decks: FlashcardDeck[],
  now: Date = new Date(),
): RetentionSummary {
  const memories = cards.map(cardMemory);
  const reviewed = memories.filter((m): m is CardMemory => m !== null);

  const byDeck = new Map<string, { cards: Flashcard[]; mems: (CardMemory | null)[] }>();
  cards.forEach((card, i) => {
    const key = card.deck_id ?? "";
    const entry = byDeck.get(key) ?? { cards: [], mems: [] };
    entry.cards.push(card);
    entry.mems.push(memories[i]);
    byDeck.set(key, entry);
  });

  const titles = new Map(decks.map((d) => [d.id, d.title]));
  const deckRows: DeckRetention[] = [];
  for (const [deckId, { cards: deckCards, mems }] of byDeck) {
    const seen = mems.filter((m): m is CardMemory => m !== null);
    const enoughData = seen.length >= MIN_REVIEWED_PER_DECK;
    const curve = enoughData
      ? Array.from({ length: CURVE_DAYS + 1 }, (_, day) => {
          const at = new Date(now.getTime() + day * DAY_MS);
          return mean(seen.map((m) => recallAt(m, at))) ?? 0;
        })
      : null;
    const difficulties = deckCards
      .filter((c, i) => mems[i] && typeof c.difficulty === "number")
      .map((c) => c.difficulty as number);
    deckRows.push({
      deckId,
      title: titles.get(deckId) ?? (deckId ? "Untitled deck" : "Cards without a deck"),
      totalCards: deckCards.length,
      reviewedCards: seen.length,
      due: countDue(mems, now),
      enoughData,
      recallNow: curve ? curve[0] : null,
      recallIn7Days: curve ? curve[7] : null,
      curve,
      nextReview: seen.length
        ? new Date(Math.min(...seen.map((m) => m.due.getTime())))
        : null,
      difficulty: mean(difficulties),
    });
  }
  // Most cards first: the decks a student leans on lead the list.
  deckRows.sort((a, b) => b.totalCards - a.totalCards || a.title.localeCompare(b.title));

  const today = startOfDay(now);
  const dueByDay = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return { date, count: 0 };
  });
  for (const m of reviewed) {
    const dayIndex = Math.floor((startOfDay(m.due).getTime() - today.getTime()) / DAY_MS);
    // Rounded: a daylight-saving day is 23 or 25 hours long.
    const idx = Math.max(0, Math.round(dayIndex));
    if (idx < 7) dueByDay[idx].count++;
  }

  const earliest = reviewed.length
    ? Math.min(...reviewed.map((m) => m.due.getTime()))
    : null;
  const nextReview =
    earliest === null
      ? null
      : earliest <= now.getTime()
        ? { at: now, count: reviewed.filter((m) => m.due.getTime() <= now.getTime()).length }
        : {
            at: new Date(earliest),
            // Everything due by the end of that day goes in the same sitting.
            count: reviewed.filter(
              (m) => m.due.getTime() < startOfDay(new Date(earliest)).getTime() + DAY_MS,
            ).length,
          };

  return {
    totalCards: cards.length,
    reviewedCards: reviewed.length,
    due: countDue(memories, now),
    dueByDay,
    recallNow: reviewed.length >= MIN_REVIEWED_PER_DECK
      ? mean(reviewed.map((m) => recallAt(m, now)))
      : null,
    nextReview,
    decks: deckRows,
    weakestDecks: deckRows
      .filter((d) => d.enoughData)
      .sort((a, b) => (a.recallNow ?? 1) - (b.recallNow ?? 1))
      .slice(0, 3),
  };
}
