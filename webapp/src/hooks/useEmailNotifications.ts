import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  emailNotificationsApi,
  type EmailNotificationPrefs,
} from "../api/emailNotifications";

const key = ["email-notification-prefs"] as const;

export function useEmailNotificationPrefs() {
  return useQuery({
    queryKey: key,
    queryFn: emailNotificationsApi.fetch,
  });
}

export function useUpdateEmailNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<EmailNotificationPrefs>) =>
      emailNotificationsApi.update(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
