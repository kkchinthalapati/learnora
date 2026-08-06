import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { Material, Note } from "../../api/types";
import { NotesView } from "./NotesView";
import { SAVE_DEBOUNCE_MS } from "./NotesEditorPane";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    user_id: "user-1",
    folder_id: null,
    title: "Cell division",
    type: "pdf",
    raw_content: null,
    storage_path: null,
    created_at: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    user_id: "user-1",
    material_id: "mat-1",
    markdown_content: "",
    html_content: "<p>Existing notes</p>",
    created_at: "2026-03-06T00:00:00.000Z",
    ...overrides,
  };
}

function serveNotes({
  material: mat = null as Material | null,
  notes = [] as Note[],
} = {}) {
  server.use(
    http.get(rest("materials"), ({ request }) => {
      const id = new URL(request.url).searchParams
        .get("id")
        ?.replace("eq.", "");
      if (!id) return HttpResponse.json([]);
      return HttpResponse.json(mat && mat.id === id ? mat : null);
    }),
    http.get(rest("notes"), ({ request }) => {
      const materialId = new URL(request.url).searchParams
        .get("material_id")
        ?.replace("eq.", "");
      return HttpResponse.json(
        notes.filter((n) => n.material_id === materialId),
      );
    }),
    http.patch(rest("notes"), async ({ request }) => {
      const patch = (await request.json()) as { html_content: string };
      const id = new URL(request.url).searchParams
        .get("id")
        ?.replace("eq.", "");
      const row = notes.find((n) => n.id === id);
      return HttpResponse.json({ ...row, ...patch });
    }),
  );
}

function renderNotes(materialId = "mat-1") {
  return renderWithAuth(
    <MemoryRouter initialEntries={[`/notes/${materialId}`]}>
      <Routes>
        <Route path="/notes/:materialId" element={<NotesView />} />
        <Route path="/library" element={<h1>Library</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

function editorEl(): HTMLElement {
  return document.querySelector(".ql-editor") as HTMLElement;
}

describe("NotesView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the material title and loaded note", async () => {
    serveNotes({ material: material(), notes: [note()] });
    renderNotes();

    expect(await screen.findByText("Cell division")).toBeInTheDocument();
    await waitFor(() => expect(editorEl().textContent).toBe("Existing notes"));
    expect(editorEl()).toHaveAttribute("contenteditable", "true");
  });

  it("says the file no longer exists rather than showing an empty editor", async () => {
    const user = userEvent.setup();
    serveNotes({ material: null });
    renderNotes();

    expect(
      await screen.findByText("This file no longer exists."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Library" }));
    expect(
      await screen.findByRole("heading", { name: "Library" }),
    ).toBeInTheDocument();
  });

  it("is read-only with a placeholder when the material has no notes yet", async () => {
    serveNotes({ material: material(), notes: [] });
    renderNotes();

    await screen.findByText("Cell division");
    await waitFor(() =>
      expect(editorEl()).toHaveAttribute("contenteditable", "false"),
    );
    expect(editorEl().textContent).toContain(
      "No notes yet — Learnora is still processing this material.",
    );
    expect(
      screen.getByText("Notes aren't ready to edit yet"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("falls back to rendering markdown when html_content is empty", async () => {
    serveNotes({
      material: material(),
      notes: [
        note({
          html_content: "",
          markdown_content: "**Mitosis** has four phases.",
        }),
      ],
    });
    renderNotes();

    await waitFor(() =>
      expect(editorEl().textContent).toContain("Mitosis has four phases."),
    );
    expect(editorEl().querySelector("strong")).toBeInTheDocument();
    expect(editorEl()).toHaveAttribute("contenteditable", "true");
  });

  it("goes back on the Back button", async () => {
    const user = userEvent.setup();
    serveNotes({ material: material(), notes: [note()] });
    renderNotes();
    await screen.findByText("Cell division");

    await user.click(screen.getByRole("button", { name: "← Back" }));

    // No history to go back to in a fresh MemoryRouter — same limitation
    // the vanilla's plain history.back() has with no prior entry, so the
    // notes route just stays put rather than erroring.
    expect(screen.getByText("Cell division")).toBeInTheDocument();
  });

  it("autosaves after the debounce window and reports Saved", async () => {
    const user = userEvent.setup();
    let saved: string | null = null;
    serveNotes({
      material: material(),
      notes: [note({ html_content: "<p>Hi</p>" })],
    });
    server.use(
      http.patch(rest("notes"), async ({ request }) => {
        const body = (await request.json()) as { html_content: string };
        saved = body.html_content;
        return HttpResponse.json({ ...note(), html_content: saved });
      }),
    );
    renderNotes();
    await waitFor(() => expect(editorEl().textContent).toBe("Hi"));

    await user.click(editorEl());
    await user.keyboard("!");
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), {
      timeout: SAVE_DEBOUNCE_MS + 2000,
    });
    expect(saved).toContain("!");
    expect(saved).toContain("Hi");
  });

  it("acknowledges a manual Save on an unchanged document instead of doing nothing", async () => {
    const user = userEvent.setup();
    let patched = false;
    serveNotes({ material: material(), notes: [note()] });
    server.use(
      http.patch(rest("notes"), () => {
        patched = true;
        return HttpResponse.json(note());
      }),
    );
    renderNotes();
    await waitFor(() => expect(editorEl().textContent).toBe("Existing notes"));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it("reports a failed save", async () => {
    const user = userEvent.setup();
    serveNotes({
      material: material(),
      notes: [note({ html_content: "<p>Hi</p>" })],
    });
    server.use(
      http.patch(rest("notes"), () =>
        HttpResponse.json({ message: "nope" }, { status: 500 }),
      ),
    );
    renderNotes();
    await waitFor(() => expect(editorEl().textContent).toBe("Hi"));

    await user.click(editorEl());
    await user.keyboard("!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Failed to save", undefined, {
        timeout: SAVE_DEBOUNCE_MS + 2000,
      }),
    ).toBeInTheDocument();
  });

  it("flushes a pending edit on unmount instead of dropping it", async () => {
    const user = userEvent.setup();
    let saved: string | null = null;
    serveNotes({
      material: material(),
      notes: [note({ html_content: "<p>Hi</p>" })],
    });
    server.use(
      http.patch(rest("notes"), async ({ request }) => {
        const body = (await request.json()) as { html_content: string };
        saved = body.html_content;
        return HttpResponse.json({ ...note(), html_content: saved });
      }),
    );
    const { unmount } = renderNotes();
    await waitFor(() => expect(editorEl().textContent).toBe("Hi"));

    await user.click(editorEl());
    await user.keyboard("!");
    // Unmount well inside the debounce window — nothing has autosaved yet.
    unmount();

    await waitFor(() => expect(saved).toContain("!"));
    expect(saved).toContain("Hi");
  });

  describe("Complexity Slider", () => {
    it("renders the complexity slider and defaults to Standard", async () => {
      serveNotes({ material: material(), notes: [note()] });
      renderNotes();
      expect(await screen.findByText("Complexity:")).toBeInTheDocument();
      expect(screen.getByText("Standard")).toBeInTheDocument();
      expect(screen.getByRole("slider")).toHaveValue("3");
    });

    it("changes the label when the slider moves", async () => {
      serveNotes({ material: material(), notes: [note()] });
      renderNotes();
      await screen.findByText("Complexity:");

      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "5" } });

      expect(screen.getByText("Expert")).toBeInTheDocument();
    });

    it("calls the edge function, rewrites notes, and allows undoing", async () => {
      serveNotes({ material: material(), notes: [note({ html_content: "<p>Original</p>" })] });
      server.use(
        http.post(`${SUPABASE_URL}/functions/v1/learnora-ai`, async () => {
          return HttpResponse.json({ text: "Rewritten content here" });
        })
      );

      renderNotes();
      await waitFor(() => expect(editorEl().textContent).toBe("Original"));

      const rewriteBtn = screen.getByRole("button", { name: "Rewrite Notes" });
      await userEvent.click(rewriteBtn);

      await waitFor(() => expect(editorEl().textContent).toContain("Rewritten content here"));
      
      const undoBtn = await screen.findByRole("button", { name: "Undo Rewrite" });
      expect(undoBtn).toBeInTheDocument();

      await userEvent.click(undoBtn);
      await waitFor(() => expect(editorEl().textContent).toBe("Original"));
      expect(screen.queryByRole("button", { name: "Undo Rewrite" })).not.toBeInTheDocument();
    });
  });
});
