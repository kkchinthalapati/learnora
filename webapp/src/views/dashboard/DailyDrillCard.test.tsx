import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { DailyDrillCard } from "./DailyDrillCard";

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
      <Routes>
        <Route path="/" element={<DailyDrillCard />} />
        <Route
          path="/review/daily-drill"
          element={<h1>Daily Drill Session</h1>}
        />
        <Route path="/library/flashcards" element={<h1>Flashcards</h1>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("DailyDrillCard", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows zero due state", async () => {
    const user = userEvent.setup();
    serveDueCount(0);
    renderCard();
    expect(await screen.findByText(/You're caught up/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open flashcards" }));
    expect(await screen.findByText("Flashcards")).toBeInTheDocument();
  });

  it("shows count and navigates to drill when there are cards", async () => {
    const user = userEvent.setup();
    serveDueCount(12);
    renderCard();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText(/up to 12 across your decks/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start drill" }));
    expect(await screen.findByText("Daily Drill Session")).toBeInTheDocument();
  });

  it("sets the expectation that a drill caps at twenty cards", async () => {
    serveDueCount(42);
    renderCard();

    expect(
      await screen.findByText(/up to 20 across your decks/),
    ).toBeInTheDocument();
  });
});
