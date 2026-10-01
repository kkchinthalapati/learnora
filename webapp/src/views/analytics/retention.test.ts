import { describe, expect, it } from "vitest";
import type { Flashcard, FlashcardDeck } from "../../api/types";
import { computeFsrsCardState } from "../review/srs";
import {
  cardMemory,
  computeRetention,
  CURVE_DAYS,
  MIN_REVIEWED_PER_DECK,
  recallAt,
  TARGET_RECALL,
} from "./retention";

const NOW = new Date(2026, 8, 29, 15, 0, 0); // 29 Sep 2026, 3pm local
const day = (offset: number, hour = 0) =>
  new Date(2026, 8, 29 + offset, hour, 0, 0);

let seq = 0;
function card(overrides: Partial<Flashcard> = {}): Flashcard {
  seq++;
  return {
    id: `c${seq}`,
    user_id: "u",
    deck_id: "d1",
    front: "f",
    back: "b",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    stability: null,
    difficulty: null,
    created_at: day(-30).toISOString(),
    ...overrides,
  };
}

/** A card reviewed `daysAgo` days before NOW, scheduled `interval` days out. */
function reviewed(daysAgo: number, interval: number, stability?: number, deck = "d1") {
  return card({
    deck_id: deck,
    srs_interval: interval,
    stability: stability ?? interval,
    next_review_date: day(-daysAgo + interval).toISOString(),
  });
}

const DECKS: FlashcardDeck[] = [
  { id: "d1", title: "Cell biology" } as FlashcardDeck,
  { id: "d2", title: "WW1 causes" } as FlashcardDeck,
];

describe("cardMemory", () => {
  it("has no memory state for a card that was never reviewed", () => {
    expect(cardMemory(card())).toBeNull();
  });

  it("recovers the review day from the due date and interval the scheduler wrote", () => {
    const m = cardMemory(reviewed(3, 10, 12))!;
    expect(m.lastReview).toEqual(day(-3));
    expect(m.stability).toBe(12);
  });

  it("falls back as the scheduler does: stability, then interval, then one day", () => {
    expect(cardMemory(card({ srs_interval: 6, next_review_date: day(2).toISOString() }))!.stability).toBe(6);
    const again = cardMemory(card({ srs_interval: 0, next_review_date: day(0, 9).toISOString() }))!;
    expect(again.stability).toBe(1);
    // An "Again" is due at the instant it was graded, which is the review.
    expect(again.lastReview).toEqual(day(0, 9));
  });
});

describe("recallAt — the scheduler's own curve", () => {
  it("predicts the target recall on the day the scheduler set the card due", () => {
    // Grade a card exactly as ReviewView does, then read it back.
    const reviewedAt = day(-5, 10);
    const state = computeFsrsCardState({ quality: 3, now: reviewedAt, stability: 8, difficulty: 5, previousInterval: 8, elapsedDays: 8 });
    const m = cardMemory(
      card({
        next_review_date: state.nextReviewDate,
        srs_interval: state.interval,
        stability: state.stability,
      }),
    )!;
    // Whole-day intervals round the target slightly either way.
    expect(recallAt(m, new Date(state.nextReviewDate))).toBeCloseTo(TARGET_RECALL, 1);
    expect(recallAt(m, m.lastReview)).toBe(1);
  });

  it("only ever falls as time passes", () => {
    const m = cardMemory(reviewed(1, 5))!;
    expect(recallAt(m, day(1))).toBeGreaterThan(recallAt(m, day(10)));
    expect(recallAt(m, day(10))).toBeGreaterThan(recallAt(m, day(60)));
  });
});

describe("computeRetention", () => {
  it("is honest with no cards and with cards nobody has reviewed", () => {
    const empty = computeRetention([], DECKS, NOW);
    expect(empty.recallNow).toBeNull();
    expect(empty.nextReview).toBeNull();

    const unstudied = computeRetention([card(), card()], DECKS, NOW);
    expect(unstudied.reviewedCards).toBe(0);
    expect(unstudied.due.newCards).toBe(2);
    expect(unstudied.recallNow).toBeNull();
    expect(unstudied.decks[0]).toMatchObject({ enoughData: false, recallNow: null, curve: null });
  });

  it(`holds back a deck's figures below ${MIN_REVIEWED_PER_DECK} reviewed cards`, () => {
    const s = computeRetention([reviewed(1, 4), reviewed(2, 4), card()], DECKS, NOW);
    expect(s.decks[0].reviewedCards).toBe(2);
    expect(s.decks[0].enoughData).toBe(false);
    expect(s.decks[0].recallNow).toBeNull();
    expect(s.weakestDecks).toEqual([]);
  });

  it("counts overdue, due now, due this week and new cards separately", () => {
    const cards = [
      reviewed(10, 3), // due 7 days ago — overdue
      card({ srs_interval: 0, next_review_date: day(0, 9).toISOString() }), // due this morning
      reviewed(1, 3), // due in 2 days
      reviewed(1, 30), // due in 29 days
      card(), // new
    ];
    const s = computeRetention(cards, DECKS, NOW);
    expect(s.due).toEqual({ overdue: 1, dueNow: 2, dueNext7: 1, newCards: 1 });
    // Today's bar carries everything already due; the rest land on their day.
    expect(s.dueByDay.map((d) => d.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(s.nextReview).toEqual({ at: NOW, count: 2 });
  });

  it("recommends the next sitting when nothing is due yet", () => {
    const s = computeRetention([reviewed(1, 3), reviewed(1, 3), reviewed(0, 9)], DECKS, NOW);
    expect(s.nextReview).toEqual({ at: day(2), count: 2 });
  });

  it("projects each deck's forgetting curve and ranks the weakest first", () => {
    const strong = [reviewed(1, 40), reviewed(1, 40), reviewed(2, 40)];
    const weak = [reviewed(9, 3, 3, "d2"), reviewed(8, 3, 3, "d2"), reviewed(7, 2, 2, "d2")];
    const s = computeRetention([...strong, ...weak], DECKS, NOW);

    const bio = s.decks.find((d) => d.title === "Cell biology")!;
    const ww1 = s.decks.find((d) => d.title === "WW1 causes")!;
    expect(bio.curve).toHaveLength(CURVE_DAYS + 1);
    expect(bio.curve!.every((r, i, all) => i === 0 || r <= all[i - 1])).toBe(true);
    expect(bio.recallNow!).toBeGreaterThan(0.95);
    expect(ww1.recallNow!).toBeLessThan(TARGET_RECALL);
    expect(ww1.recallIn7Days!).toBeLessThan(ww1.recallNow!);
    expect(s.weakestDecks.map((d) => d.title)).toEqual(["WW1 causes", "Cell biology"]);
    // Its earliest card (reviewed 9 days ago, 3-day interval) fell due 6 days ago.
    expect(ww1.nextReview).toEqual(day(-6));
  });

  it("names cards whose deck is gone rather than dropping them", () => {
    const s = computeRetention([reviewed(1, 3, 3, "gone")], DECKS, NOW);
    expect(s.decks[0].title).toBe("Untitled deck");
  });
});
