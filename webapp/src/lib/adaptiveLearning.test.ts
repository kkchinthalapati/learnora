import { describe, expect, it } from "vitest";
import type { Exam, Flashcard, FlashcardDeck, Folder, QuizAttempt, StudySession } from "../api/types";
import {
  calculateRetentionRisk,
  calculateSubjectBalance,
  computeAdaptiveHealth,
  computeOverallRetention,
  computeRetentionProbability,
  computeSubjectMastery,
  extractTopWeakTopics,
  getAdaptiveRecommendations,
  getCardsAtForgettingRisk,
  getPreExamSurgeQueue,
  predictOptimalStudyTime,
} from "./adaptiveLearning";

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "s-1",
    user_id: "user-1",
    task: null,
    folder_id: null,
    minutes: 30,
    timer_type: "pomodoro",
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function flashcard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "fc-1",
    user_id: "user-1",
    deck_id: "d-1",
    front: "Front",
    back: "Back",
    next_review_date: "2026-08-01",
    srs_interval: 1,
    ease_factor: 2.5,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 1,
    user_id: "user-1",
    exam_name: "Midterm Physics",
    exam_date: "2026-08-25",
    difficulty: "Hard",
    status: "Scheduled",
    ...overrides,
  };
}

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "f-1",
    user_id: "user-1",
    name: "Physics",
    color: "#6366F1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("adaptiveLearning Engine", () => {
  const baseDate = new Date("2026-08-20T12:00:00Z");

  describe("computeRetentionProbability", () => {
    it("returns 1.0 for a card reviewed right now", () => {
      const card: Flashcard = {
        id: "c1",
        user_id: "u1",
        deck_id: "d1",
        front: "Front",
        back: "Back",
        srs_interval: 5,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-25T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const retention = computeRetentionProbability(card, baseDate);
      expect(retention).toBeCloseTo(1.0, 4);
    });

    it("decays over elapsed time according to exponential formula", () => {
      const card: Flashcard = {
        id: "c2",
        user_id: "u1",
        deck_id: "d1",
        front: "Front",
        back: "Back",
        srs_interval: 10,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-20T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const retention = computeRetentionProbability(card, baseDate);
      expect(retention).toBeCloseTo(Math.exp(-1), 3);
    });

    it("higher ease factor yields higher stability and slower decay", () => {
      const cardNormalEase: Flashcard = {
        id: "c3",
        user_id: "u1",
        deck_id: "d1",
        front: "Front",
        back: "Back",
        srs_interval: 6,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-23T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const cardHighEase: Flashcard = {
        ...cardNormalEase,
        id: "c4",
        ease_factor: 3.2,
      };

      const retNormal = computeRetentionProbability(cardNormalEase, baseDate);
      const retHigh = computeRetentionProbability(cardHighEase, baseDate);
      expect(retHigh).toBeGreaterThan(retNormal);
    });

    it("handles unreviewed cards using creation date", () => {
      const freshCard: Flashcard = {
        id: "c5",
        user_id: "u1",
        deck_id: "d1",
        front: "Front",
        back: "Back",
        srs_interval: 0,
        ease_factor: 2.5,
        next_review_date: null,
        created_at: baseDate.toISOString(),
      };

      const oldCard: Flashcard = {
        ...freshCard,
        id: "c6",
        created_at: new Date("2026-08-10T12:00:00Z").toISOString(),
      };

      expect(computeRetentionProbability(freshCard, baseDate)).toBeCloseTo(1.0, 4);
      expect(computeRetentionProbability(oldCard, baseDate)).toBeLessThan(0.1);
    });
  });

  describe("getCardsAtForgettingRisk", () => {
    it("filters and sorts cards below the retention threshold", () => {
      const safeCard: Flashcard = {
        id: "safe",
        user_id: "u1",
        deck_id: "d1",
        front: "Safe",
        back: "Safe",
        srs_interval: 20,
        ease_factor: 2.5,
        next_review_date: new Date("2026-09-08T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const moderateRiskCard: Flashcard = {
        id: "moderate",
        user_id: "u1",
        deck_id: "d1",
        front: "Moderate",
        back: "Moderate",
        srs_interval: 5,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-22T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const severeRiskCard: Flashcard = {
        id: "severe",
        user_id: "u1",
        deck_id: "d1",
        front: "Severe",
        back: "Severe",
        srs_interval: 2,
        ease_factor: 2.0,
        next_review_date: new Date("2026-08-18T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const atRisk = getCardsAtForgettingRisk(
        [safeCard, moderateRiskCard, severeRiskCard],
        0.75,
        baseDate,
      );

      expect(atRisk.map((c) => c.id)).toEqual(["severe", "moderate"]);
    });
  });

  describe("computeOverallRetention", () => {
    it("returns 100 for empty cards list", () => {
      expect(computeOverallRetention([])).toBe(100);
    });

    it("returns average retention percentage", () => {
      const card1: Flashcard = {
        id: "c1",
        user_id: "u1",
        deck_id: "d1",
        front: "F1",
        back: "B1",
        srs_interval: 10,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-30T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };
      const card2: Flashcard = {
        id: "c2",
        user_id: "u1",
        deck_id: "d1",
        front: "F2",
        back: "B2",
        srs_interval: 10,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-20T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const overall = computeOverallRetention([card1, card2], baseDate);
      expect(overall).toBe(Math.round(((1.0 + Math.exp(-1)) / 2) * 100));
    });
  });

  describe("computeSubjectMastery", () => {
    it("computes mastery, tiers, and aggregates weak topics correctly", () => {
      const cards: Flashcard[] = [
        {
          id: "c1",
          user_id: "u1",
          deck_id: "d1",
          front: "F1",
          back: "B1",
          srs_interval: 20,
          ease_factor: 2.5,
          next_review_date: new Date("2026-09-08T12:00:00Z").toISOString(),
          created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
        },
      ];

      const attempts: QuizAttempt[] = [
        {
          id: "qa1",
          user_id: "u1",
          quiz_id: "q1",
          score: 9,
          total: 10,
          answers_json: {},
          weak_topics: ["Integration", "Limits"],
          created_at: baseDate.toISOString(),
        },
        {
          id: "qa2",
          user_id: "u1",
          quiz_id: "q1",
          score: 8,
          total: 10,
          answers_json: {},
          weak_topics: ["Limits"],
          created_at: baseDate.toISOString(),
        },
      ];

      const mastery = computeSubjectMastery("f1", "Calculus", cards, attempts, baseDate);

      expect(mastery.folderId).toBe("f1");
      expect(mastery.folderName).toBe("Calculus");
      expect(mastery.cardsCount).toBe(1);
      expect(mastery.averageQuizScore).toBe(85);
      expect(mastery.tier).toBe("Mastered");
      expect(mastery.weakTopics).toEqual(["Limits", "Integration"]);
    });

    it("assigns correct tiers based on score thresholds", () => {
      const novice = computeSubjectMastery("f1", "F", [], [{
        id: "qa",
        user_id: "u",
        quiz_id: "q",
        score: 4,
        total: 10,
        answers_json: {},
        weak_topics: null,
        created_at: baseDate.toISOString(),
      }]);
      expect(novice.tier).toBe("Novice");

      const developing = computeSubjectMastery("f1", "F", [], [{
        id: "qa",
        user_id: "u",
        quiz_id: "q",
        score: 6,
        total: 10,
        answers_json: {},
        weak_topics: null,
        created_at: baseDate.toISOString(),
      }]);
      expect(developing.tier).toBe("Developing");

      const competent = computeSubjectMastery("f1", "F", [], [{
        id: "qa",
        user_id: "u",
        quiz_id: "q",
        score: 75,
        total: 100,
        answers_json: {},
        weak_topics: null,
        created_at: baseDate.toISOString(),
      }]);
      expect(competent.tier).toBe("Competent");
    });
  });

  describe("extractTopWeakTopics", () => {
    it("ranks weak topics by occurrence frequency", () => {
      const attempts: QuizAttempt[] = [
        {
          id: "1",
          user_id: "u1",
          quiz_id: "q1",
          score: 5,
          total: 10,
          answers_json: {},
          weak_topics: ["Recursion", "Trees", "Sorting"],
          created_at: baseDate.toISOString(),
        },
        {
          id: "2",
          user_id: "u1",
          quiz_id: "q1",
          score: 6,
          total: 10,
          answers_json: {},
          weak_topics: ["Trees", "Recursion", "Graphs"],
          created_at: baseDate.toISOString(),
        },
        {
          id: "3",
          user_id: "u1",
          quiz_id: "q1",
          score: 8,
          total: 10,
          answers_json: {},
          weak_topics: ["Trees"],
          created_at: baseDate.toISOString(),
        },
      ];

      const top = extractTopWeakTopics(attempts, 3);
      expect(top).toEqual([
        { topic: "Trees", count: 3 },
        { topic: "Recursion", count: 2 },
        { topic: "Sorting", count: 1 },
      ]);
    });
  });

  describe("getPreExamSurgeQueue", () => {
    it("boosts priority for cards related to upcoming exams within 14 days", () => {
      const folders: Folder[] = [
        { id: "f-bio", user_id: "u1", name: "Biology", color: "#10b981", created_at: baseDate.toISOString() },
        { id: "f-hist", user_id: "u1", name: "History", color: "#f59e0b", created_at: baseDate.toISOString() },
      ];

      const decks: FlashcardDeck[] = [
        { id: "d-bio", user_id: "u1", folder_id: "f-bio", title: "Cell Biology", created_at: baseDate.toISOString() },
        { id: "d-hist", user_id: "u1", folder_id: "f-hist", title: "World War II", created_at: baseDate.toISOString() },
      ];

      const exams: Exam[] = [
        {
          id: 1,
          user_id: "u1",
          exam_name: "Biology Midterm",
          exam_date: new Date("2026-08-25T09:00:00Z").toISOString(),
          difficulty: "Hard",
          status: "Upcoming",
        },
      ];

      const bioCard: Flashcard = {
        id: "c-bio",
        user_id: "u1",
        deck_id: "d-bio",
        front: "Mitochondria",
        back: "Powerhouse",
        srs_interval: 5,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-21T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const histCard: Flashcard = {
        id: "c-hist",
        user_id: "u1",
        deck_id: "d-hist",
        front: "1939",
        back: "WWII Start",
        srs_interval: 5,
        ease_factor: 2.5,
        next_review_date: new Date("2026-08-21T12:00:00Z").toISOString(),
        created_at: new Date("2026-08-01T12:00:00Z").toISOString(),
      };

      const surge = getPreExamSurgeQueue([histCard, bioCard], exams, folders, baseDate, decks);
      expect(surge[0].id).toBe("c-bio");
    });
  });

  describe("computeAdaptiveHealth", () => {
    it("returns baseline health score for fresh user with no data", () => {
      const health = computeAdaptiveHealth({});
      expect(health.overallScore).toBeGreaterThanOrEqual(0);
      expect(health.overallScore).toBeLessThanOrEqual(100);
      expect(["optimal", "good", "needs-attention", "at-risk"]).toContain(health.grade);
      expect(health.burnoutRisk).toBe("low");
    });

    it("evaluates optimal health for consistent learner", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const sessions = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        return session({
          id: `s-${i}`,
          started_at: d.toISOString(),
          minutes: 45,
        });
      });

      const health = computeAdaptiveHealth({
        sessions,
        flashcards: [flashcard({ next_review_date: "2026-08-25", srs_interval: 10 })],
        now,
      });

      expect(health.overallScore).toBeGreaterThanOrEqual(75);
      expect(["optimal", "good"]).toContain(health.grade);
      expect(health.consistencyScore).toBeGreaterThanOrEqual(80);
    });

    it("flags burnout risk when recent volume is excessive", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const sessions = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        return session({
          id: `s-${i}`,
          started_at: d.toISOString(),
          minutes: 400,
        });
      });

      const health = computeAdaptiveHealth({ sessions, now });
      expect(health.burnoutRisk).toBe("high");
    });

    it("penalizes pacing score when exam is in <=3 days with insufficient study", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const health = computeAdaptiveHealth({
        sessions: [],
        exams: [exam({ exam_date: "2026-08-22" })],
        now,
      });

      expect(health.pacingScore).toBeLessThanOrEqual(50);
    });
  });

  describe("calculateRetentionRisk", () => {
    it("returns healthy status on empty flashcards", () => {
      const risk = calculateRetentionRisk([]);
      expect(risk.status).toBe("healthy");
      expect(risk.retentionRate).toBe(100);
      expect(risk.overdueCount).toBe(0);
    });

    it("identifies overdue and critical cards accurately", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const cards = [
        flashcard({ id: "c1", next_review_date: "2026-08-10", ease_factor: 1.8, srs_interval: 1 }),
        flashcard({ id: "c2", next_review_date: "2026-08-15", ease_factor: 2.5, srs_interval: 4 }),
        flashcard({ id: "c3", next_review_date: "2026-08-20", ease_factor: 2.5, srs_interval: 6 }),
        flashcard({ id: "c4", next_review_date: "2026-08-25", ease_factor: 2.5, srs_interval: 10 }),
      ];

      const risk = calculateRetentionRisk(cards, now);
      expect(risk.overdueCount).toBe(2);
      expect(risk.criticalCardsCount).toBe(1);
      expect(risk.dueTodayCount).toBe(1);
      expect(risk.retentionRate).toBeLessThan(100);
    });
  });

  describe("calculateSubjectBalance", () => {
    it("returns zero percent for all folders if no sessions exist", () => {
      const f1 = folder({ id: "f1", name: "Math" });
      const f2 = folder({ id: "f2", name: "Science" });
      const balance = calculateSubjectBalance([], [f1, f2]);

      expect(balance).toHaveLength(2);
      expect(balance[0].percentage).toBe(0);
      expect(balance[1].percentage).toBe(0);
    });

    it("correctly identifies dominant and understudied subjects", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const f1 = folder({ id: "f1", name: "Math" });
      const f2 = folder({ id: "f2", name: "Science" });
      const f3 = folder({ id: "f3", name: "History" });

      const sessions = [
        session({ folder_id: "f1", minutes: 300, started_at: now.toISOString() }),
        session({ folder_id: "f2", minutes: 20, started_at: now.toISOString() }),
        session({ folder_id: "f3", minutes: 100, started_at: now.toISOString() }),
      ];

      const balance = calculateSubjectBalance(sessions, [f1, f2, f3], 14, now);
      const math = balance.find((b) => b.folderId === "f1");
      const science = balance.find((b) => b.folderId === "f2");

      expect(math?.status).toBe("dominant");
      expect(science?.status).toBe("understudied");
    });
  });

  describe("predictOptimalStudyTime", () => {
    it("provides reasonable default with empty sessions", () => {
      const opt = predictOptimalStudyTime([]);
      expect(opt.confidence).toBe("low");
      expect(opt.peakFocusWindow).toBeDefined();
    });

    it("detects peak study hours from afternoon sessions", () => {
      const sessions = Array.from({ length: 12 }, (_, i) => {
        const d = new Date("2026-08-10T14:15:00");
        d.setDate(d.getDate() + i);
        return session({
          id: `s-${i}`,
          started_at: d.toISOString(),
          minutes: 45,
        });
      });

      const opt = predictOptimalStudyTime(sessions);
      expect(opt.confidence).toBe("high");
      expect(opt.preferredHour).toBe(14);
      expect(opt.peakFocusWindow).toContain("2:00 PM");
    });
  });

  describe("getAdaptiveRecommendations", () => {
    it("recommends flashcard review when cards are overdue", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const recs = getAdaptiveRecommendations({
        flashcards: [flashcard({ next_review_date: "2026-08-01" })],
        now,
      });

      expect(recs.some((r) => r.category === "spaced_repetition")).toBe(true);
    });

    it("recommends exam prep for exams in <= 10 days", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      const recs = getAdaptiveRecommendations({
        exams: [exam({ exam_date: "2026-08-24" })],
        now,
      });

      expect(recs.some((r) => r.category === "exam_prep")).toBe(true);
    });

    it("recommends focus sprints for pending tasks", () => {
      const recs = getAdaptiveRecommendations({
        tasks: [{ id: 1, user_id: "u1", text: "Read Chapter 4", is_done: false, due_date: null }],
      });

      expect(recs.some((r) => r.category === "focus_sprint")).toBe(true);
    });
  });
});
