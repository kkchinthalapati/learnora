import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { StudyCircleCard } from "./StudyCircleCard";

vi.mock("../../hooks/useStudyRoom", () => ({
  useStudyRoom: () => ({ activeCount: 0 }),
}));

const rpc = (name: string) => `${SUPABASE_URL}/rest/v1/rpc/${name}`;

const ME = {
  friendship_id: null,
  user_id: "user-1",
  full_name: "Ada King",
  avatar_url: null,
  weekly_minutes: 90,
  streak: 3,
  is_self: true,
  rank: 2,
};

const FRIEND = {
  friendship_id: "friendship-1",
  user_id: "user-2",
  full_name: "Grace Hopper",
  avatar_url: null,
  weekly_minutes: 240,
  streak: 6,
  is_self: false,
  rank: 1,
};

function serveLeaderboard(entries: unknown[]) {
  server.use(
    http.post(rpc("get_friends_leaderboard"), () => HttpResponse.json(entries)),
  );
}

function renderCard() {
  mockAuthSession("user-1");
  return renderWithAuth(
    <MemoryRouter>
      <StudyCircleCard />
    </MemoryRouter>,
    { session: fakeSession() },
    { withTimer: true },
  );
}

describe("StudyCircleCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts to add a friend when the board is just the caller", async () => {
    serveLeaderboard([ME]);
    renderCard();

    expect(
      await screen.findByText(/Add a friend to compare focus time/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/friends",
    );
  });

  it("shows accepted friends ranked, with the caller labelled 'You'", async () => {
    serveLeaderboard([FRIEND, ME]);
    renderCard();

    await screen.findByText("Grace Hopper");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/4h this week/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Full leaderboard" }),
    ).toHaveAttribute("href", "/friends");
  });

  it("caps the visible rows at three", async () => {
    const extra = ["Bob", "Carl", "Dee"].map((name, i) => ({
      ...FRIEND,
      user_id: `user-extra-${i}`,
      full_name: name,
      rank: i + 3,
    }));
    serveLeaderboard([FRIEND, ME, ...extra]);
    renderCard();

    await screen.findByText("Grace Hopper");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Carl")).toBeNull();
    expect(screen.queryByText("Dee")).toBeNull();
  });

  it("surfaces a load failure instead of hanging silently", async () => {
    server.use(
      http.post(rpc("get_friends_leaderboard"), () =>
        HttpResponse.json({ message: "down" }, { status: 500 }),
      ),
    );
    renderCard();

    expect(
      await screen.findByText(/Could not load your study circle/),
    ).toBeInTheDocument();
  });
});
