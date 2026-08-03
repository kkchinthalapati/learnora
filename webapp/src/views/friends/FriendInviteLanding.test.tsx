import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import type { FriendRelationship } from "../../api/types";
import { FriendInviteLanding } from "./FriendInviteLanding";

const rpc = (name: string) => `${SUPABASE_URL}/rest/v1/rpc/${name}`;

/* `resolve_friend_code` is `returns table (...)`, so PostgREST sends an array
   even for the single row — and an empty array for a code that matched
   nothing, which is the "link is dead" path rather than an error. */
function serveResolve(
  row: {
    full_name?: string | null;
    is_self?: boolean;
    relationship?: FriendRelationship;
  } | null,
) {
  server.use(
    http.post(rpc("resolve_friend_code"), () =>
      HttpResponse.json(
        row
          ? [
              {
                id: "user-2",
                full_name: row.full_name ?? "Grace Hopper",
                avatar_url: null,
                is_self: row.is_self ?? false,
                relationship: row.relationship ?? "none",
              },
            ]
          : [],
      ),
    ),
  );
}

function renderLanding(code = "K7M2QW9X") {
  mockAuthSession("user-1");
  return renderWithAuth(
    <MemoryRouter initialEntries={[`/friends/add/${code}`]}>
      <Routes>
        <Route path="/friends/add/:code" element={<FriendInviteLanding />} />
        <Route path="/friends" element={<div>Friends hub</div>} />
      </Routes>
    </MemoryRouter>,
    { session: fakeSession() },
  );
}

describe("FriendInviteLanding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks before sending anything", async () => {
    let called = false;
    serveResolve({});
    server.use(
      http.post(rpc("request_or_accept_friend"), () => {
        called = true;
        return HttpResponse.json("pending");
      }),
    );
    renderLanding();

    expect(
      await screen.findByText("Add Grace Hopper as a friend?"),
    ).toBeInTheDocument();
    // Merely opening the link is not consent — nothing has been sent yet.
    expect(called).toBe(false);
  });

  it("sends the request on confirm and returns to the hub", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    serveResolve({});
    server.use(
      http.post(rpc("request_or_accept_friend"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json("pending");
      }),
    );
    renderLanding();

    await user.click(
      await screen.findByRole("button", { name: "Send request" }),
    );

    await waitFor(() => expect(body).toEqual({ code: "K7M2QW9X" }));
    expect(await screen.findByText("Friends hub")).toBeInTheDocument();
  });

  it("accepts instead of re-requesting when they already asked you", async () => {
    const user = userEvent.setup();
    serveResolve({ relationship: "incoming" });
    server.use(
      http.post(rpc("request_or_accept_friend"), () =>
        HttpResponse.json("accepted"),
      ),
    );
    renderLanding();

    expect(
      await screen.findByText("Grace Hopper already asked to be your friend"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(
      await screen.findByText("You and Grace Hopper are now friends."),
    ).toBeInTheDocument();
  });

  it("reports a dead link without offering to send anything", async () => {
    serveResolve(null);
    renderLanding();

    expect(
      await screen.findByText("This link is not valid"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("recognises the user's own link", async () => {
    serveResolve({ is_self: true, full_name: "Ada King" });
    renderLanding();

    expect(
      await screen.findByText("This is your own link"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("says so when the two are already friends", async () => {
    serveResolve({ relationship: "accepted" });
    renderLanding();

    expect(
      await screen.findByText("You and Grace Hopper are already friends"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("does not offer to send a second request on a link already followed", async () => {
    serveResolve({ relationship: "outgoing" });
    renderLanding();

    expect(await screen.findByText("Request already sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("surfaces a failed resolve rather than a blank card", async () => {
    server.use(
      http.post(rpc("resolve_friend_code"), () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    renderLanding();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not check this invite link/i,
    );
  });

  it("keeps the user on the page when sending the request fails", async () => {
    const user = userEvent.setup();
    serveResolve({});
    server.use(
      http.post(rpc("request_or_accept_friend"), () =>
        HttpResponse.json({ message: "already pending" }, { status: 400 }),
      ),
    );
    renderLanding();

    await user.click(
      await screen.findByRole("button", { name: "Send request" }),
    );

    expect(
      await screen.findByText(/could not send the request/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Friends hub")).toBeNull();
  });
});
