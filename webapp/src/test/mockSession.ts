import { vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { fakeSession } from "./auth";

/* Every api module resolves the current user via `requireUserId()`, which
 * reads `supabase.auth.getSession()` — local/cached in the real client, but
 * with nothing in test-environment storage it resolves to a null session.
 * Spying on it here is the same approach AuthProvider.test.tsx uses for the
 * client module, just reused for the api-layer tests. */
export function mockAuthSession(userId = "user-1"): Session {
  const session = fakeSession({ id: userId });
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  return session;
}

export function mockNoAuthSession(): void {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: null },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
}
