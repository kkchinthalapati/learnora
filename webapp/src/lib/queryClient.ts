import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isRetryableRead, isRetryableWrite } from "./requestErrors";
import { handleRequestError } from "./sessionRecovery";

/** How long a fetched query is treated as fresh before a remount or a window
 *  focus is allowed to refetch it. Sized to a single navigation: bouncing
 *  between Dashboard, Analytics and Library reuses the cache, while a tab
 *  left open past a minute still re-checks the moment it's looked at again.
 *
 *  This used to be 0, which inverted both behaviours: every visit to Analytics
 *  refetched 365 days of sessions from scratch, and a tab left open for an
 *  hour refetched nothing at all on return because `refetchOnWindowFocus` was
 *  off. Cheap thing repeated, expensive thing skipped. */
const DEFAULT_STALE_TIME_MS = 60_000;

/** Attempts after the first, for reads. Three total tries spans roughly three
 *  seconds of backoff — long enough to ride out a tunnel or a lane change on
 *  mobile, short enough that a genuinely broken query still surfaces. */
const READ_RETRIES = 2;

/** Writes get one replay, and only when the request never reached the origin
 *  (see isRetryableWrite). One is the whole budget on purpose: the failure
 *  mode this covers is a single dropped request, and every extra attempt
 *  widens the window in which a "transport" error was really a slow success. */
const WRITE_RETRIES = 1;

/** Exponential with jitter. Without the random term every query on a screen
 *  that failed together retries in the same millisecond, which is how a
 *  recovering backend gets knocked over a second time. */
function backoffMs(attemptIndex: number): number {
  const base = Math.min(1000 * 2 ** attemptIndex, 8000);
  return base + Math.random() * 250;
}

export const queryClient = new QueryClient({
  /* Every failed request passes through here on its way to the caller, which
     makes it the one place that can notice "these are all 401s" and renew the
     session once, rather than each screen rendering its own dead end. */
  queryCache: new QueryCache({ onError: handleRequestError }),
  mutationCache: new MutationCache({ onError: handleRequestError }),
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME_MS,
      /* Coming back to the tab is when a student is most likely to act on
         what's on screen, so it's the right moment to be current. Bounded by
         staleTime above, so returning to a tab repeatedly costs nothing. */
      refetchOnWindowFocus: true,
      /* Was a flat `retry: 1`, which retried everything once — including a
         404 and a malformed-request 400, where a second identical attempt
         cannot succeed — and gave up after one on the flaky-network case it
         was actually there for. */
      retry: (failureCount, error) =>
        failureCount < READ_RETRIES && isRetryableRead(error),
      retryDelay: backoffMs,
    },
    mutations: {
      /* There was no mutation policy at all, so every one of the app's writes
         — logging a session, grading a card, saving a task — was one dropped
         packet away from being lost with nothing but a toast. */
      retry: (failureCount, error) =>
        failureCount < WRITE_RETRIES && isRetryableWrite(error),
      retryDelay: backoffMs,
    },
  },
});
