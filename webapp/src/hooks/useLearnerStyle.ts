import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadLearnerProfile, saveLearnerProfile } from "../api/learnerStyle";
import { EMPTY_LEARNER, type LearnerProfile } from "../lib/learnerProfile";
import type { LearnerStyle } from "../lib/learnerStyle";

export const learnerProfileKey = ["learner-profile"] as const;
/** Kept for callers that only invalidate the style. */
export const learnerStyleKey = learnerProfileKey;

/** Everything the student said under "How you learn", and a way to change
 *  any part of it. `isPending` is true only for the first read. */
export function useLearnerProfile() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: learnerProfileKey,
    queryFn: loadLearnerProfile,
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: saveLearnerProfile,
    onSuccess: (saved) => qc.setQueryData(learnerProfileKey, saved),
  });
  return {
    profile: (query.data ?? EMPTY_LEARNER) as LearnerProfile,
    isPending: query.isPending,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/** The main learner style alone. `style` is null until one is chosen. */
export function useLearnerStyle() {
  const { profile, isPending, save, isSaving } = useLearnerProfile();
  return {
    style: profile.style as LearnerStyle | null,
    isPending,
    save: (style: LearnerStyle | null) => save({ style }).then(() => undefined),
    isSaving,
  };
}
