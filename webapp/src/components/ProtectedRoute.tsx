import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/auth";
import { Skeleton } from "./Skeleton";

/* Layout route guarding every migrated view.
 *
 * While the stored session is still being read, this renders a placeholder
 * rather than redirecting: bouncing to /login on first paint would sign out
 * anyone who simply reloaded the page. Only a resolved "no session" redirects,
 * and it records where the user was headed so the sign-in flow can return
 * them there. */

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main aria-busy="true" style={{ padding: "var(--s-8)" }}>
        <Skeleton label="Loading your workspace" width="40%" height={28} />
      </main>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
