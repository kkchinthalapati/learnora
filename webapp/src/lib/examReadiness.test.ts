import { describe, expect, it } from "vitest";
import type {
  Exam,
  Folder,
  Material,
  Flashcard,
  QuizAttempt,
  StudySession,
} from "../api/types";
import {
  computeExamReadiness,
  generatePrepRoadmap,
  getDaysRemaining,
  getTargetStudyMinutes,
  calculateCramRisk,
  calculateExamReadiness,
  generateExamStudyMilestones,
  recommendRevisionSchedule,
} from "./examReadiness";

describe("examReadiness", () => {
  const baseExam: Exam = {
    id: 1,
    user_id: "user-123",
    exam_name: "Biochemistry Midterm",
    exam_date: "2026-09-10",
    difficulty: "Medium",
    status: "Scheduled",
  };

  const folder: Folder = {
    id: "f-1",
    user_id: "user-123",
    name: "Biochemistry",
    color: "#6366f1",
    created_at: "2026-08-01T00:00:00Z",
  };

  function session(overrides: Partial<StudySession> = {}): StudySession {
    return {
      id: "s-1",
      user_id: "user-123",
      task: "Biochemistry Midterm",
      folder_id: null,
      minutes: 60,
      timer_type: "pomodoro",
      started_at: "2026-08-15T10:00:00Z",
      created_at: "2026-08-15T10:00:00Z",
      ...overrides,
    };
  }

  describe("getDaysRemaining", () => {
    it("computes accurate day difference to exam date", () => {
      const now = new Date("2026-09-01T12:00:00");
      const days = getDaysRemaining("2026-09-10", now);
      expect(days).toBe(9);
    });

    it("returns 0 for same day or past dates", () => {
      const now = new Date("2026-09-10T15:00:00");
      expect(getDaysRemaining("2026-09-10", now)).toBe(0);
      expect(getDaysRemaining("2026-09-05", now)).toBe(0);
    });
  });

  describe("getTargetStudyMinutes", () => {
    it("returns difficulty-specific target durations", () => {
      expect(getTargetStudyMinutes("Easy")).toBe(600); // 10h
      expect(getTargetStudyMinutes("Medium")).toBe(1200); // 20h
      expect(getTargetStudyMinutes("Hard")).toBe(2100); // 35h
      expect(getTargetStudyMinutes(null)).toBe(1200);
    });
  });

  describe("computeExamReadiness", () => {
    it("calculates the Needs work tier when no materials, reviews, or study sessions exist", () => {
      const now = new Date("2026-09-01T00:00:00");
      const readiness = computeExamReadiness(
        baseExam,
        folder,
        [],
        [],
        [],
        [],
        now,
      );

      expect(readiness.score).toBe(0);
      expect(readiness.tier).toBe("Needs work");
      expect(readiness.breakdown.coverage).toBe(0);
      expect(readiness.breakdown.mastery).toBe(0);
      expect(readiness.breakdown.studyTime).toBe(0);
      expect(readiness.daysRemaining).toBe(9);
      expect(readiness.targetHoursRemaining).toBe(20);
    });

    it("computes In Progress tier with partial study investment and materials", () => {
      const materials: Material[] = [
        {
          id: "m-1",
          user_id: "user-123",
          folder_id: "f-1",
          title: "Lecture 1 Notes",
          type: "pdf",
          raw_content:
            "Comprehensive outline of enzyme kinetics and thermodynamics.",
          storage_path: null,
          created_at: "2026-08-10T00:00:00Z",
        },
        {
          id: "m-2",
          user_id: "user-123",
          folder_id: "f-1",
          title: "Lecture 2 Notes",
          type: "pdf",
          raw_content: "Protein folding and alpha helices structure notes.",
          storage_path: null,
          created_at: "2026-08-12T00:00:00Z",
        },
      ];

      const flashcards: Flashcard[] = [
        {
          id: "c-1",
          user_id: "user-123",
          deck_id: "d-1",
          front: "Enzyme Active Site",
          back: "Catalytic region where substrate binds.",
          next_review_date: "2026-09-15T00:00:00Z",
          srs_interval: 4,
          ease_factor: 2.5,
          created_at: "2026-08-15T00:00:00Z",
        },
      ];

      const sessions: StudySession[] = [
        {
          id: "s-1",
          user_id: "user-123",
          folder_id: "f-1",
          task: "Enzymes",
          minutes: 480, // 8 hours
          timer_type: "pomodoro",
          started_at: "2026-08-20T00:00:00Z",
          created_at: "2026-08-20T00:00:00Z",
        },
      ];

      const now = new Date("2026-09-01T00:00:00");
      const readiness = computeExamReadiness(
        baseExam,
        folder,
        materials,
        flashcards,
        [],
        sessions,
        now,
      );

      expect(readiness.breakdown.coverage).toBeGreaterThan(50);
      expect(readiness.breakdown.mastery).toBe(100);
      expect(readiness.breakdown.studyTime).toBe(40); // 480 / 1200 = 40%
      expect(readiness.tier).toBe("Getting there");
      expect(readiness.targetHoursRemaining).toBe(12);
    });

    it("does not treat a brand-new card's default ease factor as mastery", () => {
      const newCard: Flashcard = {
        id: "new-card",
        user_id: "user-123",
        deck_id: "d-1",
        front: "Unreviewed question",
        back: "Unreviewed answer",
        next_review_date: null,
        srs_interval: 0,
        ease_factor: 2.5,
        created_at: "2026-09-01T00:00:00Z",
      };

      const readiness = computeExamReadiness(
        baseExam,
        folder,
        [],
        [newCard],
        [],
        [],
        new Date("2026-09-01T00:00:00"),
      );

      expect(readiness.breakdown.mastery).toBe(0);
    });

    it("identifies weak topics from quiz attempts and calculates the Exam ready tier", () => {
      const materials: Material[] = [
        {
          id: "m-1",
          user_id: "user-123",
          folder_id: "f-1",
          title: "Lecture 1",
          type: "text",
          raw_content: "Detailed text content for full syllabus and notes.",
          storage_path: null,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "m-2",
          user_id: "user-123",
          folder_id: "f-1",
          title: "Lecture 2",
          type: "text",
          raw_content: "Detailed text content for full syllabus and notes.",
          storage_path: null,
          created_at: "2026-08-02T00:00:00Z",
        },
        {
          id: "m-3",
          user_id: "user-123",
          folder_id: "f-1",
          title: "Lecture 3",
          type: "text",
          raw_content: "Detailed text content for full syllabus and notes.",
          storage_path: null,
          created_at: "2026-08-03T00:00:00Z",
        },
      ];

      const flashcards: Flashcard[] = [
        {
          id: "c-1",
          user_id: "user-123",
          deck_id: "d-1",
          front: "Michaelis Menten equation",
          back: "V = Vmax[S] / (Km + [S])",
          next_review_date: "2026-09-12T00:00:00Z",
          srs_interval: 5,
          ease_factor: 2.6,
          created_at: "2026-08-05T00:00:00Z",
        },
      ];

      const quizAttempts: QuizAttempt[] = [
        {
          id: "qa-1",
          user_id: "user-123",
          quiz_id: "q-1",
          score: 9,
          total: 10,
          answers_json: {},
          weak_topics: ["Lineweaver-Burk Plot", "Allosteric Regulation"],
          created_at: "2026-08-22T00:00:00Z",
        },
        {
          id: "qa-2",
          user_id: "user-123",
          quiz_id: "q-2",
          score: 10,
          total: 10,
          answers_json: {},
          weak_topics: ["Lineweaver-Burk Plot"],
          created_at: "2026-08-25T00:00:00Z",
        },
      ];

      const sessions: StudySession[] = [
        {
          id: "s-1",
          user_id: "user-123",
          folder_id: "f-1",
          task: "Mock exam prep",
          minutes: 1200, // 20 hours -> 100% of target
          timer_type: "pomodoro",
          started_at: "2026-08-20T00:00:00Z",
          created_at: "2026-08-20T00:00:00Z",
        },
      ];

      const now = new Date("2026-09-01T00:00:00");
      const readiness = computeExamReadiness(
        baseExam,
        folder,
        materials,
        flashcards,
        quizAttempts,
        sessions,
        now,
      );

      expect(readiness.score).toBeGreaterThanOrEqual(75);
      expect(readiness.tier).toBe("Exam ready");
      expect(readiness.weakTopics).toEqual([
        "Lineweaver-Burk Plot",
        "Allosteric Regulation",
      ]);
      expect(readiness.targetHoursRemaining).toBe(0);
    });
  });

  describe("generatePrepRoadmap", () => {
    it("generates 4 distinct milestone phases with tasks and due dates", () => {
      const now = new Date("2026-08-25T00:00:00");
      const exam: Exam = {
        ...baseExam,
        exam_date: "2026-09-10", // 16 days remaining
      };

      const readiness = computeExamReadiness(exam, folder, [], [], [], [], now);
      const phases = generatePrepRoadmap(exam, readiness, now);

      expect(phases).toHaveLength(4);
      expect(phases[0].title).toContain(
        "Phase 1: Get your material together",
      );
      expect(phases[1].title).toContain(
        "Phase 2: Test yourself, little and often",
      );
      expect(phases[2].title).toContain(
        "Phase 3: Mocks and weak spots",
      );
      expect(phases[3].title).toContain("Phase 4: Last look, then rest");

      phases.forEach((p) => {
        expect(p.tasks.length).toBeGreaterThan(0);
        p.tasks.forEach((task) => {
          expect(task.title).toBeTruthy();
          expect(task.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(task.category).toBeTruthy();
        });
      });
    });

    it("customizes Phase 3 tasks with identified weak topics", () => {
      const now = new Date("2026-08-25T00:00:00");
      const readiness = computeExamReadiness(
        baseExam,
        folder,
        [],
        [],
        [
          {
            id: "qa-1",
            user_id: "user-1",
            quiz_id: "q-1",
            score: 5,
            total: 10,
            answers_json: {},
            weak_topics: ["Krebs Cycle", "Electron Transport Chain"],
            created_at: "2026-08-20T00:00:00Z",
          },
        ],
        [],
        now,
      );

      const phases = generatePrepRoadmap(baseExam, readiness, now);
      const phase3 = phases.find((p) => p.phaseNumber === 3)!;
      const weakTask = phase3.tasks.find((t) => t.id.includes("p3-1"))!;

      expect(weakTask.description).toContain("Krebs Cycle");
      expect(weakTask.description).toContain("Electron Transport Chain");
    });

    it("keeps phases sequential when later mastery is high but coverage is incomplete", () => {
      const now = new Date("2026-09-01T00:00:00");
      const readiness = {
        score: 65,
        tier: "Getting there" as const,
        breakdown: { coverage: 40, mastery: 90, studyTime: 60 },
        weakTopics: [],
        daysRemaining: 9,
        targetHoursRemaining: 8,
        totalStudyMinutes: 720,
        targetStudyMinutes: 1200,
      };

      const phases = generatePrepRoadmap(baseExam, readiness, now);

      expect(phases.map((phase) => phase.status)).toEqual([
        "current",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
    });
  });

  describe("calculateExamReadiness (backward-compat)", () => {
    it("evaluates high readiness when target study hours and quiz mastery are met", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const e: Exam = { ...baseExam, exam_date: "2026-08-30" };
      const sessions = Array.from({ length: 15 }, (_, i) =>
        session({ id: `s-${i}`, minutes: 120 }),
      );
      const attempts: QuizAttempt[] = [
        {
          id: "a1",
          user_id: "u1",
          quiz_id: "q1",
          score: 9,
          total: 10,
          answers_json: null,
          weak_topics: null,
          created_at: "2026-08-18",
        },
      ];

      const readiness = calculateExamReadiness(e, {
        sessions,
        quizAttempts: attempts,
        now,
      });

      expect(readiness.overallReadiness).toBeGreaterThanOrEqual(80);
      expect(readiness.level).toBe("ready");
      expect(readiness.passProbability).toBeGreaterThanOrEqual(80);
      expect(readiness.daysRemaining).toBeGreaterThanOrEqual(9);
    });
  });

  describe("generateExamStudyMilestones (backward-compat)", () => {
    it("creates 4 sequential revision milestones", () => {
      const now = new Date("2026-08-20T00:00:00");
      const e: Exam = { ...baseExam, exam_date: "2026-08-30" };
      const milestones = generateExamStudyMilestones(e, 20, now, now);

      expect(milestones).toHaveLength(4);
      expect(milestones[0].title).toContain("Phase 1");
      expect(milestones[3].title).toContain("Phase 4");
    });
  });

  describe("calculateCramRisk (backward-compat)", () => {
    it("flags high cramming risk when 80% of study occurs in last 48h before an exam in 2 days", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const e: Exam = { ...baseExam, exam_date: "2026-08-22" };
      const sessions = [
        session({ started_at: "2026-08-19T10:00:00Z", minutes: 180 }),
        session({ started_at: "2026-08-20T09:00:00Z", minutes: 180 }),
      ];

      const risk = calculateCramRisk(e, sessions, now);
      expect(risk.isCramming).toBe(true);
      expect(["medium", "high"]).toContain(risk.severity);
    });
  });

  describe("recommendRevisionSchedule (backward-compat)", () => {
    it("generates day by day schedule with practice tests near the end", () => {
      const now = new Date("2026-08-20T00:00:00");
      const e: Exam = { ...baseExam, exam_date: "2026-08-26" };
      const plan = recommendRevisionSchedule(
        e,
        ["Limits", "Derivatives", "Integrals"],
        6,
        now,
      );

      expect(plan).toHaveLength(6);
      expect(plan[0].date).toBe("2026-08-20");
      expect(plan[4].focusMode).toBe("practice_test");
      expect(plan[5].focusMode).toBe("light_recall");
    });
  });
});
