import { describe, expect, it } from "vitest";
import {
  chooseNextStep,
  LOW_EVIDENCE,
  SHAKY_MASTERY,
  SOLID_MASTERY,
} from "./nextStep";

const base = {
  label: "Hydrolysis",
  topicId: "deck-1",
  mastery: 0.5,
  evidence: 0.8,
  dueCards: 0,
};

describe("chooseNextStep", () => {
  it("measures first when the mastery number is not yet trustworthy", () => {
    const step = chooseNextStep({
      ...base,
      evidence: LOW_EVIDENCE - 0.01,
      mastery: 0.1,
    });
    expect(step.method).toBe("block");
    expect(step.to).toBeNull();
    expect(step.why).toMatch(/nothing has measured/i);
  });

  it("sends a measured-and-wrong topic to the Solver, not to more cards", () => {
    const step = chooseNextStep({
      ...base,
      mastery: SHAKY_MASTERY - 0.01,
      dueCards: 40,
    });
    expect(step.method).toBe("solve");
    expect(step.to).toBe("/solver?topic=Hydrolysis");
  });

  it("reviews due cards once the topic is understood but slipping", () => {
    const step = chooseNextStep({ ...base, mastery: 0.55, dueCards: 12 });
    expect(step.method).toBe("review");
    expect(step.to).toBe("/review/deck-1");
    expect(step.action).toBe("Review 12 due cards in Hydrolysis");
  });

  it("says card, not cards, for a single due card", () => {
    expect(chooseNextStep({ ...base, mastery: 0.55, dueCards: 1 }).action).toBe(
      "Review 1 due card in Hydrolysis",
    );
  });

  it("asks a solid topic to be explained rather than drilled again", () => {
    const step = chooseNextStep({ ...base, mastery: SOLID_MASTERY });
    expect(step.method).toBe("teach");
    expect(step.to).toBe("/feynman?topic=Hydrolysis");
  });

  it("falls back to a timed block for a half-built topic with nothing due", () => {
    const step = chooseNextStep({ ...base, mastery: 0.5, dueCards: 0 });
    expect(step.method).toBe("block");
    expect(step.to).toBeNull();
  });

  it("escapes a topic name that would otherwise break the query string", () => {
    const step = chooseNextStep({
      ...base,
      label: "Acids & Bases",
      mastery: 0.2,
    });
    expect(step.to).toBe("/solver?topic=Acids%20%26%20Bases");
  });
});
