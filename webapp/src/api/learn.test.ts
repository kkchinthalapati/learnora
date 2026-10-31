import { describe, expect, it } from "vitest";
import { buildLearnStepPrompt, learnSessionKey, parseLearnStep } from "./learn";

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
