import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL, supabase } from "../../lib/supabase";
import { mockAuthSession } from "../../test/mockSession";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { PrivacyTab } from "./PrivacyTab";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

function serveProfile(optOut: boolean) {
  server.use(
    http.get(rest("profiles"), () =>
      HttpResponse.json([{ leaderboard_opt_out: optOut }]),
    ),
  );
}

function render() {
  return renderWithAuth(<PrivacyTab />, { session: fakeSession() });
}

beforeEach(() => {
  mockAuthSession("user-1");
});

describe("PrivacyTab", () => {
  const toggleName = "Appear on friends' leaderboards";

  /* Withdrawing used to mean emailing support. */
  it("lets the student withdraw AI consent from the switch", async () => {
    serveProfile(false);
    const update = vi
      .spyOn(supabase.auth, "updateUser")
      .mockResolvedValue({ data: { user: null }, error: null } as never);
    const user = userEvent.setup();
    render();

    const ai = await screen.findByRole("switch", {
      name: "Let AI features use my study data",
    });
    /* No flag on the fake account = a legacy account, which has access. */
    expect(ai).toBeChecked();
    await user.click(ai);

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        data: expect.objectContaining({ consent_given: false }),
      }),
    );
  });

  it("shows the leaderboard toggle on when the user has not opted out", async () => {
    serveProfile(false);
    render();

    const toggle = await screen.findByRole("switch", { name: toggleName });
    expect(toggle).toBeChecked();
  });

  /* The stored column is an *opt-out*, but the control reads as an opt-in —
     "appear on leaderboards" is the thing a student is deciding about, and a
     toggle labelled with a negative is how settings screens get misread. */
  it("shows it off when they have opted out", async () => {
    serveProfile(true);
    render();

    const toggle = await screen.findByRole("switch", { name: toggleName });
    expect(toggle).not.toBeChecked();
  });

  it("saves the inverted value when switched off", async () => {
    serveProfile(false);
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(rest("profiles"), async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([]);
      }),
    );
    render();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: toggleName }));

    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toEqual({ leaderboard_opt_out: true });
  });

  /* Stated, not offered as a control: rooms have no discovery mechanism, so a
     "discoverable / invite-only" switch would have nothing on the other side. */
  it("states that study rooms are always invite-only, without a fake toggle", async () => {
    serveProfile(false);
    render();

    /* Waited on the leaderboard toggle first: it renders only once the
       privacy query settles, and counting switches before then would pass
       for the wrong reason. */
    await screen.findByRole("switch", { name: toggleName });

    expect(screen.getByText("Study rooms")).toBeInTheDocument();
    expect(screen.getByText(/Always invite-only/)).toBeInTheDocument();
    /* Two real switches: AI consent and the leaderboard. Rooms has none. */
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("offers a data download and says what it does not include", async () => {
    serveProfile(false);
    render();

    expect(
      await screen.findByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Uploaded files themselves are not included/),
    ).toBeInTheDocument();
  });
});
