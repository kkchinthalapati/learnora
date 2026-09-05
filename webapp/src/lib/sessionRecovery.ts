import { supabase } from "./supabase";
import { isAuthError } from "./requestErrors";

/* What happens to a tab left open overnight.
 *
 * Supabase refreshes the access token on a timer, but that timer only runs
 * while the tab is awake and the network is up. A laptop that slept through
 * the refresh window, or was offline across it, wakes with a token the API
 * will not accept and a refresh token that may itself have expired. Nothing
 * in the app noticed: every query simply failed with a 401 the UI rendered as
 * an ordinary "couldn't load" state, on every screen, until the student
 * thought to reload. `onAuthStateChange` never fired, because from the
 * client's point of view nothing about the session had changed.
 *
 * So: when a request comes back unauthorised, ask once whether the session can
 * still be renewed. If it can, the retry succeeds and the student sees a blink.
 * If it cannot, sign out — which is what finally drives ProtectedRoute's
 * redirect to /login instead of a dashboard full of error cards. */

/** One recovery at a time. A screen with eight queries on it fails eight times
 *  within the same tick; without this each one would fire its own refresh, and
 *  a burst of concurrent refreshes against the same token is how a *valid*
 *  session gets invalidated by rotation. */
let inFlight: Promise<boolean> | null = null;

/** Guards against a recovery loop: if signing out somehow leaves requests
 *  failing, this stops the handler re-entering forever. Cleared on success. */
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

export function resetSessionRecoveryState(): void {
  inFlight = null;
  consecutiveFailures = 0;
}

/**
 * Try to renew the session. Resolves true when the tab is still authenticated
 * afterwards, false when the student has been signed out.
 */
export async function recoverSession(): Promise<boolean> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
        consecutiveFailures = 0;
        return true;
      }
    } catch {
      /* Offline, or the refresh endpoint itself is unreachable. That is not
         proof the session is dead — falling through to signOut here would log
         out every student the moment the network hiccuped. */
      consecutiveFailures = 0;
      return true;
    }

    consecutiveFailures += 1;
    if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) return false;

    /* The refresh token is genuinely spent. Clear it so the app stops
       presenting a signed-in shell backed by credentials the API rejects. */
    try {
      await supabase.auth.signOut();
    } catch {
      /* AuthProvider.signOut has the same fallback: the local session is
         cleared by the state change either way. */
    }
    return false;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/**
 * Call on any failed request. A no-op unless the failure was an auth failure,
 * so callers can hand it everything without pre-filtering.
 */
export function handleRequestError(error: unknown): void {
  if (!isAuthError(error)) return;
  void recoverSession();
}
