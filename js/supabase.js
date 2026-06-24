import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const supabaseKey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";

export const supabase = createClient(supabaseUrl, supabaseKey);
