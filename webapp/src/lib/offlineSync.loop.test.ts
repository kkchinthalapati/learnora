import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOfflineQueue,
  flushOfflineQueue,
  getOfflineQueue,
  recordLoopObservation,
} from "./offlineSync";
import { misconceptionsApi, type LoopObservationInput } from "../api/misconceptions";
import { observationKey, questionKey } from "./questionKey";

vi.mock("../api/misconceptions", () => ({
  misconceptionsApi: { recordObservation: vi.fn().mockResolvedValue("written") },
}));
vi.mock("../api/session", () => ({ requireUserId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("./queryClient", () => ({ queryClient: { invalidateQueries: vi.fn() } }));

const q = questionKey("Which organelle releases energy?");
const RETEST: LoopObservationInput = {
  misconceptionId: "m1",
  kind: "correction",
  sourceTool: "quiz",
  questionKey: q,
  idempotencyKey: observationKey("retest", "m1", q),
  detail: "Retest passed.",
};

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
}

describe("retests are idempotent under retry and offline", () => {
  beforeEach(() => {
    localStorage.clear();
    clearOfflineQueue();
    vi.mocked(misconceptionsApi.recordObservation).mockReset().mockResolvedValue("written");
    setOnline(true);
  });

  it("answering the same retest twice offline queues it once", async () => {
    setOnline(false);
    await recordLoopObservation(RETEST);
    await recordLoopObservation(RETEST);
    expect(getOfflineQueue()).toHaveLength(1);
  });

  it("stamps the answer time once, and replays it with that time", async () => {
    setOnline(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
    await recordLoopObservation(RETEST);
    vi.setSystemTime(new Date("2026-10-09T18:00:00Z"));
    vi.useRealTimers();

    setOnline(true);
    await flushOfflineQueue();
    expect(misconceptionsApi.recordObservation).toHaveBeenCalledTimes(1);
    expect(misconceptionsApi.recordObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: RETEST.idempotencyKey,
        occurredAt: "2026-10-08T10:00:00.000Z",
      }),
    );
    expect(getOfflineQueue()).toHaveLength(0);
  });

  it("a request that never reached the server is queued, then retried with the same key", async () => {
    vi.mocked(misconceptionsApi.recordObservation)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("written");
    const { queued } = await recordLoopObservation(RETEST);
    expect(queued).toBe(true);
    await flushOfflineQueue();
    const keys = vi
      .mocked(misconceptionsApi.recordObservation)
      .mock.calls.map(([input]) => input.idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([RETEST.idempotencyKey]));
    expect(getOfflineQueue()).toHaveLength(0);
  });

  it("an HTTP rejection is surfaced, not queued", async () => {
    vi.mocked(misconceptionsApi.recordObservation).mockRejectedValueOnce(
      Object.assign(new Error("bad request"), { status: 400 }),
    );
    await expect(recordLoopObservation(RETEST)).rejects.toThrow("bad request");
    expect(getOfflineQueue()).toHaveLength(0);
  });
});
