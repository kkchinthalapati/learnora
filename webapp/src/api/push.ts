import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { PushSubscriptionRow } from "./types";

/* Data layer for Web Push subscriptions. Plain `.from()` reads/writes, not
 * RPCs — unlike friends.ts, nothing here reads another user's row, so the
 * owner-only RLS policies on push_subscriptions (see the migration) are
 * sufficient on their own. */

export const pushApi = {
  /** This device's active subscription, if it has one. `endpoint` is unique
   *  per browser+origin+device, so it's the natural lookup key — there is no
   *  separate client-generated id to remember between visits. */
  async fetchByEndpoint(endpoint: string): Promise<PushSubscriptionRow | null> {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Upsert on `endpoint`: re-subscribing (e.g. after clearing the toggle
   *  off and back on) replaces the row instead of erroring on the unique
   *  constraint. */
  async save(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    notifyExams: boolean;
    notifyFlashcards: boolean;
  }): Promise<PushSubscriptionRow> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          notify_exams: input.notifyExams,
          notify_flashcards: input.notifyFlashcards,
        },
        { onConflict: "endpoint" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updatePreferences(
    endpoint: string,
    prefs: Partial<{ notifyExams: boolean; notifyFlashcards: boolean }>,
  ): Promise<void> {
    const patch: Record<string, boolean> = {};
    if (prefs.notifyExams !== undefined) patch.notify_exams = prefs.notifyExams;
    if (prefs.notifyFlashcards !== undefined)
      patch.notify_flashcards = prefs.notifyFlashcards;
    const { error } = await supabase
      .from("push_subscriptions")
      .update(patch)
      .eq("endpoint", endpoint);
    if (error) throw new Error(error.message);
  },

  async remove(endpoint: string): Promise<void> {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    if (error) throw new Error(error.message);
  },
};
