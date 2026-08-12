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

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://mlvgqwqiynpwpwzqufdf.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";

/* Captured before createClient() below gets a chance to touch it —
 * detectSessionInUrl consumes (and, on success, strips) recovery/error
 * params from the hash. ResetPasswordView reads this to tell an expired
 * link apart from a slow one deterministically, instead of only guessing
 * from a timeout. */
export const initialUrlHash =
  typeof window !== "undefined" ? window.location.hash : "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
