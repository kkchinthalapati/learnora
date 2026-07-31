import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./auth";
import { fakeSession } from "../test/auth";

const unsubscribe = vi.fn();
const getSession = vi.fn();
const signOut = vi.fn();
const onAuthStateChange = vi.fn();

/* importOriginal + spread, not a bare replacement object: this file only
 * cares about mocking the `supabase` client, but test/auth.tsx (imported for
 * fakeSession below) pulls in the whole provider stack via test/render.tsx —
 * including, as of Step 14, api/ai.ts, which reads `SUPABASE_URL` at module
 * load. A bare `{ supabase: {...} }` replacement drops every other export
 * that anything in that chain might need, present or future. */
vi.mock("../lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/supabase")>();
  return {
    ...actual,
    supabase: {
      auth: {
        getSession: (...args: unknown[]) => getSession(...args),
        signOut: (...args: unknown[]) => signOut(...args),
        onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
      },
    },
  };
});

/* Captured so tests can drive the callback supabase would normally invoke on
 * sign-in, sign-out and token refresh. */
let emitAuthChange: (event: AuthChangeEvent, session: Session | null) => void;

function Probe() {
  const { user, loading, signOut: doSignOut } = useAuth();
  return (
    <div>
      <p data-testid="state">
        {loading ? "loading" : (user?.email ?? "signed-out")}
      </p>
      <button type="button" onClick={() => void doSignOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  // Cleared here rather than in afterEach: RTL's automatic cleanup unmounts
  // the tree *after* afterEach hooks, so an unsubscribe from the previous
  // test would otherwise be counted against the next one.
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();

  getSession.mockResolvedValue({ data: { session: null }, error: null });
  signOut.mockResolvedValue({ error: null });
  onAuthStateChange.mockImplementation(
    (cb: (event: AuthChangeEvent, session: Session | null) => void) => {
      emitAuthChange = cb;
      return { data: { subscription: { unsubscribe } } };
    },
  );
});

describe("AuthProvider", () => {
  it("exposes the stored session without a network round trip", async () => {
    getSession.mockResolvedValue({
      data: { session: fakeSession() },
      error: null,
    });
    renderProvider();

    expect(screen.getByTestId("state")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent(
        "student@example.com",
      ),
    );
  });

  it("treats a getSession error as signed out", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: { message: "bad token" },
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );
  });

  it("does not get stuck loading when reading the session throws", async () => {
    getSession.mockRejectedValue(new Error("storage unavailable"));
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );
  });

  it("follows sign-in and sign-out events from Supabase", async () => {
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );

    emitAuthChange("SIGNED_IN", fakeSession());
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent(
        "student@example.com",
      ),
    );

    emitAuthChange("SIGNED_OUT", null);
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );
  });

  it("clears the invite-access keys on sign out", async () => {
    getSession.mockResolvedValue({
      data: { session: fakeSession() },
      error: null,
    });
    localStorage.setItem("learnora_invite_access", "granted");
    sessionStorage.setItem("learnora_invite_access", "granted");

    const user = userEvent.setup();
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent(
        "student@example.com",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );
    expect(localStorage.getItem("learnora_invite_access")).toBeNull();
    expect(sessionStorage.getItem("learnora_invite_access")).toBeNull();
  });

  it("still signs out locally when the API call fails", async () => {
    getSession.mockResolvedValue({
      data: { session: fakeSession() },
      error: null,
    });
    signOut.mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent(
        "student@example.com",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent("signed-out"),
    );
  });

  it("unsubscribes from auth events on unmount", async () => {
    const { unmount } = renderProvider();
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
