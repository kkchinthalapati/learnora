import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auth/session-scoped data — refetch on remount is cheap and correctness
      // matters more here than avoiding a round trip.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
