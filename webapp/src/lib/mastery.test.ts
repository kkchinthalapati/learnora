import { describe, expect, it } from "vitest";
import { masteryLabel, topicMastery } from "./mastery";

const topic = (mastery: number, evidence = 0.6, stabilityDays = 60) => ({
  mastery,
  evidence,
  stabilityDays,
});

describe("topicMastery", () => {
  it("claims no rung without evidence, whatever the prior says", () => {
    expect(topicMastery(topic(0.9, 0))).toEqual({ rung: 0, fading: false });
  });

  it("climbs Seen → Recalled → Applied on the trajectory cut points", () => {
    expect(topicMastery(topic(0.2)).rung).toBe(1);
    expect(topicMastery(topic(0.5)).rung).toBe(2);
    expect(topicMastery(topic(0.8)).rung).toBe(3);
  });

  it("only reaches Explained with an explain check behind it", () => {
    expect(topicMastery(topic(0.95)).rung).toBe(3);
    expect(topicMastery(topic(0.95), { explained: true }).rung).toBe(4);
    /* An explain check can't skip rungs a quiz hasn't earned. */
    expect(topicMastery(topic(0.5), { explained: true }).rung).toBe(2);
  });

  it("flags a rung that will not survive a week untouched", () => {
    expect(topicMastery(topic(0.7, 0.6, 3)).fading).toBe(true);
    expect(topicMastery(topic(0.7, 0.6, 200)).fading).toBe(false);
  });
});

describe("masteryLabel", () => {
  it("names the rung and the fade", () => {
    expect(masteryLabel({ rung: 3, fading: true })).toBe("Applied · fading");
    expect(masteryLabel({ rung: 1, fading: false })).toBe("Seen");
    expect(masteryLabel({ rung: 0, fading: false })).toBe("Not started");
  });
});
