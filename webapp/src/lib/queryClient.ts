import { QueryClient } from "@tanstack/react-query";

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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME_MS,
      /* Coming back to the tab is when a student is most likely to act on
         what's on screen, so it's the right moment to be current. Bounded by
         staleTime above, so returning to a tab repeatedly costs nothing. */
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
