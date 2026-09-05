import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Flashcard, FlashcardDeck } from "../../api/types";
import { DeckCardsView } from "./DeckCardsView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function deck(overrides: Partial<FlashcardDeck> = {}): FlashcardDeck {
  return {
    id: "deck-1",
    user_id: "user-1",
    folder_id: "folder-1",
    title: "Mitosis basics",
    created_at: "2026-03-06T00:00:00.000Z",
    ...overrides,
  };
}

function card(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "card-1",
    user_id: "user-1",
    deck_id: "deck-1",
    front: "What is prophase?",
    back: "The first stage of mitosis.",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: "2026-03-06T00:00:00.000Z",
    ...overrides,
  };
}

function serve({
  decks = [deck()],
  cards = [card()],
}: { decks?: FlashcardDeck[]; cards?: Flashcard[] } = {}) {
  server.use(
    http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
    http.get(rest("flashcards"), () => HttpResponse.json(cards)),
  );
}

function renderView(deckId = "deck-1") {
  return renderWithAuth(
    <Routes>
      <Route path="/decks/:deckId" element={<DeckCardsView />} />
    </Routes>,
    { session: fakeSession() },
    { withRouter: true, initialEntries: [`/decks/${deckId}`] },
  );
}

beforeEach(() => {
  mockAuthSession();
});

describe("DeckCardsView", () => {
  it("lists the deck's cards with both sides and its schedule", async () => {
    serve({
      cards: [
        card(),
        card({
          id: "card-2",
          front: "What is anaphase?",
          back: "Sister chromatids separate.",
        }),
      ],
    });
    renderView();

    expect(await screen.findByText("Mitosis basics")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
    expect(screen.getByText("What is prophase?")).toBeInTheDocument();
    expect(
      screen.getByText("The first stage of mitosis."),
    ).toBeInTheDocument();
    expect(screen.getByText("What is anaphase?")).toBeInTheDocument();
    expect(screen.getAllByText("New — not reviewed yet")).toHaveLength(2);
  });

  it("adds a card the student writes themselves", async () => {
    serve({ cards: [] });
    let posted: unknown = null;
    server.use(
      http.post(rest("flashcards"), async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json([
          card({ id: "card-new", front: "Q", back: "A" }),
        ]);
      }),
    );
    renderView();

    const user = userEvent.setup();
    expect(await screen.findByText("This deck is empty.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Write a card" }));
    await user.type(screen.getByLabelText("Front"), "What is telophase?");
    await user.type(screen.getByLabelText("Back"), "Nuclei re-form.");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    await waitFor(() => expect(posted).not.toBeNull());
  });

  it("refuses to save a card with an empty side", async () => {
    serve({ cards: [] });
    renderView();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Write a card" }));
    await user.type(screen.getByLabelText("Front"), "Only a front");

    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  });

  it("edits a card without touching its scheduling columns", async () => {
    serve();
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(rest("flashcards"), async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([card({ front: "Edited front" })]);
      }),
    );
    renderView();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Edit card: What is prophase?",
      }),
    );

    const front = screen.getByLabelText("Front");
    await user.clear(front);
    await user.type(front, "Edited front");
    await user.click(screen.getByRole("button", { name: "Save card" }));

    await waitFor(() => expect(patched).not.toBeNull());
    /* A typo fix is not evidence about recall — rewriting the text must not
       reschedule the card. */
    expect(patched).toEqual({ front: "Edited front", back: card().back });
  });

  it("deletes a single card, leaving the rest of the deck alone", async () => {
    serve({
      cards: [card(), card({ id: "card-2", front: "What is anaphase?" })],
    });
    let deleted = false;
    server.use(
      http.delete(rest("flashcards"), () => {
        deleted = true;
        return HttpResponse.json([]);
      }),
    );
    renderView();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Delete card: What is prophase?",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it("says so when the deck has been deleted elsewhere", async () => {
    serve({ decks: [] });
    renderView("deck-gone");

    expect(
      await screen.findByText("This deck no longer exists."),
    ).toBeInTheDocument();
  });
});
