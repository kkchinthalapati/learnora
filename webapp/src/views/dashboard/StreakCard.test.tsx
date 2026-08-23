import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { StreakCard } from "./StreakCard";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function serveSessions(sessions: unknown[]) {
  server.use(
    http.get(rest("study_sessions"), () => HttpResponse.json(sessions)),
    http.get(rest("folders"), () => HttpResponse.json([])),
  );
}

describe("StreakCard", () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthSession("user-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty state when there are no sessions, with Trophy button", async () => {
    const user = userEvent.setup();
    serveSessions([]);
    renderWithAuth(<StreakCard />, { session: fakeSession() });

    expect(
      await screen.findByText(/Start your first streak today/),
    ).toBeInTheDocument();

    const trophyBtn = screen.getByRole("button", {
      name: "Open Achievements and Study Goals",
    });
    expect(trophyBtn).toBeInTheDocument();

    await user.click(trophyBtn);
    expect(await screen.findByText("Trophy Cabinet")).toBeInTheDocument();
  });

  it("renders streak count, daily goal progress ring, and opens modal on Badges click", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString();
    serveSessions([
      {
        id: "s-1",
        user_id: "user-1",
        minutes: 25,
        started_at: today,
        created_at: today,
      },
    ]);

    renderWithAuth(<StreakCard />, { session: fakeSession() });

    expect(await screen.findByText("Streak & Daily Goal")).toBeInTheDocument();
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText("25 / 30m")).toBeInTheDocument();

    const trophyBtn = screen.getByRole("button", {
      name: "Open Trophy Cabinet and Achievements",
    });
    await user.click(trophyBtn);

    expect(await screen.findByText("Trophy Cabinet")).toBeInTheDocument();
  });

  it("shows 'Goal Complete! 🔥' when today's minutes reach the goal", async () => {
    const today = new Date().toISOString();
    serveSessions([
      {
        id: "s-1",
        user_id: "user-1",
        minutes: 40,
        started_at: today,
        created_at: today,
      },
    ]);

    renderWithAuth(<StreakCard />, { session: fakeSession() });

    expect(await screen.findByText("40 / 30m")).toBeInTheDocument();
    expect(screen.getByText("Goal Complete! 🔥")).toBeInTheDocument();
  });
});
