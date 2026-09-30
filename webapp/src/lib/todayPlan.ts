/* What Today leads with.
 *
 * Today answers one question — what should I do now? — with one button. This
 * picks which of its scenarios applies from state the app already holds: the
 * continuity snapshot (an unfinished Session), the misconception ledger (a
 * test that went badly), the trajectory forecast (the topic worth the next
 * hour) and what is due. Pure, so the ordering is testable without React.
 *
 * Order, and why:
 *   short     the student said they only have ten minutes; that overrides
 *             everything, because the other cards all assume more time
 *   returning an unfinished Session — resuming costs nothing to decide
 *   rough     a test in the last ~day and a half surfaced misconceptions:
 *             fixing a fresh wrong belief beats any forecast
 *   next      the forecast's top topic, via chooseNextStep
 *   clear     an exam and material, but nothing worth doing right now
 *   empty     no exam or no material — onboarding, not a next step */

import type { QuizAttempt, Task } from "../api/types";
import type { LastStudySession } from "./continuity";
import type { Misconception } from "./misconceptions";
import { localDateStr } from "./date";
import { topicMastery } from "./mastery";
import { newSessionHref } from "./sessionModes";
import type { TopicState, TrajectoryForecast } from "./trajectory";

export type TodayScenario =
  | "short"
  | "returning"
  | "rough"
  | "next"
  | "clear"
  | "empty";

/** How recent a test must be for Today to lead with its results. */
export const ROUGH_TEST_WINDOW_HOURS = 36;

export interface TodayInput {
  now: Date;
  shortOnTime: boolean;
  session: LastStudySession | null;
  attempts: QuizAttempt[];
  misconceptions: Misconception[];
  hasExam: boolean;
  needsMaterial: boolean;
  forecast: TrajectoryForecast | null;
  dueCards: number;
  tasks: Task[];
}

export interface RoughTest {
  attempt: QuizAttempt;
  /** Quiz-origin misconceptions seen since the attempt, most urgent first. */
  fixes: Misconception[];
}

export function recentRoughTest(
  attempts: QuizAttempt[],
  misconceptions: Misconception[],
  now: Date,
): RoughTest | null {
  const cutoff = now.getTime() - ROUGH_TEST_WINDOW_HOURS * 3_600_000;
  const latest = [...attempts]
    .filter((a) => new Date(a.created_at).getTime() >= cutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest || latest.score >= latest.total) return null;
  /* A misconception the quiz logged at (or just before) submission. The
     ledger writes a few seconds either side of the attempt row. */
  const since = new Date(latest.created_at).getTime() - 5 * 60_000;
  const fixes = misconceptions.filter(
    (m) =>
      m.originTool === "quiz" &&
      m.status !== "resolved" &&
      new Date(m.lastSeenAt).getTime() >= since,
  );
  return fixes.length > 0 ? { attempt: latest, fixes } : null;
}

export function chooseTodayScenario(input: TodayInput): TodayScenario {
  if (!input.hasExam || input.needsMaterial) {
    /* A session or a rough test is still worth leading with before the
       student has set an exam — they are working, just not planning. */
    if (input.session && input.session.status !== "done") return "returning";
    return "empty";
  }
  if (input.shortOnTime) return "short";
  if (input.session && input.session.status !== "done") return "returning";
  if (recentRoughTest(input.attempts, input.misconceptions, input.now)) {
    return "rough";
  }
  const top = input.forecast?.interventions[0];
  if (top && top.pointsPerHour > 0) return "next";
  if (input.dueCards > 0) return "short";
  return "clear";
}

export interface AlsoRow {
  id: string;
  /** Ochre dot for memory work (recall, fading); muted for tasks. */
  kind: "recall" | "task";
  label: string;
  /** "6 min", or a word ("Plan") when there is no honest estimate. */
  estimate: string;
  action: string;
  to: string;
}

/** Seconds a due card takes, for the "6 min" estimate. */
const SECONDS_PER_CARD = 20;

export function minutesForCards(n: number): number {
  return Math.max(1, Math.round((n * SECONDS_PER_CARD) / 60));
}

/** Topics slipping below a rung within the week, strongest first. */
export function fadingTopics(topics: TopicState[]): TopicState[] {
  return topics
    .filter((t) => topicMastery(t).fading)
    .sort((a, b) => b.mastery - a.mastery);
}

/** Up to three secondary items. Rows, not cards: they are the "also", not
 *  competition for the one button. `exclude` drops whatever the lead card
 *  already offers so the same thing is never asked twice. */
export function alsoWorthDoing({
  dueCards,
  forecast,
  tasks,
  today,
  exclude = [],
}: {
  dueCards: number;
  forecast: TrajectoryForecast | null;
  tasks: Task[];
  today: string;
  exclude?: Array<"cards" | "fading">;
}): AlsoRow[] {
  const rows: AlsoRow[] = [];
  if (dueCards > 0 && !exclude.includes("cards")) {
    rows.push({
      id: "cards",
      kind: "recall",
      label: `Review ${dueCards} ${dueCards === 1 ? "flashcard" : "flashcards"}`,
      estimate: `${minutesForCards(dueCards)} min`,
      action: "Review",
      to: "/review/daily-drill",
    });
  }
  const fading = fadingTopics(forecast?.topics ?? [])[0];
  if (fading && !exclude.includes("fading")) {
    rows.push({
      id: `fading-${fading.id}`,
      kind: "recall",
      label: `${fading.label} is fading: 5-question check`,
      estimate: "4 min",
      action: "Check",
      to: newSessionHref("recall", { topic: fading.label }),
    });
  }
  const due = tasks
    .filter((t) => !t.is_done && t.due_date !== null && t.due_date <= today)
    .slice(0, 3);
  for (const task of due) {
    rows.push({
      id: `task-${task.id}`,
      kind: "task",
      label: task.text,
      estimate: task.due_date === today ? "Today" : "Overdue",
      action: "Open",
      to: "/tasks",
    });
  }
  return rows.slice(0, 3);
}

/** Study days a week the (experimental) weekly goal asks for. */
export const WEEKLY_GOAL_DAYS = 5;

/** The seven local dates of the Monday-start week containing `now`. */
export function weekDates(now: Date): string[] {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateStr(d);
  });
}
