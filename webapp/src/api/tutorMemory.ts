/* The tutor's memory between conversations (lib/tutorMemory.ts): the lessons
 * a student has asked it about. Read before a reply, written when a student
 * asks the tutor something on a lesson's page, listed and deleted in
 * Settings > Privacy and AI.
 *
 * On the server once migration 20261111010000 is applied, so it follows the
 * student between devices. Until then, and whenever the server can't be
 * reached, the same rows are kept in this browser under the account's id.
 * Nothing here throws into a chat: a tutor that forgot is still a tutor. */

import { supabase } from "../lib/supabase";
import { Storage } from "../lib/storage";
import { requireUserId } from "./session";
import {
  readTutorMemory,
  rememberLesson,
  TUTOR_MEMORY_LIMIT,
  type TutorMemoryEntry,
} from "../lib/tutorMemory";

export const tutorMemoryKey = ["tutor-memory"] as const;

const localKey = (userId: string) => `learnora_tutor_memory_v1:${userId}`;

let tableMissing = false;

/** For tests. */
export function resetTutorMemorySupport(): void {
  tableMissing = false;
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  );
}

interface Row {
  material_id: string;
  lesson_title: string;
  subject: string | null;
  times: number;
  last_at: string;
}

const fromRow = (r: Row) => ({
  materialId: r.material_id,
  lessonTitle: r.lesson_title,
  subject: r.subject,
  times: r.times,
  lastAt: r.last_at,
});

const readLocal = (userId: string) => readTutorMemory(Storage.get<unknown>(localKey(userId)));

export const tutorMemoryApi = {
  /** What is remembered, newest first. [] on any failure. */
  async list(): Promise<TutorMemoryEntry[]> {
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return [];
    }
    if (!tableMissing) {
      const { data, error } = await supabase
        .from("tutor_memory")
        .select("material_id, lesson_title, subject, times, last_at")
        .eq("user_id", userId)
        .order("last_at", { ascending: false })
        .limit(TUTOR_MEMORY_LIMIT);
      if (!error) return readTutorMemory(((data ?? []) as Row[]).map(fromRow));
      if (isMissingTable(error)) tableMissing = true;
      else console.warn("[tutorMemory] read failed:", error.message);
    }
    return readLocal(userId);
  },

  /** One more conversation on a lesson. Never throws. */
  async remember(lesson: { materialId: string; lessonTitle: string; subject?: string | null }): Promise<void> {
    try {
      const userId = await requireUserId();
      const next = rememberLesson(await tutorMemoryApi.list(), lesson);
      const entry = next.find((e) => e.materialId === lesson.materialId);
      if (!entry) return;
      if (!tableMissing) {
        const { error } = await supabase.from("tutor_memory").upsert(
          {
            user_id: userId,
            material_id: entry.materialId,
            lesson_title: entry.lessonTitle,
            subject: entry.subject,
            times: entry.times,
            last_at: entry.lastAt,
          },
          { onConflict: "user_id,material_id" },
        );
        if (!error) return;
        if (isMissingTable(error)) tableMissing = true;
        else {
          console.warn("[tutorMemory] write failed:", error.message);
          return;
        }
      }
      Storage.set(localKey(userId), next);
    } catch (err) {
      console.warn("[tutorMemory] write failed:", err);
    }
  },

  /** Forget one lesson. Throws, so Settings can say it didn't work. */
  async forget(materialId: string): Promise<void> {
    const userId = await requireUserId();
    Storage.set(
      localKey(userId),
      readLocal(userId).filter((e) => e.materialId !== materialId),
    );
    if (tableMissing) return;
    const { error } = await supabase
      .from("tutor_memory")
      .delete()
      .eq("user_id", userId)
      .eq("material_id", materialId);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (error) tableMissing = true;
  },

  /** Forget everything. Throws, so Settings can say it didn't work. */
  async forgetAll(): Promise<void> {
    const userId = await requireUserId();
    Storage.remove(localKey(userId));
    if (tableMissing) return;
    const { error } = await supabase.from("tutor_memory").delete().eq("user_id", userId);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (error) tableMissing = true;
  },
};
