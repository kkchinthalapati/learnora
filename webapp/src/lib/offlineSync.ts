import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { flashcardsApi } from "../api/flashcards";
import { sessionsApi, type LogSessionInput } from "../api/sessions";
import { tasksApi } from "../api/tasks";
import { queryClient } from "./queryClient";
import { learningEventsApi, type RecordLearningEventInput } from "../api/learningEvents";
import { requireUserId } from "../api/session";
import { misconceptionsApi, type LoopObservationInput } from "../api/misconceptions";

export const OFFLINE_QUEUE_KEY = "learnora:offline_queue";
export const OFFLINE_QUEUE_EVENT = "learnora:offline_queue_changed";
export const OFFLINE_SYNC_STATE_EVENT = "learnora:offline_sync_state_changed";

export interface SrsReviewPayload {
  cardId: string;
  nextReviewDate: string;
  interval: number;
  ease: number;
  /** FSRS memory state for the graded card. Optional so a queue persisted by
   *  an older build still replays. */
  stability?: number;
  difficulty?: number;
  /** When the student graded the card (ISO). The server keeps whichever
   *  review of a card is newest (flashcardsApi.updateReview), so replaying
   *  this later can neither double-apply it nor clobber a newer review.
   *  Optional so a queue persisted by an older build still replays. */
  reviewedAt?: string;
}

export type LogSessionPayload = LogSessionInput;

export interface ToggleTaskPayload {
  id: number;
  currentStatus: boolean;
}

export interface OfflineActionPayloadMap {
  recordLearningEvent: { input: RecordLearningEventInput; userId: string };
  submitSrsReview: SrsReviewPayload;
  logSession: LogSessionPayload;
  toggleTask: ToggleTaskPayload;
  /** A repair shown or a retest answered (lib/mistakeLoop.ts). Replay-safe:
   *  the server drops a second write with the same idempotency key. */
  recordLoopObservation: { input: LoopObservationInput; userId: string };
}

export type OfflineActionType = keyof OfflineActionPayloadMap;

export interface OfflineAction<
  T extends OfflineActionType = OfflineActionType,
> {
  id: string;
  type: T;
  payload: OfflineActionPayloadMap[T];
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export interface FlushResult {
  processed: number;
  failed: number;
  remaining: number;
}

const queueListeners = new Set<() => void>();
let syncingState = false;
let flushPromise: Promise<FlushResult> | null = null;
let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
const MAX_RETRIES = 5;

let cachedQueue: OfflineAction[] = [];
let cachedRaw: string | null = null;

function safeParseQueue(raw: string | null): OfflineAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is OfflineAction =>
          item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.type === "string" &&
          item.payload !== undefined &&
          typeof item.timestamp === "number",
      );
    }
  } catch {
    // Ignore malformed storage content safely
  }
  return [];
}

export function getOfflineQueue(): OfflineAction[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    return safeParseQueue(window.localStorage.getItem(OFFLINE_QUEUE_KEY));
  } catch {
    return [];
  }
}

export function getOfflineQueueSize(): number {
  return getOfflineQueue().length;
}

export function isCurrentlySyncing(): boolean {
  return syncingState;
}

function setSyncingState(syncing: boolean): void {
  syncingState = syncing;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(OFFLINE_SYNC_STATE_EVENT, {
        detail: { isSyncing: syncing },
      }),
    );
  }
}

function notifyQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  }
  queueListeners.forEach((fn) => fn());
}

function saveOfflineQueue(queue: OfflineAction[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const serialized = JSON.stringify(queue);
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, serialized);
    cachedRaw = serialized;
    cachedQueue = queue;
  } catch (err) {
    console.error(
      "[offlineSync] Failed to persist queue to localStorage:",
      err,
    );
  }
  notifyQueueChanged();
}

/**
 * Enqueues an offline action into LocalStorage with conflict safety & deduplication:
 * - `submitSrsReview`: Updates existing review in queue for the same cardId if present.
 * - `toggleTask`: Updates existing queued toggle for the same taskId if present.
 * - `logSession`: Appends sequentially so no focus history is lost.
 */
export function enqueueOfflineAction<T extends OfflineActionType>(
  type: T,
  payload: OfflineActionPayloadMap[T],
): OfflineAction<T> {
  const queue = getOfflineQueue();
  if (type === "recordLearningEvent") {
    const p = payload as OfflineActionPayloadMap["recordLearningEvent"];
    const existing = queue.find(a => a.type === type &&
      (a.payload as typeof p).userId === p.userId && (a.payload as typeof p).input.clientId === p.input.clientId);
    if (existing) return existing as OfflineAction<T>;
  }
  if (type === "recordLoopObservation") {
    const p = payload as OfflineActionPayloadMap["recordLoopObservation"];
    const existing = queue.find(a => a.type === type &&
      (a.payload as typeof p).userId === p.userId &&
      (a.payload as typeof p).input.idempotencyKey === p.input.idempotencyKey);
    if (existing) return existing as OfflineAction<T>;
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const newAction: OfflineAction<T> = {
    id,
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  if (type === "submitSrsReview") {
    const srsPayload = payload as SrsReviewPayload;
    const existingIdx = queue.findIndex(
      (a) =>
        a.type === "submitSrsReview" &&
        (a.payload as SrsReviewPayload).cardId === srsPayload.cardId,
    );
    if (existingIdx >= 0) {
      /* One queued review per card, and it is the newest one: a card graded
         twice offline syncs once, with its latest schedule. */
      const existing = queue[existingIdx] as OfflineAction<"submitSrsReview">;
      if (isNewerReview(existing.payload, srsPayload)) {
        return existing as unknown as OfflineAction<T>;
      }
      queue[existingIdx] = newAction as OfflineAction;
      saveOfflineQueue(queue);
      return newAction;
    }
  } else if (type === "toggleTask") {
    const taskPayload = payload as ToggleTaskPayload;
    const existingIdx = queue.findIndex(
      (a) =>
        a.type === "toggleTask" &&
        (a.payload as ToggleTaskPayload).id === taskPayload.id,
    );
    if (existingIdx >= 0) {
      queue[existingIdx] = newAction as OfflineAction;
      saveOfflineQueue(queue);
      return newAction;
    }
  }

  queue.push(newAction as OfflineAction);
  saveOfflineQueue(queue);
  return newAction;
}

/** True when `a` was graded after `b`. A review with no timestamp (queued by
 *  an older build) counts as older than one that has one. */
function isNewerReview(a: SrsReviewPayload, b: SrsReviewPayload): boolean {
  if (!a.reviewedAt) return false;
  if (!b.reviewedAt) return true;
  return a.reviewedAt > b.reviewedAt;
}

/** Card reviews among the queued actions — what "N reviews waiting to sync"
 *  counts. */
export function countQueuedReviews(queue: OfflineAction[]): number {
  return queue.filter((a) => a.type === "submitSrsReview").length;
}

/** Thrown when an offline review cannot be written to the device at all
 *  (storage full, blocked, or private mode). The caller must hear about it:
 *  pretending it was saved would lose the grade silently. */
export class OfflineStorageError extends Error {
  constructor() {
    super(
      "You're offline and this browser won't let Learnora save reviews on the device, so this grade couldn't be kept. Reconnect to keep reviewing.",
    );
    this.name = "OfflineStorageError";
  }
}

function enqueueReviewDurably(payload: SrsReviewPayload): void {
  const action = enqueueOfflineAction("submitSrsReview", payload);
  if (!getOfflineQueue().some((a) => a.id === action.id)) {
    throw new OfflineStorageError();
  }
}

/**
 * Clear the entire offline queue and resets flush state. Useful for testing and data resets.
 */
export function clearOfflineQueue(): void {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  flushPromise = null;
  setSyncingState(false);
  saveOfflineQueue([]);
}

/**
 * Flushes the persistent offline queue in FIFO order with exponential backoff on network failures.
 */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (flushPromise) {
    return flushPromise;
  }

  const runFlush = async (): Promise<FlushResult> => {
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { processed: 0, failed: 0, remaining: getOfflineQueueSize() };
    }

    const initialQueue = getOfflineQueue();
    if (initialQueue.length === 0) {
      return { processed: 0, failed: 0, remaining: 0 };
    }

    setSyncingState(true);
    let processed = 0;
    let failed = 0;

    const skippedIds = new Set<string>();

    try {
      while (true) {
        const currentQueue = getOfflineQueue();
        if (currentQueue.length === 0) break;

        // Skip past (never remove) actions already identified as belonging
        // to a different account, instead of always looking at index 0 — a
        // stray item left behind by a previous account on a shared device
        // must not block every action the *current* user queues afterward.
        const action = currentQueue.find((a) => !skippedIds.has(a.id));
        if (!action) break; // everything left belongs to another account

        // Do not upload another account's evidence or consume its retry budget.
        if (action.type === "recordLearningEvent" || action.type === "recordLoopObservation") {
          const owner = (action.payload as { userId: string }).userId;
          if (await requireUserId().catch(() => null) !== owner) {
            skippedIds.add(action.id);
            continue;
          }
        }
        try {
          if (action.type === "submitSrsReview") {
            const p = action.payload as SrsReviewPayload;
            await flashcardsApi.updateReview(
              p.cardId,
              p.nextReviewDate,
              p.interval,
              p.ease,
              { stability: p.stability, difficulty: p.difficulty },
              p.reviewedAt,
            );
            queryClient.invalidateQueries({ queryKey: ["flashcards"] });
          } else if (action.type === "recordLearningEvent") {
            const p = action.payload as OfflineActionPayloadMap["recordLearningEvent"];
            await learningEventsApi.send(p.input, p.userId);
            queryClient.invalidateQueries({ queryKey: ["learning_events"] });
          } else if (action.type === "logSession") {
            const p = action.payload as LogSessionPayload;
            await sessionsApi.log(p);
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            queryClient.invalidateQueries({ queryKey: ["learning_events"] });
          } else if (action.type === "toggleTask") {
            const p = action.payload as ToggleTaskPayload;
            await tasksApi.toggle(p.id, p.currentStatus);
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          } else if (action.type === "recordLoopObservation") {
            const p = action.payload as OfflineActionPayloadMap["recordLoopObservation"];
            await misconceptionsApi.recordObservation(p.input);
            queryClient.invalidateQueries({ queryKey: ["misconceptions"] });
          }

          // Successful execution: remove this item. Not necessarily index 0
          // any more — a skipped foreign-account item may still sit ahead of
          // it in the queue.
          const updated = getOfflineQueue();
          const doneIdx = updated.findIndex((a) => a.id === action.id);
          if (doneIdx !== -1) {
            updated.splice(doneIdx, 1);
            saveOfflineQueue(updated);
          }
          processed++;
        } catch (err: any) {
          failed++;
          const nextRetry = (action.retryCount || 0) + 1;
          const errorMessage = err?.message || String(err);
          console.error(
            `[offlineSync] Error executing action ${action.id} (${action.type}):`,
            err,
          );

          if (nextRetry >= MAX_RETRIES && action.type === "recordLearningEvent") {
            // Keep evidence for the next reconnect/manual retry instead of dropping it.
            break;
          } else if (nextRetry >= MAX_RETRIES) {
            console.warn(
              `[offlineSync] Action ${action.id} exceeded max retries (${MAX_RETRIES}). Dropping.`,
            );
            const updated = getOfflineQueue();
            const dropIdx = updated.findIndex((a) => a.id === action.id);
            if (dropIdx !== -1) {
              updated.splice(dropIdx, 1);
              saveOfflineQueue(updated);
            }
          } else {
            const updated = getOfflineQueue();
            const retryIdx = updated.findIndex((a) => a.id === action.id);
            if (retryIdx !== -1) {
              updated[retryIdx] = {
                ...action,
                retryCount: nextRetry,
                lastError: errorMessage,
              };
              saveOfflineQueue(updated);
            }

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
            const backoffMs = Math.min(
              1000 * Math.pow(2, nextRetry - 1),
              30000,
            );
            retryTimeoutId = setTimeout(() => {
              if (typeof navigator === "undefined" || navigator.onLine) {
                flushOfflineQueue();
              }
            }, backoffMs);

            // Break on network error so subsequent actions don't fail in a tight loop during downtime
            break;
          }
        }
      }
    } finally {
      setSyncingState(false);
    }

    return {
      processed,
      failed,
      remaining: getOfflineQueueSize(),
    };
  };

  flushPromise = runFlush();
  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}

/* Only a failure where the request never got a fair send belongs in the
 * replay queue. If the server ANSWERED — the api layer surfaces its error
 * payloads as plain Errors — the rejection is authoritative: replaying the
 * identical write later would be rejected identically, so we rethrow and let
 * the caller's onError roll the optimistic UI back. Silently queueing those
 * would show success while the action quietly dies after MAX_RETRIES.
 * Transport-level failures (offline, DNS, refused socket) surface from fetch
 * as TypeError, sometimes after navigator.onLine has already flipped false. */
function isConnectivityFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof TypeError;
}

/**
 * Helper to submit SRS review: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function submitSrsReview(
  payload: SrsReviewPayload,
): Promise<{ queued: boolean }> {
  const stamped: SrsReviewPayload = {
    ...payload,
    reviewedAt: payload.reviewedAt ?? new Date().toISOString(),
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueReviewDurably(stamped);
    return { queued: true };
  }
  try {
    await flashcardsApi.updateReview(
      stamped.cardId,
      stamped.nextReviewDate,
      stamped.interval,
      stamped.ease,
      { stability: stamped.stability, difficulty: stamped.difficulty },
      stamped.reviewedAt,
    );
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    return { queued: false };
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    console.warn(
      "[offlineSync] submitSrsReview failed, queuing offline:",
      error,
    );
    enqueueReviewDurably(stamped);
    return { queued: true };
  }
}

/**
 * Helper to log focus timer session: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function logSession(
  payload: LogSessionPayload,
): Promise<{ queued: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("logSession", payload);
    return { queued: true };
  }
  try {
    await sessionsApi.log(payload);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    return { queued: false };
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    console.warn("[offlineSync] logSession failed, queuing offline:", error);
    enqueueOfflineAction("logSession", payload);
    return { queued: true };
  }
}

/**
 * Helper to toggle task completion: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function toggleTask(
  payload: ToggleTaskPayload,
): Promise<{ queued: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("toggleTask", payload);
    return { queued: true };
  }
  try {
    await tasksApi.toggle(payload.id, payload.currentStatus);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    return { queued: false };
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    console.warn("[offlineSync] toggleTask failed, queuing offline:", error);
    enqueueOfflineAction("toggleTask", payload);
    return { queued: true };
  }
}

function subscribeQueue(onStoreChange: () => void) {
  queueListeners.add(onStoreChange);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === OFFLINE_QUEUE_KEY || event.key === null) {
      onStoreChange();
    }
  };
  const handleCustom = () => {
    onStoreChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener(OFFLINE_QUEUE_EVENT, handleCustom);
  }
  return () => {
    queueListeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(OFFLINE_QUEUE_EVENT, handleCustom);
    }
  };
}

function getQueueSnapshot(): OfflineAction[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedQueue = safeParseQueue(raw);
    }
    return cachedQueue;
  } catch {
    return [];
  }
}

export function useOfflineQueueData(): OfflineAction[] {
  return useSyncExternalStore(subscribeQueue, getQueueSnapshot, () => []);
}

export function useOfflineQueueSize(): number {
  const queue = useOfflineQueueData();
  return queue.length;
}

/**
 * Hook to track online/offline connectivity status and active sync queue size.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const queue = useOfflineQueueData();
  const queueSize = queue.length;
  const reviewsQueued = countQueuedReviews(queue);
  const [isSyncing, setIsSyncing] = useState<boolean>(() =>
    isCurrentlySyncing(),
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const handleSyncChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isSyncing: boolean }>).detail;
      setIsSyncing(detail?.isSyncing ?? isCurrentlySyncing());
    };
    window.addEventListener(OFFLINE_SYNC_STATE_EVENT, handleSyncChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_SYNC_STATE_EVENT, handleSyncChange);
    };
  }, []);

  const syncNow = useCallback(async () => {
    return flushOfflineQueue();
  }, []);

  return {
    isOnline,
    queueSize,
    /** How many of `queueSize` are card reviews. */
    reviewsQueued,
    isSyncing,
    syncNow,
  };
}

/**
 * Hook returning comprehensive offline queue state and management actions.
 */
// Auto-register online listeners if running in a browser environment
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushOfflineQueue();
  });
}

/**
 * Record a repair or a retest answer: online now, or queued when offline or
 * the request never reached the server. The time it happened is stamped
 * here, once, so a replay days later still counts from when the student
 * answered (the server only refuses times in the future, and stamps repairs
 * itself). An HTTP rejection is rethrown, not queued.
 */
export async function recordLoopObservation(
  input: LoopObservationInput,
): Promise<{ queued: boolean }> {
  const stamped: LoopObservationInput = {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  const userId = await requireUserId();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("recordLoopObservation", { input: stamped, userId });
    return { queued: true };
  }
  try {
    await misconceptionsApi.recordObservation(stamped);
    queryClient.invalidateQueries({ queryKey: ["misconceptions"] });
    return { queued: false };
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    enqueueOfflineAction("recordLoopObservation", { input: stamped, userId });
    return { queued: true };
  }
}
