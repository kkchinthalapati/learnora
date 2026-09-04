import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendsApi } from "../api/friends";

export const friendsKeys = {
  all: ["friends"] as const,
  myCode: ["friends", "my-code"] as const,
  leaderboard: ["friends", "leaderboard"] as const,
  requests: ["friends", "requests"] as const,
  code: (code: string) => ["friends", "code", code] as const,
};

export function useMyFriendCode() {
  return useQuery({
    queryKey: friendsKeys.myCode,
    queryFn: friendsApi.fetchMyCode,
  });
}

/** How often the standings re-check while someone is looking at them. */
const LEADERBOARD_POLL_MS = 60_000;

/* The one screen in the app whose content is *other people*, and the only one
 * where sitting still and watching is the point. On the app's default query
 * settings it refetched on mount and on window focus and never again, so a
 * student with the Friends tab open watched a frozen table while their friends
 * studied — the standings only moved if they navigated away and back.
 *
 * Polling rather than a realtime channel: the underlying figures are rolled-up
 * study totals rather than a per-row feed, there is no realtime subscription
 * anywhere else in the app except study rooms (hooks/useStudyRoom.ts), and a
 * minute is well inside the resolution anyone reads a leaderboard at. React
 * Query pauses the interval while the tab is in the background by default, so
 * this costs nothing when nobody is watching. */
export function useFriendsLeaderboard() {
  return useQuery({
    queryKey: friendsKeys.leaderboard,
    queryFn: friendsApi.fetchLeaderboard,
    refetchInterval: LEADERBOARD_POLL_MS,
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: friendsKeys.requests,
    queryFn: friendsApi.fetchRequests,
  });
}

/* Same queryKey as useFriendRequests, so the Sidebar badge and the Friends
 * page share one cached fetch instead of issuing two — `select` runs once
 * per subscriber against that shared result. Outgoing requests don't count:
 * those are yours, not something to be notified about. */
export function useIncomingFriendRequestCount() {
  return useQuery({
    queryKey: friendsKeys.requests,
    queryFn: friendsApi.fetchRequests,
    select: (requests) =>
      requests.filter((r) => r.direction === "incoming").length,
  });
}

export function useResolveFriendCode(code: string) {
  return useQuery({
    queryKey: friendsKeys.code(code),
    queryFn: () => friendsApi.resolveCode(code),
    enabled: !!code,
    /* One shot: a code that resolves to nothing resolves to nothing on the
       retry too, and the landing page wants to say so quickly rather than
       sit on a spinner through three backoffs. */
    retry: false,
  });
}

/* Every mutation below invalidates `friendsKeys.all`, not one narrower key.
 * The three reads overlap by design — accepting a request moves a person from
 * `requests` onto the `leaderboard`, and following an invite link can do the
 * same in one step — so the pairs that would need invalidating together are
 * most of the pairs there are. */
function useFriendMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: friendsKeys.all }),
  });
}

export function useAddFriendByCode() {
  return useFriendMutation((code: string) => friendsApi.requestOrAccept(code));
}

export function useRespondToFriendRequest() {
  return useFriendMutation(
    ({ requestId, accept }: { requestId: string; accept: boolean }) =>
      friendsApi.respondToRequest(requestId, accept),
  );
}

export function useRemoveFriend() {
  return useFriendMutation((friendshipId: string) =>
    friendsApi.removeFriend(friendshipId),
  );
}

/* Explicit `void` variables so callers can write `.mutate()` with no argument
   — inference would otherwise land on `unknown` and demand one. */
export function useRegenerateFriendCode() {
  return useFriendMutation<void, string>(() => friendsApi.regenerateCode());
}
