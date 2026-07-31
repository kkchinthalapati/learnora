import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type {
  AuthChangeEvent,
  Session,
  Subscription,
} from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { renderWithAuth } from "../../test/auth";
import { ResetPasswordView } from "./ResetPasswordView";

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

/* Spying on the client rather than intercepting at the network layer, matching
 * SecurityTab's tests (Step 7). `updateUser` refuses to reach the network at
 * all without a stored session, so an MSW handler for it would never be hit. */
function mockUpdateUser() {
  return vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
    data: { user: { id: "u1" } },
    error: null,
  } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>);
}

function mockSignOut() {
  return vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.signOut>>);
}

/* Hands the test the callback the view registered, so PASSWORD_RECOVERY can be
 * delivered on demand.
 *
 * Driving this through a spy rather than a real token exchange is the whole
 * point: what the view actually reacts to is the event, and the exchange that
 * produces it is supabase-js's job, covered by its own tests. */
function captureAuthListener(): { fire: (event: AuthChangeEvent) => void } {
  let listener: Listener | null = null;
  const unsubscribe = vi.fn();
  vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((cb) => {
    listener = cb as Listener;
    return {
      data: { subscription: { unsubscribe } as unknown as Subscription },
    };
  });
  return {
    fire: (event) => act(() => listener?.(event, null)),
  };
}

function renderReset() {
  return renderWithAuth(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordView />} />
      </Routes>
    </MemoryRouter>,
    { session: null },
  );
}

describe("ResetPasswordView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits before deciding, rather than assuming the link is bad", () => {
    captureAuthListener();
    renderReset();

    expect(
      screen.getByRole("heading", { level: 1, name: "Checking your link" }),
    ).toBeInTheDocument();
  });

  it("shows the form once Supabase reports a recovery session", async () => {
    const auth = captureAuthListener();
    renderReset();
    auth.fire("PASSWORD_RECOVERY");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Reset Password" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
  });

  it("calls the link expired when no recovery event ever arrives", async () => {
    /* Real time, not fake timers — the suite's other views have to run against
       a live clock (see the ledger's note on vi.useFakeTimers), and the view's
       deadline is only 3s. */
    captureAuthListener();
    renderReset();

    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Link expired" },
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Send a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("updates the password, then signs every session out", async () => {
    const updateUser = mockUpdateUser();
    const signOut = mockSignOut();

    const auth = captureAuthListener();
    const user = userEvent.setup();
    renderReset();
    auth.fire("PASSWORD_RECOVERY");

    await screen.findByLabelText("New Password");
    await user.type(screen.getByLabelText("New Password"), "Password1!");
    await user.type(screen.getByLabelText("Confirm Password"), "Password1!");
    await user.click(screen.getByRole("button", { name: "Update Password →" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "All done!" }),
    ).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ password: "Password1!" });

    /* Other sessions, then this one: a reset is what you do when you think
       someone else is in your account, so leaving their session alive would
       defeat the point — and dropping the recovery session too makes the user
       prove the new password works. */
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ scope: "others" }),
    );
    expect(signOut).toHaveBeenCalledWith();
    expect(
      screen.getByRole("link", { name: "Go to sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("refuses mismatched passwords without calling the API", async () => {
    const updateUser = mockUpdateUser();

    const auth = captureAuthListener();
    const user = userEvent.setup();
    renderReset();
    auth.fire("PASSWORD_RECOVERY");

    await screen.findByLabelText("New Password");
    await user.type(screen.getByLabelText("New Password"), "Password1!");
    await user.type(screen.getByLabelText("Confirm Password"), "Password2!");
    await user.click(screen.getByRole("button", { name: "Update Password →" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("keeps the form up when the update is rejected", async () => {
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: null },
      error: {
        message: "New password should be different from the old password.",
      },
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>);

    const auth = captureAuthListener();
    const user = userEvent.setup();
    renderReset();
    auth.fire("PASSWORD_RECOVERY");

    await screen.findByLabelText("New Password");
    await user.type(screen.getByLabelText("New Password"), "Password1!");
    await user.type(screen.getByLabelText("Confirm Password"), "Password1!");
    await user.click(screen.getByRole("button", { name: "Update Password →" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "must be different",
    );
    /* Still on the form, so the user can correct it — not stranded on a
       success screen for something that failed. */
    expect(screen.getByLabelText("New Password")).toBeInTheDocument();
  });
});
