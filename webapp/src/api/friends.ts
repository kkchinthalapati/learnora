import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type {
  FriendRequest,
  LeaderboardEntry,
  ResolvedFriendCode,
} from "./types";

/* The friends feature's data layer.
 *
 * This is the first module in the app to use `supabase.rpc()` rather than
 * `supabase.from()`, and that is the whole design: `profiles` and
 * `study_sessions` are owner-only under RLS, so there is no table read that
 * can return another person's name or minutes. Every cross-user value here
 * comes back from a SECURITY DEFINER function that checked the friendship
 * itself (supabase/migrations/20260803000000_add_friends_feature.sql).
 *
 * Only `fetchMyCode` is a plain `.from()` read — your own profile row is the
 * one row the existing owner-only policy already lets you have. */

/* Streaks and "this week" are day-boundary questions, and the dashboard
 * answers them in the browser's local zone (analytics.ts's computeStreak).
 * Sending the zone keeps a friend's streak on the leaderboard from ticking
 * over at a different moment than the same number on their own dashboard.
 * Guarded because `resolvedOptions().timeZone` is not universally present and
 * the RPC's own `safe_timezone()` falls back to UTC anyway. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/* PostgREST returns a `returns table (...)` function as a JSON array, and
 * supabase-js hands it straight through — so a "one row" RPC still arrives
 * as an array of zero or one. */
function firstRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

/** Windows the leaderboard can be read over. The server falls back to
 *  "week" for anything it does not recognise, so an older client keeps
 *  working against a newer function and vice versa. */
export type LeaderboardPeriod = "week" | "month" | "all";

export const friendsApi = {
  /** The signed-in user's own invite code. */
  async fetchMyCode(): Promise<string | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select("friend_code")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.friend_code ?? null;
  },

  /** Rotate it, invalidating every link already shared. Returns the new one. */
  async regenerateCode(): Promise<string> {
    const { data, error } = await supabase.rpc("regenerate_friend_code");
    if (error) throw new Error(error.message);
    return data as string;
  },

  /* Returns null for a code that matches nothing — a rotated or mistyped
     link is an ordinary outcome the landing page renders, not an error. */
  async resolveCode(code: string): Promise<ResolvedFriendCode | null> {
    const { data, error } = await supabase.rpc("resolve_friend_code", { code });
    if (error) throw new Error(error.message);
    return firstRow<ResolvedFriendCode>(data);
  },

  /* Sends a request, or — if they had already requested you — accepts on the
     spot, which is why one call has two possible outcomes. */
  async requestOrAccept(code: string): Promise<"pending" | "accepted"> {
    const { data, error } = await supabase.rpc("request_or_accept_friend", {
      code,
    });
    if (error) throw new Error(error.message);
    return data as "pending" | "accepted";
  },

  async respondToRequest(
    requestId: string,
    accept: boolean,
  ): Promise<"accepted" | "declined"> {
    const { data, error } = await supabase.rpc("respond_to_friend_request", {
      request_id: requestId,
      accept,
    });
    if (error) throw new Error(error.message);
    return data as "accepted" | "declined";
  },

  /** Ends an accepted friendship, or withdraws a request you sent. */
  async removeFriend(friendshipId: string): Promise<void> {
    const { error } = await supabase.rpc("remove_friend", {
      friendship_id: friendshipId,
    });
    if (error) throw new Error(error.message);
  },

  async fetchRequests(): Promise<FriendRequest[]> {
    const { data, error } = await supabase.rpc("get_friend_requests");
    if (error) throw new Error(error.message);
    return (data as FriendRequest[] | null) ?? [];
  },

  async fetchLeaderboard(
    period: LeaderboardPeriod = "week",
  ): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase.rpc("get_friends_leaderboard", {
      tz: browserTimeZone(),
      period,
    });
    if (error) throw new Error(error.message);
    return (data as LeaderboardEntry[] | null) ?? [];
  },
};

/* Built from BASE_URL rather than a bare path: this app is served under
 * `/app/` in production (vite.config.ts), so a link written as
 * `${origin}/friends/add/...` would land on the vanilla app's 404. BASE_URL
 * keeps its trailing slash, which is exactly what's wanted here. */
export function inviteLinkFor(code: string): string {
  const origin =
    typeof window === "undefined"
      ? ""
      : window.location.origin.replace(/\/$/, "");
  return `${origin}${import.meta.env.BASE_URL}friends/add/${code}`;
}
