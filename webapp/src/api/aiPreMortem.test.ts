import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_TRAP_ARCHETYPES,
  extractProfessorTraps,
  generateStressTest,
  evaluatePreMortemTest,
  getTrapNeutralizer,
  getPreMortemReports,
  savePreMortemReport,
  getLatestPreMortemReport,
  clearPreMortemReports,
  type PreMortemReport,
} from "./aiPreMortem";

describe("aiPreMortem API", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("extractProfessorTraps", () => {
    it("returns default archetypes when offline or without settings", async () => {
      const traps = await extractProfessorTraps("Calculus 2", "Midterm 1");
      expect(traps.length).toBeGreaterThanOrEqual(6);
      expect(traps[0]).toHaveProperty("id");
      expect(traps[0]).toHaveProperty("name");
      expect(traps[0]).toHaveProperty("description");
      expect(traps[0]).toHaveProperty("examplePattern");
      expect(traps[0]).toHaveProperty("frequency");
    });

    it("includes boundary, negative phrasing, and assumption archetypes", () => {
      const ids = DEFAULT_TRAP_ARCHETYPES.map((a) => a.id);
      expect(ids).toContain("boundary-condition-tricks");
      expect(ids).toContain("negative-phrasing-distractors");
      expect(ids).toContain("multi-step-assumption-traps");
      expect(ids).toContain("false-synonym-conflation");
    });
  });

  describe("generateStressTest", () => {
    it("generates questions tailored to Math & Physics subject", async () => {
      const questions = await generateStressTest("Calculus", ["boundary-condition-tricks"], 3);
      expect(questions.length).toBe(3);
      expect(questions[0]).toHaveProperty("question");
      expect(questions[0].options.length).toBe(4);
      expect(typeof questions[0].correctAnswerIndex).toBe("number");
      expect(questions[0]).toHaveProperty("trapExplanation");
      expect(questions[0]).toHaveProperty("hint");
    });

    it("generates questions tailored to Computer Science subject", async () => {
      const questions = await generateStressTest("Computer Science Algorithms", ["boundary-condition-tricks"], 3);
      expect(questions.length).toBe(3);
      expect(questions.some((q) => q.question.toLowerCase().includes("binary search") || q.question.toLowerCase().includes("knapsack") || q.question.toLowerCase().includes("authentication"))).toBe(true);
    });

    it("generates questions tailored to Bio/Chem subject", async () => {
      const questions = await generateStressTest("Organic Chemistry", ["boundary-condition-tricks"], 3);
      expect(questions.length).toBe(3);
      expect(questions.some((q) => q.question.toLowerCase().includes("kinetics") || q.question.toLowerCase().includes("dna") || q.question.toLowerCase().includes("ph"))).toBe(true);
    });
  });

  describe("evaluatePreMortemTest", () => {
    it("evaluates answers, computes predictedScore, gradeEstimate, radarData, and predictedFailures", async () => {
      const questions = await generateStressTest("Calculus", ["boundary-condition-tricks", "negative-phrasing-distractors"], 4);
      
      // Answer 2 correct and 2 wrong
      const answers: Record<string, number> = {
        [questions[0].id]: questions[0].correctAnswerIndex,
        [questions[1].id]: (questions[1].correctAnswerIndex + 1) % 4, // wrong
        [questions[2].id]: questions[2].correctAnswerIndex,
        [questions[3].id]: (questions[3].correctAnswerIndex + 1) % 4, // wrong
      };

      const report = await evaluatePreMortemTest("Calculus", answers, questions);

      expect(report.predictedScore).toBeGreaterThanOrEqual(35);
      expect(report.predictedScore).toBeLessThanOrEqual(99);
      expect(report.gradeEstimate).toBeDefined();
      expect(report.radarData.length).toBeGreaterThan(0);
      expect(report.radarData[0]).toHaveProperty("topic");
      expect(report.radarData[0]).toHaveProperty("riskLevel");
      expect(report.radarData[0]).toHaveProperty("failureProbability");
      expect(report.predictedFailures.length).toBeGreaterThan(0);
      expect(report.predictedFailures[0]).toHaveProperty("coreTrap");
      expect(report.predictedFailures[0]).toHaveProperty("predictedLostMarks");
      expect(report.predictedFailures[0]).toHaveProperty("neutralizerId");
    });

    it("handles empty questions gracefully", async () => {
      const report = await evaluatePreMortemTest("Physics", {}, []);
      expect(report.predictedScore).toBe(75);
      expect(report.radarData).toEqual([]);
      expect(report.predictedFailures).toEqual([]);
    });
  });

  describe("getTrapNeutralizer", () => {
    it("returns rich 3-step deconstruction and verification challenge for known trap", async () => {
      const neutralizer = await getTrapNeutralizer("boundary-condition-tricks");
      expect(neutralizer.id).toBe("boundary-condition-tricks");
      expect(neutralizer.trapName).toBe("Boundary Condition & Edge Case Traps");
      expect(typeof neutralizer.anatomyOfTrick).toBe("object");
      if (typeof neutralizer.anatomyOfTrick === "object") {
        expect(neutralizer.anatomyOfTrick.bait).toBeDefined();
        expect(neutralizer.anatomyOfTrick.hiddenFlaw).toBeDefined();
        expect(neutralizer.anatomyOfTrick.disarmRule).toBeDefined();
      }
      expect(neutralizer.disarmRules.length).toBeGreaterThan(0);
      expect(neutralizer.practiceChallenge.options.length).toBe(4);
      expect(typeof neutralizer.practiceChallenge.answer).toBe("number");
      expect(neutralizer.practiceChallenge.explanation).toBeDefined();
    });

    it("returns valid fallback neutralizer for unknown trap ID", async () => {
      const neutralizer = await getTrapNeutralizer("custom-experimental-trick");
      expect(neutralizer.id).toBe("custom-experimental-trick");
      expect(neutralizer.practiceChallenge).toBeDefined();
    });
  });

  describe("Storage and History persistence", () => {
    it("persists and retrieves pre-mortem reports", () => {
      const mockReport: PreMortemReport = {
        id: "test-report-1",
        subject: "Linear Algebra",
        predictedScore: 82,
        gradeEstimate: "B (82%)",
        radarData: [{ topic: "Eigenvalues", riskLevel: "low", failureProbability: 25 }],
        predictedFailures: [
          {
            topic: "Eigenvalues",
            failureProbability: 25,
            predictedLostMarks: 4,
            coreTrap: "Boundary Condition",
            neutralizerId: "boundary-condition-tricks",
          },
        ],
        timestamp: "2026-08-26T12:00:00.000Z",
      };

      savePreMortemReport(mockReport);
      const retrieved = getPreMortemReports();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].subject).toBe("Linear Algebra");

      const latest = getLatestPreMortemReport("Linear Algebra");
      expect(latest?.id).toBe("test-report-1");

      clearPreMortemReports();
      expect(getPreMortemReports()).toEqual([]);
    });
  });
});
