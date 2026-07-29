import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import { tasksApi } from "./tasks";
import { examsApi } from "./exams";
import { sessionsApi } from "./sessions";

function escapeCSVField(field: unknown): string {
  const str = String(field ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/* Direct port of js/api.js's `DataAdmin` object (:1137-1225). Unlike every
 * other entity module this one drives DOM side effects (file download, full
 * reload) rather than returning rows — kept as-is since that behavior is the
 * feature, not an implementation detail to abstract away. */
export const dataAdminApi = {
  async exportCSV(): Promise<void> {
    const [tasks, exams, dbSessions] = await Promise.all([
      tasksApi.fetch(),
      examsApi.fetch(),
      sessionsApi.fetchSince(3650),
    ]);

    let localSessions: { minutes: number; task?: string; timestamp: string }[] = [];
    if (!dbSessions.length) {
      // Fall back to localStorage history predating the study_sessions table.
      try {
        const raw = localStorage.getItem("sessions");
        localSessions = raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.error("Failed to parse sessions for export", err);
      }
    }

    const activeSessions = dbSessions.length ? dbSessions : localSessions;
    const rows = [["Type", "Name", "Status", "Date"]].concat(
      tasks.map((t) => ["Task", t.text, t.is_done ? "Done" : "Pending", ""]),
      exams.map((e) => ["Exam", e.exam_name, e.status ?? "", e.exam_date]),
      activeSessions.map((s) => [
        "Focus Session",
        `${s.minutes}m Focus on ${s.task || "General Study"}`,
        "Completed",
        dbSessions.length
          ? (s as (typeof dbSessions)[number]).started_at
          : (s as { timestamp: string }).timestamp,
      ]),
    );

    const csv = rows.map((r) => r.map(escapeCSVField).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Learnora_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async wipe(): Promise<void> {
    const userId = await requireUserId();
    // supabase-js resolves with `{ error }` instead of rejecting, so a bare
    // Promise.all() would report success even when every delete was refused
    // by RLS or dropped by the network.
    const results = await Promise.all([
      supabase.from("tasks").delete().eq("user_id", userId),
      supabase.from("exams").delete().eq("user_id", userId),
      supabase.from("study_sessions").delete().eq("user_id", userId),
      supabase.from("weekly_plans").delete().eq("user_id", userId),
      supabase.from("quizzes").delete().eq("user_id", userId),
    ]);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      throw new Error(
        "Some data could not be deleted. Please check your connection and try again.",
      );
    }
    // Only wipe study-session data, never auth tokens or theme prefs.
    localStorage.removeItem("sessions");
    localStorage.removeItem("fav_times");
  },
};
