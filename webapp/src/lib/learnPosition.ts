/* Where a student is in a lesson's Learn tab, read without loading Learn.
 *
 * Learn (views/lesson/LearnPanel) keeps its progress in this browser under
 * one key per lesson. Home's "continue" row wants one fact from it: which
 * part they're on. This reads only that, and says nothing when it can't be
 * sure, since a made-up "Part 2 of 5" is worse than no label.
 *
 * The outline stored here is the one the progress was made against. If the
 * notes were edited since, Learn starts the lesson afresh when it opens; the
 * count shown on Home is then one visit out of date, never invented. */

/** The key Learn stores a lesson's progress under. */
export const learnStorageKey = (materialId: string) => `learnora:learn:v1:${materialId}`;

export type LearnPosition =
  | { state: "started"; part: number; total: number }
  | { state: "finished"; total: number };

/** Null when Learn hasn't been started for this lesson on this device, or
 *  what is stored can't be read. */
export function readLearnPosition(materialId: string): LearnPosition | null {
  if (!materialId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(learnStorageKey(materialId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { outline?: unknown; current?: unknown };
    if (!Array.isArray(parsed.outline) || typeof parsed.current !== "number") return null;
    const total = parsed.outline.length;
    const current = parsed.current;
    if (total === 0 || !Number.isInteger(current)) return null;
    /* -1 is the outline screen: opened, not begun. */
    if (current < 0) return null;
    if (current >= total) return { state: "finished", total };
    return { state: "started", part: current + 1, total };
  } catch {
    return null;
  }
}

/** "Part 3 of 5", "All 5 parts done", or "" when nothing is known. */
export function learnPositionLabel(position: LearnPosition | null): string {
  if (!position) return "";
  if (position.state === "finished") {
    return position.total === 1 ? "Lesson done" : `All ${position.total} parts done`;
  }
  return `Part ${position.part} of ${position.total}`;
}
