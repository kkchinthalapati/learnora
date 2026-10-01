import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  folder_id: "folder-1",
  color: "#4A90E2",
  description: "Core theorems and proof strategies.",
  notes: "",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-02T00:00:00Z",
  notebook_sources: [],
  notebook_artifacts: [],
  ...over,
});

function serveNotebooks(
  rows = [
    notebookRow(),
    notebookRow({
      id: "nb-2",
      title: "A-Level Biology: Cell Structure & Transport",
      subject: "Biology",
      color: "#2FBF88",
    }),
  ],
) {
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

  it("requests only student-created notebooks, not internal subject owners", async () => {
    let requestedStudentNotebooks = false;
    server.use(
      http.get(rest("notebooks"), ({ request }) => {
        requestedStudentNotebooks =
          new URL(request.url).searchParams.get("system_key") === "is.null";
        return HttpResponse.json(
          requestedStudentNotebooks
            ? [notebookRow()]
            : [
                notebookRow(),
                notebookRow({
                  id: "system-folder-1",
                  title: "Internal Mathematics owner",
                  system_key: "folder_contents",
                }),
              ],
        );
      }),
    );

    renderHub();

    expect(await screen.findByText(/Grade 9 Mathematics/)).toBeInTheDocument();
    expect(requestedStudentNotebooks).toBe(true);
    expect(
      screen.queryByText("Internal Mathematics owner"),
    ).not.toBeInTheDocument();
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

  it("files a new notebook under the selected subject folder", async () => {
    const user = userEvent.setup();
    const inserts: unknown[] = [];
    server.use(
      http.post(rest("notebooks"), async ({ request }) => {
        const body = await request.json();
        inserts.push(body);
        const [row] = body as Array<Record<string, unknown>>;
        return HttpResponse.json(notebookRow({ id: "nb-new", ...row }));
      }),
    );
    renderHub();
    await screen.findByText(/Grade 9 Mathematics/);

    await user.click(screen.getByRole("button", { name: /New notebook/i }));
    await user.type(screen.getByLabelText("Notebook title"), "Cell revision");
    await user.selectOptions(
      screen.getByLabelText(/Subject folder/i),
      "folder-1",
    );
    await user.click(screen.getByRole("button", { name: "Create notebook" }));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts).toEqual([
      expect.arrayContaining([
        expect.objectContaining({
          folder_id: "folder-1",
          subject: "Biology",
          color: "#4A90E2",
        }),
      ]),
    ]);
  });

  it("shows an empty state when the account has no notebooks", async () => {
    serveNotebooks([]);
    renderHub();

    expect(
      await screen.findByText(/No study notebooks yet/i),
    ).toBeInTheDocument();
  });

  it("opens a notebook on Space without also scrolling the page", async () => {
    renderHub();
    const card = await screen.findByRole("button", {
      name: /Grade 9 Mathematics/,
    });

    /* Space activates a role="button" — and, unprevented, also scrolls the
       hub a screen down underneath the navigation. fireEvent returns false
       when the handler called preventDefault. */
    const notPrevented = fireEvent.keyDown(card, { key: " " });
    expect(notPrevented).toBe(false);

    expect(
      await screen.findByRole("heading", { name: "Studio" }),
    ).toBeInTheDocument();
  });
});
