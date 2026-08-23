import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStudySnapshot,
  saveStudySnapshot,
  recordMaterialVisit,
  recordDeckReview,
  recordQuizProgress,
  recordFocusGoal,
  clearStudySnapshot,
  subscribeContinuity,
  getResumeAction,
  getRecentContinuityItems,
  CONTINUITY_STORAGE_KEY,
  type StudySnapshot,
} from "./continuity";

describe("continuity", () => {
  beforeEach(() => {
    localStorage.clear();
    clearStudySnapshot();
    vi.clearAllMocks();
  });

  describe("storage operations & snapshot merging", () => {
    it("returns empty snapshot when storage is empty", () => {
      const snapshot = getStudySnapshot();
      expect(snapshot).toEqual({});
    });

    it("saves and retrieves full study snapshot", () => {
      const saved = saveStudySnapshot({
        lastOpenedMaterial: {
          id: "m-1",
          title: "Biology Cell Division",
          folderId: "f-1",
          scrollPercentage: 45,
          lastVisitedAt: "2026-08-20T10:00:00.000Z",
        },
      });

      expect(saved.lastOpenedMaterial?.id).toBe("m-1");
      expect(saved.updatedAt).toBeDefined();

      const retrieved = getStudySnapshot();
      expect(retrieved.lastOpenedMaterial?.title).toBe("Biology Cell Division");
    });

    it("merges partial snapshot patches without erasing other sections", () => {
      recordMaterialVisit({
        id: "m-10",
        title: "Chemistry Notes",
        scrollPercentage: 70,
      });

      recordDeckReview({
        id: "d-5",
        title: "Periodic Table",
        cardIndex: 8,
        totalCards: 20,
      });

      const snapshot = getStudySnapshot();
      expect(snapshot.lastOpenedMaterial?.id).toBe("m-10");
      expect(snapshot.lastReviewedDeck?.id).toBe("d-5");
      expect(snapshot.lastReviewedDeck?.cardIndex).toBe(8);
    });

    it("clears snapshot from storage", () => {
      recordMaterialVisit({
        id: "m-1",
        title: "Test Note",
      });

      expect(getStudySnapshot().lastOpenedMaterial).toBeDefined();
      clearStudySnapshot();
      expect(getStudySnapshot().lastOpenedMaterial).toBeUndefined();
    });
  });

  describe("convenience helpers", () => {
    it("records material visit with clamped scroll percentage", () => {
      recordMaterialVisit({
        id: "m-2",
        title: "Physics Mechanics",
        folderId: "f-phys",
        scrollPercentage: 120, // Should clamp to 100
      });

      const snapshot = getStudySnapshot();
      expect(snapshot.lastOpenedMaterial).toEqual(
        expect.objectContaining({
          id: "m-2",
          title: "Physics Mechanics",
          folderId: "f-phys",
          scrollPercentage: 100,
        }),
      );
    });

    it("records deck review with safe indices", () => {
      recordDeckReview({
        id: "d-1",
        title: "Organic Compounds",
        cardIndex: 4,
        totalCards: 15,
      });

      const snapshot = getStudySnapshot();
      expect(snapshot.lastReviewedDeck).toEqual(
        expect.objectContaining({
          id: "d-1",
          title: "Organic Compounds",
          cardIndex: 4,
          totalCards: 15,
        }),
      );
    });

    it("records quiz progress", () => {
      recordQuizProgress({
        id: "q-1",
        title: "Genetics Quiz",
        questionIndex: 3,
        totalQuestions: 10,
      });

      const snapshot = getStudySnapshot();
      expect(snapshot.lastQuizDraft).toEqual(
        expect.objectContaining({
          id: "q-1",
          title: "Genetics Quiz",
          questionIndex: 3,
          totalQuestions: 10,
        }),
      );
    });

    it("records focus goal", () => {
      recordFocusGoal({
        task: "Complete Chapter 5 Review",
        folderId: "f-bio",
        minutesRemaining: 25,
      });

      const snapshot = getStudySnapshot();
      expect(snapshot.lastFocusGoal).toEqual(
        expect.objectContaining({
          task: "Complete Chapter 5 Review",
          folderId: "f-bio",
          minutesRemaining: 25,
        }),
      );
    });
  });

  describe("subscribeContinuity (event & multi-tab sync)", () => {
    it("notifies listeners on local save", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeContinuity(listener);

      recordMaterialVisit({ id: "m-1", title: "Note 1" });
      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it("notifies listeners on window storage event (multi-tab)", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeContinuity(listener);

      const serialized = JSON.stringify({
        lastOpenedMaterial: {
          id: "m-remote",
          title: "Remote Tab Note",
          scrollPercentage: 50,
          lastVisitedAt: new Date().toISOString(),
        },
      });

      localStorage.setItem(CONTINUITY_STORAGE_KEY, serialized);

      const storageEvent = new StorageEvent("storage", {
        key: CONTINUITY_STORAGE_KEY,
        newValue: serialized,
      });

      window.dispatchEvent(storageEvent);
      expect(listener).toHaveBeenCalled();

      const snapshot = getStudySnapshot();
      expect(snapshot.lastOpenedMaterial?.id).toBe("m-remote");

      unsubscribe();
    });
  });

  describe("getResumeAction", () => {
    it("returns null when snapshot is empty", () => {
      expect(getResumeAction({})).toBeNull();
    });

    it("selects the most recent activity as primary resume action", () => {
      const snapshot: StudySnapshot = {
        lastOpenedMaterial: {
          id: "m-older",
          title: "Older Material",
          scrollPercentage: 30,
          lastVisitedAt: "2026-08-20T10:00:00.000Z",
        },
        lastReviewedDeck: {
          id: "d-newer",
          title: "Newer Flashcard Deck",
          cardIndex: 5,
          totalCards: 10,
          lastReviewedAt: "2026-08-20T12:00:00.000Z",
        },
      };

      const action = getResumeAction(snapshot);
      expect(action).not.toBeNull();
      expect(action?.type).toBe("deck");
      expect(action?.title).toBe("Newer Flashcard Deck");
      expect(action?.targetUrl).toBe("/review/d-newer");
      expect(action?.progressPercentage).toBe(60); // (5+1)/10 = 60%
    });

    it("formats material resume action correctly", () => {
      const snapshot: StudySnapshot = {
        lastOpenedMaterial: {
          id: "m-100",
          title: "Enzyme Kinetics",
          scrollPercentage: 85,
          lastVisitedAt: "2026-08-22T09:00:00.000Z",
        },
      };

      const action = getResumeAction(snapshot);
      expect(action).toEqual({
        type: "material",
        title: "Enzyme Kinetics",
        subtitle: "Notes • 85% read",
        targetUrl: "/notes/m-100",
        progressPercentage: 85,
        timestamp: "2026-08-22T09:00:00.000Z",
        badgeLabel: "Reading",
        iconName: "notes",
      });
    });

    it("formats quiz draft resume action correctly", () => {
      const snapshot: StudySnapshot = {
        lastQuizDraft: {
          id: "q-42",
          title: "Midterm Mock Quiz",
          questionIndex: 4,
          totalQuestions: 20,
          lastAttemptedAt: "2026-08-22T15:00:00.000Z",
        },
      };

      const action = getResumeAction(snapshot);
      expect(action?.type).toBe("quiz");
      expect(action?.title).toBe("Midterm Mock Quiz");
      expect(action?.subtitle).toBe("Quiz • Question 5 of 20");
      expect(action?.targetUrl).toBe("/quiz/q-42");
      expect(action?.progressPercentage).toBe(25);
    });

    it("formats focus goal action correctly", () => {
      const snapshot: StudySnapshot = {
        lastFocusGoal: {
          task: "Deep Work: Thermodynamics",
          minutesRemaining: 40,
          lastActiveAt: "2026-08-22T16:00:00.000Z",
        },
      };

      const action = getResumeAction(snapshot);
      expect(action?.type).toBe("focus");
      expect(action?.title).toBe("Deep Work: Thermodynamics");
      expect(action?.targetUrl).toBe("/timer");
    });
  });

  describe("getRecentContinuityItems", () => {
    it("returns all available items sorted by recency", () => {
      const snapshot: StudySnapshot = {
        lastOpenedMaterial: {
          id: "m-1",
          title: "Material A",
          scrollPercentage: 20,
          lastVisitedAt: "2026-08-20T10:00:00.000Z",
        },
        lastReviewedDeck: {
          id: "d-1",
          title: "Deck B",
          cardIndex: 2,
          totalCards: 10,
          lastReviewedAt: "2026-08-20T14:00:00.000Z",
        },
        lastQuizDraft: {
          id: "q-1",
          title: "Quiz C",
          questionIndex: 1,
          totalQuestions: 5,
          lastAttemptedAt: "2026-08-20T12:00:00.000Z",
        },
      };

      const items = getRecentContinuityItems(snapshot);
      expect(items.length).toBe(3);
      expect(items[0].title).toBe("Deck B"); // 14:00
      expect(items[1].title).toBe("Quiz C"); // 12:00
      expect(items[2].title).toBe("Material A"); // 10:00
    });
  });
});
