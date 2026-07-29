import { supabase } from "../lib/supabase";

/* Every entity query needs the current user's id to scope its `.eq("user_id",
 * ...)` filter. `AuthProvider` already tracks the session reactively without
 * a network call (Step 4); this mirrors that same `getSession()`-first
 * approach rather than the vanilla `getCurrentUser()`'s separate
 * network-verifying `auth.getUser()` cache — one auth cache (the provider's)
 * instead of two. Throws instead of the vanilla's "return [] / null / false"
 * per Decision #6. */
export async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");
  return session.user.id;
}
