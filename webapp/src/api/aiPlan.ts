/* Ports `AI.generateWeeklyPlan` from js/ai.js (:420-469).
 *
 * The prompt's task/exam lines are carried over verbatim — that half is the
 * thing the edge function's `mode: "plan"` instructions were tuned against,
 * and rewording it would silently change what the model returns for every
 * existing user. The weak-topics and adherence lines are new additions, not
 * a port: the vanilla never fed either back into planning, which meant a
 * regenerated plan was always a cold guess from tasks/exams alone, with no
 * memory of whether last week's plan actually happened or which topics
 * quizzes say the student is struggling with — even though both signals
 * already existed elsewhere (fetchWeakTopics powers the Dashboard's
 * "Struggling with" chips; study_sessions is what StreakCard reads).
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
import { flashcardsApi } from "./flashcards";
import { foldersApi } from "./folders";
import { plansApi } from "./plans";
import { quizzesApi } from "./quizzes";
import { sessionsApi } from "./sessions";
import { extractPlanJSON, type WeeklyPlanJson } from "../lib/aiJson";
import { localDateStr, mondayOfWeek, weekDates } from "../lib/date";
import {
  computeWeekAdherence,
  formatAdherenceNote,
} from "../lib/planAdherence";
import { parseStoredPlan } from "../lib/planShape";
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
  weakTopics = "None",
  weakFlashcardDecks = "None",
  lastWeekAdherence = "None",
}: {
  weekStartISO: string;
  dates: string[];
  pendingTasks: string;
  upcomingExams: string;
  /** Topics `quiz_attempts.weak_topics` has flagged most often recently —
   *  same data the Dashboard's "Struggling with" chips already read, just
   *  fed into the planner too now. Optional so the existing prompt tests
   *  (and any other caller that hasn't been updated) still get the plain
   *  task/exam prompt rather than a "None"-cluttered one by accident. */
  weakTopics?: string;
  /** Decks with low ease-factors, indicating the student is struggling to retain them. */
  weakFlashcardDecks?: string;
  /** `formatAdherenceNote`'s one-liner on how much of *last* week's plan
   *  actually happened, and which subjects fell short — "None" for a
   *  student's first-ever plan, when there's nothing to compare against. */
  lastWeekAdherence?: string;
}): string {
  return `Build a weekly study schedule for the week of ${weekStartISO} (days: ${dates.join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Recent weak topics from quizzes: ${weakTopics}
Weak flashcard decks: ${weakFlashcardDecks}
Last week's adherence: ${lastWeekAdherence}
Prioritize subjects with closer/harder exams, tasks with closer due dates, and topics the student is weak on. If last week shows a subject was under-studied, ease it back in with shorter blocks rather than repeating the exact same plan. Keep daily blocks realistic (30-90 minutes each, a couple of blocks per day at most). If there is no exam/task data, suggest light general review blocks.`;
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

/** The two adaptive signals `buildPlanPrompt` folds in on top of tasks/exams.
 *  Split out from `generateWeeklyPlan` so it's separately testable — the
 *  four reads it does (weak topics, last week's stored plan, recent
 *  sessions, folders) have nothing to do with talking to the model. */
export async function loadAdaptiveContext(monday: Date): Promise<{
  weakTopics: string;
  weakFlashcardDecks: string;
  lastWeekAdherence: string;
}> {
  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevWeekStartISO = localDateStr(prevMonday);

  const [weakTopicRows, weakDeckRows, prevPlan, sessions, folders] =
    await Promise.all([
      quizzesApi.fetchWeakTopics(5),
      flashcardsApi.fetchWeakDecks(5),
      plansApi.fetchForWeek(prevWeekStartISO),
      // 14 days comfortably covers "last week" regardless of which day of the
      // current week this runs on.
      sessionsApi.fetchSince(14),
      foldersApi.fetch(),
    ]);

  const weakTopics = weakTopicRows.map((w) => w.topic).join(", ") || "None";
  const weakFlashcardDecks = weakDeckRows.join(", ") || "None";

  const prevParsed = prevPlan ? parseStoredPlan(prevPlan.plan_json) : null;
  const lastWeekAdherence =
    prevParsed && prevParsed.days.length > 0
      ? formatAdherenceNote(
          computeWeekAdherence(
            prevParsed.days,
            sessions,
            folders,
            prevWeekStartISO,
          ),
        )
      : "None";

  return { weakTopics, weakFlashcardDecks, lastWeekAdherence };
}

export async function generateWeeklyPlan(
  settings: Settings,
): Promise<WeeklyPlan> {
  const todayStr = localDateStr();
  const monday = mondayOfWeek();
  const weekStartISO = localDateStr(monday);

  const [
    { pendingTasks, upcomingExams },
    { weakTopics, weakFlashcardDecks, lastWeekAdherence },
  ] = await Promise.all([
    loadWorkspaceContext(todayStr),
    loadAdaptiveContext(monday),
  ]);

  const { text } = await callEdge({
    history: [
      {
        role: "user",
        content: buildPlanPrompt({
          weekStartISO,
          dates: weekDates(monday),
          pendingTasks,
          upcomingExams,
          weakTopics,
          weakFlashcardDecks,
          lastWeekAdherence,
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
