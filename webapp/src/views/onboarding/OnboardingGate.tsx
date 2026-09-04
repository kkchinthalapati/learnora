import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../context/auth";
import { shouldOnboard } from "../../lib/onboarding";

/** Where the first-run wizard lives. */
export const WELCOME_PATH = "/welcome";

/* Sits between ProtectedRoute and AppShell: session first, then "has this
 * account ever been set up".
 *
 * The check is synchronous — `shouldOnboard` reads `user_metadata` off the
 * session that ProtectedRoute already waited for, plus a localStorage mirror
 * — so there is no loading state here and no flash of the dashboard before
 * the redirect. It also means an account that predates this feature is
 * grandfathered in without a query; see `ONBOARDING_RELEASE_ISO`.
 *
 * `/welcome` itself is registered as a sibling of this guard rather than a
 * child, so finishing the wizard can't bounce off a guard that hasn't seen
 * the new metadata yet. */
export function OnboardingGate() {
  const { user } = useAuth();

  if (shouldOnboard(user)) {
    return <Navigate to={WELCOME_PATH} replace />;
  }

  return <Outlet />;
}
