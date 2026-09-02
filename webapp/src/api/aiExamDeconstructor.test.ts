import { describe, expect, it, beforeEach } from "vitest";
import {
  CANONICAL_TRAP_ARCHETYPES,
  deconstructExamPaper,
  generateChallengeSprint,
  getAhaDisarmWalkthrough,
  getStoredDisarmedTraps,
  markTrapDisarmed,
  getStoredRadarHistory,
  saveRadarRecord,
} from "./aiExamDeconstructor";

describe("aiExamDeconstructor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("deconstructExamPaper", () => {
    it("returns canonical trap archetypes with offline fallback", async () => {
      const archetypes = await deconstructExamPaper("Midterm syllabus", "Calculus 2");
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
  });

  describe("getAhaDisarmWalkthrough", () => {
    it("returns 4-step Aha! breakdown for known trap archetype", async () => {
      const walkthrough = await getAhaDisarmWalkthrough("edge-case-hazards");
      expect(walkthrough.trapId).toBe("edge-case-hazards");
      expect(walkthrough.trapName).toBe("Edge Case Hazards");

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
  });
});
