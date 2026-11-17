import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Flashcard } from "../../api/types";
import { APKG_MESSAGE, ImportCardsModal } from "./ImportCardsModal";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

const NEW_DECK = {
  id: "deck-new",
  user_id: "user-1",
  folder_id: null,
  title: "Spanish",
  created_at: "2026-11-01T00:00:00.000Z",
};

function renderModal(deck?: { id: string; title: string }) {
  return renderWithAuth(
    <Routes>
      <Route
        path="/library/flashcards"
        element={<ImportCardsModal open onClose={() => {}} deck={deck} />}
      />
      <Route path="/decks/:deckId" element={<p>Deck page</p>} />
    </Routes>,
    { session: fakeSession() },
    { withRouter: true, initialEntries: ["/library/flashcards"] },
  );
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText("Paste your cards"), {
    target: { value: text },
  });
}

beforeEach(() => {
  mockAuthSession();
});

describe("ImportCardsModal", () => {
  it("previews the parsed cards with the count and what was left out", async () => {
    renderModal();
    paste("hola\thello\nadios\tgoodbye\nhola\thello\n\tno front\n");

    expect(await screen.findByText("2 cards ready from Quizlet.")).toBeInTheDocument();
    expect(screen.getByText("hola")).toBeInTheDocument();
    expect(screen.getByText("goodbye")).toBeInTheDocument();
    expect(screen.getByText("1 row skipped (blank front or back).")).toBeInTheDocument();
    expect(screen.getByText("1 duplicate left out.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 2 cards" })).toBeDisabled();

    // The title is the last thing missing.
    await userEvent.setup().type(screen.getByLabelText("Set title"), "Spanish");
    expect(screen.getByRole("button", { name: "Import 2 cards" })).toBeEnabled();
  });

  it("creates the set and its cards, then opens it", async () => {
    let deckBody: unknown = null;
    let cardsBody: unknown = null;
    server.use(
      http.post(rest("flashcard_decks"), async ({ request }) => {
        deckBody = await request.json();
        return HttpResponse.json(NEW_DECK, { status: 201 });
      }),
      http.post(rest("flashcards"), async ({ request }) => {
        cardsBody = await request.json();
        return HttpResponse.json([], { status: 201 });
      }),
    );
    renderModal();
    const user = userEvent.setup();
    paste("#separator:tab\n#html:true\n#deck column:3\nhola [sound:a.mp3]\thello<br>hi\tSpanish\n");

    expect(await screen.findByText("1 card ready from Anki.")).toBeInTheDocument();
    expect(
      screen.getByText("1 card had images or sounds removed — they can't be imported."),
    ).toBeInTheDocument();
    // Prefilled from Anki's deck column.
    expect(screen.getByLabelText("Set title")).toHaveValue("Spanish");

    await user.click(screen.getByRole("button", { name: "Import 1 card" }));

    expect(await screen.findByText("Deck page")).toBeInTheDocument();
    expect(deckBody).toMatchObject([{ title: "Spanish", folder_id: null }]);
    expect(cardsBody).toEqual([
      { user_id: "user-1", deck_id: "deck-new", front: "hola", back: "hello\nhi" },
    ]);
  });

  it("removes the new set again when the cards can't be saved", async () => {
    let deleted = false;
    server.use(
      http.post(rest("flashcard_decks"), () => HttpResponse.json(NEW_DECK, { status: 201 })),
      http.post(rest("flashcards"), () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
      http.delete(rest("flashcard_decks"), ({ request }) => {
        deleted = new URL(request.url).searchParams.get("id") === "eq.deck-new";
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderModal();
    const user = userEvent.setup();
    paste("a\tb");
    await user.type(screen.getByLabelText("Set title"), "Set");
    await user.click(await screen.findByRole("button", { name: "Import 1 card" }));

    expect(await screen.findByText(/Nothing was imported\./)).toBeInTheDocument();
    expect(deleted).toBe(true);
    expect(screen.queryByText("Deck page")).not.toBeInTheDocument();
  });

  it("imports into an existing set, skipping cards it already has", async () => {
    const existing: Partial<Flashcard>[] = [
      { id: "c1", deck_id: "deck-1", user_id: "user-1", front: "a", back: "1" },
    ];
    let cardsBody: unknown = null;
    server.use(
      http.get(rest("flashcards"), () => HttpResponse.json(existing)),
      http.post(rest("flashcards"), async ({ request }) => {
        cardsBody = await request.json();
        return HttpResponse.json([], { status: 201 });
      }),
    );
    renderModal({ id: "deck-1", title: "Numbers" });
    paste("a\t1\nb\t2\n");

    expect(await screen.findByText("1 card ready from Quizlet.")).toBeInTheDocument();
    expect(screen.getByText("1 card already in this set left out.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Set title")).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Import 1 card" }));
    await waitFor(() =>
      expect(cardsBody).toEqual([
        { user_id: "user-1", deck_id: "deck-1", front: "b", back: "2" },
      ]),
    );
  });

  it("explains how to export from Anki when an .apkg is chosen", async () => {
    renderModal();
    const file = new File(["PK\u0003\u0004..."], "Spanish.apkg", {
      type: "application/octet-stream",
    });
    await userEvent.setup().upload(screen.getByLabelText("Choose a file to import"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(APKG_MESSAGE);
    expect(screen.queryByText(/ready from/)).not.toBeInTheDocument();
  });

  it("reads a chosen text file and titles the set after it", async () => {
    renderModal();
    const file = new File(["term,definition\nx,y\n"], "Bio_unit_2.csv", { type: "text/csv" });
    await userEvent.setup().upload(screen.getByLabelText("Choose a file to import"), file);

    expect(await screen.findByText("1 card ready from CSV/TSV.")).toBeInTheDocument();
    expect(screen.getByLabelText("Set title")).toHaveValue("Bio unit 2");
  });
});
