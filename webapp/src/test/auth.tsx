import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { type AuthState } from "../context/auth";
import { renderWithProviders } from "./render";

/* A session shaped like the real one but built locally, so route and guard
 * tests never touch supabase-js. AuthProvider's own tests mock the client
 * module instead and exercise the real subscription wiring. */
export function fakeSession(overrides: Partial<User> = {}): Session {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "student@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  } as Session;
}

export function authValue(partial: Partial<AuthState> = {}): AuthState {
  const session = partial.session ?? null;
  return {
    session,
    user: session?.user ?? null,
    loading: false,
    signOut: async () => {},
    ...partial,
  };
}

/* Renders inside the full App provider stack with a canned auth state. Views
 * reach for toasts, dialogs and the query cache as soon as they stop being
 * placeholders, so the guard tests and the view tests share one composition
 * rather than drifting apart. */
export function renderWithAuth(
  ui: ReactNode,
  state: Partial<AuthState> = {},
  options: { withTimer?: boolean; withRouter?: boolean } = {},
) {
  return renderWithProviders(ui, authValue(state), options);
}
