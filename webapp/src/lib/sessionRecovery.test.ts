import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./supabase";
import {
  handleRequestError,
  recoverSession,
  resetSessionRecoveryState,
} from "./sessionRecovery";

/* Re-spied per test rather than once at module scope: `restoreAllMocks`
   detaches a spy, and a module-level handle kept pointing at the detached one
   while the real network method quietly took the calls. */
let refreshSession: ReturnType<typeof vi.spyOn>;
let signOut: ReturnType<typeof vi.spyOn>;

function renewed() {
  return { data: { session: { user: {} }, user: {} }, error: null };
}
function rejected() {
  return { data: { session: null, user: null }, error: { message: "gone" } };
}

beforeEach(() => {
  resetSessionRecoveryState();
  refreshSession = vi.spyOn(supabase.auth, "refreshSession");
  signOut = vi
    .spyOn(supabase.auth, "signOut")
    .mockResolvedValue({ error: null } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recoverSession", () => {
  it("keeps the student signed in when the token can still be renewed", async () => {
    refreshSession.mockResolvedValue(renewed() as never);

    await expect(recoverSession()).resolves.toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out once the refresh token is spent", async () => {
    refreshSession.mockResolvedValue(rejected() as never);

    await expect(recoverSession()).resolves.toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  /* The failure this guards against is a whole screen of queries 401-ing in
     the same tick. Eight concurrent refreshes against one token is how token
     rotation invalidates a session that was recoverable. */
  it("collapses concurrent recoveries into a single refresh", async () => {
    refreshSession.mockResolvedValue(renewed() as never);

    await Promise.all([recoverSession(), recoverSession(), recoverSession()]);

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  /* Being unable to reach the refresh endpoint is not evidence the session is
     dead. Signing out here would log a student out every time a train went
     into a tunnel. */
  it("does not sign out when the refresh itself could not be attempted", async () => {
    refreshSession.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(recoverSession()).resolves.toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("handleRequestError", () => {
  it("ignores a failure that has nothing to do with the session", async () => {
    refreshSession.mockResolvedValue(renewed() as never);

    handleRequestError(new Error("row not found"));
    handleRequestError({ status: 500 });

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("starts a recovery on an unauthorised response", async () => {
    refreshSession.mockResolvedValue(renewed() as never);

    handleRequestError({ status: 401, message: "JWT expired" });

    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
  });
});
