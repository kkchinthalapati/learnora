import { describe, expect, it } from "vitest";
import { getSpec } from "../../lib/syllabus";
import type { BankQuestion } from "../../lib/questionBank";
import {
  firstPractice,
  pickPlacement,
  PLACEMENT_MAX,
  startingPointFromAnswers,
  startingPointFromChapters,
} from "./placement";

const spec = getSpec("aqa-gcse-biology-8461")!;

function bank(
  topicRef: string,
  i = 0,
  patch: Partial<BankQuestion> = {},
): BankQuestion {
  return {
    id: `${topicRef}-${i}`,
    source: "learnora",
    source_ref: null,
    licence: "learnora",
    attribution: null,
    spec_key: spec.id,
    topic_ref: topicRef,
    tier: null,
    question: `Q ${topicRef} ${i}?`,
    choices: ["a", "b", "c"],
    correct_index: 0,
    explanation: null,
    ...patch,
  };
}

describe("the 2-minute check", () => {
  it("asks at most 12, one per topic, spread across units before repeating one", () => {
    const rows = spec.topics.flatMap((t) => [bank(t.ref, 0), bank(t.ref, 1)]);
    const picked = pickPlacement(spec, rows);
    expect(picked.length).toBe(Math.min(PLACEMENT_MAX, spec.topics.length));
    expect(new Set(picked.map((q) => q.topicRef)).size).toBe(picked.length);
    const firstRound = picked.slice(0, spec.units.length).map((q) => q.unit);
    expect(new Set(firstRound).size).toBe(firstRound.length);
  });

  it("skips numeric questions and topics outside the spec", () => {
    const t = spec.topics[0].ref;
    expect(
      pickPlacement(spec, [
        bank(t, 0, { answer_type: "numeric" }),
        bank("nope"),
      ]),
    ).toEqual([]);
  });

  it("ends on a starting point, not a score; 'not learnt' is its own group", () => {
    const sp = startingPointFromAnswers([
      { topicTitle: "Osmosis", correct: true },
      { topicTitle: "Enzymes", correct: false },
      { topicTitle: "Ecology", correct: null },
    ]);
    expect(sp).toEqual({
      know: ["Osmosis"],
      look: ["Enzymes"],
      notLearnt: ["Ecology"],
    });
    expect(firstPractice(sp, "Biology")).toBe("Enzymes");
    expect(
      firstPractice({ know: [], look: [], notLearnt: [] }, "Biology"),
    ).toBe("Biology");
  });

  it("builds the same starting point from per-chapter answers", () => {
    const [a, b, c] = spec.units;
    const sp = startingPointFromChapters(spec, {
      [a.code]: "know",
      [b.code]: "unsure",
      [c.code]: "not_learnt",
    });
    expect(sp).toEqual({
      know: [a.title],
      look: [b.title],
      notLearnt: [c.title],
    });
  });
});
