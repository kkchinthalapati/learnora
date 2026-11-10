/* What Home says under "Today", and the subjects it lists. Pure, so every
 * case a student can be in (nothing yet, nothing due, things due) is tested
 * without rendering the page.
 *
 * Two rules. Every number here is a count of real rows: cards the scheduler
 * says are due, ledger rows due a check. And there is no time estimate,
 * because nothing measures how long a student's cards or checks take them. */

import type { Exam, Folder, Material } from "../api/types";
import { daysUntil } from "./quizForecast";
import { lessonPath, lessonTitle, type LessonProgress } from "./lessons";

export interface TodayInput {
  /** Cards the scheduler says are due now. */
  dueCards: number;
  /** Ledger items due: check-backs, repairs waiting, a pair to tell apart. */
  dueIdeas: number;
  /** The topic the adaptive session (lib/adaptiveSession) would start on,
   *  or null when it has nothing to go on. */
  sessionTopic: string | null;
  /** Somewhere to send a student whose only due item is a pair to sort. */
  pairHref: string | null;
  /** Home is already showing a "continue" row above this. */
  hasResume: boolean;
  /** A lesson to open when nothing is due and nothing is in progress. */
  nextLesson: { title: string; href: string } | null;
  hasLessons: boolean;
}

export type TodayAction =
  /** Start the adaptive session: Home builds the run. */
  | { kind: "session"; label: string }
  | { kind: "link"; label: string; to: string };

export interface TodayView {
  state: "revisit" | "session" | "continue" | "lesson" | "first";
  message: string;
  action: TodayAction | null;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function revisitMessage(cards: number, ideas: number): string {
  const parts = [
    cards > 0 ? count(cards, "card", "cards") : "",
    ideas > 0 ? count(ideas, "idea", "ideas") : "",
  ].filter(Boolean);
  const plural = cards + ideas !== 1;
  return `${parts.join(" and ")} ${plural ? "are" : "is"} worth another look today.`;
}

export function todayView(input: TodayInput): TodayView {
  const cards = Math.max(0, input.dueCards);
  const ideas = Math.max(0, input.dueIdeas);

  if (cards + ideas > 0) {
    const action: TodayAction | null = input.sessionTopic
      ? { kind: "session", label: "Start session" }
      : cards > 0
        ? { kind: "link", label: "Review cards", to: "/review/daily-drill" }
        : input.pairHref
          ? { kind: "link", label: "Tell them apart", to: input.pairHref }
          : null;
    return { state: "revisit", message: revisitMessage(cards, ideas), action };
  }

  if (input.sessionTopic) {
    return {
      state: "session",
      message: `Nothing is due today. A short session on ${input.sessionTopic} is ready when you are.`,
      action: { kind: "session", label: "Start session" },
    };
  }

  if (input.hasResume) {
    return {
      state: "continue",
      message: "Nothing urgent today. Continue where you left off.",
      action: null,
    };
  }

  if (input.nextLesson) {
    return {
      state: "lesson",
      message: `Nothing urgent today. ${input.nextLesson.title} is ready when you are.`,
      action: { kind: "link", label: "Open lesson", to: input.nextLesson.href },
    };
  }

  return {
    state: "first",
    message: input.hasLessons
      ? "Nothing urgent today. Pick a lesson below, or add something new."
      : "Add a topic, your notes or a lecture below, and your first lesson starts here.",
    action: null,
  };
}

/* ---------------------------------------------------------------- lessons */

type LessonRow = Pick<Material, "id" | "title" | "folder_id" | "created_at">;

/** Practised through: it has cards and every one has been reviewed. A lesson
 *  with no cards yet is not done, it is not started. */
function isPractisedThrough(p: LessonProgress | undefined): boolean {
  return Boolean(p && p.total > 0 && p.practised >= p.total);
}

/** The lesson to suggest next: the earliest-added one not practised through,
 *  on the reading that lessons are added in the order a course is taught. */
export function nextLessonOf(
  lessons: readonly LessonRow[],
  progress: ReadonlyMap<string, LessonProgress>,
): LessonRow | null {
  const waiting = lessons.filter((m) => !isPractisedThrough(progress.get(m.id)));
  if (waiting.length === 0) return null;
  return [...waiting].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
}

export function nextLessonLink(
  lessons: readonly LessonRow[],
  progress: ReadonlyMap<string, LessonProgress>,
): { title: string; href: string } | null {
  const next = nextLessonOf(lessons, progress);
  return next ? { title: lessonTitle(next), href: lessonPath(next.id) } : null;
}

/* --------------------------------------------------------------- subjects */

export interface HomeSubject {
  id: string;
  name: string;
  color: string;
  /** One line: what's next in it, and its exam when one is coming. */
  meta: string;
}

export const HOME_SUBJECT_LIMIT = 4;

/** The subjects Home lists: those worked on most recently first, each with
 *  its next lesson. Only real subjects, and nothing is said about a subject
 *  beyond what its rows show. */
export function homeSubjects(input: {
  folders: readonly Pick<Folder, "id" | "name" | "color" | "created_at">[];
  lessons: readonly LessonRow[];
  progress: ReadonlyMap<string, LessonProgress>;
  exams: readonly Pick<Exam, "exam_name" | "exam_date" | "folder_id">[];
  /** Local date, YYYY-MM-DD. */
  today: string;
  limit?: number;
}): HomeSubject[] {
  const { folders, lessons, progress, exams, today, limit = HOME_SUBJECT_LIMIT } = input;
  const bySubject = new Map<string, LessonRow[]>();
  for (const m of lessons) {
    if (!m.folder_id) continue;
    const list = bySubject.get(m.folder_id) ?? [];
    list.push(m);
    bySubject.set(m.folder_id, list);
  }
  const latest = (f: Pick<Folder, "id" | "created_at">) =>
    (bySubject.get(f.id) ?? []).reduce((max, m) => (m.created_at > max ? m.created_at : max), f.created_at ?? "");

  return [...folders]
    .sort((a, b) => latest(b).localeCompare(latest(a)))
    .slice(0, limit)
    .map((f) => {
      const own = bySubject.get(f.id) ?? [];
      const next = nextLessonOf(own, progress);
      const exam = exams
        .filter((e) => e.folder_id === f.id && e.exam_date >= today)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
      const days = exam ? daysUntil(exam.exam_date, today) : null;
      const parts = [
        own.length === 0
          ? "No lessons yet"
          : next
            ? `Next: ${lessonTitle(next)}`
            : `${count(own.length, "lesson", "lessons")}, all practised`,
        exam && days !== null
          ? days === 0
            ? "exam today"
            : `exam in ${count(days, "day", "days")}`
          : "",
      ].filter(Boolean);
      return { id: f.id, name: f.name, color: f.color, meta: parts.join(" · ") };
    });
}
