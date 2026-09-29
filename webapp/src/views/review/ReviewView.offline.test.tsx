import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { ChatProvider } from "../../context/ChatProvider";
import type { Flashcard } from "../../api/types";
import {
  loadOfflineSnapshot,
  saveOfflineSnapshot,
  setOfflineKVForTests,
  type OfflineKV,
} from "../../lib/offlineCards";
import {
  clearOfflineQueue,
  getOfflineQueue,
  type SrsReviewPayload,
} from "../../lib/offlineSync";
import { ReviewView } from "./ReviewView";

/* Flashcard review with no connection: the deck and its due cards come from
 * the device's offline copy, and a grade is queued durably (and applied to
 * that copy) instead of waiting in memory for a network that isn't there. */

function memoryKV(): OfflineKV {
  const data = new Map<string, unknown>();
  const k = (store: string, key: string) => `${store}/${key}`;
  return {
    get: async <T,>(store: string, key: string) => data.get(k(store, key)) as T | undefined,
    put: async (store, key, value) => void data.set(k(store, key), value),
    delete: async (store, key) => void data.delete(k(store, key)),
    keys: async (store) => [...data.keys()].filter((x) => x.startsWith(`${store}/`)),
    clear: async () => data.clear(),
  };
}

function card(patch: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "c-1",
    user_id: "user-1",
    deck_id: "d-1",
    front: "What is a mitochondrion?",
    back: "The powerhouse of the cell.",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, writable: true, configurable: true });
  onlineManager.setOnline(online);
}

function renderReview(deckId = "d-1") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[`/review/${deckId}`]}>
      <ChatProvider>
        <Routes>
          <Route path="/review/:deckId" element={<ReviewView />} />
          <Route path="/library/flashcards" element={<h1>Flashcards tab</h1>} />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("ReviewView offline", () => {
  beforeEach(() => {
    localStorage.clear();
    clearOfflineQueue();
    mockAuthSession("user-1");
    setOfflineKVForTests(memoryKV());
    setOnline(false);
  });

  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it("reviews a saved deck with no connection and queues the grade", async () => {
    await saveOfflineSnapshot(
      "user-1",
      [{ id: "d-1", title: "Cell Biology", folder_id: null }],
      [card(), card({ id: "c-2", front: "Q2", back: "A2" })],
    );
    const user = userEvent.setup();
    renderReview();

    expect(await screen.findByText("Cell Biology")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start review" }));
    await user.click(await screen.findByRole("button", { name: "Flip card to see the answer" }));
    await user.click(screen.getByRole("button", { name: "Good (3)" }));

    expect(await screen.findByText("Q2")).toBeInTheDocument();

    await waitFor(() => expect(getOfflineQueue()).toHaveLength(1));
    const queued = getOfflineQueue()[0];
    expect(queued.type).toBe("submitSrsReview");
    expect(queued.payload).toMatchObject({ cardId: "c-1", interval: 3 });
    expect((queued.payload as SrsReviewPayload).reviewedAt).toMatch(/^\d{4}-/);

    // The device's copy learns the grade, so the card isn't due there any more.
    await waitFor(async () => {
      const snapshot = await loadOfflineSnapshot("user-1");
      expect(snapshot?.cards.find((c) => c.id === "c-1")?.next_review_date).not.toBeNull();
    });
  });

  it("offers every saved due card through the daily drill", async () => {
    await saveOfflineSnapshot(
      "user-1",
      [],
      [
        card({ id: "a", deck_id: "d-1", front: "Due A" }),
        card({ id: "b", deck_id: "d-2", front: "Due B" }),
        card({ id: "later", deck_id: "d-2", front: "Tomorrow", next_review_date: new Date(Date.now() + 86_400_000).toISOString() }),
      ],
    );
    renderReview("daily-drill");

    expect(await screen.findByText("Your due cards")).toBeInTheDocument();
    expect(screen.getByText("2 cards are due.")).toBeInTheDocument();
  });

  it("says plainly when a deck isn't saved on this device", async () => {
    renderReview("d-unknown");
    expect(
      await screen.findByText("This deck isn't saved for offline review"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review your saved cards" })).toHaveAttribute(
      "href",
      "/review/daily-drill",
    );
  });

  it("still works, online-only, when this browser blocks offline storage", async () => {
    setOfflineKVForTests(null);
    renderReview();
    expect(
      await screen.findByText("This deck isn't saved for offline review"),
    ).toBeInTheDocument();
  });
});
