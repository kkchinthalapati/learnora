import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../../context/auth";
import { Skeleton } from "../../components/Skeleton";

/* The mirror image of `ProtectedRoute`: it keeps a signed-in user off the
 * sign-in screens, and it is what finally consumes the `state.from` that
 * `ProtectedRoute` has been recording since Step 4.
 *
 * Waiting out `loading` matters as much here as it does in the guard. The
 * stored session resolves a tick after first paint, so rendering the form
 * immediately would flash a login screen at someone who is already signed in
 * and merely reloaded the page.
 *
 * `replace` on the redirect keeps the auth screen out of the history stack —
 * otherwise Back lands on a login form that instantly bounces forward again. */

interface FromState {
  from?: { pathname?: string };
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main aria-busy="true" style={{ padding: "var(--s-8)" }}>
        <Skeleton label="Checking your session" width="40%" height={28} />
      </main>
    );
  }

  if (session) {
    const from = (location.state as FromState | null)?.from?.pathname;
    /* Never bounce back to an auth route: a user who hit /login directly while
       signed in has `from` unset, but one who was redirected *out* of /login
       could otherwise be sent straight back into it. */
    const target = from && !isAuthPath(from) ? from : "/";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

const AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify",
];

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.includes(pathname);
}
