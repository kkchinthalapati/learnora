import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLabelPrompt, labelWrongAnswers, parseLabels } from "./mistakeLabel";
import { callEdge } from "./ai";
import { fetchDailyAiUsage } from "./aiUsage";
import { questionKey } from "../lib/questionKey";

vi.mock("./ai", () => ({ callEdge: vi.fn() }));
vi.mock("./aiUsage", () => ({ fetchDailyAiUsage: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { user_metadata: {} } } } })) } },
}));

const ITEMS = [
  { question: "Why did Weimar collapse?", chosen: "One cause", correct: "Several causes", topic: "Weimar" },
  { question: "Compute 12 × 4", chosen: "46", correct: "48", topic: "Arithmetic" },
];

describe("provisional AI labels", () => {
  beforeEach(() => {
    vi.mocked(callEdge).mockReset();
    vi.mocked(fetchDailyAiUsage).mockResolvedValue({ usedByTool: {}, resetsAt: "" });
  });

  it("sends questions and answers, nothing about the student", () => {
    const prompt = buildLabelPrompt("History", ITEMS, ["Single-cause history"]);
    expect(prompt).toContain("Why did Weimar collapse?");
    expect(prompt).toContain("Single-cause history");
    expect(prompt).not.toMatch(/@|full_name|user_id|date of birth/i);
  });

  it("keeps well-formed labels and drops 'none' and malformed items", () => {
    const text = JSON.stringify({
      items: [
        { i: 0, concept: "Single-cause history", belief: "Events have one cause.", reteach: "Causes interact.", contrast: "One vs many." },
        { i: 1, none: true },
        { i: 7, concept: "Out of range", belief: "x", reteach: "y", contrast: "z" },
      ],
    });
    const labels = parseLabels(text, ITEMS);
    expect([...labels.keys()]).toEqual([questionKey(ITEMS[0].question)]);
  });

  it("an AI failure yields no labels, so the generic repair is used", async () => {
    vi.mocked(callEdge).mockRejectedValue(new Error("429"));
    await expect(labelWrongAnswers("History", ITEMS)).resolves.toEqual(new Map());
  });

  it("does not spend the student's last chat calls", async () => {
    vi.mocked(fetchDailyAiUsage).mockResolvedValue({ usedByTool: { chat: 14 }, resetsAt: "" });
    await labelWrongAnswers("History", ITEMS);
    expect(callEdge).not.toHaveBeenCalled();
  });
});
