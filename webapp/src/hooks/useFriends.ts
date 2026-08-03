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

export function useFriendsLeaderboard() {
  return useQuery({
    queryKey: friendsKeys.leaderboard,
    queryFn: friendsApi.fetchLeaderboard,
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: friendsKeys.requests,
    queryFn: friendsApi.fetchRequests,
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
