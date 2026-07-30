import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "./test/mocks/server";
import { SUPABASE_URL } from "./lib/supabase";
import { AppRoutes } from "./routes";
import { fakeSession, renderWithAuth } from "./test/auth";
import { mockAuthSession } from "./test/mockSession";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function renderAt(path: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
    { session: fakeSession() },
    /* /timer renders TimerView, which reads the timer context. */
    { withTimer: true },
  );
}

describe("route skeleton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["/", "Dashboard"],
    ["/tasks", "Tasks"],
    ["/exams", "Exams"],
    ["/timer", "Timer"],
    ["/library", "Library"],
    ["/library/notes", "Library"],
    ["/plan", "This week's plan"],
    ["/review/d-1", "Flashcard Review"],
    ["/settings", "Settings"],
  ])("%s renders the %s view for a signed-in user", (path, heading) => {
    renderAt(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
  });

  /* Its own case rather than a row in the table above: the subject page is
     titled with the folder's name, so it can only be asserted once the data
     has loaded. */
  it("/folders/:folderId renders that subject's workspace", async () => {
    mockAuthSession("user-1");
    renderAt("/folders/folder-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Biology" }),
    ).toBeInTheDocument();
  });

  /* Also its own case, same reason as the folder test above: the notes
     editor is titled with the material's name, only known once the material
     and its notes have loaded. */
  it("/notes/:materialId renders that material's notes", async () => {
    mockAuthSession("user-1");
    server.use(
      http.get(rest("materials"), () =>
        HttpResponse.json({
          id: "mat-1",
          user_id: "user-1",
          folder_id: null,
          title: "Cell division",
          type: "pdf",
          raw_content: null,
          storage_path: null,
          created_at: "2026-03-05T00:00:00.000Z",
        }),
      ),
      http.get(rest("notes"), () => HttpResponse.json([])),
    );
    renderAt("/notes/mat-1");

    await waitFor(() =>
      expect(screen.getByText("Cell division")).toBeInTheDocument(),
    );
  });

  /* Both quiz routes load before they can title themselves, so they get their
     own async cases too. The default handlers return no rows, which is the
     "quiz was deleted" path — enough to prove the route resolves. */
  it("/quiz/:quizId renders the quiz runner", async () => {
    mockAuthSession("user-1");
    renderAt("/quiz/q-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Quiz not found." }),
    ).toBeInTheDocument();
  });

  it("/quiz/:quizId/review renders the quiz review", async () => {
    mockAuthSession("user-1");
    renderAt("/quiz/q-1/review");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Quiz not found." }),
    ).toBeInTheDocument();
  });

  it("unknown paths fall through to Not found", () => {
    renderAt("/definitely-not-a-route");
    expect(
      screen.getByRole("heading", { level: 1, name: "Not found" }),
    ).toBeInTheDocument();
  });
});
