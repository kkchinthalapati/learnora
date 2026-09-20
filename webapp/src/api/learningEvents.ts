import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { LearningEvent, LearningEventSource } from "./types";
import { queryClient } from "../lib/queryClient";
import { misconceptionsApi } from "./misconceptions";
import type { MisconceptionCandidate } from "../lib/misconceptions";

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
  /**
   * Record a learning event and, optionally, the misconception-ledger
   * candidates diagnosed from the same interaction — one call site for both
   * writes instead of two independent ones scattered across a tool's code,
   * so the ledger rows this interaction produces always carry the event's
   * own `clientId` as their `sourceId` and the two records stay traceable to
   * each other. Only appropriate when both halves genuinely describe the
   * same moment (e.g. one quiz/quick-check/sparring-round result) — a tool
   * whose ledger diagnosis and forecast signal happen at different points in
   * its flow (a diagnosis now, mastery confirmed later) should keep calling
   * `misconceptionsApi.record` separately at the moment the diagnosis
   * actually occurs.
   *
   * The ledger write is still best-effort and fire-and-forget by the ledger's
   * own contract (see `useRecordMisconceptions`): it never blocks or fails
   * this function, and — unlike the event itself — it is not queued for
   * offline retry, matching how every other ledger writer already behaves.
   */
  async record(
    input: RecordLearningEventInput,
    misconceptionCandidates?: MisconceptionCandidate[],
  ): Promise<void | { queued: true }> {
    if (input.score != null && (!Number.isFinite(input.score) || input.score < 0 || input.score > 1)) {
      throw new Error(`learning event score must be 0–1, got ${input.score}`);
    }
    const userId = await requireUserId();
    const stable = { ...input, clientId: input.clientId ?? crypto.randomUUID(), occurredAt: input.occurredAt ?? new Date().toISOString() };

    if (misconceptionCandidates && misconceptionCandidates.length > 0) {
      const linked = misconceptionCandidates.map((c) => ({ ...c, sourceId: c.sourceId ?? stable.clientId }));
      void misconceptionsApi
        .record(linked)
        .then((written) => {
          if (written.length > 0) void queryClient.invalidateQueries({ queryKey: ["misconceptions"] });
        })
        .catch((err) => console.warn("[learningEvents] ledger write failed:", err));
    }

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
    /* A real error must always throw, even when there are pending offline
     * events to merge in — otherwise a genuine RLS/auth/network failure
     * silently degrades to "only show the unsynced local items", hiding
     * every already-committed row with no error surfaced anywhere. Only a
     * missing table (migration not yet applied) should degrade quietly. */
    if (error && !isMissingTable(error)) throw new Error(error.message);
    const rows: LearningEvent[] = data ?? [];
    const existing = new Set(rows.map(e => e.client_id).filter(Boolean));
    return [...rows, ...pending.filter(e => !existing.has(e.client_id))]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  },
};
