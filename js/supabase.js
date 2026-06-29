import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
