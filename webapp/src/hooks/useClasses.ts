import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classesApi } from "../api/classes";

/* Classes for React (api/classes.ts). Behind the `classMap` flag: callers
 * pass `enabled` so nothing is fetched while the flag is off. */

export const classesKeys = {
  taught: ["classes", "taught"] as const,
  memberships: ["classes", "memberships"] as const,
  map: (id: string) => ["classes", id, "map"] as const,
};

export function useTaughtClasses(enabled = true) {
  return useQuery({ queryKey: classesKeys.taught, queryFn: classesApi.taught, enabled });
}

export function useMemberships(enabled = true) {
  return useQuery({ queryKey: classesKeys.memberships, queryFn: classesApi.memberships, enabled });
}

/** Counts and the map together: the screen needs both to say anything. */
export function useClassMap(classId: string, enabled = true) {
  return useQuery({
    queryKey: classesKeys.map(classId),
    queryFn: async () => {
      const [counts, rows] = await Promise.all([classesApi.counts(classId), classesApi.map(classId)]);
      return { counts, rows };
    },
    enabled: enabled && !!classId,
  });
}

export function useClassActions() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["classes"] });
  return {
    create: useMutation({ mutationFn: classesApi.create, onSuccess: refresh }),
    remove: useMutation({ mutationFn: classesApi.remove, onSuccess: refresh }),
    join: useMutation({ mutationFn: classesApi.join, onSuccess: refresh }),
    setShare: useMutation({
      mutationFn: ({ classId, share }: { classId: string; share: boolean }) => classesApi.setShare(classId, share),
      onSuccess: refresh,
    }),
    leave: useMutation({ mutationFn: classesApi.leave, onSuccess: refresh }),
  };
}
