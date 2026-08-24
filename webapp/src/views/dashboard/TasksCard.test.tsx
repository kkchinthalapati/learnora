import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { TasksCard } from "./TasksCard";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function serveDueCount(total: number) {
  server.use(
    http.head(rest("flashcards"), () =>
      new HttpResponse(null, { headers: { "Content-Range": `0-0/${total}` } }),
    ),
  );
}

function renderCard() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/"]}>
      <TasksCard />
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("TasksCard", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not flash a false '0 due' banner while the count is still loading", () => {
    serveDueCount(5);
    renderCard();

    // Assert synchronously, before the due-count request has resolved: the
    // banner must be absent, not present with a stale/default "0 cards".
    expect(screen.queryByText(/due today/)).not.toBeInTheDocument();
  });

  it("shows nothing once loaded with no cards due", async () => {
    serveDueCount(0);
    renderCard();

    // Give the query a tick to settle, then confirm it stays hidden rather
    // than ever having shown a "0 cards due" flash.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/due today/)).not.toBeInTheDocument();
  });

  it("shows the due count and review link once loaded", async () => {
    serveDueCount(7);
    renderCard();

    expect(await screen.findByText("7 cards due today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review now" })).toHaveAttribute(
      "href",
      "/library/flashcards",
    );
  });

  it("uses singular phrasing for exactly one due card", async () => {
    serveDueCount(1);
    renderCard();

    expect(await screen.findByText("1 card due today")).toBeInTheDocument();
  });
});
