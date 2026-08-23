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

      expect(flashcardsApi.updateReview).toHaveBeenCalledWith(
        "c-10",
        "2026-08-26T00:00:00.000Z",
        2,
        2.5,
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

    it("enqueues into offline queue on online failure", async () => {
      vi.mocked(tasksApi.toggle).mockRejectedValueOnce(new Error("503 Service Unavailable"));

      const res = await toggleTask({
        id: 7,
        currentStatus: false,
      });

      expect(res.queued).toBe(true);
      expect(getOfflineQueueSize()).toBe(1);
    });
  });
});
