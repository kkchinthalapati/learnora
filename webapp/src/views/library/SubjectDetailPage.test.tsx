import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { FlashcardDeck, Folder, Material, Quiz } from "../../api/types";
import { SubjectDetailPage } from "./SubjectDetailPage";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/* useLibraryActions fires the actual delete from a setTimeout, not on
 * confirm — a 4s "Undo" window so a misclick doesn't cost a material/deck
 * outright. The setTimeout has to be *scheduled* under fake timers to be
 * advanceable — enabling them only after the fact leaves it running on the
 * real clock — so callers wrap the confirming click in
 * useFakeTimersForUndoWindow(), then call jumpPastUndoWindow() right after. */
function useFakeTimersForUndoWindow() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
}

function jumpPastUndoWindow() {
  act(() => {
    vi.advanceTimersByTime(4100);
  });
  vi.useRealTimers();
}

const biology: Folder = {
  id: "folder-1",
  user_id: "user-1",
  name: "Biology",
  color: "#4A90E2",
  created_at: "2026-03-04T00:00:00.000Z",
};

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    user_id: "user-1",
    folder_id: "folder-1",
    title: "Cell division",
    type: "pdf",
    raw_content: null,
    storage_path: null,
    created_at: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

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

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: "quiz-1",
    user_id: "user-1",
    material_id: "mat-1",
    folder_id: "folder-1",
    title: "Cell division quiz",
    questions_json: [],
    created_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

function serveSubject({
  folders = [biology] as Folder[],
  materials = [] as Material[],
  decks = [] as FlashcardDeck[],
  quizzes = [] as Quiz[],
  flashcards = [] as {
    id: string;
    deck_id: string;
    next_review_date?: string | null;
  }[],
} = {}) {
  server.use(
    http.get(rest("folders"), () => HttpResponse.json(folders)),
    http.get(rest("materials"), ({ request }) => {
      const folderId = new URL(request.url).searchParams
        .get("folder_id")
        ?.replace("eq.", "");
      return HttpResponse.json(
        folderId
          ? materials.filter((m) => m.folder_id === folderId)
          : materials,
      );
    }),
    http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
    http.get(rest("quizzes"), () => HttpResponse.json(quizzes)),
    http.get(rest("flashcards"), () => HttpResponse.json(flashcards)),
  );
}

function renderSubject(folderId = "folder-1") {
  return renderWithAuth(
    <Routes>
      <Route path="/folders/:folderId" element={<SubjectDetailPage />} />
      <Route path="/library" element={<h1>Library</h1>} />
      <Route path="/notes/:materialId" element={<h1>Notes editor</h1>} />
      <Route path="/review/:deckId" element={<h1>Deck review</h1>} />
      <Route path="/quiz/:quizId" element={<h1>Quiz runner</h1>} />
      <Route path="/timer" element={<h1>Timer view</h1>} />
    </Routes>,
    { session: fakeSession() },
    // The router lives above the create-dialog provider — see test/render.tsx.
    { initialEntries: [`/folders/${folderId}`], withTimer: true },
  );
}

const section = (name: string) =>
  screen.getByRole("heading", { name }).closest("section")!;

describe("SubjectDetailPage", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the subject name as workspace context below the shell heading", async () => {
    serveSubject();
    renderSubject();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Biology" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
  });

  it("shows only this folder's materials, decks and quizzes", async () => {
    serveSubject({
      materials: [
        material(),
        material({ id: "mat-2", folder_id: "folder-2", title: "Elsewhere" }),
      ],
      decks: [
        deck(),
        deck({ id: "deck-2", folder_id: "folder-2", title: "Other deck" }),
      ],
      quizzes: [
        quiz(),
        quiz({ id: "quiz-2", folder_id: "folder-2", title: "Other quiz" }),
      ],
    });
    renderSubject();

    expect(await screen.findByText("Cell division")).toBeInTheDocument();
    expect(screen.getByText("Mitosis basics")).toBeInTheDocument();
    expect(screen.getByText("Cell division quiz")).toBeInTheDocument();

    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
    expect(screen.queryByText("Other deck")).not.toBeInTheDocument();
    expect(screen.queryByText("Other quiz")).not.toBeInTheDocument();
  });

  it("shows a per-section empty state when a section has nothing in it", async () => {
    serveSubject({ materials: [material()] });
    renderSubject();

    await screen.findByText("Cell division");
    expect(
      within(section("Flashcard Decks")).getByText("No flashcard decks yet."),
    ).toBeInTheDocument();
    expect(
      within(section("Quizzes")).getByText("No quizzes yet."),
    ).toBeInTheDocument();
    expect(
      within(section("Materials & Notes")).queryByText("No materials yet."),
    ).not.toBeInTheDocument();
  });

  it("says so when the folder does not exist rather than showing three empty lists", async () => {
    serveSubject({ folders: [] });
    renderSubject("folder-gone");

    expect(
      await screen.findByText("This folder no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Materials & Notes" }),
    ).not.toBeInTheDocument();
  });

  it("opens a material's notes", async () => {
    const user = userEvent.setup();
    serveSubject({ materials: [material()] });
    renderSubject();

    await user.click(
      await screen.findByRole("link", { name: /Cell division/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Notes editor" }),
    ).toBeInTheDocument();
  });

  it("goes back to the Library", async () => {
    const user = userEvent.setup();
    serveSubject();
    renderSubject();

    await user.click(
      await screen.findByRole("link", { name: "← Back to Library" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeInTheDocument();
  });

  it("deletes a material after confirming, and removes its stored file", async () => {
    const user = userEvent.setup();
    let materials = [material({ storage_path: "user-1/cells.pdf" })];
    serveSubject({ materials });
    let removedPaths: unknown = null;
    server.use(
      http.get(rest("materials"), () => HttpResponse.json(materials)),
      http.delete(
        `${SUPABASE_URL}/storage/v1/object/materials`,
        async ({ request }) => {
          removedPaths = await request.json();
          return HttpResponse.json([]);
        },
      ),
      http.delete(rest("materials"), () => {
        materials = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSubject();

    await user.click(
      await screen.findByRole("button", { name: "Delete Cell division" }),
    );
    expect(
      screen.getByText(
        /will be permanently deleted, along with the notes and quizzes generated from it/,
      ),
    ).toBeInTheDocument();
    useFakeTimersForUndoWindow();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText('Deleted "Cell division".'),
    ).toBeInTheDocument();
    jumpPastUndoWindow();

    await waitFor(() =>
      expect(screen.queryByText("Cell division")).not.toBeInTheDocument(),
    );
    expect(removedPaths).toEqual({ prefixes: ["user-1/cells.pdf"] });
  });

  it("keeps the material when the delete is cancelled", async () => {
    const user = userEvent.setup();
    serveSubject({ materials: [material()] });
    let deleteCount = 0;
    server.use(
      http.delete(rest("materials"), () => {
        deleteCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSubject();

    await user.click(
      await screen.findByRole("button", { name: "Delete Cell division" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteCount).toBe(0);
    expect(screen.getByText("Cell division")).toBeInTheDocument();
  });

  it("deletes a deck from the workspace", async () => {
    const user = userEvent.setup();
    let decks = [deck()];
    serveSubject({ decks });
    server.use(
      http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
      http.delete(rest("flashcard_decks"), () => {
        decks = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSubject();

    await user.click(
      await screen.findByRole("button", { name: "Delete Mitosis basics" }),
    );
    useFakeTimersForUndoWindow();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    jumpPastUndoWindow();

    await waitFor(() =>
      expect(screen.queryByText("Mitosis basics")).not.toBeInTheDocument(),
    );
  });

  it("opens the create dialog with this folder pre-selected", async () => {
    const user = userEvent.setup();
    serveSubject();
    renderSubject();

    await user.click(await screen.findByRole("button", { name: "+ Create" }));

    expect(
      await screen.findByRole("heading", { name: "Build study resources" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      const summary = screen.getByRole("complementary", {
        name: "Creation summary",
      });
      expect(within(summary).getByText("Biology")).toBeInTheDocument();
    });
  });

  it("stages a 25m Focus session and navigates to the timer when Focus on Subject is clicked", async () => {
    const user = userEvent.setup();
    serveSubject();
    renderSubject();

    const focusBtn = await screen.findByRole("button", {
      name: "Focus on Subject (25m)",
    });
    expect(focusBtn).toBeInTheDocument();
    await user.click(focusBtn);

    expect(await screen.findByText("Timer view")).toBeInTheDocument();
  });

  it("renders Review Due Cards button when folder has due flashcards and navigates to review", async () => {
    const user = userEvent.setup();
    const decks = [deck({ id: "deck-1", title: "Mitosis basics" })];
    const flashcards = [
      {
        id: "c-1",
        deck_id: "deck-1",
        next_review_date: "2020-01-01T00:00:00.000Z",
      },
      {
        id: "c-2",
        deck_id: "deck-1",
        next_review_date: "2020-01-01T00:00:00.000Z",
      },
    ];
    serveSubject({ decks, flashcards });
    renderSubject();

    const reviewBtn = await screen.findByRole("button", {
      name: /Review 2 Due Cards/,
    });
    expect(reviewBtn).toBeInTheDocument();
    await user.click(reviewBtn);

    expect(await screen.findByText("Deck review")).toBeInTheDocument();
  });
});
