/* The order of a subject's lessons.
 *
 * A lesson the student has placed (materials.position, counted from 0) comes
 * first, in that order. Lessons never placed follow in the order they were
 * added, on the reading that a course's lessons are added as it is taught.
 * So a subject nobody has reordered reads oldest first, and moving one
 * lesson places the whole list.
 *
 * Pure: the write is api/materials.ts setOrder. */

export interface Orderable {
  id: string;
  created_at: string;
  position?: number | null;
}

const placed = (m: Orderable): m is Orderable & { position: number } =>
  typeof m.position === "number" && Number.isFinite(m.position);

export function orderLessons<T extends Orderable>(lessons: readonly T[]): T[] {
  return [...lessons].sort((a, b) => {
    const pa = placed(a);
    const pb = placed(b);
    if (pa && pb && a.position !== b.position) return a.position - b.position;
    if (pa !== pb) return pa ? -1 : 1;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
}

/** The ordered list with one lesson moved a place up (-1) or down (+1).
 *  The same array back when it can't move. */
export function moveLesson<T extends Orderable>(ordered: readonly T[], id: string, by: -1 | 1): T[] {
  const from = ordered.findIndex((m) => m.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ordered.length) return [...ordered];
  const next = [...ordered];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** The rows whose stored position differs from their place in `ordered`:
 *  what a save has to write. */
export function positionChanges(ordered: readonly Orderable[]): Array<{ id: string; position: number }> {
  return ordered
    .map((m, index) => ({ id: m.id, position: index, was: m.position }))
    .filter((row) => row.was !== row.position)
    .map(({ id, position }) => ({ id, position }));
}
