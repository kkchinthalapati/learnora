import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  CANONICAL_TRAP_ARCHETYPES,
  deconstructExamPaper,
  generateChallengeSprint,
  getAhaDisarmWalkthrough,
  getStoredDisarmedTraps,
  markTrapArmed,
  markTrapDisarmed,
  getStoredRadarHistory,
  saveRadarRecord,
  sprintFromBank,
} from "./aiExamDeconstructor";
import { callEdge } from "./ai";
import { fetchMisconceptionMappedQuestions } from "./questionBank";
import type { BankQuestion } from "../lib/questionBank";
import type { Settings } from "../lib/settings";

vi.mock("./ai", () => ({ callEdge: vi.fn() }));
vi.mock("./questionBank", () => ({
  fetchMisconceptionMappedQuestions: vi.fn(async () => []),
  bankTopicTitle: () => "Acids, Bases and Salts",
}));

const PH_ROW = {
  id: "row-ph",
  spec_key: "cbse-10-science-086",
  topic_ref: "2",
  question: "Which of these solutions is the most acidic?",
  choices: ["pH 8", "pH 13", "pH 1", "pH 6"],
  correct_index: 2,
  explanation: "The lower the pH, the more acidic.",
  distractor_misconceptions: [null, "chem-higher-ph-more-acidic", null, null],
} as unknown as BankQuestion;

describe("aiExamDeconstructor", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(callEdge).mockReset();
    vi.mocked(fetchMisconceptionMappedQuestions).mockResolvedValue([]);
  });

  describe("deconstructExamPaper", () => {
    it("returns canonical trap archetypes with offline fallback, and says they are the stock list", async () => {
      const { archetypes, fromMaterial } = await deconstructExamPaper("Midterm syllabus", "Calculus 2");
      expect(fromMaterial).toBe(false);
      expect(archetypes.length).toBeGreaterThanOrEqual(6);
      expect(archetypes[0]).toHaveProperty("id");
      expect(archetypes[0]).toHaveProperty("name");
      expect(archetypes[0]).toHaveProperty("category");
      expect(archetypes[0]).toHaveProperty("description");
      expect(archetypes[0]).toHaveProperty("disarmRule");
      expect(archetypes[0]).toHaveProperty("examplePattern");
    });

    it("covers essential trap archetypes: edge cases, negative wording, hidden assumptions, lookalike terms", () => {
      const ids = CANONICAL_TRAP_ARCHETYPES.map((a) => a.id);
      expect(ids).toContain("edge-case-hazards");
      expect(ids).toContain("negative-wording-maze");
      expect(ids).toContain("hidden-assumptions");
      expect(ids).toContain("lookalike-terms");
      expect(ids).toContain("units-and-scale-drift");
      expect(ids).toContain("premature-shortcut-traps");
    });
  });

  describe("generateChallengeSprint", () => {
    it("generates tricky practice questions with bait explanations and hints", async () => {
      const questions = await generateChallengeSprint("Calculus", CANONICAL_TRAP_ARCHETYPES, 3);
      expect(questions.length).toBe(3);
      const q = questions[0];
      expect(q).toHaveProperty("question");
      expect(q.options.length).toBe(4);
      expect(typeof q.correctAnswerIndex).toBe("number");
      expect(typeof q.baitOptionIndex).toBe("number");
      expect(q.correctAnswerIndex).not.toBe(q.baitOptionIndex);
      expect(q.baitExplanation.length).toBeGreaterThan(10);
      expect(q.trapExplanation.length).toBeGreaterThan(10);
      expect(q.hint.length).toBeGreaterThan(5);
    });

    it("tailors questions to subject matter (CS vs Science vs Math)", async () => {
      const csQuestions = await generateChallengeSprint("Computer Science", CANONICAL_TRAP_ARCHETYPES, 2);
      expect(csQuestions.some((q) => q.question.includes("binary search") || q.question.includes("Dijkstra"))).toBe(true);

      const scienceQuestions = await generateChallengeSprint("Physics Mechanics", CANONICAL_TRAP_ARCHETYPES, 2);
      expect(scienceQuestions.some((q) => q.question.includes("accelerates") || q.question.includes("Enzyme"))).toBe(true);
    });

    it("never pads a subject with another subject's questions", async () => {
      vi.mocked(callEdge).mockRejectedValueOnce(new Error("offline"));
      await expect(generateChallengeSprint("History", [], 4, {} as Settings)).rejects.toThrow(
        /Couldn't put together a sprint for History/,
      );
      const maths = await generateChallengeSprint("Maths", [], 4);
      expect(maths.every((q) => q.id.startsWith("math-sprint"))).toBe(true);
    });

    it("never repeats a question, so one bait can't look like a recurring mistake", async () => {
      const qs = await generateChallengeSprint("Physics", [], 6);
      expect(new Set(qs.map((q) => q.question)).size).toBe(qs.length);
      expect(qs).toHaveLength(2);
    });

    it("shuffles options so the bait is not always option A", async () => {
      const qs = await generateChallengeSprint("Maths", [], 4, undefined, () => 0);
      for (const q of qs) expect(q.correctAnswerIndex).not.toBe(q.baitOptionIndex);
      expect(qs.some((q) => q.baitOptionIndex !== 0)).toBe(true);
    });

    it("puts the practice bank's mapped questions first, in the student's subject only", async () => {
      vi.mocked(fetchMisconceptionMappedQuestions).mockResolvedValue([PH_ROW]);
      const [first] = await generateChallengeSprint("Chemistry", [], 3, undefined, () => 0.99);
      expect(first.source).toBe("bank");
      expect(first.misconceptionId).toBe("chem-higher-ph-more-acidic");
      expect(first.options[first.baitOptionIndex]).toBe("pH 13");
      expect(first.options[first.correctAnswerIndex]).toBe("pH 1");

      expect(sprintFromBank([PH_ROW], "Biology")).toEqual([]);
      expect(sprintFromBank([PH_ROW], "Science")).toHaveLength(1);
    });

    it("asks the AI only when the subject's sources are short, and drops questions it can't mark", async () => {
      const ai = (n: number, extra: Record<string, unknown> = {}) => ({
        id: `h${n}`,
        question: `History question ${n}?`,
        options: ["Bait", "Right", "Other", "Another"],
        correctAnswerIndex: 1,
        baitOptionIndex: 0,
        trapArchetypeId: "hidden-assumptions",
        trapName: "Hidden assumptions",
        baitExplanation: "Looks right because…",
        trapExplanation: "The trap is…",
        hint: "Read the dates.",
        ...extra,
      });
      vi.mocked(callEdge).mockResolvedValueOnce({
        text: JSON.stringify([
          ai(1),
          ai(2, { baitOptionIndex: 1 }),
          ai(3, { options: ["A", "B"] }),
          ai(4, { correctAnswerIndex: 7 }),
          ai(5, { trapArchetypeId: "made-up" }),
          ai(1),
        ]),
      } as never);
      const qs = await generateChallengeSprint("History", [], 4, {} as Settings, () => 0);
      expect(qs).toHaveLength(1);
      expect(qs[0].source).toBe("ai");
      expect(qs[0].options[qs[0].correctAnswerIndex]).toBe("Right");
      expect(qs[0].options[qs[0].baitOptionIndex]).toBe("Bait");
    });
  });

  describe("disarmed traps follow the latest evidence", () => {
    it("re-arms a trap the student falls for again", () => {
      markTrapDisarmed("edge-case-hazards");
      expect(getStoredDisarmedTraps()).toContain("edge-case-hazards");
      markTrapArmed("edge-case-hazards");
      expect(getStoredDisarmedTraps()).not.toContain("edge-case-hazards");
    });
  });

  describe("walkthroughs", () => {
    it("builds a bank trap's walkthrough from its catalogue entry, ending in its check question", async () => {
      const w = await getAhaDisarmWalkthrough("chem-higher-ph-more-acidic");
      expect(w.trapId).toBe("chem-higher-ph-more-acidic");
      expect(w.step1Bait.baitExample).toMatch(/pH/i);
      expect(w.step4DisarmChallenge.options.length).toBeGreaterThanOrEqual(2);
    });

    it("gives a paper-analysis card its category's walkthrough, not the edge-case one under its name", async () => {
      const w = await getAhaDisarmWalkthrough("negative-wording-maze-3");
      expect(w.trapId).toBe("negative-wording-maze");
    });
  });

  describe("getAhaDisarmWalkthrough", () => {
    it("returns 4-step Aha! breakdown for known trap archetype", async () => {
      const walkthrough = await getAhaDisarmWalkthrough("edge-case-hazards");
      expect(walkthrough.trapId).toBe("edge-case-hazards");
      expect(walkthrough.trapName).toBe("Edge cases");

      // Step 1: Bait
      expect(walkthrough.step1Bait).toBeDefined();
      expect(walkthrough.step1Bait.title).toBeTruthy();
      expect(walkthrough.step1Bait.baitExample).toBeTruthy();
      expect(walkthrough.step1Bait.whyItTricksStudents).toBeTruthy();

      // Step 2: Sneaky Trick
      expect(walkthrough.step2SneakyTrick).toBeDefined();
      expect(walkthrough.step2SneakyTrick.title).toBeTruthy();
      expect(walkthrough.step2SneakyTrick.mechanism).toBeTruthy();
      expect(walkthrough.step2SneakyTrick.distractorDesign).toBeTruthy();

      // Step 3: Detective Rule
      expect(walkthrough.step3DetectiveRule).toBeDefined();
      expect(walkthrough.step3DetectiveRule.ruleStatement).toBeTruthy();
      expect(walkthrough.step3DetectiveRule.checklist.length).toBeGreaterThan(0);
      expect(walkthrough.step3DetectiveRule.motto).toBeTruthy();

      // Step 4: Disarm Challenge
      expect(walkthrough.step4DisarmChallenge).toBeDefined();
      expect(walkthrough.step4DisarmChallenge.scenario).toBeTruthy();
      expect(walkthrough.step4DisarmChallenge.options.length).toBeGreaterThanOrEqual(3);
      expect(typeof walkthrough.step4DisarmChallenge.correctAnswerIndex).toBe("number");
      expect(walkthrough.step4DisarmChallenge.celebrationNote).toBeTruthy();
    });

    it("falls back gracefully for custom or unknown trap ID", async () => {
      const customWalkthrough = await getAhaDisarmWalkthrough("quantum-fluctuation-traps");
      expect(customWalkthrough.trapId).toBe("quantum-fluctuation-traps");
      expect(customWalkthrough.step1Bait).toBeDefined();
      expect(customWalkthrough.step4DisarmChallenge.options.length).toBeGreaterThan(0);
    });
  });

  describe("storage and progress tracking", () => {
    it("records and retrieves disarmed traps in localStorage", () => {
      expect(getStoredDisarmedTraps()).toEqual([]);
      const updated = markTrapDisarmed("edge-case-hazards");
      expect(updated).toContain("edge-case-hazards");
      expect(getStoredDisarmedTraps()).toContain("edge-case-hazards");
    });

    it("saves and retrieves radar records", () => {
      expect(getStoredRadarHistory()).toEqual([]);
      saveRadarRecord({
        id: "radar-1",
        subject: "Calculus",
        timestamp: new Date().toISOString(),
        overallScore: 85,
        disarmedTrapIds: ["edge-case-hazards"],
        totalAttempted: 5,
        correctCount: 4,
        categoryScores: { edge_cases: 90 },
      });
      const history = getStoredRadarHistory();
      expect(history.length).toBe(1);
      expect(history[0].overallScore).toBe(85);
    });

    it("keeps only the 20 most recent radar records", () => {
      for (let index = 0; index < 21; index += 1) {
        saveRadarRecord({
          id: `radar-${index}`,
          subject: "Calculus",
          timestamp: new Date(index).toISOString(),
          overallScore: index,
          disarmedTrapIds: [],
          totalAttempted: 1,
          correctCount: 1,
          categoryScores: {},
        });
      }

      const history = getStoredRadarHistory();
      expect(history).toHaveLength(20);
      expect(history[0].id).toBe("radar-20");
      expect(history.at(-1)?.id).toBe("radar-1");
    });
  });
});
