import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Misconception } from "../lib/misconceptions";

const fetchAll = vi.fn<() => Promise<Misconception[]>>();
vi.mock("./misconceptions", () => ({
  misconceptionsApi: { fetchAll: () => fetchAll() },
}));
vi.mock("./studentEvidence", () => ({
  loadKnowledgeSummary: async () =>
    "TOPIC STATUS (from answered questions; never quote these as percentages or grades):\n- osmosis: still learning (2 of 5 right).",
}));
vi.mock("./session", () => ({ requireUserId: async () => "user-1" }));
const adaptation = vi.fn(async () => "");
vi.mock("./learnerSignals", () => ({ loadAdaptationBlock: () => adaptation() }));
vi.mock("./learnerStyle", () => ({
  loadLearnerProfileRule: async () => "HOW THIS STUDENT LEARNS BEST (Worked examples): lead with worked examples.",
}));
vi.mock("../lib/studentLevel", () => ({ studentLevel: async () => "GCSE" }));

const { learnerSettings, loadLearnerContext, loadPresentationLines, resetLearnerContextCache } =
  await import("./learnerContext");

const now = new Date().toISOString();
const mistake = (
  subject: string,
  concept: string,
  summary: string,
): Misconception => ({
  id: `${subject}-${concept}`,
  subject,
  concept,
  conceptKey: concept.toLowerCase(),
  summary,
  status: "open",
  severity: "moderate",
  originTool: "quiz",
  timesObserved: 3,
  timesCorrected: 0,
  firstSeenAt: now,
  lastSeenAt: now,
  resolvedAt: null,
});

beforeEach(() => {
  resetLearnerContextCache();
  fetchAll.mockReset();
  adaptation.mockReset();
  adaptation.mockResolvedValue("");
  window.localStorage.clear();
});

describe("loadLearnerContext", () => {
  it("brings the student's mistakes in this subject, what they know, and their level", async () => {
    fetchAll.mockResolvedValue([
      mistake("Biology", "Osmosis", "Thinks salt moves into the cell"),
      mistake("History", "Treaty of Versailles", "Thinks it ended WW2"),
    ]);
    const block = await loadLearnerContext("Biology");
    expect(block).toContain("studying at GCSE level");
    expect(block).toContain("Thinks salt moves into the cell");
    expect(block).not.toContain("Treaty of Versailles");
    expect(block).toContain("osmosis: still learning");
    expect(block).toMatch(/never list the student's weaknesses back to them/);
  });

  it("says there is nothing on record, rather than failing, when the ledger can't be read", async () => {
    fetchAll.mockRejectedValue(new Error("offline"));
    const block = await loadLearnerContext("Biology");
    expect(block).toMatch(/Do not invent any/);
  });

  it("reads once for a lesson's several calls", async () => {
    fetchAll.mockResolvedValue([]);
    await loadLearnerContext("Biology");
    await loadLearnerContext("biology");
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it("adds what recent ratings said fresh on every call, past the record's cache", async () => {
    fetchAll.mockResolvedValue([]);
    await loadLearnerContext("Biology");
    adaptation.mockResolvedValueOnce("WHAT THIS STUDENT SAID ABOUT RECENT EXPLANATIONS:\n- Keep explanations short.");
    const block = await loadLearnerContext("Biology");
    expect(block).toContain("Keep explanations short.");
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it("still gives the record when the ratings can't be read", async () => {
    fetchAll.mockResolvedValue([]);
    adaptation.mockRejectedValueOnce(new Error("offline"));
    await expect(loadLearnerContext("Biology")).resolves.toMatch(/HOW TO USE/);
  });
});

describe("loadPresentationLines", () => {
  it("joins the learner style and the requests, with no ledger", async () => {
    adaptation.mockResolvedValueOnce("WHAT THIS STUDENT SAID ABOUT RECENT EXPLANATIONS:\n- Keep it shorter.");
    const lines = await loadPresentationLines();
    expect(lines).toMatch(/HOW THIS STUDENT LEARNS BEST \(Worked examples\)/);
    expect(lines).toContain("Keep it shorter.");
    expect(fetchAll).not.toHaveBeenCalled();
  });
});

describe("learnerSettings", () => {
  it("keeps the student's language and persona, and leaves lengths to the prompt", () => {
    window.localStorage.setItem(
      "learnora_settings",
      JSON.stringify({
        aiLanguage: "Hindi",
        aiPersona: "coach",
        aiDepth: 5,
        aiStyle: "concise",
      }),
    );
    const s = learnerSettings();
    expect(s.aiDepth).toBe(3);
    expect(s.aiStyle).toBe("balanced");
    expect(s.aiLanguage).toBe("Hindi");
    expect(s.aiPersona).toBe("coach");
  });
});
