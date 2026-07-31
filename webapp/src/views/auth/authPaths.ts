/* The sign-in flow's own route paths — not `/terms`, which is public but
 * isn't part of the flow itself.
 *
 * Its own module rather than living in `routes.tsx`: `routes.tsx` imports
 * `LoginView`, which (via `RedirectIfSignedIn`) would need to import these
 * back out of `routes.tsx`, a circular import for no reason — both files
 * import this one instead. `routes.tsx` uses the named constants for its
 * `<Route path>` props; `RedirectIfSignedIn` uses `AUTH_PATHS` to know
 * "never bounce a signed-in user back into an auth screen" without
 * retyping the five paths a second time. */

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";
export const VERIFY_PATH = "/verify";

export const AUTH_PATHS = [
  LOGIN_PATH,
  SIGNUP_PATH,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  VERIFY_PATH,
] as const;
