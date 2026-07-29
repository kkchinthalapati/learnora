import type { Task } from "../../api/types";

/* Port of js/main.js's `sortTasksByUrgency` (:40-50).
 *
 * Pending first, ordered by due date with undated tasks last; completed
 * tasks sink to the bottom in their original order. Dates are plain
 * YYYY-MM-DD strings, so `localeCompare` orders them correctly without
 * parsing.
 *
 * `toSorted` rather than the vanilla's in-place `sort`: the input here is a
 * TanStack Query cache array, and mutating it would reorder the cached value
 * behind React's back. */
export function sortTasksByUrgency(tasks: Task[]): Task[] {
  const pending = tasks.filter((t) => !t.is_done);
  const done = tasks.filter((t) => t.is_done);
  const sorted = [...pending].sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
  return [...sorted, ...done];
}
