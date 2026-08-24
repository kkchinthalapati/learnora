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
import { useCreateModal } from "../../context/createModal";

function Harness() {
  const { openCreateModal } = useCreateModal();
  const { pathname } = useLocation();
  return (
    <>
      <button onClick={() => openCreateModal({ type: "material" })}>
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
  "A full paragraph of text that is definitely long enough to pass validation.";

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

describe("MaterialPanel guided creation", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () =>
        HttpResponse.json(folderFixture),
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

  async function openDialog() {
    const user = userEvent.setup();
    renderWithProviders(<Harness />, undefined, { withRouter: true });
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await screen.findByRole("heading", { name: "What are you learning from?" });
    return user;
  }

  async function chooseText(
    user: ReturnType<typeof userEvent.setup>,
    value = LONG_TEXT,
  ) {
    await user.click(screen.getByRole("radio", { name: /Paste text/ }));
    await user.type(screen.getByLabelText("Paste your notes or text"), value);
  }

  async function continueToResults(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      screen.getByRole("button", { name: "Continue to results" }),
    );
  }

  async function continueToDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Review and create" }));
    await screen.findByRole("heading", { name: "Put it in the right place" });
  }

  it("starts with one source decision and locks later steps", async () => {
    await openDialog();
    expect(
      screen.getByRole("radio", { name: /Document or recording/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Choose results/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Review & create/ }),
    ).toBeDisabled();
  });

  it("accepts a file, then shows Notes as an included result", async () => {
    const user = await openDialog();
    const file = new File(["study content"], "chapter.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Browse files"), file);
    expect(screen.getAllByText("chapter.pdf")).toHaveLength(2);
    await continueToResults(user);
    expect(outputCheckbox("Smart notes")).toBeChecked();
    expect(outputCheckbox("Smart notes")).toBeDisabled();
  });

  it("only offers Saved material when the student has one", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([{ id: "m1", title: "Chapter 4 notes" }]),
      ),
    );
    const user = await openDialog();
    await user.click(
      await screen.findByRole("radio", { name: /Saved material/ }),
    );
    expect(
      screen.getByRole("option", { name: "Chapter 4 notes" }),
    ).toBeInTheDocument();
  });

  it("hides Saved material when the library is empty", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([]),
      ),
    );
    await openDialog();
    await waitFor(() =>
      expect(
        screen.queryByRole("radio", { name: /Saved material/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("validates the active source before moving forward", async () => {
    const user = await openDialog();
    await continueToResults(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a file");
    expect(
      screen.getByRole("heading", { name: "What are you learning from?" }),
    ).toBeInTheDocument();
  });

  it("requires enough pasted text", async () => {
    const user = await openDialog();
    await chooseText(user, "Too short");
    await continueToResults(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "a bit short to study from",
    );
  });

  it("rejects unsafe and malformed links", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Web or video link/ }));
    const input = screen.getByRole("textbox", { name: "Web or YouTube link" });
    await user.type(input, "javascript:alert(1)");
    await continueToResults(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Links have to start with http:// or https://",
    );
    await user.clear(input);
    await user.type(input, "not a link");
    await continueToResults(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "doesn't look like a link",
    );
  });

  it("explains YouTube limitations and accepts a bare topic", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Web or video link/ }));
    expect(screen.getByText(/not its full transcript/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Just a topic/ }));
    await user.type(screen.getByLabelText("Topic"), "Ionic bonding");
    await continueToResults(user);
    expect(
      screen.getByRole("heading", { name: "What should Learnora make?" }),
    ).toHaveFocus();
  });

  it("requires an output when notes are not implicit", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: /Just a topic/ }));
    await user.type(screen.getByLabelText("Topic"), "Ionic bonding");
    await continueToResults(user);
    await user.click(outputCheckbox("Flashcards"));
    await user.click(screen.getByRole("button", { name: "Review and create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick at least one thing",
    );
  });

  it("keeps required filing visible on the final step", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json([])),
    );
    const user = await openDialog();
    await chooseText(user);
    await continueToResults(user);
    await continueToDetails(user);
    expect(screen.getByLabelText("Subject")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create study kit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a subject to save this into",
    );
  });

  it("reveals only relevant generation settings", async () => {
    const user = await openDialog();
    await chooseText(user);
    await continueToResults(user);
    expect(screen.queryByText("Quiz difficulty")).not.toBeInTheDocument();
    await user.click(outputCheckbox("Practice quiz"));
    await continueToDetails(user);
    await user.click(screen.getByText("Fine-tune generation"));
    expect(screen.getByText("Quiz difficulty")).toBeInTheDocument();
  });

  it("seeds the quiz host from the student's AI persona", async () => {
    Storage.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, aiPersona: "coach" });
    const user = await openDialog();
    await chooseText(user);
    await continueToResults(user);
    await user.click(outputCheckbox("Practice quiz"));
    await continueToDetails(user);
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
    await continueToResults(user);
    await continueToDetails(user);
    await user.click(screen.getByRole("button", { name: "Create study kit" }));
    expect(
      await screen.findByText("Created notes, flashcards."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("path:/notes/mat-1")).toBeInTheDocument();
  });

  it("keeps the wizard open and explains a failed run", async () => {
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
    await continueToResults(user);
    await continueToDetails(user);
    await user.click(screen.getByRole("button", { name: "Create study kit" }));
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
    await continueToResults(user);
    await continueToDetails(user);
    await user.click(screen.getByRole("button", { name: "Create study kit" }));
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
    await continueToResults(user);
    await continueToDetails(user);
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
});
