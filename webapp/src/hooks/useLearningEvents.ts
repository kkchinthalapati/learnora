import { useQuery } from "@tanstack/react-query";
import { learningEventsApi } from "../api/learningEvents";

export const learningEventsKeys = { all: ["learning_events"] as const };

/** The recent evidence window the forecast reads. Invalidate `all` after
 *  recording an event so every forecast on screen recomputes. */
export function useLearningEvents() {
  return useQuery({
    queryKey: learningEventsKeys.all,
    queryFn: () => learningEventsApi.fetchSince(),
  });
}
