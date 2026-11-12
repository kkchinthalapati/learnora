import { describe, expect, it } from "vitest";
import {
  feedbackRule,
  ratingFindings,
  SECTION_SCORE,
  steerRule,
  suggestStyle,
  type LearnerSignal,
} from "./learnerSignals";

const NOW = Date.parse("2026-11-09T12:00:00Z");
let tick = 0;
const sig = (over: Partial<LearnerSignal>, daysAgo = 1): LearnerSignal => ({
  kind: "rating",
  surface: "learn",
  style: null,
  value: null,
  score: null,
  topicKey: null,
  ref: null,
  /* Each one a second later than the last, so order is what was written. */
  createdAt: new Date(NOW - daysAgo * 86_400_000 + tick++ * 1000).toISOString(),
  ...over,
});
const down = (value: string, daysAgo = 1) => sig({ kind: "rating", value, score: -1 }, daysAgo);
const result = (style: string, outcome: keyof typeof SECTION_SCORE) =>
  sig({ kind: "section_result", style, score: SECTION_SCORE[outcome] });

describe("steerRule", () => {
  it("is empty with no requests, and lists each rule otherwise", () => {
    expect(steerRule([])).toBe("");
    const rule = steerRule(["shorter", "quiz_first"]);
    expect(rule).toMatch(/STANDING PREFERENCES/);
    expect(rule).toMatch(/two-thirds/);
    expect(rule).toMatch(/short question/);
    expect(rule).toMatch(/unless one would make something untrue/);
  });
});

describe("ratingFindings / feedbackRule", () => {
  it("needs taste said twice, but a reported mistake only once", () => {
    expect(ratingFindings([down("too_long")], NOW)).toEqual([]);
    expect(ratingFindings([down("too_long"), down("too_long")], NOW)).toEqual(["too_long"]);
    expect(ratingFindings([down("wrong")], NOW)).toEqual(["wrong"]);
  });

  it("forgets ratings older than a month", () => {
    expect(ratingFindings([down("too_long", 40), down("too_long", 35)], NOW)).toEqual([]);
  });

  it("keeps the more-said of too basic and too hard, and neither on a tie", () => {
    const basic = [down("too_basic"), down("too_basic"), down("too_basic")];
    const hard = [down("too_hard"), down("too_hard")];
    expect(ratingFindings([...basic, ...hard], NOW)).toEqual(["too_basic"]);
    expect(ratingFindings([...hard, down("too_basic"), down("too_basic")], NOW)).toEqual([]);
  });

  it("ignores helpful ratings and unknown reasons", () => {
    expect(ratingFindings([sig({ score: 1 }), down("made-up"), down("made-up")], NOW)).toEqual([]);
  });

  it("writes a line that is never to be mentioned to the student", () => {
    expect(feedbackRule([], NOW)).toBe("");
    expect(feedbackRule([down("wrong")], NOW)).toMatch(/never mention it.*\n- The student reported a mistake/s);
  });
});

describe("suggestStyle", () => {
  it("suggests nothing without enough evidence", () => {
    expect(suggestStyle([], "visual", NOW)).toBeNull();
    expect(suggestStyle([result("visual", "revisit"), result("examples", "got")], "visual", NOW)).toBeNull();
  });

  it("suggests a style whose parts went clearly better", () => {
    const signals = [
      ...Array.from({ length: 6 }, (_, i) => result("visual", i < 2 ? "got" : "revisit")),
      ...Array.from({ length: 4 }, () => result("examples", "got")),
    ];
    const s = suggestStyle(signals, "visual", NOW);
    expect(s?.style).toBe("examples");
    expect(s?.reason).toMatch(/4 of 4 first time.*2 of 6/);
  });

  it("does not suggest when the current style is doing fine", () => {
    const signals = [
      ...Array.from({ length: 6 }, () => result("visual", "got")),
      ...Array.from({ length: 4 }, () => result("examples", "got")),
    ];
    expect(suggestStyle(signals, "visual", NOW)).toBeNull();
  });

  it("suggests what they keep asking for, counting a standing preference double", () => {
    const picks = [sig({ kind: "reteach_pick", value: "steps" }), sig({ kind: "reteach_pick", value: "steps" })];
    expect(suggestStyle(picks, "talk", NOW)).toBeNull();
    expect(suggestStyle(picks, "talk", NOW, ["more_examples"])?.style).toBe("examples");
    expect(suggestStyle(picks, "examples", NOW, ["more_examples"])).toBeNull();
  });

  it("does not suggest when the asks are split", () => {
    const picks = ["steps", "steps", "example", "example", "analogy"].map((value) =>
      sig({ kind: "reteach_pick", value }),
    );
    expect(suggestStyle(picks, "visual", NOW)).toBeNull();
  });
});
