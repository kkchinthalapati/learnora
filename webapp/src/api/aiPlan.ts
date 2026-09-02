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
import { availabilityRange } from "../lib/availability";
import {
  AVAILABILITY_RULE,
  formatAvailabilityNote,
  formatChronotypeNote,
} from "../lib/availabilityPrompt";
import { importIcsForRange } from "../lib/icsImport";
import { isLifeContextConfigured, loadLifeContext } from "../lib/lifeContext";
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
  availability = "None",
  chronotype = "Unknown",
  isTriage = false,
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
  /** `formatAvailabilityNote`'s per-day summary of when this student is
   *  actually free, from their own timetable and imported calendar. "None"
   *  when they have not set up My week, in which case the rule below is left
   *  out too — a binding instruction about an empty list would have the model
   *  refuse to schedule anything at all. */
  availability?: string;
  /** When their head works best, for placing the demanding blocks. */
  chronotype?: string;
  /** When true, the AI is instructed to ignore long-term tasks and focus purely on
   * an emergency 80/20 survival schedule for the most urgent exam. */
  isTriage?: boolean;
}): string {
  if (isTriage) {
    return `Generate an EMERGENCY SURVIVAL study schedule for the next 48 hours (dates: ${dates.slice(0, 2).join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Recent weak topics from quizzes: ${weakTopics}

This is a Triage situation. The student is panicking and has limited time. DO NOT generate a standard weekly plan. 
1. Ignore all tasks and exams that are more than a week away.
2. Identify the single most urgent exam and the student's weak topics for it.
3. Apply the 80/20 rule: focus ONLY on high-yield, critical topics that will get them a passing grade.
4. Schedule intense but realistic study blocks (e.g., 45-60 minutes) for these next 48 hours.
5. Skip any "general review" blocks. Cut the fluff. Be ruthless.`;
  }

  return `Build a weekly study schedule for the week of ${weekStartISO} (days: ${dates.join(", ")}).
Pending tasks: ${pendingTasks}
Upcoming exams: ${upcomingExams}
Recent weak topics from quizzes: ${weakTopics}
Weak flashcard decks: ${weakFlashcardDecks}
Last week's adherence: ${lastWeekAdherence}
When the student is actually free: ${availability}
When their head works best: ${chronotype}
${
  availability === "None"
    ? ""
    : `${AVAILABILITY_RULE}
`
}Prioritize subjects with closer/harder exams, tasks with closer due dates, and topics the student is weak on. If last week shows a subject was under-studied, ease it back in with shorter blocks rather than repeating the exact same plan. Keep daily blocks realistic (30-90 minutes each, a couple of blocks per day at most). If there is no exam/task data, suggest light general review blocks.`;
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

/** The student's own week, for the days the plan will cover.
 *
 * Synchronous and local — life context lives in localStorage and the calendar
 * import never leaves the device, so unlike every other context loader here
 * there is nothing to await and nothing to fail. A student who has not set up
 * My week gets "None" for both, and `buildPlanPrompt` drops the scheduling
 * rule accordingly rather than binding the model to an empty list. */
export function loadLifeAvailabilityContext(
  weekStartISO: string,
  dayCount: number = 7,
): { availability: string; chronotype: string } {
  const ctx = loadLifeContext();
  if (!isLifeContextConfigured(ctx)) {
    return { availability: "None", chronotype: "Unknown" };
  }
  const calendar = ctx.importedIcs
    ? importIcsForRange(ctx.importedIcs, weekStartISO, dayCount).events
    : [];
  return {
    availability: formatAvailabilityNote(
      availabilityRange(ctx, weekStartISO, dayCount, calendar),
    ),
    chronotype: formatChronotypeNote(ctx.chronotype),
  };
}

export async function generateWeeklyPlan(
  settings: Settings,
  isTriage: boolean = false,
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
  const { availability, chronotype } =
    loadLifeAvailabilityContext(weekStartISO);

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
          availability,
          chronotype,
          isTriage,
        }),
      },
    ],
    mode: "plan",
    settings,
  });

  const planJson: WeeklyPlanJson | null = extractPlanJSON(text);
  if (!planJson) throw new PlanShapeError();

  if (isTriage) {
    planJson.isTriage = true;
  }

  return plansApi.upsert(weekStartISO, planJson);
}
