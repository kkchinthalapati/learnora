/* Where Stripe may send a student back to after checkout or the billing
 * portal.
 *
 * A return URL is reflected into Stripe and then into the student's browser,
 * so it has to be one of ours: an open redirect here would let someone send
 * a phishing link that genuinely starts on a Stripe checkout page.
 *
 * Exact origins only, plus a local dev server. This used to accept any
 * https://*.vercel.app, which anyone with a Vercel account can serve, so the
 * guard did not hold (audit 2026-11-08). There is no preview-URL pattern
 * either, because a project can be named to fit one; a checkout started from
 * a preview deployment returns to the fallback (the first origin) instead.
 *
 * Plain JS so tests/return-url.test.js can run it under Node. */

/** @param {unknown} raw @param {string[]} origins first = fallback */
export function safeReturnUrl(raw, origins) {
  const fallback = `${origins[0]}/app/settings`;
  if (typeof raw !== "string") return fallback;
  try {
    const url = new URL(raw);
    const ok =
      origins.includes(url.origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url.origin);
    return ok ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
