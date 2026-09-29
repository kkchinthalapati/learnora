import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";
import { clearAppearance } from "../lib/appearance";
import { AuthContext } from "./auth";
import { migrateGuestSessions } from "../lib/guestSessionMigration";
import { claimLocalStorageFor } from "../lib/userStorage";
import { clearOfflineCards } from "../lib/offlineCards";

/* Port of Auth.getSession / Auth.logout from js/api.js.
 *
 * Reads getSession() first — it resolves from local storage without a network
 * round trip — then keeps itself in sync through onAuthStateChange, which is
 * also what refreshes the token in the background. The vanilla module kept a
 * `_cachedUser` variable for the same reason; here the provider's state is
 * that cache. */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null | undefined>(undefined);

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null;
    if (lastUserId.current !== undefined && lastUserId.current !== nextUserId) {
      queryClient.clear();
      clearAppearance();
      /* Signing out (or in as someone else) wipes the device's offline copy
         of the last student's cards and images. Their queued, not-yet-synced
         grades are not in it: those follow userStorage.ts's rule — kept for
         the same student signing back in, cleared for anyone else. */
      void clearOfflineCards();
    }
    lastUserId.current = nextUserId;
    // Before the new session renders anything: a different student signing
    // in on this browser must not see the last one's drafts or resume card.
    if (nextUserId) claimLocalStorageFor(nextUserId);
    setSession(nextSession);
    if (nextUserId) {
      void migrateGuestSessions(nextUserId).catch((error) =>
        console.warn(
          "[Auth] Guest session import will retry next login:",
          error,
        ),
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        applySession(error ? null : data.session);
      })
      .catch(() => {
        // A malformed or unreadable stored session must not leave the app
        // stuck on its loading state — treat it as signed out.
        if (active) applySession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      applySession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Fall through: the local session is cleared either way, matching the
      // vanilla logout's "force clear even if signOut API fails".
    }
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
