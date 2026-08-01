import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthState {
  /* null once resolved and signed out; undefined is never exposed — `loading`
     is how callers tell "not known yet" from "known to be signed out". */
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
