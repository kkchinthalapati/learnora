/* Absolute URLs into this app, honouring the deployed path prefix.
 *
 * The React app is served under `/app/` in production (`vite.config.ts`), and
 * the router is given that prefix as its `basename` (`App.tsx`). Router-aware
 * navigation — `<Link to>`, `useNavigate()` — applies the basename for you.
 * Anything that bypasses the router does not: a bare
 * `window.location.href = "/signup"` requests `origin + "/signup"`, which
 * `vercel.json`'s catch-all rewrite turns into a 404 rather than this app's
 * signup screen.
 *
 * Two callers legitimately cannot use the router:
 *   - code rendered outside `<BrowserRouter>` (TimerProvider is mounted above
 *     it, so `useNavigate` is unavailable there);
 *   - links that must survive being copied out of the app, such as a friend
 *     invite or an email confirmation redirect.
 *
 * `import.meta.env.BASE_URL` is substituted by Vite at build time and always
 * carries a trailing slash, hence the leading slash being trimmed off `path`.
 */

/** A root-relative href for `path`, e.g. `/signup` -> `/app/signup`. */
export function appPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

/** A fully-qualified URL for `path`, safe to copy out of the app. */
export function appUrl(path: string): string {
  const origin =
    typeof window === "undefined"
      ? ""
      : window.location.origin.replace(/\/$/, "");
  return `${origin}${appPath(path)}`;
}
