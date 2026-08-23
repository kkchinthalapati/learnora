import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { flashcardsApi } from "../api/flashcards";
import { sessionsApi, type LogSessionInput } from "../api/sessions";
import { tasksApi } from "../api/tasks";
import { queryClient } from "./queryClient";

export const OFFLINE_QUEUE_KEY = "learnora:offline_queue";
export const OFFLINE_QUEUE_EVENT = "learnora:offline_queue_changed";
export const OFFLINE_SYNC_STATE_EVENT = "learnora:offline_sync_state_changed";

export interface SrsReviewPayload {
  cardId: string;
  nextReviewDate: string;
  interval: number;
  ease: number;
}

export type LogSessionPayload = LogSessionInput;

export interface ToggleTaskPayload {
  id: number;
  currentStatus: boolean;
}

export interface OfflineActionPayloadMap {
  submitSrsReview: SrsReviewPayload;
  logSession: LogSessionPayload;
  toggleTask: ToggleTaskPayload;
}

export type OfflineActionType = keyof OfflineActionPayloadMap;

export interface OfflineAction<T extends OfflineActionType = OfflineActionType> {
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
      new CustomEvent(OFFLINE_SYNC_STATE_EVENT, { detail: { isSyncing: syncing } }),
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
    console.error("[offlineSync] Failed to persist queue to localStorage:", err);
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

    try {
      while (true) {
        const currentQueue = getOfflineQueue();
        if (currentQueue.length === 0) break;

        const action = currentQueue[0];
        try {
          if (action.type === "submitSrsReview") {
            const p = action.payload as SrsReviewPayload;
            await flashcardsApi.updateReview(p.cardId, p.nextReviewDate, p.interval, p.ease);
            queryClient.invalidateQueries({ queryKey: ["flashcards"] });
          } else if (action.type === "logSession") {
            const p = action.payload as LogSessionPayload;
            await sessionsApi.log(p);
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
          } else if (action.type === "toggleTask") {
            const p = action.payload as ToggleTaskPayload;
            await tasksApi.toggle(p.id, p.currentStatus);
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }

          // Successful execution: remove head item
          const updated = getOfflineQueue();
          if (updated.length > 0 && updated[0].id === action.id) {
            updated.shift();
            saveOfflineQueue(updated);
          }
          processed++;
        } catch (err: any) {
          failed++;
          const nextRetry = (action.retryCount || 0) + 1;
          const errorMessage = err?.message || String(err);
          console.error(`[offlineSync] Error executing action ${action.id} (${action.type}):`, err);

          if (nextRetry >= MAX_RETRIES) {
            console.warn(
              `[offlineSync] Action ${action.id} exceeded max retries (${MAX_RETRIES}). Dropping.`,
            );
            const updated = getOfflineQueue();
            if (updated.length > 0 && updated[0].id === action.id) {
              updated.shift();
              saveOfflineQueue(updated);
            }
          } else {
            const updated = getOfflineQueue();
            if (updated.length > 0 && updated[0].id === action.id) {
              updated[0] = {
                ...action,
                retryCount: nextRetry,
                lastError: errorMessage,
              };
              saveOfflineQueue(updated);
            }

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
            const backoffMs = Math.min(1000 * Math.pow(2, nextRetry - 1), 30000);
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

/**
 * Helper to submit SRS review: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function submitSrsReview(payload: SrsReviewPayload): Promise<{ queued: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("submitSrsReview", payload);
    return { queued: true };
  }
  try {
    await flashcardsApi.updateReview(
      payload.cardId,
      payload.nextReviewDate,
      payload.interval,
      payload.ease,
    );
    queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    return { queued: false };
  } catch (error) {
    console.warn("[offlineSync] submitSrsReview failed, queuing offline:", error);
    enqueueOfflineAction("submitSrsReview", payload);
    return { queued: true };
  }
}

/**
 * Helper to log focus timer session: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function logSession(payload: LogSessionPayload): Promise<{ queued: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("logSession", payload);
    return { queued: true };
  }
  try {
    await sessionsApi.log(payload);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    return { queued: false };
  } catch (error) {
    console.warn("[offlineSync] logSession failed, queuing offline:", error);
    enqueueOfflineAction("logSession", payload);
    return { queued: true };
  }
}

/**
 * Helper to toggle task completion: attempts online execution first;
 * if offline or on network error, enqueues to offline queue.
 */
export async function toggleTask(payload: ToggleTaskPayload): Promise<{ queued: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueOfflineAction("toggleTask", payload);
    return { queued: true };
  }
  try {
    await tasksApi.toggle(payload.id, payload.currentStatus);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    return { queued: false };
  } catch (error) {
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
  const queueSize = useOfflineQueueSize();
  const [isSyncing, setIsSyncing] = useState<boolean>(() => isCurrentlySyncing());

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
    isSyncing,
    syncNow,
  };
}

/**
 * Hook returning comprehensive offline queue state and management actions.
 */
export function useOfflineQueue() {
  const queue = useOfflineQueueData();
  const queueSize = queue.length;
  const [isSyncing, setIsSyncing] = useState<boolean>(() => isCurrentlySyncing());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleSyncChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isSyncing: boolean }>).detail;
      setIsSyncing(detail?.isSyncing ?? isCurrentlySyncing());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_SYNC_STATE_EVENT, handleSyncChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_SYNC_STATE_EVENT, handleSyncChange);
    };
  }, []);

  const flushQueue = useCallback(async () => {
    return flushOfflineQueue();
  }, []);

  return {
    queue,
    queueSize,
    isSyncing,
    isOnline,
    flushQueue,
    enqueueAction: enqueueOfflineAction,
  };
}

// Auto-register online listeners if running in a browser environment
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushOfflineQueue();
  });
}
