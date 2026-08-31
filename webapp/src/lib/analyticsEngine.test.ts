import { describe, expect, it } from "vitest";
import {
  generateActivityHeatmap,
  computeHourlyDistribution,
  detectPeakFocusWindow,
  computeSubjectUrgencyMatrix,
  generateStudyInsights,
  formatHour,
  computeUnifiedExamReadiness,
} from "./analyticsEngine";
import type {
  StudySession,
  QuizAttempt,
  Folder,
  Exam,
  Flashcard,
  Material,
} from "../api/types";

describe("analyticsEngine", () => {
  const fakeSession = (
    overrides: Partial<StudySession> = {},
  ): StudySession => ({
    id: "sess-1",
    user_id: "user-1",
    task: "Study chapter 1",
    folder_id: "folder-1",
    minutes: 45,
    timer_type: "pomodoro",
    started_at: "2026-08-20T10:00:00.000Z",
    created_at: "2026-08-20T10:45:00.000Z",
    ...overrides,
  });

  const fakeAttempt = (overrides: Partial<QuizAttempt> = {}): QuizAttempt => ({
    id: "att-1",
    user_id: "user-1",
    quiz_id: "quiz-1",
    score: 9,
    total: 10,
    answers_json: {},
    weak_topics: [],
    created_at: "2026-08-20T10:30:00.000Z",
    ...overrides,
  });

  describe("generateActivityHeatmap", () => {
    it("generates grid cells spanning specified days with level mappings", () => {
      const now = new Date("2026-08-23T12:00:00");
      const sessions: StudySession[] = [
        fakeSession({ started_at: "2026-08-23T10:00:00.000Z", minutes: 130 }), // level 4
        fakeSession({ started_at: "2026-08-22T10:00:00.000Z", minutes: 75 }), // level 3
        fakeSession({ started_at: "2026-08-21T10:00:00.000Z", minutes: 35 }), // level 2
        fakeSession({ started_at: "2026-08-20T10:00:00.000Z", minutes: 15 }), // level 1
      ];

      const data = generateActivityHeatmap(sessions, 30, now);

      expect(data.cells.length).toBeGreaterThanOrEqual(30);
      expect(data.totalMinutes).toBe(130 + 75 + 35 + 15);
      expect(data.activeDays).toBe(4);
      expect(data.currentStreak).toBe(4);
      expect(data.longestStreak).toBe(4);
      expect(data.monthLabels.length).toBeGreaterThan(0);

      const cellAug23 = data.cells.find((c) => c.dateStr === "2026-08-23");
      expect(cellAug23).toBeDefined();
      expect(cellAug23?.level).toBe(4);
      expect(cellAug23?.minutes).toBe(130);
    });

    it("handles streak calculation when today has no activity but yesterday does", () => {
      const now = new Date("2026-08-23T12:00:00");
      const sessions: StudySession[] = [
        fakeSession({ started_at: "2026-08-22T10:00:00.000Z", minutes: 60 }),
        fakeSession({ started_at: "2026-08-21T10:00:00.000Z", minutes: 60 }),
      ];

      const data = generateActivityHeatmap(sessions, 30, now);
      expect(data.currentStreak).toBe(2);
      expect(data.longestStreak).toBe(2);
    });

    it("resets current streak to 0 when inactive for multiple days", () => {
      const now = new Date("2026-08-23T12:00:00");
      const sessions: StudySession[] = [
        fakeSession({ started_at: "2026-08-15T10:00:00.000Z", minutes: 60 }),
      ];

      const data = generateActivityHeatmap(sessions, 30, now);
      expect(data.currentStreak).toBe(0);
      expect(data.longestStreak).toBe(1);
    });
  });

  describe("computeHourlyDistribution", () => {
    it("aggregates minutes, counts, and quiz scores across 24 hours", () => {
      const d10 = new Date();
      d10.setHours(10, 0, 0, 0);

      const d14 = new Date();
      d14.setHours(14, 0, 0, 0);

      const sessions: StudySession[] = [
        fakeSession({ started_at: d10.toISOString(), minutes: 50 }),
        fakeSession({ started_at: d10.toISOString(), minutes: 40 }),
        fakeSession({ started_at: d14.toISOString(), minutes: 60 }),
      ];
      const attempts: QuizAttempt[] = [
        fakeAttempt({ created_at: d10.toISOString(), score: 8, total: 10 }),
        fakeAttempt({ created_at: d10.toISOString(), score: 10, total: 10 }),
      ];

      const stats = computeHourlyDistribution(sessions, attempts);
      expect(stats.length).toBe(24);

      const hour10 = stats[10];
      expect(hour10.totalMinutes).toBe(90);
      expect(hour10.sessionCount).toBe(2);
      expect(hour10.avgQuizScore).toBe(90); // (80 + 100) / 2
      expect(hour10.quizAttemptCount).toBe(2);
    });
  });

  describe("detectPeakFocusWindow", () => {
    it("identifies the 3-hour sliding window with highest study density", () => {
      const stats = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        totalMinutes: 0,
        sessionCount: 0,
        avgQuizScore: null,
        quizAttemptCount: 0,
      }));

      // Peak around 10, 11, 12
      stats[10].totalMinutes = 120;
      stats[10].sessionCount = 2;
      stats[11].totalMinutes = 180;
      stats[11].sessionCount = 3;
      stats[12].totalMinutes = 90;
      stats[12].sessionCount = 2;

      const peak = detectPeakFocusWindow(stats);
      expect(peak.startHour).toBe(10);
      expect(peak.endHour).toBe(13);
      expect(peak.label).toContain("Mid-Day Peak");
      expect(peak.description).toBeDefined();
    });

    it("returns default fallback when no stats exist", () => {
      const stats = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        totalMinutes: 0,
        sessionCount: 0,
        avgQuizScore: null,
        quizAttemptCount: 0,
      }));

      const peak = detectPeakFocusWindow(stats);
      expect(peak.startHour).toBe(9);
      expect(peak.endHour).toBe(12);
      expect(peak.label).toBe("Morning Deep Work");
    });
  });

  describe("computeSubjectUrgencyMatrix", () => {
    const folders: Folder[] = [
      {
        id: "f-1",
        user_id: "user-1",
        name: "Calculus",
        color: "#3b82f6",
        created_at: "2026-08-01",
      },
      {
        id: "f-2",
        user_id: "user-1",
        name: "Physics",
        color: "#10b981",
        created_at: "2026-08-01",
      },
      {
        id: "f-3",
        user_id: "user-1",
        name: "History",
        color: "#f59e0b",
        created_at: "2026-08-01",
      },
    ];

    const exams: Exam[] = [
      {
        id: 1,
        user_id: "user-1",
        exam_name: "Calculus Final",
        exam_date: "2026-08-26",
        difficulty: "hard",
        status: "upcoming",
      },
      {
        id: 2,
        user_id: "user-1",
        exam_name: "Physics Midterm",
        exam_date: "2026-09-15",
        difficulty: "medium",
        status: "upcoming",
      },
    ];

    it("marks subjects as Exam soon when exam is near and minutes studied are low", () => {
      const sessions: StudySession[] = [
        fakeSession({ folder_id: "f-1", minutes: 30 }), // Calculus: exam in 3 days, low minutes
        fakeSession({ folder_id: "f-2", minutes: 300 }), // Physics: exam in 20 days, high minutes
        fakeSession({ folder_id: "f-3", minutes: 10 }), // History: no exam, under-invested
      ];

      const testNow = new Date("2026-08-23T12:00:00");
      const matrix = computeSubjectUrgencyMatrix(sessions, folders, exams, testNow);
      expect(matrix.length).toBe(3);

      const calcRow = matrix.find((r) => r.folderId === "f-1");
      expect(calcRow?.status).toBe("Exam soon");
      expect(calcRow?.examName).toBe("Calculus Final");

      const physicsRow = matrix.find((r) => r.folderId === "f-2");
      expect(physicsRow?.status).toBe("Balanced");

      const historyRow = matrix.find((r) => r.folderId === "f-3");
      expect(historyRow?.status).toBe("Needs more time");
    });
  });

  describe("generateStudyInsights", () => {
    it("synthesizes multi-faceted actionable study insights", () => {
      const sessions = [fakeSession({ minutes: 60 })];
      const attempts = [fakeAttempt({ score: 9, total: 10 })];
      const heatData = generateActivityHeatmap(sessions, 30);
      const hourly = computeHourlyDistribution(sessions, attempts);

      const insights = generateStudyInsights(
        sessions,
        attempts,
        heatData,
        hourly,
      );
      expect(insights.length).toBeGreaterThanOrEqual(4);
      expect(insights.some((i) => i.includes("When you focus best"))).toBe(true);
      expect(insights.some((i) => i.includes("Time studied"))).toBe(true);
      expect(insights.some((i) => i.includes("Quizzes"))).toBe(true);
    });
  });

  describe("formatHour", () => {
    it("formats 24-hour values to 12-hour AM/PM string", () => {
      expect(formatHour(0)).toBe("12 AM");
      expect(formatHour(9)).toBe("9 AM");
      expect(formatHour(12)).toBe("12 PM");
      expect(formatHour(15)).toBe("3 PM");
      expect(formatHour(23)).toBe("11 PM");
    });
  });

  describe("computeUnifiedExamReadiness", () => {
    it("computes a full 100 readiness when no content or exams exist", () => {
      const result = computeUnifiedExamReadiness({});
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.tier).toBe("Exam ready");
      expect(result.summary).toBeDefined();
    });

    it("calculates multi-factor readiness score from syllabus, flashcards, and quizzes", () => {
      const now = new Date("2026-08-26T12:00:00");
      const materials: Material[] = [
        {
          id: "m1",
          user_id: "user-1",
          folder_id: "f1",
          title: "Syllabus Notes",
          type: "text",
          raw_content: "Comprehensive course syllabus and deep lecture breakdown notes.",
          storage_path: null,
          created_at: now.toISOString(),
        },
        {
          id: "m2",
          user_id: "user-1",
          folder_id: "f1",
          title: "Chapter 2",
          type: "text",
          raw_content: "Detailed chapter 2 summary with formulas and reaction pathways.",
          storage_path: null,
          created_at: now.toISOString(),
        },
      ];

      const flashcards: Flashcard[] = [
        {
          id: "c1",
          user_id: "user-1",
          deck_id: "d1",
          front: "Q1",
          back: "A1",
          srs_interval: 10,
          ease_factor: 2.5,
          next_review_date: new Date(now.getTime() + 5 * 86400000).toISOString(),
          created_at: now.toISOString(),
        },
        {
          id: "c2",
          user_id: "user-1",
          deck_id: "d1",
          front: "Q2",
          back: "A2",
          srs_interval: 7,
          ease_factor: 2.4,
          next_review_date: new Date(now.getTime() + 3 * 86400000).toISOString(),
          created_at: now.toISOString(),
        },
      ];

      const quizAttempts: QuizAttempt[] = [
        fakeAttempt({ score: 9, total: 10 }),
        fakeAttempt({ score: 10, total: 10 }),
      ];

      const result = computeUnifiedExamReadiness({
        materials,
        flashcards,
        quizAttempts,
        now,
      });

      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.tier).toBe("Exam ready");
      expect(result.syllabusCoverage).toBeGreaterThanOrEqual(50);
      expect(result.flashcardStability).toBeGreaterThanOrEqual(70);
      expect(result.quizMastery).toBe(95);
      expect(result.summary).toContain("Really strong prep");
    });

    it("flags the Needs work tier when quiz accuracy and card maturity are low", () => {
      const now = new Date("2026-08-26T12:00:00");
      const flashcards: Flashcard[] = [
        {
          id: "c1",
          user_id: "user-1",
          deck_id: "d1",
          front: "Q1",
          back: "A1",
          srs_interval: 0,
          ease_factor: 1.3,
          next_review_date: new Date(now.getTime() - 10 * 86400000).toISOString(),
          created_at: now.toISOString(),
        },
      ];

      const quizAttempts: QuizAttempt[] = [
        fakeAttempt({ score: 2, total: 10 }),
      ];

      const exams: Exam[] = [
        {
          id: 1,
          user_id: "user-1",
          exam_name: "Bio Midterm",
          exam_date: "2026-08-28",
          difficulty: "hard",
          status: "upcoming",
        },
      ];

      const result = computeUnifiedExamReadiness({
        materials: [],
        flashcards,
        quizAttempts,
        exams,
        now,
      });

      expect(result.score).toBeLessThan(50);
      expect(result.tier).toBe("Needs work");
      expect(result.summary).toContain("ground to make up");
    });
  });
});
