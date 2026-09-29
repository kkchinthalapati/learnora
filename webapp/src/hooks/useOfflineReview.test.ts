import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import {
  loadOfflineImage,
  loadOfflineSnapshot,
  setOfflineKVForTests,
  type OfflineKV,
} from "../lib/offlineCards";
import { clearOfflineQueue, enqueueOfflineAction, getOfflineQueue } from "../lib/offlineSync";
import {
  prepareOffline,
  refreshOfflineCopy,
  resetOfflineReviewSyncForTests,
  warmOfflineShell,
} from "./useOfflineReview";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function memoryKV(): OfflineKV {
  const data = new Map<string, unknown>();
  const k = (store: string, key: string) => `${store}/${key}`;
  return {
    get: async <T,>(store: string, key: string) => data.get(k(store, key)) as T | undefined,
    put: async (store, key, value) => void data.set(k(store, key), value),
    delete: async (store, key) => void data.delete(k(store, key)),
    keys: async (store) =>
      [...data.keys()].filter((x) => x.startsWith(`${store}/`)).map((x) => x.slice(store.length + 1)),
    clear: async () => data.clear(),
  };
}

const CARD = {
  id: "c-1",
  user_id: "user-1",
  deck_id: "d-1",
  front: "Q",
  back: "A",
  next_review_date: null,
  srs_interval: 0,
  ease_factor: 2.5,
  front_image_path: "user-1/cell.png",
  created_at: "2026-09-01T00:00:00Z",
};

describe("offline review sync", () => {
  beforeEach(() => {
    localStorage.clear();
    clearOfflineQueue();
    resetOfflineReviewSyncForTests();
    setOfflineKVForTests(memoryKV());
    mockAuthSession("user-1");
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    server.use(
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([{ id: "d-1", user_id: "user-1", folder_id: null, title: "Cells", created_at: "" }]),
      ),
      http.get(rest("flashcards"), () => HttpResponse.json([CARD])),
      http.post(`${SUPABASE_URL}/storage/v1/object/sign/card-media/*`, () =>
        HttpResponse.json({ signedURL: "/object/sign/card-media/user-1/cell.png?token=t" }),
      ),
      http.get(`${SUPABASE_URL}/storage/v1/object/sign/card-media/*`, () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the due cards, their decks and their images for this student", async () => {
    expect(await refreshOfflineCopy("user-1")).toBe(true);

    const snapshot = await loadOfflineSnapshot("user-1");
    expect(snapshot?.decks).toEqual([{ id: "d-1", title: "Cells", folder_id: null }]);
    expect(snapshot?.cards.map((c) => c.id)).toEqual(["c-1"]);
    const image = await loadOfflineImage("user-1", "user-1/cell.png");
    expect(image?.size).toBe(4);
  });

  it("keeps a still-queued grade on top of the fresh server copy", async () => {
    enqueueOfflineAction("submitSrsReview", {
      cardId: "c-1",
      nextReviewDate: "2026-10-05T00:00:00.000Z",
      interval: 6,
      ease: 2.6,
      reviewedAt: "2026-09-29T08:00:00.000Z",
    });
    await refreshOfflineCopy("user-1");
    const snapshot = await loadOfflineSnapshot("user-1");
    expect(snapshot?.cards[0].next_review_date).toBe("2026-10-05T00:00:00.000Z");
  });

  it("drains the queue before refreshing the copy", async () => {
    const order: string[] = [];
    server.use(
      http.patch(rest("flashcards"), () => {
        order.push("sync review");
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(rest("flashcards"), () => {
        order.push("fetch due cards");
        return HttpResponse.json([CARD]);
      }),
    );
    enqueueOfflineAction("submitSrsReview", {
      cardId: "c-1",
      nextReviewDate: "2026-10-05T00:00:00.000Z",
      interval: 6,
      ease: 2.6,
      reviewedAt: "2026-09-29T08:00:00.000Z",
    });

    await prepareOffline("user-1", true);

    expect(order).toEqual(["sync review", "fetch due cards"]);
    expect(getOfflineQueue()).toHaveLength(0);
    expect(await loadOfflineSnapshot("user-1")).not.toBeNull();
  });

  it("does nothing while offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    await prepareOffline("user-1", true);
    expect(await loadOfflineSnapshot("user-1")).toBeNull();
  });

  it("skips warming the worker where there is no service worker", async () => {
    expect(await warmOfflineShell()).toBe(false);
  });
});
