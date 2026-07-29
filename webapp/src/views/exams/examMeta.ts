/* Shared, non-component exports for the exams views. Kept apart from the
 * components so each .tsx file exports only components (Fast Refresh). */

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export const STATUSES = ["Scheduled", "Completed"] as const;

/** How many exam bars a calendar cell shows before collapsing to "+N more". */
export const MAX_EXAM_BARS_PER_DAY = 2;

export function formatDayTitle(dateStr: string): string {
  /* T00:00:00 forces local-midnight parsing — bare `new Date("2026-08-01")`
     parses as UTC and shows the wrong day west of Greenwich. */
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
