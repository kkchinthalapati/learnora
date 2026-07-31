/* Ports `AI.generateWeeklyPlan` from js/ai.js (:420-469).
 *
 * The prompt is carried over verbatim — it is the thing the edge function's
 * `mode: "plan"` instructions were tuned against, and rewording it here would
 * silently change what the model returns for every existing user.
 *
 * Two changes from the vanilla, both consequences of decisions already made:
 * it throws instead of showing a popup and returning null (Decision #6), and
 * it takes `settings` as an argument rather than reading `UI.loadSettings()`
 * off a global, so the caller passes whatever `SettingsProvider` currently
 * holds — including unsaved edits, which is what the vanilla did too.
 */

import { callEdge } from "./ai";
import { tasksApi } from "./tasks";
import { examsApi } from "./exams";
import { plansApi } from "./plans";
import { extractPlanJSON, type WeeklyPlanJson } from "../lib/aiJson";
import { localDateStr, mondayOfWeek, weekDates } from "../lib/date";
import type { Settings } from "../lib/settings";
import type { WeeklyPlan } from "./types";

/** Thrown when the model replied but nothing plan-shaped could be recovered
 *  from it — distinct from a transport failure, and worth a different
 *  message ("try again" rather than "we're down"). */
export class PlanShapeError extends Error {
  constructor() {
    super("Couldn't generate a plan this time. Please try again.");
    this.name = "PlanShapeError";
  }
}

export function buildPlanPrompt({
  weekStartISO,
  dates,
  pendingTasks,
  upcomingExams,
}: {
  weekStartISO: string;
  dates: string[];
  pendingTasks: string;
  upcomingExams: string;
}): string {
  return `Build a weekly study schedule for the week of ${weekStartISO} (days: ${dates.join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Prioritize subjects with closer/harder exams and tasks with closer due dates. Keep daily blocks realistic (30-90 minutes each, a couple of blocks per day at most). If there is no exam/task data, suggest light general review blocks.`;
}

/** The workspace summary both the planner and the chat feed to the model.
 *  Exams that have already happened (or are manually marked Completed) are
 *  excluded — an exam in the past isn't "upcoming" and shouldn't shape the
 *  schedule as if it still were. */
export async function loadWorkspaceContext(todayStr = localDateStr()): Promise<{
  pendingTasks: string;
  upcomingExams: string;
}> {
  const [tasks, exams] = await Promise.all([
    tasksApi.fetch(),
    examsApi.fetch(),
  ]);

  const pendingTasks =
    tasks
      .filter((t) => !t.is_done)
      .map((t) => (t.due_date ? `${t.text} (due ${t.due_date})` : t.text))
      .join(", ") || "None";

  const upcomingExams =
    exams
      .filter((e) => e.status !== "Completed" && e.exam_date >= todayStr)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
      .map(
        (e) =>
          `${e.exam_name} on ${e.exam_date} (difficulty: ${e.difficulty || "unspecified"})`,
      )
      .join(", ") || "None";

  return { pendingTasks, upcomingExams };
}

export async function generateWeeklyPlan(
  settings: Settings,
): Promise<WeeklyPlan> {
  const todayStr = localDateStr();
  const { pendingTasks, upcomingExams } = await loadWorkspaceContext(todayStr);

  const monday = mondayOfWeek();
  const weekStartISO = localDateStr(monday);

  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildPlanPrompt({
          weekStartISO,
          dates: weekDates(monday),
          pendingTasks,
          upcomingExams,
        }),
      },
    ],
    mode: "plan",
    settings,
  });

  const planJson: WeeklyPlanJson | null = extractPlanJSON(text);
  if (!planJson) throw new PlanShapeError();

  return plansApi.upsert(weekStartISO, planJson);
}
