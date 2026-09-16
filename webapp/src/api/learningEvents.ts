import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { LearningEvent, LearningEventSource } from "./types";

export interface RecordLearningEventInput {
  topicKey: string;
  source: LearningEventSource;
  /** 0–1 outcome; omit or null for a pure time event. */
  score?: number | null;
  minutes?: number;
  deckId?: string | null;
  folderId?: string | null;
  payload?: Record<string, unknown>;
  /** Idempotency key: a replayed insert with the same key is a no-op. */
  clientId?: string | null;
  occurredAt?: string;
}

/** Days of evidence the forecast reads. Older events are ignored by
 *  `buildTopicStates` anyway, so fetching more is wasted bytes. */
export const LEARNING_EVENT_WINDOW_DAYS = 45;

/* PostgREST surfaces a missing relation as 404 with code 42P01. The table is
 * new; a deployment that has not applied the migration yet should degrade
 * to "no evidence", not break every screen that forecasts. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

export const learningEventsApi = {
  async record(input: RecordLearningEventInput): Promise<void> {
    if (input.score != null && (input.score < 0 || input.score > 1)) {
      throw new Error(`learning event score must be 0–1, got ${input.score}`);
    }
    const userId = await requireUserId();
    const { error } = await supabase.from("learning_events").insert([
      {
        user_id: userId,
        topic_key: input.topicKey,
        deck_id: input.deckId ?? null,
        folder_id: input.folderId ?? null,
        source: input.source,
        score: input.score ?? null,
        minutes: Math.max(0, Math.round(input.minutes ?? 0)),
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        payload: input.payload ?? {},
        client_id: input.clientId ?? null,
      },
    ]);
    if (!error) return;
    if (error.code === "23505") return; // replayed client_id — already recorded
    if (isMissingTable(error)) {
      console.warn("[learningEvents] table missing; event dropped:", error.message);
      return;
    }
    throw new Error(error.message);
  },

  async fetchSince(daysBack = LEARNING_EVENT_WINDOW_DAYS): Promise<LearningEvent[]> {
    const userId = await requireUserId();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const { data, error } = await supabase
      .from("learning_events")
      .select("*")
      .eq("user_id", userId)
      .gte("occurred_at", since.toISOString())
      .order("occurred_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) return [];
      throw new Error(error.message);
    }
    return data ?? [];
  },
};
