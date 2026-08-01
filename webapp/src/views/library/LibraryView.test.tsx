import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes, useLocation } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type {
  FlashcardDeck,
  Folder,
  Material,
  Quiz,
} from "../../api/types";
import { LibraryView } from "./LibraryView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    user_id: "user-1",
    name: "Biology",
    color: "#4A90E2",
    created_at: "2026-03-04T00:00:00.000Z",
    ...overrides,
  };
}

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    user_id: "user-1",
    folder_id: "folder-1",
    title: "Cell division",
    type: "pdf",
    raw_content: null,
    storage_path: "user-1/cells.pdf",
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
    questions_json: [{ q: "1" }, { q: "2" }, { q: "3" }],
    created_at: "2026-03-07T00:00:00.000Z",
    ...overrides,
  };
}

/* Every tab reads a different table, so each test declares only the rows it
 * cares about and the rest fall back to empty lists. `dueCount` is served the
 * way supabase-js reads an exact count: a HEAD request whose content-range
 * carries the total. */
function serveLibrary({
  folders = [] as Folder[],
  materials = [] as Material[],
  decks = [] as FlashcardDeck[],
  quizzes = [] as Quiz[],
  dueCount = 0,
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
    http.head(
      rest("flashcards"),
      () =>
        new HttpResponse(null, {
          status: 200,
          headers: { "content-range": `*/${dueCount}` },
        }),
    ),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderLibrary(path = "/library") {
  return renderWithAuth(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/library" element={<LibraryView />} />
        <Route path="/library/:tab" element={<LibraryView />} />
        <Route path="/folders/:folderId" element={<h1>Subject workspace</h1>} />
        <Route path="/notes/:materialId" element={<h1>Notes editor</h1>} />
        <Route path="/review/:deckId" element={<h1>Deck review</h1>} />
        <Route path="/quiz/:quizId" element={<h1>Quiz runner</h1>} />
        <Route path="/quiz/:quizId/review" element={<h1>Quiz review</h1>} />
      </Routes>
    </>,
    { session: fakeSession() },
    // The router lives above the create-dialog provider — see test/render.tsx.
    { initialEntries: [path] },
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("LibraryView shell", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the four tabs with Folders selected on /library", async () => {
    serveLibrary({ folders: [folder()] });
    renderLibrary();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Folders",
      "Materials",
      "Flashcards",
      "Quizzes",
    ]);
    expect(tab("Folders")).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Biology")).toBeInTheDocument();
  });

  it("selects the tab named in the URL on a deep link", async () => {
    serveLibrary({ quizzes: [quiz()] });
    renderLibrary("/library/quizzes");

    expect(await screen.findByText("Cell division quiz")).toBeInTheDocument();
    expect(tab("Quizzes")).toHaveAttribute("aria-selected", "true");
    expect(tab("Folders")).toHaveAttribute("aria-selected", "false");
  });

  it("redirects an unknown tab back to the Folders tab", async () => {
    serveLibrary({ folders: [folder()] });
    renderLibrary("/library/not-a-tab");

    await waitFor(() =>
      expect(screen.getByTestId("path")).toHaveTextContent("/library"),
    );
    expect(screen.getByTestId("path").textContent).toBe("/library");
    expect(tab("Folders")).toHaveAttribute("aria-selected", "true");
  });

  it("switches tab and URL on click, mounting only that tab's panel", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()], materials: [material()] });
    renderLibrary();
    await screen.findByText("Biology");

    await user.click(tab("Materials"));

    expect(await screen.findByText("Cell division")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/library/materials");
    // The Folders panel is unmounted, not merely hidden.
    expect(screen.queryByText("Biology")).not.toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys, one tab stop for the strip", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()], materials: [material()] });
    renderLibrary();
    await screen.findByText("Biology");

    expect(tab("Folders")).toHaveAttribute("tabindex", "0");
    expect(tab("Materials")).toHaveAttribute("tabindex", "-1");

    tab("Folders").focus();
    await user.keyboard("{ArrowRight}");

    expect(await screen.findByText("Cell division")).toBeInTheDocument();
    expect(tab("Materials")).toHaveAttribute("aria-selected", "true");
    expect(tab("Materials")).toHaveFocus();
  });

  it("wraps from the last tab back to the first with Home/End", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    renderLibrary();
    await screen.findByText("Biology");

    tab("Folders").focus();
    await user.keyboard("{End}");
    expect(tab("Quizzes")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(await screen.findByText("Biology")).toBeInTheDocument();
    expect(tab("Folders")).toHaveAttribute("aria-selected", "true");
  });

  it("names the panel from its tab", async () => {
    serveLibrary({ folders: [folder()] });
    renderLibrary();
    await screen.findByText("Biology");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "library-panel-folders");
    expect(panel).toHaveAttribute("aria-labelledby", "library-tab-folders");
  });

  it("opens the create dialog from the header button", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    renderLibrary();
    await screen.findByText("Biology");

    await user.click(screen.getByRole("button", { name: "+ Create" }));

    expect(
      await screen.findByRole("heading", { name: "Create study material" }),
    ).toBeInTheDocument();
  });
});

describe("Library — Folders tab", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts the materials in each folder", async () => {
    serveLibrary({
      folders: [folder(), folder({ id: "folder-2", name: "History" })],
      materials: [
        material({ id: "m1" }),
        material({ id: "m2", title: "Meiosis" }),
        material({ id: "m3", folder_id: "folder-2" }),
      ],
    });
    renderLibrary();

    const biology = (await screen.findByText("Biology")).closest("li")!;
    expect(biology).toHaveTextContent("2 materials");

    const history = screen.getByText("History").closest("li")!;
    expect(history).toHaveTextContent("1 material •");
  });

  it("links a folder card to its workspace", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    renderLibrary();

    await user.click(await screen.findByRole("link", { name: /Biology/ }));

    expect(
      await screen.findByRole("heading", { name: "Subject workspace" }),
    ).toBeInTheDocument();
  });

  it("shows the getting-started empty state and opens the Subject panel from it", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [] });
    renderLibrary();

    expect(await screen.findByText("No folders yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Create Folder" }));

    expect(
      await screen.findByRole("heading", { name: "New subject" }),
    ).toBeInTheDocument();
  });

  it("renames a folder through the prompt dialog", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    let patched: unknown = null;
    server.use(
      http.patch(rest("folders"), async ({ request }) => {
        patched = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary();

    await user.click(await screen.findByRole("button", { name: "Rename Biology" }));
    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("Biology");
    await user.clear(input);
    await user.type(input, "Biology 101");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patched).toEqual({ name: "Biology 101" }));
  });

  it("does not write when the rename dialog is cancelled", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    let patchCount = 0;
    server.use(
      http.patch(rest("folders"), () => {
        patchCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary();

    await user.click(await screen.findByRole("button", { name: "Rename Biology" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    expect(patchCount).toBe(0);
  });

  it("warns what a folder delete takes with it, then deletes on confirm", async () => {
    const user = userEvent.setup();
    const folders = [folder()];
    serveLibrary({ folders });
    let deleted = false;
    server.use(
      http.get(rest("folders"), () =>
        HttpResponse.json(deleted ? [] : folders),
      ),
      http.delete(rest("folders"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary();

    await user.click(await screen.findByRole("button", { name: "Delete Biology" }));
    expect(
      screen.getByText(
        /and everything inside it — materials, notes, flashcards, and quizzes — will be permanently deleted/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText('Deleted "Biology".')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Biology")).not.toBeInTheDocument(),
    );
  });

  it("keeps the folder when the delete is cancelled", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    let deleteCount = 0;
    server.use(
      http.delete(rest("folders"), () => {
        deleteCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary();

    await user.click(await screen.findByRole("button", { name: "Delete Biology" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteCount).toBe(0);
    expect(screen.getByText("Biology")).toBeInTheDocument();
  });

  it("reports a failed delete instead of dropping the card", async () => {
    const user = userEvent.setup();
    serveLibrary({ folders: [folder()] });
    server.use(
      http.delete(rest("folders"), () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );
    renderLibrary();

    await user.click(await screen.findByRole("button", { name: "Delete Biology" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const toast = await screen.findByText(
      "Couldn't delete that folder. Please try again.",
    );
    expect(toast.closest("[role='alert']")).not.toBeNull();
    expect(screen.getByText("Biology")).toBeInTheDocument();
  });
});

describe("Library — Materials tab", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists every material across folders and links each into its notes", async () => {
    const user = userEvent.setup();
    serveLibrary({
      materials: [material(), material({ id: "mat-2", title: "Osmosis" })],
    });
    renderLibrary("/library/materials");

    expect(await screen.findByText("Osmosis")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Cell division/ }));

    expect(
      await screen.findByRole("heading", { name: "Notes editor" }),
    ).toBeInTheDocument();
  });

  it("offers creation from the empty state", async () => {
    serveLibrary({ materials: [] });
    renderLibrary("/library/materials");

    expect(await screen.findByText("No materials yet.")).toBeInTheDocument();
    // The header's button and the empty state's, both opening the same dialog.
    expect(screen.getAllByRole("button", { name: "+ Create" })).toHaveLength(2);
  });
});

describe("Library — Flashcards tab", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("banners the cards due today above the decks", async () => {
    serveLibrary({ decks: [deck()], dueCount: 7 });
    renderLibrary("/library/flashcards");

    expect(
      await screen.findByText(/due for review today/, { selector: "span" }),
    ).toHaveTextContent("7 cards due for review today.");
    expect(screen.getByText("Mitosis basics")).toBeInTheDocument();
  });

  it("hides the banner when nothing is due", async () => {
    serveLibrary({ decks: [deck()], dueCount: 0 });
    renderLibrary("/library/flashcards");

    await screen.findByText("Mitosis basics");
    expect(
      screen.queryByText(/due for review today/),
    ).not.toBeInTheDocument();
  });

  it("deletes a deck after confirming what goes with it", async () => {
    const user = userEvent.setup();
    let decks = [deck()];
    serveLibrary({ decks });
    server.use(
      http.get(rest("flashcard_decks"), () => HttpResponse.json(decks)),
      http.delete(rest("flashcard_decks"), () => {
        decks = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary("/library/flashcards");

    await user.click(
      await screen.findByRole("button", { name: "Delete Mitosis basics" }),
    );
    expect(
      screen.getByText(/and all its flashcards will be permanently deleted/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Mitosis basics")).not.toBeInTheDocument(),
    );
  });

  it("links a deck to its review session", async () => {
    const user = userEvent.setup();
    serveLibrary({ decks: [deck()] });
    renderLibrary("/library/flashcards");

    await user.click(
      await screen.findByRole("link", { name: /Mitosis basics/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deck review" }),
    ).toBeInTheDocument();
  });
});

describe("Library — Quizzes tab", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts a quiz's questions", async () => {
    serveLibrary({ quizzes: [quiz()] });
    renderLibrary("/library/quizzes");

    const card = (await screen.findByText("Cell division quiz")).closest("li")!;
    expect(card).toHaveTextContent("3 questions ·");
  });

  it("survives a questions_json that is not an array", async () => {
    serveLibrary({ quizzes: [quiz({ questions_json: { broken: true } })] });
    renderLibrary("/library/quizzes");

    const card = (await screen.findByText("Cell division quiz")).closest("li")!;
    expect(card).toHaveTextContent("0 questions ·");
  });

  it("offers both taking the quiz and reviewing the last attempt", async () => {
    const user = userEvent.setup();
    serveLibrary({ quizzes: [quiz()] });
    renderLibrary("/library/quizzes");

    await user.click(await screen.findByRole("link", { name: "Review" }));
    expect(
      await screen.findByRole("heading", { name: "Quiz review" }),
    ).toBeInTheDocument();
  });

  it("deletes a quiz after confirming", async () => {
    const user = userEvent.setup();
    let quizzes = [quiz()];
    serveLibrary({ quizzes });
    server.use(
      http.get(rest("quizzes"), () => HttpResponse.json(quizzes)),
      http.delete(rest("quizzes"), () => {
        quizzes = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderLibrary("/library/quizzes");

    await user.click(
      await screen.findByRole("button", { name: "Delete Cell division quiz" }),
    );
    expect(
      screen.getByText(/and its attempt history will be permanently deleted/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Cell division quiz")).not.toBeInTheDocument(),
    );
  });
});
