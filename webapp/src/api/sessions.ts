import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { StudySession } from "./types";
import { learningEventsApi } from "./learningEvents";
import { normaliseTopicKey } from "../lib/topicKey";

export interface LogSessionInput {
  minutes: number;
  task?: string | null;
  folderId?: string | null;
  timerType?: string | null;
  /** "What I covered" — one line, optional, persisted on the row. */
  notes?: string | null;
  /** The deck the session was started for (NextHour hands this over). */
  deckId?: string | null;
  /** Idempotency key shared by the session and its learning event, so an
   *  offline replay cannot double-count the hour. */
  clientId?: string | null;
}

/* Direct port of js/api.js's `Sessions` object (:920-957). */
export const sessionsApi = {
  async log({
    minutes,
    task,
    folderId = null,
    timerType = null,
    notes = null,
    deckId = null,
    clientId = null,
  }: LogSessionInput): Promise<void> {
    const userId = await requireUserId();
    const startedAt = new Date(Date.now() - minutes * 60000).toISOString();
    const { error } = await supabase.from("study_sessions").insert([
      {
        user_id: userId,
        task: task || null,
        folder_id: folderId,
        minutes,
        timer_type: timerType,
        started_at: startedAt,
        notes: notes?.trim() ? notes.trim().slice(0, 280) : null,
      },
    ]);
    if (error) throw new Error(error.message);

    /* The hour counts as evidence. Failure here must not fail the session
       log — the row is already in; the forecast merely misses one hour. */
    const topic = (task ?? "").trim();
    if (topic && !["none", "general study"].includes(normaliseTopicKey(topic))) {
      try {
        await learningEventsApi.record({
          topicKey: normaliseTopicKey(topic),
          source: "timer",
          minutes,
          deckId: deckId ?? null,
          folderId,
          clientId: clientId ?? null,
          payload: { task: topic, timerType },
        });
      } catch (err) {
        console.warn("[sessions] learning event not recorded:", err);
      }
    }
  },

  async fetchSince(daysBack = 90): Promise<StudySession[]> {
    const userId = await requireUserId();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", userId)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async fetchAverageSessionLengths(
    daysBack = 14,
  ): Promise<Record<string, number>> {
    const sessions = await this.fetchSince(daysBack);
    const sums: Record<string, { totalMinutes: number; count: number }> = {};
    sessions.forEach((s) => {
      if (!s.timer_type || s.minutes <= 0) return;
      if (!sums[s.timer_type])
        sums[s.timer_type] = { totalMinutes: 0, count: 0 };
      sums[s.timer_type].totalMinutes += s.minutes;
      sums[s.timer_type].count += 1;
    });

    const averages: Record<string, number> = {};
    for (const [type, data] of Object.entries(sums)) {
      averages[type] = Math.round(data.totalMinutes / data.count);
    }
    return averages;
  },
};
