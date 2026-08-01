import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthContext } from "./auth";

/* Port of Auth.getSession / Auth.logout from js/api.js.
 *
 * Reads getSession() first — it resolves from local storage without a network
 * round trip — then keeps itself in sync through onAuthStateChange, which is
 * also what refreshes the token in the background. The vanilla module kept a
 * `_cachedUser` variable for the same reason; here the provider's state is
 * that cache. */

const INVITE_ACCESS_KEY = "learnora_invite_access";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(error ? null : data.session);
      })
      .catch(() => {
        // A malformed or unreadable stored session must not leave the app
        // stuck on its loading state — treat it as signed out.
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Fall through: the local session is cleared either way, matching the
      // vanilla logout's "force clear even if signOut API fails".
    }
    localStorage.removeItem(INVITE_ACCESS_KEY);
    sessionStorage.removeItem(INVITE_ACCESS_KEY);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, signOut }),
    [session, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
