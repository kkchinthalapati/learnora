import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./auth";
import { fakeSession } from "../test/auth";
import {
  loadOfflineSnapshot,
  saveOfflineSnapshot,
  setOfflineKVForTests,
  type OfflineKV,
} from "../lib/offlineCards";

const unsubscribe = vi.fn();
const getSession = vi.fn();
const signOut = vi.fn();
const onAuthStateChange = vi.fn();

/* `SUPABASE_URL` is re-exported because this file's provider stack reaches
   modules that build request URLs from it at import time (api/ai.ts, via the
   create dialog) — a partial mock without it fails the whole suite on load. */
vi.mock("../lib/supabase", () => ({
  SUPABASE_URL: "https://project.supabase.co",
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      signOut: (...args: unknown[]) => signOut(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
    },
  },
}));

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

  describe("offline flashcard copy", () => {
    function memoryKV(): OfflineKV {
      const data = new Map<string, unknown>();
      const k = (store: string, key: string) => `${store}/${key}`;
      return {
        get: async <T,>(store: string, key: string) => data.get(k(store, key)) as T | undefined,
        put: async (store, key, value) => void data.set(k(store, key), value),
        delete: async (store, key) => void data.delete(k(store, key)),
        keys: async () => [...data.keys()],
        clear: async () => data.clear(),
      };
    }

    it("is wiped on sign-out, and kept across a same-student token refresh", async () => {
      setOfflineKVForTests(memoryKV());
      getSession.mockResolvedValue({ data: { session: fakeSession() }, error: null });
      await saveOfflineSnapshot("user-1", [], []);

      const user = userEvent.setup();
      renderProvider();
      await waitFor(() =>
        expect(screen.getByTestId("state")).toHaveTextContent("student@example.com"),
      );

      emitAuthChange("TOKEN_REFRESHED", fakeSession());
      await new Promise((r) => setTimeout(r, 0));
      expect(await loadOfflineSnapshot("user-1")).not.toBeNull();

      await user.click(screen.getByRole("button", { name: "Sign out" }));
      await waitFor(async () => expect(await loadOfflineSnapshot("user-1")).toBeNull());
    });
  });
});
