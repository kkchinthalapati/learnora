import { describe, expect, it } from "vitest";
import { dueCardsFrom, nextReviewState } from "./srs";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function card(overrides: { srs_interval?: number; ease_factor?: number } = {}) {
  return { srs_interval: 0, ease_factor: 2.5, ...overrides };
}

describe("nextReviewState", () => {
  it("resets the interval to zero on a miss (quality < 3)", () => {
    const result = nextReviewState(card({ srs_interval: 8 }), 1, NOW);
    expect(result.interval).toBe(0);
    expect(result.nextReviewDate).toBe(NOW.toISOString());
  });

  it("softens the ease factor on a miss, floored at 1.3", () => {
    expect(
      nextReviewState(card({ ease_factor: 1.4 }), 2, NOW).ease,
    ).toBeCloseTo(1.3);
    expect(nextReviewState(card({ ease_factor: 1.35 }), 1, NOW).ease).toBe(1.3);
  });

  it("schedules a brand-new card for tomorrow on the first good answer", () => {
    const result = nextReviewState(card(), 3, NOW);
    expect(result.interval).toBe(1);
    expect(result.nextReviewDate).toBe("2026-08-01T12:00:00.000Z");
  });

  it("schedules a once-reviewed card for 3 days on the next good answer", () => {
    const result = nextReviewState(card({ srs_interval: 1 }), 3, NOW);
    expect(result.interval).toBe(3);
  });

  it("multiplies interval by ease and rounds once the interval exceeds 1", () => {
    const result = nextReviewState(
      card({ srs_interval: 3, ease_factor: 2.5 }),
      4,
      NOW,
    );
    expect(result.interval).toBe(Math.round(3 * 2.5));
  });

  it("increases the ease factor on a good or easy answer", () => {
    expect(
      nextReviewState(card({ ease_factor: 2.5 }), 3, NOW).ease,
    ).toBeCloseTo(2.6);
    expect(
      nextReviewState(card({ ease_factor: 2.5 }), 4, NOW).ease,
    ).toBeCloseTo(2.6);
  });

  it("defaults a never-reviewed card's ease factor to 2.5", () => {
    const result = nextReviewState({ srs_interval: 0, ease_factor: 0 }, 3, NOW);
    expect(result.ease).toBeCloseTo(2.6);
  });
});

describe("dueCardsFrom", () => {
  function flashcard(nextReviewDate: string | null) {
    return {
      id: "c1",
      user_id: "u1",
      deck_id: "d1",
      front: "Q",
      back: "A",
      next_review_date: nextReviewDate,
      srs_interval: 0,
      ease_factor: 2.5,
      created_at: "2026-01-01T00:00:00.000Z",
    };
  }

  it("includes a never-reviewed card (NULL next_review_date)", () => {
    expect(dueCardsFrom([flashcard(null)], NOW)).toHaveLength(1);
  });

  it("includes a card due today or earlier", () => {
    const due = flashcard("2026-07-31T00:00:00.000Z");
    const overdue = flashcard("2026-01-01T00:00:00.000Z");
    expect(dueCardsFrom([due, overdue], NOW)).toHaveLength(2);
  });

  it("excludes a card not due until later", () => {
    expect(dueCardsFrom([flashcard("2026-08-15T00:00:00.000Z")], NOW)).toEqual(
      [],
    );
  });
});
