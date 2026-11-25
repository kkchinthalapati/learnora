/* What the tutor remembers between conversations (api/tutorMemory.ts): the
 * lessons a student has worked on with it, and when. Topics only. Nothing
 * the student typed, nothing the tutor said, no judgement about them.
 *
 * Pure: the shape, the merge the browser copy uses, and the prompt line. */

import { fenceUntrusted } from "./actionTags";

export interface TutorMemoryEntry {
  /** The lesson (material) it is about. One entry per lesson. */
  materialId: string;
  lessonTitle: string;
  subject: string | null;
  /** Conversations with the tutor on this lesson. */
  times: number;
  /** ISO time of the latest one. */
  lastAt: string;
}

/** How many lessons are kept, newest first. */
export const TUTOR_MEMORY_LIMIT = 30;
/** How many are told to the tutor. */
export const TUTOR_MEMORY_PROMPT_LIMIT = 6;
/** Asking twice within this long is one conversation, not two. */
export const SAME_CONVERSATION_MS = 30 * 60_000;

const newestFirst = (a: TutorMemoryEntry, b: TutorMemoryEntry) => b.lastAt.localeCompare(a.lastAt);

/** `entries` with one more conversation on a lesson recorded. */
export function rememberLesson(
  entries: readonly TutorMemoryEntry[],
  lesson: { materialId: string; lessonTitle: string; subject?: string | null },
  now: Date = new Date(),
): TutorMemoryEntry[] {
  const title = lesson.lessonTitle.trim().slice(0, 200);
  if (!lesson.materialId || !title) return [...entries];
  const existing = entries.find((e) => e.materialId === lesson.materialId);
  const sameConversation =
    existing !== undefined && now.getTime() - Date.parse(existing.lastAt) < SAME_CONVERSATION_MS;
  const next: TutorMemoryEntry = {
    materialId: lesson.materialId,
    lessonTitle: title,
    subject: lesson.subject?.trim().slice(0, 120) || null,
    times: existing ? existing.times + (sameConversation ? 0 : 1) : 1,
    lastAt: now.toISOString(),
  };
  return [next, ...entries.filter((e) => e.materialId !== lesson.materialId)]
    .sort(newestFirst)
    .slice(0, TUTOR_MEMORY_LIMIT);
}

/** Rows read from storage or the server, kept only if well formed. */
export function readTutorMemory(raw: unknown): TutorMemoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TutorMemoryEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    const materialId = typeof e.materialId === "string" ? e.materialId : "";
    const lessonTitle = typeof e.lessonTitle === "string" ? e.lessonTitle.trim() : "";
    const lastAt = typeof e.lastAt === "string" && Number.isFinite(Date.parse(e.lastAt)) ? e.lastAt : "";
    if (!materialId || !lessonTitle || !lastAt) continue;
    out.push({
      materialId,
      lessonTitle,
      subject: typeof e.subject === "string" && e.subject.trim() ? e.subject.trim() : null,
      times: typeof e.times === "number" && e.times >= 1 ? Math.floor(e.times) : 1,
      lastAt,
    });
  }
  return out.sort(newestFirst).slice(0, TUTOR_MEMORY_LIMIT);
}

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** "9 Nov", for the Settings list. */
export function memoryWhen(entry: TutorMemoryEntry): string {
  return dayOf(entry.lastAt);
}

/** The prompt block, or "" when there is nothing remembered. The lesson the
 *  student is on now is left out: the tutor is already told about that. */
export function formatTutorMemoryForPrompt(
  entries: readonly TutorMemoryEntry[],
  currentMaterialId?: string | null,
): string {
  const earlier = entries
    .filter((e) => e.materialId !== currentMaterialId)
    .slice(0, TUTOR_MEMORY_PROMPT_LIMIT);
  if (earlier.length === 0) return "";
  const lines = earlier.map(
    (e) =>
      `- "${fenceUntrusted(e.lessonTitle)}"${e.subject ? ` (${fenceUntrusted(e.subject)})` : ""}, last on ${dayOf(e.lastAt)}`,
  );
  return `EARLIER WITH THIS STUDENT (lessons they have asked you about before; topics only, the student can see and delete this list):
${lines.join("\n")}
Use it only to connect ideas when it genuinely helps ("this is the same idea as in your enzymes lesson"). Never recite the list, never claim to remember what was said in those conversations, and never infer how well they know those topics from it.`;
}
