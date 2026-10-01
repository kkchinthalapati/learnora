import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard } from "../api/types";
import type { OfflineAction, SrsReviewPayload } from "./offlineSync";
import {
  applyPendingReviews,
  applyReviewToCard,
  clearOfflineCards,
  DAILY_DRILL_ID,
  deckFromSnapshot,
  imagePathsFor,
  loadOfflineImage,
  loadOfflineSnapshot,
  recordOfflineGrade,
  saveOfflineSnapshot,
  selectOfflineCards,
  setOfflineKVForTests,
  syncOfflineImages,
  type OfflineKV,
} from "./offlineCards";

/** A Map-backed stand-in for IndexedDB — the logic above storage is what is
 *  under test here; the real IndexedDB adapter is exercised by the offline
 *  Playwright run (tests/offline). */
function memoryKV(): OfflineKV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const k = (store: string, key: string) => `${store}/${key}`;
  return {
    data,
    get: async <T,>(store: string, key: string) => data.get(k(store, key)) as T | undefined,
    put: async (store, key, value) => void data.set(k(store, key), value),
    delete: async (store, key) => void data.delete(k(store, key)),
    keys: async (store) =>
      [...data.keys()].filter((key) => key.startsWith(`${store}/`)).map((key) => key.slice(store.length + 1)),
    clear: async () => data.clear(),
  };
}

function card(patch: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "c1",
    user_id: "u1",
    deck_id: "d1",
    front: "Q",
    back: "A",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: "2026-09-01T00:00:00Z",
    ...patch,
  };
}

const NOW = new Date("2026-09-29T12:00:00Z");
const REVIEW: SrsReviewPayload = {
  cardId: "c1",
  nextReviewDate: "2026-10-03T00:00:00.000Z",
  interval: 4,
  ease: 2.6,
  stability: 4.1,
  difficulty: 5,
  reviewedAt: "2026-09-29T12:05:00.000Z",
};

function queued(review: SrsReviewPayload): OfflineAction {
  return { id: `q-${review.cardId}`, type: "submitSrsReview", payload: review, timestamp: 1, retryCount: 0 };
}

describe("offlineCards — pure helpers", () => {
  it("keeps cards due now or within the horizon, soonest first, capped", () => {
    const cards = [
      card({ id: "later", next_review_date: "2026-10-05T00:00:00Z" }),
      card({ id: "tomorrow", next_review_date: "2026-09-30T09:00:00Z" }),
      card({ id: "new", next_review_date: null }),
      card({ id: "overdue", next_review_date: "2026-09-20T00:00:00Z" }),
    ];
    expect(selectOfflineCards(cards, NOW).map((c) => c.id)).toEqual(["new", "overdue", "tomorrow"]);
    expect(selectOfflineCards(cards, NOW, 48, 2).map((c) => c.id)).toEqual(["new", "overdue"]);
  });

  it("applies a review to a card, including its memory state and time", () => {
    expect(applyReviewToCard(card(), REVIEW)).toMatchObject({
      next_review_date: REVIEW.nextReviewDate,
      srs_interval: 4,
      ease_factor: 2.6,
      stability: 4.1,
      difficulty: 5,
      last_reviewed_at: REVIEW.reviewedAt,
    });
  });

  it("lays queued reviews over fresh server cards", () => {
    const fresh = [card({ id: "c1" }), card({ id: "c2" })];
    const out = applyPendingReviews(fresh, [
      queued(REVIEW),
      { id: "x", type: "toggleTask", payload: { id: 1, currentStatus: false }, timestamp: 1, retryCount: 0 },
    ]);
    expect(out[0].next_review_date).toBe(REVIEW.nextReviewDate);
    expect(out[1]).toBe(fresh[1]);
  });

  it("lets a newer server review beat an older queued one", () => {
    const serverNewer = card({ last_reviewed_at: "2026-09-29T13:00:00.000Z", next_review_date: "2026-10-09T00:00:00Z" });
    expect(applyPendingReviews([serverNewer], [queued(REVIEW)])[0]).toBe(serverNewer);
  });

  it("collects each image path once, in card order, capped", () => {
    const cards = [
      card({ front_image_path: "u1/a.png", back_image_path: "u1/b.png" }),
      card({ id: "c2", front_image_path: "u1/a.png" }),
      card({ id: "c3", back_image_path: "u1/c.png" }),
    ];
    expect(imagePathsFor(cards)).toEqual(["u1/a.png", "u1/b.png", "u1/c.png"]);
    expect(imagePathsFor(cards, 2)).toEqual(["u1/a.png", "u1/b.png"]);
  });

  it("finds one deck's cards, or every card for the daily drill", () => {
    const snapshot = {
      userId: "u1",
      savedAt: NOW.toISOString(),
      decks: [{ id: "d1", title: "Enzymes", folder_id: null }],
      cards: [card({ id: "a", deck_id: "d1" }), card({ id: "b", deck_id: "d2" })],
    };
    expect(deckFromSnapshot(snapshot, "d1")?.cards.map((c) => c.id)).toEqual(["a"]);
    expect(deckFromSnapshot(snapshot, "d1")?.deck.title).toBe("Enzymes");
    expect(deckFromSnapshot(snapshot, "missing")).toBeNull();
    expect(deckFromSnapshot(snapshot, DAILY_DRILL_ID)?.cards).toHaveLength(2);
  });
});

describe("offlineCards — storage", () => {
  let store: ReturnType<typeof memoryKV>;

  beforeEach(() => {
    store = memoryKV();
    setOfflineKVForTests(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a student's snapshot", async () => {
    expect(await saveOfflineSnapshot("u1", [{ id: "d1", title: "Enzymes", folder_id: null }], [card()], NOW)).toBe(true);
    const snapshot = await loadOfflineSnapshot("u1");
    expect(snapshot?.savedAt).toBe(NOW.toISOString());
    expect(snapshot?.cards).toHaveLength(1);
  });

  it("never hands one student another's copy", async () => {
    await saveOfflineSnapshot("u1", [], [card()]);
    expect(await loadOfflineSnapshot("u2")).toBeNull();
    // Even if a record were filed under the wrong key.
    await store.put("snapshots", "u2", { userId: "u1", savedAt: "", decks: [], cards: [] });
    expect(await loadOfflineSnapshot("u2")).toBeNull();
  });

  it("applies an offline grade so the card is no longer due", async () => {
    await saveOfflineSnapshot("u1", [], [card(), card({ id: "c2" })]);
    expect(await recordOfflineGrade("u1", REVIEW)).toBe(true);
    const snapshot = await loadOfflineSnapshot("u1");
    expect(snapshot?.cards[0].next_review_date).toBe(REVIEW.nextReviewDate);
    expect(snapshot?.cards[1].next_review_date).toBeNull();
    expect(await recordOfflineGrade("nobody", REVIEW)).toBe(false);
  });

  it("keeps images within the byte cap, reuses stored ones, and prunes the rest", async () => {
    await store.put("images", "u1\u0000old.png", new Blob(["x"]));
    await store.put("images", "u2\u0000theirs.png", new Blob(["x"]));
    const download = vi.fn(async (path: string) =>
      path === "broken.png" ? Promise.reject(new Error("404")) : new Blob(["x".repeat(path === "big.png" ? 50 : 10)]),
    );

    const saved = await syncOfflineImages("u1", ["a.png", "broken.png", "big.png", "b.png"], download, 25);

    expect(saved).toBe(2); // a + b; broken failed, big would pass the cap
    expect(await loadOfflineImage("u1", "a.png")).not.toBeNull();
    expect(await loadOfflineImage("u1", "big.png")).toBeNull();
    expect(await loadOfflineImage("u1", "old.png")).toBeNull(); // pruned
    expect(await loadOfflineImage("u2", "theirs.png")).not.toBeNull(); // not ours to prune

    download.mockClear();
    await syncOfflineImages("u1", ["a.png"], download, 25);
    expect(download).not.toHaveBeenCalled();
  });

  it("clears everything on sign-out", async () => {
    await saveOfflineSnapshot("u1", [], [card()]);
    await store.put("images", "u1\u0000a.png", new Blob(["x"]));
    await clearOfflineCards();
    expect(store.data.size).toBe(0);
  });
});

describe("offlineCards — blocked or broken storage falls back to online-only", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing, without throwing, when storage is unavailable", async () => {
    setOfflineKVForTests(null);
    expect(await saveOfflineSnapshot("u1", [], [card()])).toBe(false);
    expect(await loadOfflineSnapshot("u1")).toBeNull();
    expect(await recordOfflineGrade("u1", REVIEW)).toBe(false);
    expect(await syncOfflineImages("u1", ["a.png"], async () => new Blob(["x"]))).toBe(0);
    expect(await loadOfflineImage("u1", "a.png")).toBeNull();
    await expect(clearOfflineCards()).resolves.toBeUndefined();
  });

  it("swallows a storage that throws (quota, private mode)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: OfflineKV = {
      get: () => Promise.reject(new DOMException("denied", "SecurityError")),
      put: () => Promise.reject(new DOMException("full", "QuotaExceededError")),
      delete: () => Promise.reject(new Error("x")),
      keys: () => Promise.reject(new Error("x")),
      clear: () => Promise.reject(new Error("x")),
    };
    setOfflineKVForTests(failing);
    expect(await saveOfflineSnapshot("u1", [], [card()])).toBe(false);
    expect(await loadOfflineSnapshot("u1")).toBeNull();
    await expect(clearOfflineCards()).resolves.toBeUndefined();
  });

  it("reports no storage when this browser has no IndexedDB (jsdom)", async () => {
    // The real adapter, not a stand-in: jsdom ships no indexedDB.
    vi.resetModules();
    const fresh = await import("./offlineCards");
    expect(typeof indexedDB).toBe("undefined");
    expect(await fresh.saveOfflineSnapshot("u1", [], [card()])).toBe(false);
    expect(await fresh.loadOfflineSnapshot("u1")).toBeNull();
  });
});
