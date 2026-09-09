import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { SETTINGS_KEY, DEFAULT_SETTINGS } from "../../lib/settings";
import { Storage } from "../../lib/storage";
import { useLocation } from "react-router";
import { useCreateModal, type OpenCreateModalOptions } from "../../context/createModal";
import { MATERIAL_DRAFT_KEY } from "../../lib/draftKeys";

function Harness({ initial }: { initial?: OpenCreateModalOptions }) {
  const { openCreateModal } = useCreateModal();
  const { pathname } = useLocation();
  return (
    <>
      <button onClick={() => openCreateModal({ type: "material", ...initial })}>
        Open create
      </button>
      <p>{`path:${pathname}`}</p>
    </>
  );
}

const folderFixture = [
  { id: "folder-1", user_id: "user-1", name: "Biology", color: "#4A90E2" },
];
const EDGE_URL = `${SUPABASE_URL}/functions/v1/learnora-ai`;
const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const NOTES_MARKDOWN =
  "## Photosynthesis\nEnough notes to clear the fifty-character floor comfortably.";
const CARDS = [{ front: "What is chlorophyll?", back: "A pigment." }];
const LONG_TEXT =
  "A full paragraph of text that is definitely long enough to pass validation comfortably.";

function serveDb() {
  const echo = (table: string, id: string) =>
    http.post(rest(table), async ({ request }) => {
      const rows = (await request.json()) as Record<string, unknown>[];
      return HttpResponse.json(
        rows.length === 1
          ? { id, ...rows[0] }
          : rows.map((row) => ({ id, ...row })),
        { status: 201 },
      );
    });
  server.use(
    echo("materials", "mat-1"),
    echo("notes", "note-1"),
    echo("flashcard_decks", "deck-1"),
    echo("flashcards", "card-1"),
  );
}

describe("MaterialPanel streamlined creation", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () =>
        HttpResponse.json(folderFixture),
      ),
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([]),
      ),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function outputCheckbox(name: string): HTMLInputElement {
    const checkbox = screen
      .getByText(name)
      .closest("label")
      ?.querySelector("input");
    if (!checkbox) throw new Error(`No checkbox found for output "${name}"`);
    return checkbox as HTMLInputElement;
  }

  async function openDialog(initial?: OpenCreateModalOptions) {
    const user = userEvent.setup();
    renderWithProviders(<Harness initial={initial} />, undefined, {
      withRouter: true,
    });
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await screen.findByRole("heading", { name: "1. Provide Source" });
    return user;
  }

  async function chooseText(
    user: ReturnType<typeof userEvent.setup>,
    value = LONG_TEXT,
  ) {
    await user.click(screen.getByRole("tab", { name: /Paste Text/ }));
    await user.type(screen.getByLabelText("Paste your notes or text"), value);
  }

  it("opens with clean source tabs, 1-tap outputs, and instant action button", async () => {
    await openDialog();
    expect(screen.getByRole("tab", { name: /Upload Document/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Paste Text/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Topic/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Web Link/ })).toBeInTheDocument();

    expect(outputCheckbox("Flashcards")).toBeChecked();
    expect(outputCheckbox("Summary Notes")).toBeChecked();
    expect(outputCheckbox("Practice Quiz")).not.toBeChecked();

    expect(
      screen.getByRole("button", { name: "Generate Study Resources" }),
    ).toBeInTheDocument();
  });

  it("accepts a file and displays its details", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("tab", { name: /Upload Document/ }));
    const file = new File(["study content"], "chapter.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Browse files"), file);
    expect(screen.getByText("chapter.pdf")).toBeInTheDocument();
  });

  it("only offers Saved Material when the student has one", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([{ id: "m1", title: "Chapter 4 notes" }]),
      ),
    );
    const user = await openDialog();
    expect(
      await screen.findByRole("tab", { name: /Saved Material/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Saved Material/ }));
    expect(
      screen.getByRole("option", { name: "Chapter 4 notes" }),
    ).toBeInTheDocument();
  });

  it("hides Saved Material when the library is empty", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([]),
      ),
    );
    await openDialog();
    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: /Saved Material/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("validates the active source before generation", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("tab", { name: /Upload Document/ }));
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a file");
  });

  it("requires enough pasted text", async () => {
    const user = await openDialog();
    await chooseText(user, "Too short");
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "a bit short to study from",
    );
  });

  it("rejects unsafe and malformed links", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("tab", { name: /Web Link/ }));
    const input = screen.getByRole("textbox", { name: "Web or YouTube link" });
    await user.type(input, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Links have to start with http:// or https://",
    );
    await user.clear(input);
    await user.type(input, "not a link");
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "doesn't look like a link",
    );
  });

  it("explains YouTube limitations and accepts a bare topic", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("tab", { name: /Web Link/ }));
    expect(screen.getByText(/not its full transcript/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Topic/ }));
    await user.type(screen.getByLabelText("Topic"), "Ionic bonding");
    expect(screen.getByLabelText("Topic")).toHaveValue("Ionic bonding");
  });

  it("requires an output when all are deselected", async () => {
    const user = await openDialog();
    await chooseText(user);
    await user.click(outputCheckbox("Flashcards"));
    await user.click(outputCheckbox("Summary Notes"));
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick at least one thing",
    );
  });

  it("allows 1-tap toggling of output cards", async () => {
    const user = await openDialog();
    expect(outputCheckbox("Practice Quiz")).not.toBeChecked();
    await user.click(outputCheckbox("Practice Quiz"));
    expect(outputCheckbox("Practice Quiz")).toBeChecked();
    await user.click(outputCheckbox("Flashcards"));
    expect(outputCheckbox("Flashcards")).not.toBeChecked();
  });

  it("keeps required filing visible and validates subject selection", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json([])),
    );
    const user = await openDialog();
    await chooseText(user);
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a subject to save this into",
    );
  });

  it("reveals fine-tune generation settings in accordion", async () => {
    const user = await openDialog();
    await chooseText(user);
    await user.click(outputCheckbox("Practice Quiz"));
    await user.click(screen.getByText("Fine-tune generation"));
    expect(screen.getByText("Quiz difficulty")).toBeInTheDocument();
    expect(screen.getByLabelText("Flashcards: 12")).toBeInTheDocument();
  });

  it("seeds the quiz host from the student's AI persona", async () => {
    Storage.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, aiPersona: "coach" });
    const user = await openDialog();
    await chooseText(user);
    await user.click(outputCheckbox("Practice Quiz"));
    await user.click(screen.getByText("Fine-tune generation"));
    expect(screen.getByLabelText("Quiz host")).toHaveValue("Strict Coach");
  });

  it("creates the package, closes, and lands on what it made", async () => {
    serveDb();
    server.use(
      http.post(EDGE_URL, async ({ request }) => {
        const { mode } = (await request.json()) as { mode: string };
        return HttpResponse.json({
          text: mode === "notes" ? NOTES_MARKDOWN : JSON.stringify(CARDS),
        });
      }),
    );
    const user = await openDialog();
    await chooseText(user);
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(
      await screen.findByText("Created notes, flashcards."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("path:/notes/mat-1")).toBeInTheDocument();
  });

  it("keeps the panel open and explains a failed run", async () => {
    serveDb();
    server.use(
      http.post(EDGE_URL, () =>
        HttpResponse.json(
          { error: "That topic isn't supported.", refused: true },
          { status: 400 },
        ),
      ),
    );
    const user = await openDialog();
    await chooseText(user);
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That topic isn't supported.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("announces progress and blocks duplicate submission", async () => {
    serveDb();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let edgeCalls = 0;
    server.use(
      http.post(EDGE_URL, async () => {
        edgeCalls++;
        await held;
        return HttpResponse.json({ text: NOTES_MARKDOWN });
      }),
    );
    const user = await openDialog();
    await chooseText(user);
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));
    const busy = await screen.findByRole("button", { name: "Creating…" });
    expect(busy).toBeDisabled();
    expect(
      within(screen.getByRole("dialog")).getByRole("status"),
    ).toHaveTextContent("Reading your material and writing notes…");
    await user.click(busy);
    expect(edgeCalls).toBe(1);
    release?.();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("creates a subject inline and selects it", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/folders`, async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "folder-2", ...body }, { status: 201 });
      }),
    );
    const user = await openDialog();
    await chooseText(user);
    await user.click(screen.getByRole("button", { name: "New subject" }));
    const promptDialog = await screen.findByRole("alertdialog", {
      name: "New subject",
    });
    await user.type(within(promptDialog).getByRole("textbox"), "Chemistry");
    await user.click(
      within(promptDialog).getByRole("button", { name: "Create subject" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Subject")).toHaveValue("folder-2"),
    );
  });

  it("displays stage breakdown of errors and a direct 'Retry Failed Stages' button without losing user state", async () => {
    serveDb();
    let attempt = 0;
    let materialPosts = 0;
    server.use(
      http.post(rest("materials"), async ({ request }) => {
        materialPosts++;
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "mat-1", ...body }, { status: 201 });
      }),
      http.get(rest("materials"), ({ request }) => {
        const material = {
          id: "mat-1",
          user_id: "user-1",
          folder_id: "folder-1",
          title: "Web Link",
          type: "text",
          raw_content: LONG_TEXT,
          storage_path: null,
          created_at: new Date().toISOString(),
        };
        return new URL(request.url).searchParams.has("id")
          ? HttpResponse.json(material)
          : HttpResponse.json([]);
      }),
      http.get(rest("notes"), () => HttpResponse.json([])),
      http.post(EDGE_URL, async ({ request }) => {
        const { mode } = (await request.json()) as { mode: string };
        attempt++;
        if (attempt === 1) {
          return HttpResponse.json({ text: "Short" });
        }
        return HttpResponse.json({
          text: mode === "notes" ? NOTES_MARKDOWN : JSON.stringify(CARDS),
        });
      }),
    );
    const user = await openDialog();
    await chooseText(user);
    await user.click(screen.getByRole("button", { name: "Generate Study Resources" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry Failed Stages" }),
    ).toBeInTheDocument();

    // State is preserved
    expect(screen.getByLabelText("Subject")).toHaveValue("folder-1");

    // Click retry
    await user.click(
      screen.getByRole("button", { name: "Retry Failed Stages" }),
    );
    expect(
      await screen.findByText("Created notes, flashcards."),
    ).toBeInTheDocument();
    expect(materialPosts).toBe(1);
  });

  it("pre-populates outputs from caller options", async () => {
    await openDialog({ outputs: { flashcards: false, quiz: true, notes: false } });
    expect(outputCheckbox("Flashcards")).not.toBeChecked();
    expect(outputCheckbox("Practice Quiz")).toBeChecked();
    expect(outputCheckbox("Summary Notes")).not.toBeChecked();
  });

  describe("draft recovery", () => {
    it("keeps pasted text when the panel is dismissed and reopened", async () => {
      const user = await openDialog();
      await chooseText(user, "Mitochondria are the powerhouse of the cell.");

      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Open create" }));
      await screen.findByRole("heading", {
        name: "1. Provide Source",
      });

      expect(screen.getByLabelText("Paste your notes or text")).toHaveValue(
        "Mitochondria are the powerhouse of the cell.",
      );
    });

    it("writes no draft when nothing was typed", async () => {
      Storage.remove(MATERIAL_DRAFT_KEY);

      const user = await openDialog();
      await user.keyboard("{Escape}");

      await waitFor(() => expect(Storage.get(MATERIAL_DRAFT_KEY)).toBeNull());
    });
  });
});
