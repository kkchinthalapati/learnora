import { describe, expect, it } from "vitest";
import type { TopicKnowledge } from "./knowledgeModel";
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
    const step = chooseNextStep({ ...base, evidence: LOW_EVIDENCE - 0.01, mastery: 0.1 });
    expect(step.method).toBe("block");
    expect(step.to).toMatch(/mode=practice/);
    /* Some evidence exists, so it must not claim none does. */
    expect(step.why).toMatch(/only a little has measured/i);
    const none = chooseNextStep({ ...base, evidence: 0, mastery: 0.25 });
    expect(none.why).toMatch(/nothing has measured/i);
  });

  it("sends a measured-and-wrong topic to the Solver, not to more cards", () => {
    const step = chooseNextStep({
      ...base,
      mastery: SHAKY_MASTERY - 0.01,
      dueCards: 40,
    });
    expect(step.method).toBe("solve");
    expect(step.to).toBe("/study/new?mode=explain&topic=Hydrolysis");
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
    expect(step.to).toBe("/study/new?mode=teach&topic=Hydrolysis");
  });

  it("sends a half-built topic with nothing due to a Practice session, not a bare timer", () => {
    const step = chooseNextStep({ ...base, mastery: 0.5, dueCards: 0 });
    expect(step.method).toBe("block");
    expect(step.to).toMatch(/^\/study\/new\?mode=practice&topic=/);
  });

  it("escapes a topic name that would otherwise break the query string", () => {
    const step = chooseNextStep({
      ...base,
      label: "Acids & Bases",
      mastery: 0.2,
    });
    expect(step.to).toBe("/study/new?mode=explain&topic=Acids+%26+Bases");
  });
});

describe("chooseNextStep with answered questions (lib/knowledgeModel.ts)", () => {
  const k = (over: Partial<TopicKnowledge>): TopicKnowledge => ({
    key: "electricity",
    p: 0.5,
    pInWeek: 0.45,
    status: "learning",
    fading: false,
    rung: 1,
    stabilityDays: 4,
    counted: 3,
    rightItems: 1,
    rightDays: 1,
    rightApply: 0,
    lastAt: "2026-10-08T10:00:00Z",
    ...over,
  });
  const base = { label: "Electricity", topicId: "d1", mastery: 0.9, evidence: 0.9, dueCards: 0 };

  it("fixes a shaky prerequisite first", () => {
    const step = chooseNextStep({
      ...base,
      knowledge: k({ p: 0.45 }),
      prerequisite: { label: "Ohm's law", knowledge: k({ p: 0.3 }) },
    });
    expect(step.action).toBe("Shore up Ohm's law first");
    expect(step.to).toContain("topic=Ohm");
  });

  it("teaches before testing when the answers say it isn't there", () => {
    expect(chooseNextStep({ ...base, knowledge: k({ p: 0.3 }) }).method).toBe("solve");
  });

  it("asks for application when recall is all that has been shown", () => {
    const step = chooseNextStep({ ...base, knowledge: k({ status: "fragile", p: 0.9, rightApply: 0 }) });
    expect(step.action).toBe("Apply Electricity to new problems");
  });

  it("asks for a later check when it all went well on one day", () => {
    const step = chooseNextStep({ ...base, knowledge: k({ status: "fragile", p: 0.9, rightApply: 1 }) });
    expect(step.method).toBe("review");
  });

  it("only offers 'explain it' once the topic is secure and holding", () => {
    const secure = k({ status: "secure", p: 0.92, rightItems: 4, rightDays: 2, rightApply: 1 });
    expect(chooseNextStep({ ...base, knowledge: secure }).method).toBe("teach");
    expect(chooseNextStep({ ...base, knowledge: { ...secure, fading: true } }).method).toBe("review");
  });

  it("falls back to the card-and-score rules with nothing answered", () => {
    expect(chooseNextStep({ ...base, knowledge: k({ counted: 0 }) }).method).toBe("teach");
  });
});
