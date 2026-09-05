/* "Download my data" — GDPR Article 20 portability, as a plain JSON file.
 *
 * Deliberately built from the same per-user reads the app already makes,
 * rather than a new privileged export endpoint. Every table below is
 * protected by row-level security keyed on `user_id`, so this cannot return
 * anyone else's rows even if the list is wrong: the worst a mistake here can
 * do is export too little.
 *
 * A failed table is recorded rather than aborting the export. A student
 * exercising a data right should get everything that could be read plus an
 * honest note about what could not, not a spinner that fails at the last
 * table and yields nothing.
 */

import { supabase } from "./supabase";

/** Tables owned by the user, each filtered by `user_id`. */
export const EXPORTED_TABLES = [
  "profiles",
  "folders",
  "materials",
  "notes",
  "flashcard_decks",
  "flashcards",
  "quizzes",
  "quiz_attempts",
  "study_sessions",
  "tasks",
  "exams",
  "weekly_plans",
  "notebooks",
  "notebook_sources",
  "notebook_messages",
  "notebook_artifacts",
] as const;

/** `profiles` keys its row on `id`, not `user_id`, like everything else. */
const KEYED_BY_ID = new Set(["profiles"]);

export interface DataExport {
  exportedAt: string;
  userId: string;
  format: string;
  tables: Record<string, unknown[]>;
  /** Tables that could not be read, with the reason. Empty on a clean run. */
  unavailable: Record<string, string>;
}

export async function buildDataExport(userId: string): Promise<DataExport> {
  const tables: Record<string, unknown[]> = {};
  const unavailable: Record<string, string> = {};

  await Promise.all(
    EXPORTED_TABLES.map(async (table) => {
      const column = KEYED_BY_ID.has(table) ? "id" : "user_id";
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(column, userId);
      if (error) {
        unavailable[table] = error.message;
        return;
      }
      tables[table] = data ?? [];
    }),
  );

  return {
    exportedAt: new Date().toISOString(),
    userId,
    format: "learnora-export-v1",
    tables,
    unavailable,
  };
}

/** Filename carries the date, so repeated exports don't overwrite silently. */
export function exportFilename(now = new Date()): string {
  return `learnora-data-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadDataExport(
  data: DataExport,
  filename = exportFilename(),
): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  /* Revoked on the next tick rather than immediately: Safari has not always
     finished reading the blob by the time click() returns. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
