import { describe, expect, it, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { renderWithAuth } from "../../test/auth";
import { NotebooksHubView } from "./NotebooksHubView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

/* Notebooks moved from localStorage to Supabase, so these render against MSW
 * like every other data-backed view rather than against a hardcoded seed. */
const notebookRow = (over: Record<string, unknown> = {}) => ({
  id: "nb-1",
  title: "Grade 9 Mathematics: Geometry & Circle Theorems",
  subject: "Mathematics",
  color: "#4A90E2",
  description: "Core theorems and proof strategies.",
  notes: "",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
  notebook_sources: [],
  notebook_artifacts: [],
  ...over,
});

function serveNotebooks(rows = [notebookRow(), notebookRow({
  id: "nb-2",
  title: "A-Level Biology: Cell Structure & Transport",
  subject: "Biology",
  color: "#2FBF88",
})]) {
  server.use(http.get(rest("notebooks"), () => HttpResponse.json(rows)));
}

function renderHub() {
  return renderWithAuth(
    <Routes>
      <Route path="/notebooks" element={<NotebooksHubView />} />
      <Route path="/notebooks/:notebookId" element={<h1>Studio</h1>} />
    </Routes>,
    {},
    { withRouter: true, initialEntries: ["/notebooks"] },
  );
}

describe("NotebooksHubView", () => {
  beforeEach(() => {
    mockAuthSession("user-1");
    serveNotebooks();
  });

  it("renders the notebooks hub with the account's notebooks", async () => {
    renderHub();

    expect(
      screen.getByRole("heading", { name: "Notebooks", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Grade 9 Mathematics/)).toBeInTheDocument();
    expect(screen.getByText(/A-Level Biology/)).toBeInTheDocument();
  });

  it("filters notebooks based on search query", async () => {
    const user = userEvent.setup();
    renderHub();
    await screen.findByText(/Grade 9 Mathematics/);

    await user.type(
      screen.getByPlaceholderText(/Search notebooks/i),
      "Biology",
    );

    await waitFor(() =>
      expect(screen.queryByText(/Grade 9 Mathematics/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/A-Level Biology/)).toBeInTheDocument();
  });

  it("opens the create notebook modal", async () => {
    const user = userEvent.setup();
    renderHub();
    await screen.findByText(/Grade 9 Mathematics/);

    await user.click(screen.getByRole("button", { name: /New notebook/i }));

    expect(
      await screen.findByRole("heading", { name: /New notebook/i }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when the account has no notebooks", async () => {
    serveNotebooks([]);
    renderHub();

    expect(await screen.findByText(/No study notebooks yet/i)).toBeInTheDocument();
  });
});
