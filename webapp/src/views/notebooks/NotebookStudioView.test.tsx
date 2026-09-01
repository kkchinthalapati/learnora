import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithAuth } from "../../test/auth";
import { NotebookStudioView } from "./NotebookStudioView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/* Notebooks moved from localStorage to Supabase, so the studio renders against
 * MSW like every other data-backed view. fetchOne() uses .maybeSingle(), which
 * asks PostgREST for an object rather than an array. */
const notebook = {
  id: "nb-1",
  title: "Grade 9 Mathematics: Geometry & Circle Theorems",
  subject: "Mathematics",
  color: "#4A90E2",
  description: "Core theorems and proof strategies.",
  notes: "<h2>Circle Theorems Revision</h2>",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
  notebook_sources: [
    {
      id: "src-1",
      title: "NCERT Chapter 10: Circles & Proofs.pdf",
      type: "pdf",
      content: "Equal chords of a circle subtend equal angles at the centre.",
      url: null,
      selected: true,
      created_at: "2026-08-01T00:00:00Z",
    },
  ],
  notebook_artifacts: [],
  notebook_messages: [],
};

function renderStudio() {
  server.use(http.get(rest("notebooks"), () => HttpResponse.json(notebook)));
  /* The router is part of `ui` here rather than requested via withRouter,
     matching how this test was originally written — the studio reads
     :notebookId from it and an unmatched route silently disables the query. */
  return renderWithAuth(
    <MemoryRouter initialEntries={["/notebooks/nb-1"]}>
      <Routes>
        <Route path="/notebooks/:notebookId" element={<NotebookStudioView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NotebookStudioView", () => {
  beforeEach(() => {
    /* restoreAllMocks() must come first: mockAuthSession installs a spy on
       supabase.auth.getSession, and restoring afterwards tears it straight
       back down — requireUserId() then throws before any request is made, so
       the query fails with no MSW hit at all. */
    vi.restoreAllMocks();
    mockAuthSession("user-1");
  });

  it("renders the 3-panel studio layout for a notebook", async () => {
    renderStudio();

    // Panel 1: Sources Desk
    expect(
      await screen.findByRole("heading", { name: "Sources" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/NCERT Chapter 10/)).toBeInTheDocument();

    // Panel 2: Grounded Canvas
    expect(
      screen.getByRole("button", { name: /Grounded AI Tutor/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Notes Canvas/ }),
    ).toBeInTheDocument();

    // Panel 3: Studio Tools & Artifacts
    expect(screen.getByText("Studio Tools")).toBeInTheDocument();
    expect(screen.getByText("Explain it simply")).toBeInTheDocument();
    expect(screen.getByText("Revision Cheat Sheet")).toBeInTheDocument();
  });

  it("switches to the notes canvas tab", async () => {
    const user = userEvent.setup();
    renderStudio();
    await screen.findByRole("heading", { name: "Sources" });

    await user.click(screen.getByRole("button", { name: /Notes Canvas/ }));

    expect(screen.getByText(/Circle Theorems Revision/)).toBeInTheDocument();
  });

  it("opens add source modal when clicking Add source", async () => {
    const user = userEvent.setup();
    renderStudio();
    await screen.findByRole("heading", { name: "Sources" });

    await user.click(screen.getByRole("button", { name: /Add source/i }));

    expect(
      await screen.findByRole("heading", { name: /Add Study Source to Notebook/i }),
    ).toBeInTheDocument();
  });

  it("opens an artifact preview from the keyboard", async () => {
    /* This card is a role="button" div with tabIndex={0} and, until now, no
       onKeyDown at all — the only one in the app. Tab reached it and nothing
       could activate it, so the artifact preview was mouse-only. */
    server.use(
      http.get(rest("notebooks"), () =>
        HttpResponse.json({
          ...notebook,
          notebook_artifacts: [
            {
              id: "art-1",
              type: "cheat_sheet",
              title: "Circle Theorems Cheat Sheet",
              content: "## Angle at the centre is twice the angle at the rim",
              created_at: "2026-08-02T00:00:00Z",
            },
          ],
        }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={["/notebooks/nb-1"]}>
        <Routes>
          <Route
            path="/notebooks/:notebookId"
            element={<NotebookStudioView />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Sources" });

    const card = await screen.findByRole("button", {
      name: /Circle Theorems Cheat Sheet/,
    });

    // Space activates it *and* is prevented, so the page underneath does not
    // also scroll a screen down.
    card.focus();
    const spaceEvent = fireEvent.keyDown(card, { key: " " });
    expect(spaceEvent).toBe(false); // fireEvent returns false when prevented

    expect(
      await screen.findByText(/Angle at the centre is twice the angle/),
    ).toBeInTheDocument();
  });

  it("also opens an artifact preview with Enter", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(rest("notebooks"), () =>
        HttpResponse.json({
          ...notebook,
          notebook_artifacts: [
            {
              id: "art-1",
              type: "cheat_sheet",
              title: "Circle Theorems Cheat Sheet",
              content: "## Angle at the centre is twice the angle at the rim",
              created_at: "2026-08-02T00:00:00Z",
            },
          ],
        }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={["/notebooks/nb-1"]}>
        <Routes>
          <Route
            path="/notebooks/:notebookId"
            element={<NotebookStudioView />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Sources" });

    const card = await screen.findByRole("button", {
      name: /Circle Theorems Cheat Sheet/,
    });
    card.focus();
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/Angle at the centre is twice the angle/),
    ).toBeInTheDocument();
  });
});
