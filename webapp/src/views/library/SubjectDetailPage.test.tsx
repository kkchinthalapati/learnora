import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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
} = {}) {
  server.use(
    http.get(rest("folders"), () => HttpResponse.json(folders)),
    http.get(rest("materials"), ({ request }) => {
      const folderId = new URL(request.url).searchParams
        .get("folder_id")
        ?.replace("eq.", "");
      return HttpResponse.json(
        folderId ? materials.filter((m) => m.folder_id === folderId) : materials,
      );
    }),
    http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
    http.get(rest("quizzes"), () => HttpResponse.json(quizzes)),
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
    </Routes>,
    { session: fakeSession() },
    // The router lives above the create-dialog provider — see test/render.tsx.
    { initialEntries: [`/folders/${folderId}`] },
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

  /* The vanilla's `<h2 id="workspace-title">Workspace</h2>` was never assigned
     to by any code in js/, so every folder's page was headed "Workspace". */
  it("heads the page with the subject's name", async () => {
    serveSubject();
    renderSubject();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Biology" }),
    ).toBeInTheDocument();
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

    await user.click(await screen.findByRole("link", { name: /Cell division/ }));

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
      http.delete(`${SUPABASE_URL}/storage/v1/object/materials`, async ({ request }) => {
        removedPaths = await request.json();
        return HttpResponse.json([]);
      }),
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
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Cell division")).not.toBeInTheDocument(),
    );
    expect(removedPaths).toEqual({ prefixes: ["user-1/cells.pdf"] });
    expect(await screen.findByText('Deleted "Cell division".')).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Delete" }));

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
      await screen.findByRole("heading", { name: "Create study material" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/Folder/)).toHaveValue("folder-1"),
    );
  });
});
