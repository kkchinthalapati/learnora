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

    let localSessions: { minutes: number; task?: string; timestamp: string }[] =
      [];
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

  async exportHTML(): Promise<void> {
    const [tasks, exams, dbSessions] = await Promise.all([
      tasksApi.fetch(),
      examsApi.fetch(),
      sessionsApi.fetchSince(3650),
    ]);

    let localSessions: { minutes: number; task?: string; timestamp: string }[] =
      [];
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

    // Calculate stats
    const totalMinutes = activeSessions.reduce((sum, s) => sum + s.minutes, 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    const completedTasks = tasks.filter((t) => t.is_done).length;
    const upcomingExams = exams.filter(
      (e) => e.status === "scheduled" || e.status === "upcoming"
    ).length;

    // Calculate study streak (consecutive days with activity)
    const sessionDates = new Set<string>();
    activeSessions.forEach((s) => {
      const dateStr = dbSessions.length
        ? new Date((s as (typeof dbSessions)[number]).started_at)
            .toISOString()
            .split("T")[0]
        : (s as { timestamp: string }).timestamp.split(",")[0];
      sessionDates.add(dateStr);
    });
    const sortedDates = Array.from(sessionDates).sort().reverse();
    let streak = 0;
    if (sortedDates.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      let currentDate = new Date(today);
      for (const dateStr of sortedDates) {
        const sessionDate = new Date(dateStr);
        const daysDiff = Math.floor(
          (currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff === 0 || daysDiff === 1) {
          streak++;
          currentDate = sessionDate;
        } else {
          break;
        }
      }
    }

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learnora Study Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #f6f5f2;
      color: #1c1b18;
      line-height: 1.6;
      font-size: 15px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 30px;
      border-bottom: 2px solid rgba(15, 118, 110, 0.2);
    }

    h1 {
      font-family: "Outfit", system-ui, sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #0f766e;
      margin-bottom: 8px;
    }

    .report-date {
      font-size: 14px;
      color: #6b6558;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: #ffffff;
      border: 1px solid rgba(28, 24, 18, 0.08);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(24, 20, 14, 0.06);
      text-align: center;
    }

    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #0f766e;
      margin-bottom: 8px;
    }

    .stat-label {
      font-size: 13px;
      color: #6b6558;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    section {
      margin-bottom: 40px;
    }

    h2 {
      font-family: "Outfit", system-ui, sans-serif;
      font-size: 22px;
      font-weight: 600;
      color: #1c1b18;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
      border: 1px solid rgba(28, 24, 18, 0.08);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(24, 20, 14, 0.06);
    }

    thead {
      background: rgba(15, 118, 110, 0.08);
    }

    th {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      color: #0f766e;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 12px 16px;
      border-top: 1px solid rgba(28, 24, 18, 0.05);
    }

    tbody tr:hover {
      background: rgba(15, 118, 110, 0.04);
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-done, .status-completed {
      background: rgba(30, 142, 107, 0.12);
      color: #1e8e6b;
    }

    .status-pending {
      background: rgba(201, 138, 46, 0.14);
      color: #c98a2e;
    }

    .status-scheduled, .status-upcoming {
      background: rgba(15, 118, 110, 0.12);
      color: #0f766e;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #6b6558;
      background: #ffffff;
      border: 1px dashed rgba(28, 24, 18, 0.12);
      border-radius: 12px;
    }

    .chart-container {
      background: #ffffff;
      border: 1px solid rgba(28, 24, 18, 0.08);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(24, 20, 14, 0.06);
      margin-bottom: 20px;
    }

    .session-item {
      padding: 12px 0;
      border-bottom: 1px solid rgba(28, 24, 18, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .session-item:last-child {
      border-bottom: none;
    }

    .session-task {
      font-weight: 500;
      color: #1c1b18;
    }

    .session-meta {
      font-size: 13px;
      color: #6b6558;
    }

    @media print {
      body {
        background: white;
      }
      .container {
        padding: 20px;
      }
      .stat-card, table, .chart-container {
        box-shadow: none;
        border: 1px solid #ccc;
      }
      page-break-inside: avoid;
    }

    @media (max-width: 600px) {
      .container {
        padding: 20px 16px;
      }
      h1 {
        font-size: 24px;
      }
      .stats-grid {
        grid-template-columns: 1fr;
      }
      table {
        font-size: 14px;
      }
      th, td {
        padding: 8px 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 Your Study Report</h1>
      <p class="report-date">Generated on ${new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalHours}</div>
        <div class="stat-label">Total Hours</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedTasks}</div>
        <div class="stat-label">Tasks Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${upcomingExams}</div>
        <div class="stat-label">Upcoming Exams</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${streak}</div>
        <div class="stat-label">Day Streak 🔥</div>
      </div>
    </div>

    <section>
      <h2>📚 Tasks</h2>
      ${
        tasks.length > 0
          ? `
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map(
                (t) => `
              <tr>
                <td>${escapeHtml(t.text)}</td>
                <td>
                  <span class="status-badge status-${t.is_done ? "done" : "pending"}">
                    ${t.is_done ? "Done" : "Pending"}
                  </span>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `
          : '<div class="empty-state">No tasks yet. Start creating tasks to track your progress!</div>'
      }
    </section>

    <section>
      <h2>🎓 Exams</h2>
      ${
        exams.length > 0
          ? `
        <table>
          <thead>
            <tr>
              <th>Exam</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${exams
              .map(
                (e) => `
              <tr>
                <td>${escapeHtml(e.exam_name)}</td>
                <td>${escapeHtml(e.exam_date || "—")}</td>
                <td>
                  <span class="status-badge status-${escapeHtml(e.status ?? "scheduled")}">
                    ${escapeHtml(e.status ?? "scheduled")}
                  </span>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `
          : '<div class="empty-state">No exams scheduled yet. Plan ahead for your important dates!</div>'
      }
    </section>

    <section>
      <h2>⏱️ Recent Study Sessions</h2>
      ${
        activeSessions.length > 0
          ? `
        <div class="chart-container">
          ${activeSessions
            .slice(0, 20)
            .map(
              (s) => `
            <div class="session-item">
              <div>
                <div class="session-task">${escapeHtml(s.task || "General Study")} (${s.minutes}m)</div>
                <div class="session-meta">${escapeHtml(
                  dbSessions.length
                    ? new Date((s as (typeof dbSessions)[number]).started_at).toLocaleString()
                    : String((s as { timestamp: string }).timestamp ?? ""),
                )}</div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `
          : '<div class="empty-state">No study sessions yet. Start a timer to log your first session!</div>'
      }
    </section>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `Learnora_Report_${new Date().toISOString().slice(0, 10)}.html`;
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

/* Every interpolation of stored data into the report above goes through
 * this. `exam_date` and `status` used to skip it — `status` is free text on
 * the row and was landing inside `class="status-badge status-${...}"`, where
 * a single double-quote closes the attribute early and the rest is parsed as
 * markup. The report is the user's own data in a file they downloaded, so
 * the blast radius is small, but these files get shared and the escaping was
 * already right three lines away. */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
