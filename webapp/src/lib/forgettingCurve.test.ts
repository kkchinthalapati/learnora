import { describe, expect, it } from "vitest";
import type { Flashcard } from "../api/types";
import { computeRetentionProbability } from "./adaptiveLearning";
import { decayDays, decayOneDay, retentionAfter } from "./trajectory";
import { calculateRetrievability } from "../views/review/srs";

/* One forgetting curve everywhere: the review scheduler (FSRS), card
   retention in analytics, and topic decay in the forecast must agree, or a
   topic is "fading" on one screen and "not due" on another. */

const DAY = 86_400_000;
const now = new Date("2026-10-09T12:00:00Z");

function card(overrides: Partial<Flashcard>): Flashcard {
  return {
    id: "c",
    user_id: "u",
    deck_id: "d",
    front: "f",
    back: "b",
    srs_interval: 0,
    ease_factor: 2.5,
    next_review_date: null,
    created_at: new Date(now.getTime() - 60 * DAY).toISOString(),
    ...overrides,
  } as Flashcard;
}

describe("one forgetting curve", () => {
  it("topic retention is the scheduler's retrievability", () => {
    for (const [t, s] of [[1, 3], [7, 10], [30, 12], [90, 400]] as const) {
      expect(retentionAfter(t, s)).toBeCloseTo(calculateRetrievability(t, s), 10);
    }
  });

  it("card retention reads persisted FSRS stability and the last review", () => {
    const c = card({
      stability: 20,
      last_reviewed_at: new Date(now.getTime() - 20 * DAY).toISOString(),
      srs_interval: 3,
    });
    expect(computeRetentionProbability(c, now)).toBeCloseTo(0.9, 3);
  });

  it("decay compounds to the same curve whichever way it is stepped", () => {
    let stepped = 0.8;
    for (let day = 0; day < 10; day += 1) stepped = decayOneDay(stepped, 6, day);
    expect(stepped).toBeCloseTo(decayDays(0.8, 6, 10), 10);
    expect(stepped).toBeCloseTo(0.8 * calculateRetrievability(10, 6), 10);
  });
});
