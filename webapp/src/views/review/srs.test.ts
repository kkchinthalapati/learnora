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

  /* Asserted against local-time getters rather than a literal ISO string so
     the expectation means the same thing in every timezone the suite runs
     in — the schedule is anchored to the student's midnight, not UTC's. */
  function localMidnightDaysFrom(from: Date, days: number): Date {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }

  it("schedules a brand-new card for tomorrow on the first good answer", () => {
    const result = nextReviewState(card(), 3, NOW);
    expect(result.interval).toBe(1);
    expect(new Date(result.nextReviewDate).getTime()).toBe(
      localMidnightDaysFrom(NOW, 1).getTime(),
    );
  });

  it("schedules to the start of the due day, not the hour of review", () => {
    const evening = new Date(NOW);
    evening.setHours(20, 30, 0, 0);

    const scheduled = new Date(
      nextReviewState(card(), 3, evening).nextReviewDate,
    );

    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
    expect(scheduled.getSeconds()).toBe(0);
    expect(scheduled.getMilliseconds()).toBe(0);
  });

  /* The bug this replaces: an evening reviewer's cards came back due at that
     same late hour, so an earlier session the next day found nothing to do,
     and each review pushed the deck further out of reach. */
  it("is due for an earlier session on the following day", () => {
    const reviewedAt = new Date(NOW);
    reviewedAt.setHours(20, 0, 0, 0);

    const { nextReviewDate } = nextReviewState(card(), 3, reviewedAt);

    const nextEvening = new Date(reviewedAt);
    nextEvening.setDate(nextEvening.getDate() + 1);
    nextEvening.setHours(19, 0, 0, 0);

    expect(new Date(nextReviewDate) <= nextEvening).toBe(true);
  });

  it("keeps a missed card due in the same sitting", () => {
    const reviewedAt = new Date(NOW);
    reviewedAt.setHours(20, 0, 0, 0);

    const { interval, nextReviewDate } = nextReviewState(
      card({ srs_interval: 8 }),
      1,
      reviewedAt,
    );

    expect(interval).toBe(0);
    expect(nextReviewDate).toBe(reviewedAt.toISOString());
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
