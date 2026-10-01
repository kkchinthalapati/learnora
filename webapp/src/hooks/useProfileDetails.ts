import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileApi } from "../api/profile";

const profileDetailsKey = ["profile", "details"] as const;

/** Bio and study-configuration fields — the parts of `profiles` that live
 *  outside `auth.users` metadata and so need their own read, unlike
 *  name/email/avatar which `useAuth()` already carries reactively. */
export function useProfileDetails() {
  return useQuery({
    queryKey: profileDetailsKey,
    queryFn: profileApi.fetchProfile,
  });
}

export function useUpdateBio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bio: string) => profileApi.updateBio(bio),
    onSuccess: () => qc.invalidateQueries({ queryKey: profileDetailsKey }),
  });
}

export function useUpdateStudyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: {
      subject?: string | null;
      examType?: string | null;
      targetGrade?: string | null;
      studyPace?: string | null;
    }) => profileApi.updateStudyProfile(fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: profileDetailsKey }),
  });
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
  });
}

export function useRemoveAvatar() {
  return useMutation({
    mutationFn: () => profileApi.removeAvatar(),
  });
}
