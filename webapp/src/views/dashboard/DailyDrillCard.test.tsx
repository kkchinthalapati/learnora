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
    http.get(rest("flashcards"), () =>
      HttpResponse.json([{ count: total }], { headers: { "Content-Range": `0-0/${total}` } }),
    ),
  );
}

function renderCard() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DailyDrillCard />} />
        <Route path="/review/daily-drill" element={<h1>Daily Drill Session</h1>} />
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
    serveDueCount(0);
    renderCard();
    expect(await screen.findByText("You're all caught up! No cards due.")).toBeInTheDocument();
  });

  it("shows count and navigates to drill when there are cards", async () => {
    serveDueCount(12);
    renderCard();
    expect(await screen.findByText("12")).toBeInTheDocument();
    
    await userEvent.click(screen.getByRole("button", { name: "Start Drill" }));
    expect(await screen.findByText("Daily Drill Session")).toBeInTheDocument();
  });
});
