import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../test/render";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { useLocation } from "react-router";
import { useCreateModal } from "../../context/createModal";

/* Renders the current path too: a successful create navigates the student to
 * whatever it produced, and `withRouter` puts the router above this. */
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

/** Echoes each inserted row back the way PostgREST does for `.select()`. */
function serveDb() {
  const echo = (table: string, id: string) =>
    http.post(rest(table), async ({ request }) => {
      const rows = (await request.json()) as Record<string, unknown>[];
      return HttpResponse.json(
        rows.length === 1
          ? { id, ...rows[0] }
          : rows.map((r) => ({ id, ...r })),
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

describe("MaterialPanel", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () =>
        HttpResponse.json(folderFixture),
      ),
    );
  });

  afterEach(() => {
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
    // Let the folders query resolve so the default-folder effect settles.
    await waitFor(() =>
      expect(screen.getByLabelText("Folder")).toHaveValue("folder-1"),
    );
    return user;
  }

  it("defaults to the File source with Notes forced on", async () => {
    await openDialog();
    expect(screen.getByRole("radio", { name: "File" })).toBeChecked();
    expect(outputCheckbox("Notes")).toBeChecked();
    expect(outputCheckbox("Notes")).toBeDisabled();
  });

  it("hides the Saved source option when there are no saved materials", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([]),
      ),
    );
    await openDialog();
    expect(
      screen.queryByRole("radio", { name: "Saved" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Saved source option once a material exists", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/materials`, () =>
        HttpResponse.json([{ id: "m1", title: "Chapter 4 notes" }]),
      ),
    );
    const user = await openDialog();
    await user.click(await screen.findByRole("radio", { name: "Saved" }));
    expect(
      screen.getByRole("option", { name: "Chapter 4 notes" }),
    ).toBeInTheDocument();
  });

  it("requires a file for the File source", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a file to create from",
    );
  });

  it("requires at least a paragraph of text for the Text source", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByLabelText("Paste your notes or text"),
      "Too short",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "a bit short to study from",
    );
  });

  it("rejects a non-http(s) link", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "javascript:alert(1)",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Links have to start with http:// or https://",
    );
  });

  it("rejects text that isn't a URL at all", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "not a link",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "doesn't look like a link",
    );
  });

  it("requires a topic for the Topic source and hides the folder picker", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Topic" }));
    expect(screen.queryByLabelText("Folder")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a topic to create from",
    );
  });

  it("requires at least one output for the Topic source (notes isn't implicit)", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("radio", { name: "Topic" }));
    await user.type(
      screen.getByRole("textbox", { name: "Topic" }),
      "Ionic bonding",
    );
    // Flashcards default on, Quiz defaults off — unchecking the former
    // without touching the latter leaves both false.
    await user.click(outputCheckbox("Flashcards"));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pick at least one thing to create",
    );
  });

  it("requires a folder for a new-material source", async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/folders`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />, undefined, { withRouter: true });
    await user.click(screen.getByRole("button", { name: "Open create" }));
    await user.click(screen.getByRole("radio", { name: "Text" }));
    await user.type(
      screen.getByLabelText("Paste your notes or text"),
      "A full paragraph of text that is definitely long enough to pass validation.",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a folder to save this into",
    );
  });

  it("only shows quiz tuning options once Quiz is checked", async () => {
    const user = await openDialog();
    await user.click(screen.getByText("Options"));
    expect(screen.queryByText("Quiz difficulty")).not.toBeInTheDocument();
    await user.click(outputCheckbox("Quiz"));
    expect(screen.getByText("Quiz difficulty")).toBeInTheDocument();
  });

  describe("submitting for real", () => {
    async function fillText(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("radio", { name: "Text" }));
      await user.type(
        screen.getByLabelText("Paste your notes or text"),
        "A full paragraph of text that is definitely long enough to pass validation.",
      );
    }

    it("creates the package, then closes and lands on what it made", async () => {
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
      await fillText(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(
        await screen.findByText("Created notes, flashcards."),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      // Notes written in this run are the most specific thing to show, since
      // no quiz was asked for.
      expect(screen.getByText("path:/notes/mat-1")).toBeInTheDocument();
    });

    /* The dialog is where the student is looking, so a run that produced
       nothing says why there — rather than in a popup over a page they were
       already thrown back to, which is what the vanilla did. */
    it("keeps the dialog open and explains a run that produced nothing", async () => {
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
      await fillText(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That topic isn't supported.",
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    /* Two overlapping runs used to produce an error from the one that failed
       to parse plus a working deck from the one that didn't — both from a
       single click (js/main.js:299-307). */
    it("captions the stage in flight and refuses a second submit until it ends", async () => {
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
      await fillText(user);
      await user.click(screen.getByRole("button", { name: "Create" }));

      const busy = await screen.findByRole("button", { name: "Creating…" });
      expect(busy).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      // Scoped to the dialog: the toast region is a live region too.
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
  });

  it("creates a folder inline via the dialog prompt and selects it", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/folders`, async ({ request }) => {
        const [body] = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "folder-2", ...body }, { status: 201 });
      }),
    );
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "+ New" }));

    const promptDialog = await screen.findByRole("alertdialog", {
      name: "New folder",
    });
    await user.type(within(promptDialog).getByRole("textbox"), "Chemistry");
    await user.click(
      within(promptDialog).getByRole("button", { name: "Create folder" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Folder")).toHaveValue("folder-2"),
    );
  });
});
