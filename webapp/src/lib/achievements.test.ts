import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateAchievements,
  evaluateDailyGoalProgress,
  loadStudyGoals,
  saveStudyGoals,
  computeDaysGoalMetInWeek,
  getUnlockedAchievements,
  getLockedAchievements,
  getNextMilestones,
  ACHIEVEMENT_BADGES,
  DEFAULT_STUDY_GOALS,
} from "./achievements";

describe("achievements", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("evaluateAchievements", () => {
    it("evaluates all badges for zero statistics", () => {
      const results = evaluateAchievements({});
      expect(results.length).toBe(ACHIEVEMENT_BADGES.length);
      results.forEach((r) => {
        expect(r.unlocked).toBe(false);
        expect(r.currentProgress).toBe(0);
        expect(r.progressPercent).toBe(0);
        expect(r.unlockedAt).toBeNull();
      });
    });

    it("evaluates streak achievements accurately", () => {
      const results = evaluateAchievements({ streak: 7 });
      const firstSpark = results.find((r) => r.id === "first-spark");
      const steadyFlame = results.find((r) => r.id === "steady-flame");
      const weekWarrior = results.find((r) => r.id === "week-warrior");
      const unstoppable = results.find((r) => r.id === "unstoppable");

      expect(firstSpark?.unlocked).toBe(true);
      expect(firstSpark?.progressPercent).toBe(100);

      expect(steadyFlame?.unlocked).toBe(true);
      expect(steadyFlame?.progressPercent).toBe(100);

      expect(weekWarrior?.unlocked).toBe(true);
      expect(weekWarrior?.progressPercent).toBe(100);

      expect(unstoppable?.unlocked).toBe(false);
      expect(unstoppable?.currentProgress).toBe(7);
      expect(unstoppable?.progressPercent).toBe(Math.round((7 / 30) * 100));
    });

    it("evaluates focus minutes achievements", () => {
      const results = evaluateAchievements({ totalFocusMinutes: 120 });
      const initiate = results.find((r) => r.id === "focus-initiate");
      const deepDiver = results.find((r) => r.id === "deep-diver");
      const centuryClub = results.find((r) => r.id === "century-club");
      const titan = results.find((r) => r.id === "focus-titan");

      expect(initiate?.unlocked).toBe(true);
      expect(deepDiver?.unlocked).toBe(true);
      expect(centuryClub?.unlocked).toBe(true);
      expect(titan?.unlocked).toBe(false);
      expect(titan?.currentProgress).toBe(120);
    });

    it("evaluates flashcards review badges", () => {
      const results = evaluateAchievements({ cardsReviewed: 250 });
      const rookie = results.find((r) => r.id === "recall-rookie");
      const master = results.find((r) => r.id === "memory-master");
      const grandmaster = results.find((r) => r.id === "grandmaster");

      expect(rookie?.unlocked).toBe(true);
      expect(master?.unlocked).toBe(true);
      expect(grandmaster?.unlocked).toBe(false);
      expect(grandmaster?.currentProgress).toBe(250);
      expect(grandmaster?.progressPercent).toBe(50);
    });

    it("evaluates quiz and exam achievements", () => {
      const results = evaluateAchievements({
        quizAttempts: [
          { score: 5, total: 5, created_at: "2026-08-20T00:00:00.000Z" },
          { score: 8, total: 10, created_at: "2026-08-21T00:00:00.000Z" },
        ],
        examReadinessScore: 85,
        fastQuizCompleted: true,
      });

      const quizAce = results.find((r) => r.id === "quiz-ace");
      const speedDemon = results.find((r) => r.id === "speed-demon");
      const examReady = results.find((r) => r.id === "exam-ready");

      expect(quizAce?.unlocked).toBe(true);
      expect(speedDemon?.unlocked).toBe(true);
      expect(examReady?.unlocked).toBe(true);
    });

    it("preserves existing unlocked timestamps from storage/input", () => {
      const existingTimestamps = {
        "first-spark": "2026-08-01T12:00:00.000Z",
      };
      const results = evaluateAchievements({
        streak: 3,
        unlockedTimestamps: existingTimestamps,
      });

      const firstSpark = results.find((r) => r.id === "first-spark");
      expect(firstSpark?.unlockedAt).toBe("2026-08-01T12:00:00.000Z");
    });
  });

  describe("getUnlockedAchievements & getLockedAchievements", () => {
    it("partitions evaluated achievements properly", () => {
      const all = evaluateAchievements({ streak: 5, totalFocusMinutes: 40 });
      const unlocked = getUnlockedAchievements(all);
      const locked = getLockedAchievements(all);

      expect(unlocked.length + locked.length).toBe(all.length);
      unlocked.forEach((u) => expect(u.unlocked).toBe(true));
      locked.forEach((l) => expect(l.unlocked).toBe(false));
    });
  });

  describe("getNextMilestones", () => {
    it("returns locked badges closest to completion", () => {
      const all = evaluateAchievements({
        streak: 25, // 25/30 = 83% towards unstoppable
        totalFocusMinutes: 80, // 80/100 = 80% towards century club
        cardsReviewed: 10, // 10/20 = 50% towards recall rookie
      });

      const next = getNextMilestones(all, 2);
      expect(next.length).toBe(2);
      expect(next[0].id).toBe("unstoppable");
      expect(next[1].id).toBe("century-club");
    });
  });

  describe("evaluateDailyGoalProgress", () => {
    it("evaluates default goals against today study metrics", () => {
      const progress = evaluateDailyGoalProgress({
        todayFocusMinutes: 30,
        todayCardsReviewed: 15,
        todayTasksCompleted: 3,
      });

      expect(progress.isMinutesMet).toBe(true);
      expect(progress.isCardsMet).toBe(true);
      expect(progress.isTasksMet).toBe(true);
      expect(progress.achieved).toBe(true);
      expect(progress.minutesPercent).toBe(100);
    });

    it("handles partial completion accurately", () => {
      const progress = evaluateDailyGoalProgress({
        todayFocusMinutes: 15,
        todayCardsReviewed: 5,
        todayTasksCompleted: 1,
        goals: {
          dailyMinutesGoal: 60,
          dailyCardsGoal: 20,
          dailyTasksGoal: 4,
        },
      });

      expect(progress.isMinutesMet).toBe(false);
      expect(progress.minutesPercent).toBe(25);
      expect(progress.cardsPercent).toBe(25);
      expect(progress.tasksPercent).toBe(25);
      expect(progress.achieved).toBe(false);
    });
  });

  describe("loadStudyGoals & saveStudyGoals", () => {
    it("loads defaults when nothing is saved", () => {
      const goals = loadStudyGoals();
      expect(goals).toEqual(DEFAULT_STUDY_GOALS);
    });

    it("saves and reloads custom study goals", () => {
      saveStudyGoals({
        dailyMinutesGoal: 45,
        dailyCardsGoal: 25,
        dailyTasksGoal: 5,
      });

      const loaded = loadStudyGoals();
      expect(loaded.dailyMinutesGoal).toBe(45);
      expect(loaded.dailyCardsGoal).toBe(25);
      expect(loaded.dailyTasksGoal).toBe(5);
    });
  });

  describe("computeDaysGoalMetInWeek", () => {
    it("computes count of days within the past 7 days that met the minutes goal", () => {
      const now = new Date();
      const sessions = [
        { started_at: now.toISOString(), minutes: 35 },
        { started_at: new Date(Date.now() - 86400000).toISOString(), minutes: 40 },
        { started_at: new Date(Date.now() - 86400000 * 2).toISOString(), minutes: 10 },
      ];

      const count = computeDaysGoalMetInWeek(sessions, 30);
      expect(count).toBe(2);
    });
  });
});
