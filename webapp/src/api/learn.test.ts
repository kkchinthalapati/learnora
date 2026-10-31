import { describe, expect, it } from "vitest";
import { buildLearnStepPrompt, buildStylePrompt, holdToAnswer, learnSessionKey, parseExamQuestion, parseLearnStep } from "./learn";
import type { Marking } from "../lib/photoMarking";

const q = (question: string) => ({ question, choices: ["a", "b", "c", "d"], correctIndex: 2, feedback: "why" });
const full = {
  concept: "Osmosis",
  hook: q("Guess?"),
  explanation: "Teach.",
  check: q("Check?"),
  reteach: "Another way.",
  recheck: q("Again?"),
};

describe("parseLearnStep", () => {
  it("needs every part", () => {
    expect(parseLearnStep(JSON.stringify(full), "T")).not.toBeNull();
    for (const part of ["hook", "explanation", "check", "reteach", "recheck"]) {
      const { [part as keyof typeof full]: _dropped, ...rest } = full;
      expect(parseLearnStep(JSON.stringify(rest), "T")).toBeNull();
    }
  });

  it("refuses a check that repeats an earlier question", () => {
    expect(parseLearnStep(JSON.stringify({ ...full, check: q("guess?") }), "T")).toBeNull();
    expect(parseLearnStep(JSON.stringify({ ...full, recheck: q("Check?") }), "T")).toBeNull();
  });

  it("shuffles options but keeps each key on its answer", () => {
    const step = parseLearnStep(JSON.stringify(full), "T", () => 0)!;
    for (const question of [step.hook, step.check, step.recheck]) {
      expect(question.choices[question.correctIndex]).toBe("c");
    }
  });
});

describe("buildLearnStepPrompt", () => {
  it("teaches from this section's notes and names the others to leave out", () => {
    const prompt = buildLearnStepPrompt({
      lesson: "Cells",
      section: { key: "0-osmosis", title: "Osmosis", body: "Water moves to the more concentrated side." },
      otherSections: ["Diffusion"],
      level: "GCSE",
    });
    expect(prompt).toContain("Water moves to the more concentrated side.");
    expect(prompt).toContain("do not teach them here): Diffusion");
    expect(prompt).toContain("STUDENT LEVEL: GCSE");
  });
});

describe("learnSessionKey", () => {
  it("is one valid billing key per lesson", () => {
    const key = learnSessionKey("2b1c6f0e-1d1a-4c55-9a0e-2f4b3c1d9e7a");
    expect(key).toMatch(/^[A-Za-z0-9_-]{6,80}$/);
    expect(key).toBe(learnSessionKey("2b1c6f0e-1d1a-4c55-9a0e-2f4b3c1d9e7a"));
  });
});

describe("buildStylePrompt", () => {
  it("asks for the chosen style, from the notes, without repeating what was read", () => {
    const prompt = buildStylePrompt({
      lesson: "Cells",
      section: { key: "0-osmosis", title: "Osmosis", body: "Water moves to the more concentrated side." },
      concept: "Osmosis",
      explanation: "The first explanation.",
      style: "analogy",
      level: "GCSE",
    });
    expect(prompt).toContain("ONE analogy from everyday life");
    expect(prompt).toContain("Water moves to the more concentrated side.");
    expect(prompt).toMatch(/do not repeat its wording[^]*The first explanation\./);
  });
});

describe("parseExamQuestion", () => {
  it("takes the question and its scheme, and counts the marks itself", () => {
    const exam = parseExamQuestion(
      JSON.stringify({
        question: "Explain why a plant cell placed in pure water does not burst. [2 marks]",
        scheme: [{ point: "water enters by osmosis", marks: 1 }, { point: "the cell wall resists expansion", marks: 1 }],
      }),
    )!;
    expect(exam.question).toBe("Explain why a plant cell placed in pure water does not burst.");
    expect(exam.total).toBe(2);
  });

  it("refuses a question with no scheme or an essay's worth of marks", () => {
    expect(parseExamQuestion(JSON.stringify({ question: "Explain osmosis in plants.", scheme: [] }))).toBeNull();
    const big = Array.from({ length: 4 }, () => ({ point: "a long enough point", marks: 3 }));
    expect(parseExamQuestion(JSON.stringify({ question: "Explain osmosis in plants.", scheme: big }))).toBeNull();
  });
});

describe("holdToAnswer", () => {
  const point = (text: string) => ({ text, marks: 1 });
  const marked = (evidence: string[], quote: string): Marking => ({
    kind: "marked",
    points: evidence.map((e, i) => ({ point: point(`point ${i}`), verdict: "awarded" as const, evidence: e, note: "" })),
    awarded: evidence.length,
    total: evidence.length,
    unchecked: 0,
    beliefs: [{ concept: "Osmosis", belief: "Thinks salt moves into the cell", quote }],
  });

  it("keeps a mark only when its evidence is the student's own words", () => {
    const answer = "Water moves in by OSMOSIS, and the wall stops it bursting.";
    const held = holdToAnswer(marked(["water moves in by osmosis", "the membrane is partially permeable"], "salt moves in"), answer);
    expect(held.kind === "marked" && held.points.map((p) => p.verdict)).toEqual(["awarded", "missed"]);
    expect(held.kind === "marked" && held.points[1].note).toBe("Nothing in your answer earns this one.");
    expect(held.kind === "marked" && held.awarded).toBe(1);
    /* A belief "quoted" from words the student never wrote is dropped. */
    expect(held.kind === "marked" && held.beliefs).toEqual([]);
  });
});
