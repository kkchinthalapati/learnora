import { describe, expect, it } from "vitest";
import { isUnverified, questionRef, seededMatch, vetGeneratedQuestions, withoutFlagged } from "./questionVetting";
import type { QuizQuestion } from "./aiJson";

const q = (question: string, verified?: boolean): QuizQuestion => ({
  question,
  choices: ["a", "b"],
  correctIndex: 0,
  ...(verified === undefined ? {} : { verified }),
});

describe("seeded topics", () => {
  it("recognises a spec topic, and not a stray shared word", () => {
    expect(seededMatch("Photosynthesis")?.spec.qualification).toBeTruthy();
    expect(seededMatch("Causes of the First World War")).toBeNull();
    expect(seededMatch("energy")).toBeNull();
  });
});

describe("vetting what the checker sent", () => {
  const mixed = [q("A", true), q("B", false), q("C", true)];

  it("seeded: only verified questions, and the gap to fill", () => {
    const v = vetGeneratedQuestions(mixed, { seeded: true, wanted: 5 });
    expect(v.serve.map((x) => x.question)).toEqual(["A", "C"]);
    expect(v.shortBy).toBe(3);
  });

  it("unseeded: everything served, all labelled unverified", () => {
    const v = vetGeneratedQuestions(mixed, { seeded: false, wanted: 3 });
    expect(v.serve).toHaveLength(3);
    expect(v.serve.every(isUnverified)).toBe(true);
  });

  it("a server without the checker's verdicts serves as before", () => {
    const v = vetGeneratedQuestions([q("A"), q("B")], { seeded: true, wanted: 2 });
    expect(v.serve).toHaveLength(2);
    expect(v.shortBy).toBe(0);
  });

  it("a verified question in a seeded subject carries no label", () => {
    expect(isUnverified(q("A", true))).toBe(false);
  });
});

describe("refs and flags", () => {
  it("keys bank questions by their own ref and generated ones by quiz and wording", () => {
    expect(questionRef({ question: "x", ref: "bank:123" }, "quiz-1")).toBe("bank:123");
    expect(questionRef({ question: "What is 2+2?" }, "quiz-1")).toMatch(/^quiz:quiz-1:q[0-9a-z]+$/);
    expect(questionRef({ question: "What is 2+2?" })).toMatch(/^gen:q/);
  });

  it("drops pulled questions", () => {
    const list = [{ question: "keep" }, { question: "pull", ref: "bank:9" }];
    expect(withoutFlagged(list, new Set(["bank:9"]))).toEqual([{ question: "keep" }]);
  });
});
