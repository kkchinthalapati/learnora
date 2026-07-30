import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "./routes";
import { fakeSession, renderWithAuth } from "./test/auth";

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
  it.each([
    ["/", "Dashboard"],
    ["/tasks", "Tasks"],
    ["/exams", "Exams"],
    ["/timer", "Timer"],
    ["/library", "Library"],
    ["/library/notes", "Library"],
    ["/folders/f-1", "Subject"],
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

  it("unknown paths fall through to Not found", () => {
    renderAt("/definitely-not-a-route");
    expect(
      screen.getByRole("heading", { level: 1, name: "Not found" }),
    ).toBeInTheDocument();
  });
});
