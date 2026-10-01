/* Study sessions on the server, behind the localStorage copy.
 *
 * lib/studySessions keeps every session in this browser, which is what makes
 * "Save & leave" instant and a reload lose nothing. On its own it also meant
 * a session existed on one device only. Every save is now pushed here
 * (debounced, best-effort), and a session missing locally is fetched before
 * the student is told it isn't on this device. See
 * supabase/migrations/20261001020000_study_session_state.sql. */
import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { StudySessionRecord } from "../lib/studySessions";

const PUSH_DELAY_MS = 1500;
const pending = new Map<string, { record: StudySessionRecord; timer: ReturnType<typeof setTimeout> }>();

async function push(record: StudySessionRecord): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from("study_session_state").upsert(
    {
      user_id: userId,
      id: record.id,
      status: record.status,
      record,
      updated_at: record.updatedAt,
    },
    { onConflict: "user_id,id" },
  );
  if (error) throw new Error(error.message);
}

/** Queue a save. Rapid edits within a step coalesce into one write. */
export function scheduleSessionPush(record: StudySessionRecord): void {
  const queued = pending.get(record.id);
  if (queued) clearTimeout(queued.timer);
  const timer = setTimeout(() => {
    pending.delete(record.id);
    push(record).catch((err) => console.warn("[sessions] not synced:", err));
  }, PUSH_DELAY_MS);
  pending.set(record.id, { record, timer });
}

/** Write anything queued now — on leaving the session, so a phone opened a
 *  minute later sees where the laptop stopped. */
export function flushSessionPushes(): void {
  for (const [id, { record, timer }] of pending) {
    clearTimeout(timer);
    pending.delete(id);
    push(record).catch((err) => console.warn("[sessions] not synced:", err));
  }
}

export async function fetchSession(id: string): Promise<StudySessionRecord | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("study_session_state")
    .select("record")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.record as StudySessionRecord | undefined) ?? null;
}

/** The most recent unfinished session from any device, for Today's Resume. */
export async function fetchLatestOpenSession(): Promise<StudySessionRecord | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("study_session_state")
    .select("record")
    .eq("user_id", userId)
    .neq("status", "done")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.record as StudySessionRecord | undefined) ?? null;
}
