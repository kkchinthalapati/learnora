import { createClient } from "@supabase/supabase-js";

/* Same project and options as js/supabase.js — both apps run side-by-side
 * against one Supabase project and share the session, which is why
 * persistSession stays on and the storage key is left at the default: the
 * vanilla app must be able to read a session this app wrote, and vice versa.
 *
 * The anon key is a publishable key and is safe in client source; Row Level
 * Security is the actual access-control boundary, enforced server-side. The
 * vanilla app loads supabase-js from a CDN; here it's an npm dependency so the
 * bundle is self-contained and pinned. */

export const SUPABASE_URL = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";

/* Captured before createClient() below gets a chance to touch it —
 * detectSessionInUrl consumes (and, on success, strips) recovery/error
 * params from the hash. ResetPasswordView reads this to tell an expired
 * link apart from a slow one deterministically, instead of only guessing
 * from a timeout. */
export const initialUrlHash =
  typeof window !== "undefined" ? window.location.hash : "";

/* A request that never answers used to leave its screen on a skeleton for
 * good — fetch has no timeout of its own. Database and auth calls are small
 * and normally return in well under a second, so 20s is only ever hit by a
 * stalled connection; the query then fails, retries (requestErrors'
 * isRetryableRead) and finally shows its error state with a Retry button.
 * Storage uploads and edge functions (AI generation takes tens of seconds)
 * are left alone. A caller's own AbortSignal still works alongside it. */
export const REQUEST_TIMEOUT_MS = 20_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const bounded = /\/(rest|auth)\/v1\//.test(url);
  if (
    !bounded ||
    typeof AbortSignal === "undefined" ||
    typeof AbortSignal.timeout !== "function"
  ) {
    return fetch(input, init);
  }
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal =
    init?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : (init?.signal ?? timeout);
  return fetch(input, { ...init, signal });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
