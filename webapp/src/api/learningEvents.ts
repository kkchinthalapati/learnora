import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { LearningEvent, LearningEventSource } from "./types";
import { queryClient } from "../lib/queryClient";

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
  return error.code === "42P01" || error.code === "PGRST205";
}

export const learningEventsApi = {
  async record(input: RecordLearningEventInput): Promise<void | { queued: true }> {
    if (input.score != null && (!Number.isFinite(input.score) || input.score < 0 || input.score > 1)) {
      throw new Error(`learning event score must be 0–1, got ${input.score}`);
    }
    const userId = await requireUserId();
    const stable = { ...input, clientId: input.clientId ?? crypto.randomUUID(), occurredAt: input.occurredAt ?? new Date().toISOString() };
    try {
      await learningEventsApi.send(stable, userId);
      void queryClient.invalidateQueries({ queryKey: ["learning_events"] });
    } catch (error) {
      console.warn("[learningEvents] saved locally for retry:", error);
      const { enqueueOfflineAction } = await import("../lib/offlineSync");
      enqueueOfflineAction("recordLearningEvent", { input: stable, userId });
      return { queued: true };
    }
  },

  /** Replay bypasses enqueue; account identity is captured when the action is produced. */
  async send(input: RecordLearningEventInput, expectedUserId: string): Promise<void> {
    const userId = await requireUserId();
    if (userId !== expectedUserId) throw new Error("Evidence belongs to a different account");
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
    const { getOfflineQueue } = await import("../lib/offlineSync");
    const pending = getOfflineQueue().filter(a => a.type === "recordLearningEvent")
      .flatMap(a => {
        const p = a.payload as { input: RecordLearningEventInput; userId: string };
        if (p.userId !== userId || !p.input.occurredAt || p.input.occurredAt < since.toISOString()) return [];
        const i = p.input;
        return [{ id: `pending:${i.clientId}`, user_id: userId, topic_key: i.topicKey, deck_id: i.deckId ?? null,
          folder_id: i.folderId ?? null, source: i.source, score: i.score ?? null, minutes: Math.max(0, Math.round(i.minutes ?? 0)),
          occurred_at: i.occurredAt!, payload: i.payload ?? {}, client_id: i.clientId ?? null } satisfies LearningEvent];
      });
    if (error && !isMissingTable(error) && !pending.length) throw new Error(error.message);
    const rows: LearningEvent[] = data ?? [];
    const existing = new Set(rows.map(e => e.client_id).filter(Boolean));
    return [...rows, ...pending.filter(e => !existing.has(e.client_id))]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  },
};
