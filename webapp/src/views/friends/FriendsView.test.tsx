import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { FriendsView } from "./FriendsView";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;
const rpc = (name: string) => `${SUPABASE_URL}/rest/v1/rpc/${name}`;

/* onRemove fires the actual RPC from a setTimeout, not on confirm — a 4s
 * "Undo" window (FriendsView.tsx's onRemove) so a misclick doesn't cost a
 * friend outright. The setTimeout has to be *scheduled* under fake timers
 * to be advanceable — enabling them only after the fact leaves it running
 * on the real clock — so callers wrap the confirming click in this, then
 * call jumpPastUndoWindow() once the toast has appeared. */
function useFakeTimersForUndoWindow() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
}

function jumpPastUndoWindow() {
  act(() => {
    vi.advanceTimersByTime(4100);
  });
  vi.useRealTimers();
}

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

function serveCode(code: string | null) {
  server.use(
    http.get(rest("profiles"), () =>
      HttpResponse.json(code ? [{ friend_code: code }] : []),
    ),
  );
}

function serveLeaderboard(entries: unknown[]) {
  server.use(
    http.post(rpc("get_friends_leaderboard"), () => HttpResponse.json(entries)),
  );
}

function serveRequests(requests: unknown[]) {
  server.use(
    http.post(rpc("get_friend_requests"), () => HttpResponse.json(requests)),
  );
}

function renderFriends() {
  mockAuthSession("user-1");
  return renderWithAuth(
    <MemoryRouter>
      <FriendsView />
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("FriendsView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the invite link built from the signed-in user's own code", async () => {
    serveCode("K7M2QW9X");
    renderFriends();

    const field = await screen.findByLabelText("Your friend invite link");
    /* The path, not the whole URL: jsdom's origin is localhost and the base
       prefix comes from Vite, so asserting the full string would pin the
       test to build config rather than to behaviour. */
    expect((field as HTMLInputElement).value).toContain("friends/add/K7M2QW9X");
    expect((field as HTMLInputElement).value).toMatch(/^https?:\/\//);
  });

  it("copies the link and confirms it", async () => {
    const user = userEvent.setup();
    serveCode("K7M2QW9X");
    renderFriends();

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toContain(
      "friends/add/K7M2QW9X",
    );
  });

  it("tells the user when their profile has no code yet", async () => {
    serveCode(null);
    renderFriends();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /profile is still being set up/i,
    );
  });

  it("ranks friends and marks the signed-in user's own row", async () => {
    serveLeaderboard([FRIEND, ME]);
    renderFriends();

    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByText("Grace Hopper")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("4h this week · 6 days streak"),
    ).toBeInTheDocument();

    expect(within(rows[1]).getByText("Ada King")).toBeInTheDocument();
    expect(within(rows[1]).getByText("You")).toBeInTheDocument();
  });

  it("offers no Remove button on the user's own row", async () => {
    serveLeaderboard([FRIEND, ME]);
    renderFriends();

    const rows = await screen.findAllByRole("listitem");
    const selfRow = rows.find((row) => within(row).queryByText("You"));
    expect(selfRow).toBeDefined();
    expect(
      within(selfRow!).queryByRole("button", { name: "Remove" }),
    ).toBeNull();
    // The friend's row still has one, so this isn't passing by rendering nothing.
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  });

  it("shows the empty state when the only person on the board is you", async () => {
    serveLeaderboard([ME]);
    renderFriends();

    expect(await screen.findByText("No friends yet")).toBeInTheDocument();
  });

  it("accepts an incoming request and sends the friendship id", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    serveRequests([
      {
        friendship_id: "friendship-9",
        user_id: "user-3",
        full_name: "Katherine Johnson",
        avatar_url: null,
        direction: "incoming",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ]);
    server.use(
      http.post(rpc("respond_to_friend_request"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json("accepted");
      }),
    );
    renderFriends();

    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(body).toEqual({ request_id: "friendship-9", accept: true });
    });
    expect(
      await screen.findByText("You and Katherine Johnson are now friends."),
    ).toBeInTheDocument();
  });

  it("offers Withdraw rather than Accept on a request you sent", async () => {
    serveRequests([
      {
        friendship_id: "friendship-8",
        user_id: "user-4",
        full_name: "Alan Turing",
        avatar_url: null,
        direction: "outgoing",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ]);
    renderFriends();

    expect(
      await screen.findByRole("button", { name: "Withdraw" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("hides the requests section entirely when nothing is pending", async () => {
    serveRequests([]);
    renderFriends();

    await screen.findByLabelText("Your friend invite link");
    expect(screen.queryByRole("heading", { name: "Requests" })).toBeNull();
  });

  it("removes a friend only after the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    let called = false;
    serveLeaderboard([FRIEND, ME]);
    server.use(
      http.post(rpc("remove_friend"), () => {
        called = true;
        return HttpResponse.json(null);
      }),
    );
    renderFriends();

    await user.click(await screen.findByRole("button", { name: "Remove" }));

    // Still nothing sent — the destructive call waits on the dialog.
    expect(called).toBe(false);
    const dialog = await screen.findByRole("alertdialog");
    useFakeTimersForUndoWindow();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await screen.findByText("Removed Grace Hopper."),
    ).toBeInTheDocument();
    expect(called).toBe(false); // still just the toast — the RPC waits on the undo window

    jumpPastUndoWindow();
    await waitFor(() => expect(called).toBe(true));
  });

  it("keeps the friend when the confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    let called = false;
    serveLeaderboard([FRIEND, ME]);
    server.use(
      http.post(rpc("remove_friend"), () => {
        called = true;
        return HttpResponse.json(null);
      }),
    );
    renderFriends();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(called).toBe(false);
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("warns before rotating the code, then reports the new link", async () => {
    const user = userEvent.setup();
    serveCode("K7M2QW9X");
    server.use(
      http.post(rpc("regenerate_friend_code"), () =>
        HttpResponse.json("NEWCODE9"),
      ),
    );
    renderFriends();

    await user.click(await screen.findByRole("button", { name: "New link" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/current link stops working/i);
    await user.click(within(dialog).getByRole("button", { name: "Generate" }));

    expect(
      await screen.findByText("New invite link ready."),
    ).toBeInTheDocument();
  });

  it("surfaces a leaderboard failure instead of an empty board", async () => {
    serveLeaderboard([]);
    server.use(
      http.post(rpc("get_friends_leaderboard"), () =>
        HttpResponse.json({ message: "permission denied" }, { status: 403 }),
      ),
    );
    renderFriends();

    const alerts = await screen.findAllByRole("alert");
    expect(
      alerts.some((el) =>
        /could not load the leaderboard/i.test(el.textContent ?? ""),
      ),
    ).toBe(true);
  });
});
