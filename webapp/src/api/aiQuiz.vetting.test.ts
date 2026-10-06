import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateQuizQuestions, QuizShapeError } from "./aiQuiz";
import { callEdge } from "./ai";
import { fetchBankQuestions } from "./questionBank";
import { DEFAULT_SETTINGS } from "../lib/settings";

vi.mock("./ai", async (orig) => ({ ...(await orig<typeof import("./ai")>()), callEdge: vi.fn() }));
vi.mock("./misconceptions", () => ({ misconceptionsApi: { fetchAll: vi.fn(async () => []) } }));
vi.mock("../lib/studentLevel", async (orig) => ({
  ...(await orig<typeof import("../lib/studentLevel")>()),
  studentLevel: vi.fn(async () => "GCSE"),
}));
vi.mock("./questionBank", async (orig) => ({
  ...(await orig<typeof import("./questionBank")>()),
  fetchBankQuestions: vi.fn(async () => []),
}));

const reply = (questions: unknown[]) => ({ text: JSON.stringify({ questions, verification: { checked: true } }) });
const gen = (question: string, verified: boolean) => ({ question, choices: ["a", "b"], correctIndex: 0, verified });
const bankRow = (id: string) => ({
  id,
  source: "learnora",
  source_ref: null,
  licence: "learnora",
  attribution: null,
  spec_key: "aqa-gcse-biology-8461",
  topic_ref: "4.4.1",
  tier: null,
  question: `Bank question ${id}?`,
  choices: ["x", "y"],
  correct_index: 1,
  explanation: "Because.",
});

beforeEach(() => {
  vi.mocked(callEdge).mockReset();
  vi.mocked(fetchBankQuestions).mockReset().mockResolvedValue([]);
});

describe("verified questions and the bank fallback", () => {
  it("tells the server whether the topic is seeded", async () => {
    vi.mocked(callEdge).mockResolvedValue(reply([gen("Q1", true)]) as never);
    await generateQuizQuestions({ sourceText: "", topic: "Photosynthesis", settings: DEFAULT_SETTINGS, options: { questionCount: 1 } });
    expect(callEdge).toHaveBeenCalledWith(expect.objectContaining({ quizMeta: expect.objectContaining({ seeded: true }) }));
  });

  it("seeded: drops unverified questions and tops up from the bank", async () => {
    vi.mocked(callEdge).mockResolvedValue(reply([gen("Q1", true), gen("Q2", false)]) as never);
    vi.mocked(fetchBankQuestions).mockResolvedValue([bankRow("b1"), bankRow("b2")] as never);
    const qs = await generateQuizQuestions({
      sourceText: "",
      topic: "Photosynthesis",
      settings: DEFAULT_SETTINGS,
      options: { questionCount: 3 },
    });
    expect(qs.map((q) => q.question)).toEqual(expect.arrayContaining(["Q1", "Bank question b1?", "Bank question b2?"]));
    expect(qs.find((q) => q.question === "Q2")).toBeUndefined();
    expect(qs.every((q) => q.verified === true)).toBe(true);
  });

  it("seeded and nothing survives, bank empty too: a clear failure, not an unverified quiz", async () => {
    vi.mocked(callEdge).mockResolvedValue(reply([gen("Q1", false)]) as never);
    await expect(
      generateQuizQuestions({ sourceText: "", topic: "Photosynthesis", settings: DEFAULT_SETTINGS, options: { questionCount: 2 } }),
    ).rejects.toBeInstanceOf(QuizShapeError);
  });

  it("unseeded: served with the unverified label, no bank", async () => {
    vi.mocked(callEdge).mockResolvedValue(reply([gen("Q1", true), gen("Q2", false)]) as never);
    const qs = await generateQuizQuestions({
      sourceText: "",
      topic: "Causes of the First World War",
      settings: DEFAULT_SETTINGS,
      options: { questionCount: 2 },
    });
    expect(qs).toHaveLength(2);
    expect(qs.every((q) => q.generic)).toBe(true);
    expect(fetchBankQuestions).not.toHaveBeenCalled();
  });
});
