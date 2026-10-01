import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";

export interface EmailNotificationPrefs {
  notifyExams: boolean;
  notifyFlashcardsDue: boolean;
  notifyWeeklyDigest: boolean;
}

const DEFAULTS: EmailNotificationPrefs = {
  notifyExams: true,
  notifyFlashcardsDue: true,
  notifyWeeklyDigest: false,
};

export const emailNotificationsApi = {
  /** Upserts a default row on first read rather than returning null — an
   *  account that has never opened this tab has no row yet (it isn't
   *  created at signup, see EMAIL_NOTIFICATIONS.md), and the toggles need
   *  something to display and to flip against. Matches every other
   *  per-account preference row in this schema in landing on "on" by
   *  default: a reminder is opt-out, not opt-in, same as
   *  push_subscriptions.notify_exams. */
  async fetch(): Promise<EmailNotificationPrefs> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("email_notification_prefs")
      .select("notify_exams, notify_flashcards_due, notify_weekly_digest")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) {
      return {
        notifyExams: data.notify_exams,
        notifyFlashcardsDue: data.notify_flashcards_due,
        notifyWeeklyDigest: data.notify_weekly_digest,
      };
    }

    const { error: insertError } = await supabase
      .from("email_notification_prefs")
      .insert({ user_id: userId });
    if (insertError) throw new Error(insertError.message);
    return DEFAULTS;
  },

  async update(
    patch: Partial<EmailNotificationPrefs>,
  ): Promise<void> {
    const userId = await requireUserId();
    const row: Record<string, boolean> = {};
    if (patch.notifyExams !== undefined) row.notify_exams = patch.notifyExams;
    if (patch.notifyFlashcardsDue !== undefined)
      row.notify_flashcards_due = patch.notifyFlashcardsDue;
    if (patch.notifyWeeklyDigest !== undefined)
      row.notify_weekly_digest = patch.notifyWeeklyDigest;

    const { error } = await supabase
      .from("email_notification_prefs")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
