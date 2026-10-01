import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  enqueueOfflineAction,
  getOfflineQueue,
  getOfflineQueueSize,
  clearOfflineQueue,
  flushOfflineQueue,
  submitSrsReview,
  logSession,
  toggleTask,
  countQueuedReviews,
  OfflineStorageError,
  type SrsReviewPayload,
} from "./offlineSync";
import { flashcardsApi } from "../api/flashcards";
import { sessionsApi } from "../api/sessions";
import { tasksApi } from "../api/tasks";

vi.mock("../api/flashcards", () => ({
  flashcardsApi: {
    updateReview: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../api/sessions", () => ({
  sessionsApi: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../api/tasks", () => ({
  tasksApi: {
    toggle: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
}));

describe("offlineSync", () => {
  beforeEach(() => {
    localStorage.clear();
    clearOfflineQueue();
    vi.clearAllMocks();
    vi.mocked(flashcardsApi.updateReview).mockResolvedValue(undefined);
    vi.mocked(sessionsApi.log).mockResolvedValue(undefined);
    vi.mocked(tasksApi.toggle).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  describe("queue operations & conflict safety", () => {
    it("enqueues flashcard review action", () => {
      enqueueOfflineAction("submitSrsReview", {
        cardId: "c-1",
        nextReviewDate: "2026-08-25T00:00:00.000Z",
        interval: 3,
        ease: 2.6,
      });

      const queue = getOfflineQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe("submitSrsReview");
      expect(queue[0].payload).toEqual({
        cardId: "c-1",
        nextReviewDate: "2026-08-25T00:00:00.000Z",
        interval: 3,
        ease: 2.6,
      });
      expect(getOfflineQueueSize()).toBe(1);
    });

    it("updates existing pending review for same card (conflict safety)", () => {
      enqueueOfflineAction("submitSrsReview", {
        cardId: "c-1",
        nextReviewDate: "2026-08-24T00:00:00.000Z",
        interval: 1,
        ease: 2.5,
      });

      enqueueOfflineAction("submitSrsReview", {
        cardId: "c-1",
        nextReviewDate: "2026-08-27T00:00:00.000Z",
        interval: 4,
        ease: 2.7,
      });

      const queue = getOfflineQueue();
      expect(queue.length).toBe(1);
      expect((queue[0].payload as any).interval).toBe(4);
      expect((queue[0].payload as any).ease).toBe(2.7);
    });

    it("updates existing pending task toggle for same taskId (conflict safety)", () => {
      enqueueOfflineAction("toggleTask", {
        id: 42,
        currentStatus: false,
      });

      enqueueOfflineAction("toggleTask", {
        id: 42,
        currentStatus: true,
      });

      const queue = getOfflineQueue();
      expect(queue.length).toBe(1);
      expect((queue[0].payload as any).currentStatus).toBe(true);
    });

    it("appends multiple focus sessions without dropping", () => {
      enqueueOfflineAction("logSession", {
        minutes: 25,
        task: "Math Review",
      });

      enqueueOfflineAction("logSession", {
        minutes: 50,
        task: "Physics Problem Set",
      });

      const queue = getOfflineQueue();
      expect(queue.length).toBe(2);
      expect((queue[0].payload as any).minutes).toBe(25);
      expect((queue[1].payload as any).minutes).toBe(50);
    });
  });

  describe("flushOfflineQueue", () => {
    it("processes all queued actions when online", async () => {
      enqueueOfflineAction("submitSrsReview", {
        cardId: "c-10",
        nextReviewDate: "2026-08-26T00:00:00.000Z",
        interval: 2,
        ease: 2.5,
      });
      enqueueOfflineAction("logSession", {
        minutes: 30,
        task: "Chemistry",
      });
      enqueueOfflineAction("toggleTask", {
        id: 99,
        currentStatus: false,
      });

      const result = await flushOfflineQueue();
      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.remaining).toBe(0);
      expect(getOfflineQueueSize()).toBe(0);

      // Queued by an older build, so no review time: the write falls back to
      // "now" inside updateReview.
      expect(flashcardsApi.updateReview).toHaveBeenCalledWith(
        "c-10",
        "2026-08-26T00:00:00.000Z",
        2,
        2.5,
        { stability: undefined, difficulty: undefined },
        undefined,
      );
      expect(sessionsApi.log).toHaveBeenCalledWith({
        minutes: 30,
        task: "Chemistry",
      });
      expect(tasksApi.toggle).toHaveBeenCalledWith(99, false);
    });

    it("does not flush when offline", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      enqueueOfflineAction("toggleTask", {
        id: 1,
        currentStatus: false,
      });

      const result = await flushOfflineQueue();
      expect(result.processed).toBe(0);
      expect(result.remaining).toBe(1);
      expect(tasksApi.toggle).not.toHaveBeenCalled();
    });

    it("handles execution failure and records retry", async () => {
      vi.mocked(flashcardsApi.updateReview).mockRejectedValueOnce(
        new Error("Network disconnect"),
      );

      enqueueOfflineAction("submitSrsReview", {
        cardId: "c-fail",
        nextReviewDate: "2026-08-25T00:00:00.000Z",
        interval: 1,
        ease: 2.5,
      });

      const result = await flushOfflineQueue();
      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(1);

      const queue = getOfflineQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].retryCount).toBe(1);
      expect(queue[0].lastError).toBe("Network disconnect");
    });
  });

  describe("helper wrappers (submitSrsReview, logSession, toggleTask)", () => {
    it("calls API directly when online", async () => {
      const res = await submitSrsReview({
        cardId: "c-direct",
        nextReviewDate: "2026-08-25T00:00:00.000Z",
        interval: 1,
        ease: 2.5,
      });

      expect(res.queued).toBe(false);
      expect(flashcardsApi.updateReview).toHaveBeenCalledWith(
        "c-direct",
        "2026-08-25T00:00:00.000Z",
        1,
        2.5,
        { stability: undefined, difficulty: undefined },
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      );
      expect(getOfflineQueueSize()).toBe(0);
    });

    it("enqueues into offline queue when offline", async () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      const res = await logSession({
        minutes: 45,
        task: "Biology",
      });

      expect(res.queued).toBe(true);
      expect(sessionsApi.log).not.toHaveBeenCalled();
      expect(getOfflineQueueSize()).toBe(1);
    });

    it("enqueues into offline queue on a transport failure while online", async () => {
      vi.mocked(tasksApi.toggle).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const res = await toggleTask({
        id: 7,
        currentStatus: false,
      });

      expect(res.queued).toBe(true);
      expect(getOfflineQueueSize()).toBe(1);
    });

    /* A server that answered has rejected this exact write; replaying it
       later would be rejected identically. Rethrow so the caller rolls the
       optimistic UI back instead of showing success over a doomed queue
       entry. */
    it("rethrows an HTTP rejection instead of queueing it", async () => {
      vi.mocked(tasksApi.toggle).mockRejectedValueOnce(new Error("503 Service Unavailable"));

      await expect(
        toggleTask({ id: 7, currentStatus: false }),
      ).rejects.toThrow("503 Service Unavailable");
      expect(getOfflineQueueSize()).toBe(0);
    });
  });

  describe("offline review sync: idempotent, newest review wins", () => {
    const review = (reviewedAt: string, interval: number): SrsReviewPayload => ({
      cardId: "c-1",
      nextReviewDate: "2026-10-01T00:00:00.000Z",
      interval,
      ease: 2.5,
      reviewedAt,
    });

    it("keeps one queued review per card: the newest", () => {
      enqueueOfflineAction("submitSrsReview", review("2026-09-29T10:00:00.000Z", 1));
      enqueueOfflineAction("submitSrsReview", review("2026-09-29T11:00:00.000Z", 4));
      // Arrives late (e.g. a retry of the first grade): must not win.
      enqueueOfflineAction("submitSrsReview", review("2026-09-29T09:00:00.000Z", 9));

      const queue = getOfflineQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0].payload as SrsReviewPayload).interval).toBe(4);
    });

    it("stamps the grade time on an offline review and replays it with that time", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
      await submitSrsReview({ cardId: "c-7", nextReviewDate: "2026-10-01T00:00:00.000Z", interval: 2, ease: 2.5, reviewedAt: "2026-09-29T08:00:00.000Z" });
      Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });

      await flushOfflineQueue();
      expect(flashcardsApi.updateReview).toHaveBeenCalledWith(
        "c-7",
        "2026-10-01T00:00:00.000Z",
        2,
        2.5,
        { stability: undefined, difficulty: undefined },
        "2026-09-29T08:00:00.000Z",
      );
      expect(getOfflineQueueSize()).toBe(0);
    });

    it("replays the same stamp on a retry, so a slow success can't be applied twice", async () => {
      vi.mocked(flashcardsApi.updateReview).mockRejectedValueOnce(new Error("socket hang up"));
      enqueueOfflineAction("submitSrsReview", review("2026-09-29T10:00:00.000Z", 3));

      await flushOfflineQueue(); // fails, stays queued
      await flushOfflineQueue(); // retried
      const stamps = vi.mocked(flashcardsApi.updateReview).mock.calls.map((call) => call[5]);
      expect(stamps).toEqual(["2026-09-29T10:00:00.000Z", "2026-09-29T10:00:00.000Z"]);
    });

    it("counts only card reviews as reviews", () => {
      enqueueOfflineAction("submitSrsReview", review("2026-09-29T10:00:00.000Z", 1));
      enqueueOfflineAction("submitSrsReview", { ...review("2026-09-29T10:00:00.000Z", 1), cardId: "c-2" });
      enqueueOfflineAction("toggleTask", { id: 1, currentStatus: false });
      expect(countQueuedReviews(getOfflineQueue())).toBe(2);
    });

    it("refuses, loudly, to pretend an offline review was kept when storage is blocked", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("blocked", "QuotaExceededError");
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        submitSrsReview({ cardId: "c-9", nextReviewDate: "2026-10-01T00:00:00.000Z", interval: 1, ease: 2.5 }),
      ).rejects.toBeInstanceOf(OfflineStorageError);
      setItem.mockRestore();
    });
  });
});
