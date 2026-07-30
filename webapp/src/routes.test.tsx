import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "./routes";
import { fakeSession, renderWithAuth } from "./test/auth";
import { mockAuthSession } from "./test/mockSession";

function renderAt(path: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
    { session: fakeSession() },
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
    ["/notes/m-1", "Notes"],
    ["/plan", "Weekly Plan"],
    ["/quiz/q-1", "Quiz"],
    ["/quiz/q-1/review", "Quiz Review"],
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

  it("unknown paths fall through to Not found", () => {
    renderAt("/definitely-not-a-route");
    expect(
      screen.getByRole("heading", { level: 1, name: "Not found" }),
    ).toBeInTheDocument();
  });
});
