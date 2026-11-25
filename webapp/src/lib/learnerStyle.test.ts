import { describe, expect, it } from "vitest";
import {
  learnerStyleRule,
  LEARNER_STYLE_OPTIONS,
  parseLearnerStyle,
} from "./learnerStyle";

describe("parseLearnerStyle", () => {
  it("reads ids and the study profile wizard's older labels", () => {
    expect(parseLearnerStyle("visual")).toBe("visual");
    expect(parseLearnerStyle("Diagrams")).toBe("visual");
    expect(parseLearnerStyle("Worked examples")).toBe("examples");
    expect(parseLearnerStyle("Talking it through")).toBe("talk");
    expect(parseLearnerStyle("Practice first")).toBe("practice");
  });

  it("returns null for nothing or anything unknown", () => {
    expect(parseLearnerStyle(null)).toBeNull();
    expect(parseLearnerStyle("")).toBeNull();
    expect(parseLearnerStyle("telepathy")).toBeNull();
  });
});

describe("learnerStyleRule", () => {
  it("is empty without a style, so prompts are unchanged", () => {
    expect(learnerStyleRule(null)).toBe("");
  });

  it("names the style and never licenses new facts", () => {
    for (const option of LEARNER_STYLE_OPTIONS) {
      const rule = learnerStyleRule(option.id);
      expect(rule).toContain(option.label);
      expect(rule).toMatch(/never what is true/);
    }
  });
});
