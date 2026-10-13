import { describe, expect, it, vi } from "vitest";
import { bankRetestQuestion } from "./retestQuestion";
import { fetchBankQuestions } from "./questionBank";

vi.mock("../lib/examSpec", () => ({
  pickExamSpec: () => ({ spec: { key: "cbse-10-maths-041" }, topic: { ref: "5" }, tier: null }),
}));
vi.mock("./questionBank", () => ({ fetchBankQuestions: vi.fn() }));

const row = (id: string, question: string, choices: string[]) => ({
  id,
  question,
  choices,
  correct_index: 0,
  explanation: null,
  attribution: null,
});

describe("bankRetestQuestion", () => {
  it("skips a typed-in numeric question, whose only choice is its key", async () => {
    vi.mocked(fetchBankQuestions).mockResolvedValue([
      row("n1", "What is the sum of the first 25 odd numbers?", ["625"]),
      row("m1", "The common difference of 10, 7, 4, 1, … is", ["−3", "3", "10", "−7"]),
    ] as never);

    const q = await bankRetestQuestion({ concept: "Arithmetic Progressions", summary: "", excludedQuestionKeys: [] }, [], "2026-10-13");

    expect(q?.ref).toBe("bank:m1");
    expect(q?.choices.length).toBeGreaterThanOrEqual(2);
  });

  it("finds nothing rather than offer a numeric question as the retest", async () => {
    vi.mocked(fetchBankQuestions).mockResolvedValue([row("n1", "What is 7 × 8?", ["56"])] as never);
    expect(await bankRetestQuestion({ concept: "Arithmetic", summary: "", excludedQuestionKeys: [] }, [], "2026-10-13")).toBeNull();
  });
});
