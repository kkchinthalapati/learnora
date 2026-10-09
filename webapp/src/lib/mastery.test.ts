import { describe, expect, it } from "vitest";
import { daysUntilFading, masteryLabel, topicMastery } from "./mastery";
import type { TopicKnowledge } from "./knowledgeModel";

const now = new Date("2026-10-09T12:00:00Z");

/* A topic known only through flashcards. */
const cards = (mastery: number, evidence = 0.6, stabilityDays = 60) => ({
  mastery,
  evidence,
  stabilityDays,
});

/* A topic with answered questions. */
function answered(k: Partial<TopicKnowledge>) {
  const knowledge: TopicKnowledge = {
    key: "osmosis",
    p: 0.9,
    pInWeek: 0.88,
    status: "secure",
    fading: false,
    rung: 3,
    stabilityDays: 60,
    counted: 5,
    rightItems: 4,
    rightDays: 2,
    rightApply: 1,
    lastAt: now.toISOString(),
    ...k,
  };
  return { mastery: 0.5, evidence: 0.5, stabilityDays: 10, knowledge };
}

describe("topicMastery: flashcards only", () => {
  it("claims no rung without evidence, whatever the prior says", () => {
    expect(topicMastery(cards(0.9, 0))).toEqual({ rung: 0, fading: false });
  });

  it("can show Seen or Recalled, never Applied: reviewing a card is recall", () => {
    expect(topicMastery(cards(0.2)).rung).toBe(1);
    expect(topicMastery(cards(0.5)).rung).toBe(2);
    expect(topicMastery(cards(0.95)).rung).toBe(2);
    expect(topicMastery(cards(0.95), { explained: true }).rung).toBe(2);
  });

  it("flags a rung that will not survive a week untouched", () => {
    expect(topicMastery(cards(0.4, 0.6, 1.5)).fading).toBe(true);
    expect(topicMastery(cards(0.7, 0.6, 200)).fading).toBe(false);
  });
});

describe("topicMastery: answered questions", () => {
  it("takes the rung the knowledge model earned", () => {
    expect(topicMastery(answered({ rung: 1, rightItems: 1, p: 0.4 }), { now }).rung).toBe(1);
    expect(topicMastery(answered({ rung: 2, rightApply: 0 }), { now }).rung).toBe(2);
    expect(topicMastery(answered({}), { now }).rung).toBe(3);
  });

  it("only reaches Explained from Applied with an explain check behind it", () => {
    expect(topicMastery(answered({}), { explained: true, now }).rung).toBe(4);
    expect(topicMastery(answered({ rung: 2, rightApply: 0 }), { explained: true, now }).rung).toBe(2);
  });

  it("fades when the belief will drop below the rung's line within a week", () => {
    const old = new Date(now.getTime() - 20 * 86_400_000).toISOString();
    expect(topicMastery(answered({ p: 0.66, stabilityDays: 2, lastAt: old }), { now }).fading).toBe(true);
    expect(topicMastery(answered({ p: 0.95, stabilityDays: 300 }), { now }).fading).toBe(false);
  });
});

describe("masteryLabel", () => {
  it("names the rung and the fade", () => {
    expect(masteryLabel({ rung: 3, fading: true })).toBe("Applied · fading");
    expect(masteryLabel({ rung: 1, fading: false })).toBe("Seen");
    expect(masteryLabel({ rung: 0, fading: false })).toBe("Not started");
  });
});

describe("daysUntilFading", () => {
  it("counts the days until the rung slips, and has nothing to say about an unseen topic", () => {
    const quick = daysUntilFading(cards(0.4, 0.6, 1.5));
    const slow = daysUntilFading(cards(0.4, 0.6, 8));
    expect(quick).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(quick!).toBeLessThan(slow!);
    expect(daysUntilFading(cards(0.9, 0, 3))).toBeNull();
  });

  it("reads the knowledge model for answered topics", () => {
    const fast = daysUntilFading(answered({ p: 0.7, stabilityDays: 2 }), 60, now);
    const slow = daysUntilFading(answered({ p: 0.7, stabilityDays: 40 }), 60, now);
    expect(fast).not.toBeNull();
    expect(slow === null || slow > fast!).toBe(true);
  });
});
