import type { Flashcard, FlashcardDeck } from "../api/types";
import type { OfflineAction, SrsReviewPayload } from "./offlineSync";

/* The flashcards a student can review with no connection.
 *
 * While online, the app keeps a per-student copy of the cards that are due
 * (or fall due within the next two days) and the decks they belong to, plus
 * a capped handful of their images, in IndexedDB. The review screen reads it
 * only when the network can't answer; grading offline goes through the
 * existing replay queue (lib/offlineSync.ts), and each grade is also applied
 * to this copy so a graded card stops showing as due.
 *
 * Deliberately not the service worker's HTTP cache. Card text and images are
 * one student's private data behind their session; stored here they are
 * keyed to that student, checked against the signed-in id on every read, and
 * wiped on sign-out (context/AuthProvider.tsx). The worker only ever caches
 * the app's own static files.
 *
 * Every storage call is wrapped: private browsing, a full disk or a blocked
 * IndexedDB turns this into a no-op and the app is simply online-only. */

export interface OfflineDeck {
  id: string;
  title: string;
  folder_id: string | null;
}

export interface OfflineSnapshot {
  userId: string;
  savedAt: string;
  decks: OfflineDeck[];
  cards: Flashcard[];
}

/** How far ahead the copy reaches: a student who loses signal tonight still
 *  has tomorrow's cards. */
export const OFFLINE_HORIZON_HOURS = 48;
export const MAX_OFFLINE_CARDS = 500;
/** Images are the expensive part, so they are capped by count and by bytes;
 *  a card whose image did not fit shows its text, as it does whenever an
 *  image fails to load. */
export const MAX_OFFLINE_IMAGES = 40;
export const MAX_OFFLINE_IMAGE_BYTES = 15 * 1024 * 1024;
export const DAILY_DRILL_ID = "daily-drill";

/* ── Storage ─────────────────────────────────────────────────────────────── */

type StoreName = "snapshots" | "images";

/** The four operations this module needs, so tests can supply a Map and the
 *  logic above them is tested without a browser. */
export interface OfflineKV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  clear(): Promise<void>;
}

const DB_NAME = "learnora-offline";
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openIndexedDb(): Promise<OfflineKV | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        for (const name of ["snapshots", "images"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        const tx = (store: StoreName, mode: IDBTransactionMode) =>
          db.transaction(store, mode).objectStore(store);
        resolve({
          get: <T,>(store: StoreName, key: string) =>
            request(tx(store, "readonly").get(key)) as Promise<T | undefined>,
          put: async (store, key, value) => {
            await request(tx(store, "readwrite").put(value, key));
          },
          delete: async (store, key) => {
            await request(tx(store, "readwrite").delete(key));
          },
          keys: async (store) =>
            (await request(tx(store, "readonly").getAllKeys())).map(String),
          clear: async () => {
            await request(tx("snapshots", "readwrite").clear());
            await request(tx("images", "readwrite").clear());
          },
        });
      };
    } catch {
      resolve(null);
    }
  });
}

let kvPromise: Promise<OfflineKV | null> | null = null;

function kv(): Promise<OfflineKV | null> {
  kvPromise ??= openIndexedDb();
  return kvPromise;
}

/** Tests swap in an in-memory store (or `null`, for blocked storage). */
export function setOfflineKVForTests(store: OfflineKV | null): void {
  kvPromise = Promise.resolve(store);
}

/** Runs `fn` against storage, or returns `fallback` when storage is missing
 *  or throws — the one place that turns storage trouble into "online-only". */
async function withStore<T>(
  fallback: T,
  fn: (store: OfflineKV) => Promise<T>,
): Promise<T> {
  try {
    const store = await kv();
    if (!store) return fallback;
    return await fn(store);
  } catch (err) {
    console.warn("[offlineCards] storage unavailable:", err);
    return fallback;
  }
}

/* ── Pure helpers ────────────────────────────────────────────────────────── */

/** Due now or within the horizon, soonest first, capped. NULL is "due now". */
export function selectOfflineCards(
  cards: Flashcard[],
  now: Date = new Date(),
  horizonHours = OFFLINE_HORIZON_HOURS,
  max = MAX_OFFLINE_CARDS,
): Flashcard[] {
  const limit = now.getTime() + horizonHours * 3_600_000;
  return cards
    .filter(
      (c) => !c.next_review_date || new Date(c.next_review_date).getTime() <= limit,
    )
    .sort((a, b) => (a.next_review_date ?? "").localeCompare(b.next_review_date ?? ""))
    .slice(0, max);
}

/** A card as it will be once this review lands. */
export function applyReviewToCard(card: Flashcard, review: SrsReviewPayload): Flashcard {
  return {
    ...card,
    next_review_date: review.nextReviewDate,
    srs_interval: review.interval,
    ease_factor: review.ease,
    ...(typeof review.stability === "number" ? { stability: review.stability } : {}),
    ...(typeof review.difficulty === "number" ? { difficulty: review.difficulty } : {}),
    ...(review.reviewedAt ? { last_reviewed_at: review.reviewedAt } : {}),
  };
}

/** Reviews still waiting in the queue, laid over fresh server cards — a copy
 *  refreshed before the queue has drained must not show a card the student
 *  already graded as due again. */
export function applyPendingReviews(
  cards: Flashcard[],
  queue: OfflineAction[],
): Flashcard[] {
  const pending = new Map<string, SrsReviewPayload>();
  for (const action of queue) {
    if (action.type !== "submitSrsReview") continue;
    const review = action.payload as SrsReviewPayload;
    pending.set(review.cardId, review);
  }
  if (pending.size === 0) return cards;
  return cards.map((card) => {
    const review = pending.get(card.id);
    if (!review) return card;
    if (
      review.reviewedAt &&
      card.last_reviewed_at &&
      card.last_reviewed_at >= review.reviewedAt
    ) {
      return card; // the server already has a newer review of this card
    }
    return applyReviewToCard(card, review);
  });
}

/** The image paths worth keeping for these cards, in card order. */
export function imagePathsFor(cards: Flashcard[], max = MAX_OFFLINE_IMAGES): string[] {
  const paths: string[] = [];
  for (const card of cards) {
    for (const path of [card.front_image_path, card.back_image_path]) {
      if (path && !paths.includes(path)) paths.push(path);
    }
  }
  return paths.slice(0, max);
}

/** What the review screen needs for one deck, or for the daily drill —
 *  offline, the drill is every stored card across every deck (the review
 *  screen keeps only the ones actually due), since it is the one entry
 *  point that needs no deck list from the network. */
export function deckFromSnapshot(
  snapshot: OfflineSnapshot,
  deckId: string,
): { deck: OfflineDeck; cards: Flashcard[] } | null {
  if (deckId === DAILY_DRILL_ID) {
    return {
      deck: { id: DAILY_DRILL_ID, title: "Your due cards", folder_id: null },
      cards: snapshot.cards,
    };
  }
  const deck = snapshot.decks.find((d) => d.id === deckId);
  if (!deck) return null;
  return { deck, cards: snapshot.cards.filter((c) => c.deck_id === deckId) };
}

/* ── Snapshot ────────────────────────────────────────────────────────────── */

const imageKey = (userId: string, path: string) => `${userId}\u0000${path}`;

export async function saveOfflineSnapshot(
  userId: string,
  decks: Pick<FlashcardDeck, "id" | "title" | "folder_id">[],
  cards: Flashcard[],
  now: Date = new Date(),
): Promise<boolean> {
  const snapshot: OfflineSnapshot = {
    userId,
    savedAt: now.toISOString(),
    decks: decks.map((d) => ({ id: d.id, title: d.title, folder_id: d.folder_id ?? null })),
    cards,
  };
  return withStore(false, async (store) => {
    await store.put("snapshots", userId, snapshot);
    return true;
  });
}

/** The signed-in student's copy, or null. A copy that names another student
 *  is never returned, whatever key it was found under. */
export async function loadOfflineSnapshot(userId: string): Promise<OfflineSnapshot | null> {
  return withStore(null, async (store) => {
    const snapshot = await store.get<OfflineSnapshot>("snapshots", userId);
    return snapshot && snapshot.userId === userId && Array.isArray(snapshot.cards)
      ? snapshot
      : null;
  });
}

/** Apply one grade to the stored copy, so the card is no longer due there. */
export async function recordOfflineGrade(
  userId: string,
  review: SrsReviewPayload,
): Promise<boolean> {
  return withStore(false, async (store) => {
    const snapshot = await store.get<OfflineSnapshot>("snapshots", userId);
    if (!snapshot || snapshot.userId !== userId) return false;
    const cards = snapshot.cards.map((c) =>
      c.id === review.cardId ? applyReviewToCard(c, review) : c,
    );
    await store.put("snapshots", userId, { ...snapshot, cards });
    return true;
  });
}

/* ── Images ──────────────────────────────────────────────────────────────── */

/**
 * Keep the images for `paths`, drop this student's others. Best-effort and
 * bounded: an image that fails, or would pass the byte cap, is skipped.
 * `download` turns a storage path into its bytes (a signed URL fetch).
 */
export async function syncOfflineImages(
  userId: string,
  paths: string[],
  download: (path: string) => Promise<Blob>,
  maxBytes = MAX_OFFLINE_IMAGE_BYTES,
): Promise<number> {
  return withStore(0, async (store) => {
    const wanted = new Set(paths.map((p) => imageKey(userId, p)));
    const existing = await store.keys("images");
    for (const key of existing) {
      if (key.startsWith(`${userId}\u0000`) && !wanted.has(key)) {
        await store.delete("images", key);
      }
    }

    let used = 0;
    let saved = 0;
    for (const path of paths) {
      const key = imageKey(userId, path);
      const have = await store.get<Blob>("images", key);
      if (have) {
        used += have.size;
        saved += 1;
        continue;
      }
      try {
        const blob = await download(path);
        if (used + blob.size > maxBytes) continue;
        await store.put("images", key, blob);
        used += blob.size;
        saved += 1;
      } catch {
        /* Skipped: this card shows its text offline. */
      }
    }
    return saved;
  });
}

export async function loadOfflineImage(userId: string, path: string): Promise<Blob | null> {
  return withStore(null, async (store) => {
    const blob = await store.get<Blob>("images", imageKey(userId, path));
    return blob ?? null;
  });
}

/** Wipe every student's offline copy. Run on sign-out and account switch. */
export async function clearOfflineCards(): Promise<void> {
  await withStore(undefined, async (store) => {
    await store.clear();
  });
}
