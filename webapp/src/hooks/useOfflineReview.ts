import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { decksApi } from "../api/decks";
import { flashcardsApi } from "../api/flashcards";
import { useOptionalAuth } from "../context/auth";
import {
  applyPendingReviews,
  deckFromSnapshot,
  imagePathsFor,
  loadOfflineSnapshot,
  OFFLINE_HORIZON_HOURS,
  saveOfflineSnapshot,
  syncOfflineImages,
} from "../lib/offlineCards";
import { flushOfflineQueue, getOfflineQueue } from "../lib/offlineSync";

/* Keeping offline review ready, and reading it back.
 *
 * `useOfflineReviewSync` runs on the signed-in shell: whenever the app is
 * online (on start, on reconnect, on coming back to the tab) it first drains
 * the review queue — so the server has every offline grade — then refreshes
 * the student's offline copy of their due cards, then asks the service
 * worker to hold the files the review screen needs. That order matters: a
 * copy taken before the queue drains would bring graded cards back as due. */

/** A refresh at most this often; coming back to the tab repeatedly or a
 *  flapping connection must not refetch the deck list each time. */
const REFRESH_EVERY_MS = 10 * 60 * 1000;
let lastRefresh = { userId: "", at: 0 };
let running: Promise<void> | null = null;

async function downloadImage(path: string): Promise<Blob> {
  const url = await flashcardsApi.getImageUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image ${response.status}`);
  return response.blob();
}

/** Fetch the due cards and decks and store them for offline review. */
export async function refreshOfflineCopy(userId: string, now = new Date()): Promise<boolean> {
  const horizon = new Date(now.getTime() + OFFLINE_HORIZON_HOURS * 3_600_000);
  const [decks, cards] = await Promise.all([
    decksApi.fetchAll(),
    flashcardsApi.fetchDueBefore(horizon.toISOString()),
  ]);
  const withPending = applyPendingReviews(cards, getOfflineQueue());
  const saved = await saveOfflineSnapshot(userId, decks, withPending, now);
  if (saved) await syncOfflineImages(userId, imagePathsFor(withPending), downloadImage);
  return saved;
}

/**
 * Make sure the review screen's code is in the service worker's cache.
 *
 * The worker caches the app's files as the page fetches them, but it cannot
 * know the hashed names of a route nobody has opened yet, and the first page
 * load happens before it is in control at all. So: load the review route's
 * code now, then hand the worker every same-origin file this page has loaded
 * and let it keep them. Only static files are accepted on the other side.
 */
export async function warmOfflineShell(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }
    await import("../views/review/ReviewView");
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    const worker = registration?.active;
    if (!worker) return false;

    const base = new URL(import.meta.env.BASE_URL, window.location.href);
    const urls = new Set<string>();
    for (const entry of performance.getEntriesByType("resource")) urls.add(entry.name);
    document
      .querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
        "script[src], link[rel='stylesheet'][href], link[rel='modulepreload'][href]",
      )
      .forEach((el) => urls.add("src" in el ? el.src : el.href));
    const own = [...urls].filter((raw) => {
      try {
        const url = new URL(raw);
        return url.origin === base.origin && url.pathname.startsWith(base.pathname);
      } catch {
        return false;
      }
    });
    worker.postMessage({ type: "CACHE_URLS", urls: own });
    return true;
  } catch (err) {
    console.warn("[offlineReview] could not prepare the offline shell:", err);
    return false;
  }
}

/** Drain the queue, refresh the copy, warm the worker — in that order. */
export async function prepareOffline(userId: string, force = false): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const fresh =
    lastRefresh.userId === userId && Date.now() - lastRefresh.at < REFRESH_EVERY_MS;
  if (fresh && !force) return;
  if (running) return running;
  running = (async () => {
    try {
      await flushOfflineQueue().catch(() => undefined);
      await refreshOfflineCopy(userId);
      lastRefresh = { userId, at: Date.now() };
      await warmOfflineShell();
    } catch (err) {
      console.warn("[offlineReview] refresh failed; will retry later:", err);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Mounted once on the signed-in shell. */
export function useOfflineReviewSync(): void {
  const userId = useOptionalAuth()?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    /* After first paint and the screen's own requests, not competing with
       them. */
    const first = window.setTimeout(() => void prepareOffline(userId), 2500);
    const onOnline = () => void prepareOffline(userId, true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void prepareOffline(userId);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);
}

export const offlineReviewKeys = {
  deck: (userId: string, deckId: string) => ["offline-review", userId, deckId] as const,
};

/** The offline copy of one deck (or the daily drill). `null` when there is
 *  no copy of it on this device. Reads local storage only, so it runs with
 *  no connection — React Query would otherwise pause it offline. */
export function useOfflineReviewDeck(deckId: string, enabled: boolean) {
  const userId = useOptionalAuth()?.user?.id ?? "";
  return useQuery({
    queryKey: offlineReviewKeys.deck(userId, deckId),
    queryFn: async () => {
      const snapshot = await loadOfflineSnapshot(userId);
      if (!snapshot) return null;
      const found = deckFromSnapshot(snapshot, deckId);
      return found ? { ...found, savedAt: snapshot.savedAt } : null;
    },
    enabled: enabled && !!userId && !!deckId,
    networkMode: "always",
    retry: false,
    staleTime: Infinity,
  });
}

/** For tests: forget the refresh throttle. */
export function resetOfflineReviewSyncForTests(): void {
  lastRefresh = { userId: "", at: 0 };
  running = null;
}
