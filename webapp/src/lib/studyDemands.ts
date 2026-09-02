/* What actually needs doing, expressed as things that take time.
 *
 * Learnora already knows all of this — cards are due, a task is overdue, an
 * exam is on the 14th, a topic keeps coming back wrong — but it knows it as
 * five separate cards on a dashboard, each of which asks the student to work
 * out for themselves how much of their week it deserves. This turns all of it
 * into one comparable currency: minutes, a deadline, and how hard it is to
 * think about. `autoSchedule.ts` takes it from there.
 *
 * The estimates are deliberately conservative. A schedule that asks for less
 * than the student can do gets finished, and a finished day is the thing that
 * brings someone back tomorrow. */

import type { Exam, Task, WeakTopic } from "../api/types";
import type { StudyDemand } from "./autoSchedule";
import { dateInDays, formatRecurrenceCleanText, parseLocalDate } from "./date";

/** Minutes per due flashcard, and the sane bounds on a single review sitting.
 *  Roughly 30 seconds a card at a steady pace; 200 cards is a bad evening, not
 *  a 100-minute block, so the ask is capped and the rest carries to tomorrow. */
const MINS_PER_CARD = 0.5;
const MIN_REVIEW_MINS = 10;
const MAX_REVIEW_MINS = 40;

const DEFAULT_TASK_MINS = 30;
/** Undated tasks are real work, but scheduling all of them would bury the
 *  dated ones. The few most recently added get a slot; the rest wait. */
const MAX_UNDATED_TASKS = 3;

const EXAM_PREP_MINS: Record<string, number> = {
  Hard: 55,
  Medium: 45,
  Easy: 35,
};

/* A student can write "read chapter 4 ~45m" and have the schedule believe
   them. Cheaper than a duration field on every task, and it degrades to the
   default the moment they don't bother. */
const DURATION_HINT_RE = /~\s*(\d{1,3})\s*(m|min|mins|h|hr|hrs)\b/i;

export function parseDurationHint(text: string): number | null {
  const m = DURATION_HINT_RE.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const mins = /^h/i.test(m[2]) ? value * 60 : value;
  return Math.min(240, Math.round(mins));
}

/** The task text as it should read on a timeline: no recurrence tag, no
 *  duration hint, no double spaces. */
export function cleanDemandLabel(text: string): string {
  return formatRecurrenceCleanText(text)
    .replace(DURATION_HINT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000,
  );
}

export interface DemandSources {
  tasks: Task[];
  exams: Exam[];
  /** Cards whose next review date has arrived. */
  dueCardCount: number;
  /** Topics the quizzes keep catching. Two at most get a block. */
  weakTopics?: WeakTopic[];
  today: string;
  /** How far ahead we are scheduling. Beyond this, nothing is proposed. */
  horizonDays: number;
}

/** Everything competing for this student's week, newest evidence first. */
export function buildDemands(src: DemandSources): StudyDemand[] {
  const { today, horizonDays } = src;
  const horizonEnd = dateInDays(horizonDays - 1, today);
  const demands: StudyDemand[] = [];

  /* 1. Spaced repetition. Due today, every day, because that is what "due"
        means — a review deferred is a card relearned from scratch. */
  if (src.dueCardCount > 0) {
    demands.push({
      id: "review:due",
      label: `Review ${src.dueCardCount} due card${src.dueCardCount === 1 ? "" : "s"}`,
      kind: "review",
      estMins: Math.max(
        MIN_REVIEW_MINS,
        Math.min(MAX_REVIEW_MINS, Math.ceil(src.dueCardCount * MINS_PER_CARD)),
      ),
      load: 1,
      dueDate: today,
      href: "/library/flashcards",
    });
  }

  /* 2. Tasks. Dated ones carry their deadline; overdue ones keep the deadline
        they missed so `urgencyScore` can see they are late. */
  const openTasks = src.tasks.filter((t) => !t.is_done);
  const dated = openTasks.filter((t) => t.due_date && t.due_date <= horizonEnd);
  const undated = openTasks
    .filter((t) => !t.due_date)
    .slice(-MAX_UNDATED_TASKS)
    .reverse();

  for (const task of [...dated, ...undated]) {
    const label = cleanDemandLabel(task.text);
    if (!label) continue;
    demands.push({
      id: `task:${task.id}`,
      label,
      kind: "task",
      estMins: parseDurationHint(task.text) ?? DEFAULT_TASK_MINS,
      load: 2,
      /* An overdue task's deadline is pulled to today. Left in the past it
         would have no window on or before it and come straight back as
         unplaced — technically true and completely unhelpful. */
      dueDate: task.due_date
        ? task.due_date < today
          ? today
          : task.due_date
        : null,
      href: "/tasks",
    });
  }

  /* 3. Exams. One prep sitting per remaining day rather than one large lump,
        each one due on its own day so the scheduler is forced to spread them.
        Cramming is what happens when nobody books the earlier days. */
  for (const exam of src.exams) {
    if (!exam.exam_date || exam.status === "Completed") continue;
    const daysUntil = daysBetween(today, exam.exam_date);
    if (daysUntil < 0) continue;

    const sittings = Math.min(horizonDays, daysUntil + 1);
    const mins = EXAM_PREP_MINS[exam.difficulty ?? ""] ?? EXAM_PREP_MINS.Medium;
    for (let i = 0; i < sittings; i += 1) {
      const on = dateInDays(i, today);
      if (on > exam.exam_date) break;
      demands.push({
        id: `exam:${exam.id}:${i}`,
        label: `${exam.exam_name} prep`,
        kind: "exam",
        estMins: mins,
        load: 3,
        dueDate: on,
        subject: exam.exam_name,
        href: "/exams",
        /* The closer the exam, the more a prep sitting outranks everything
           else that day. Flat across sittings so the near days do not all
           lose to the far ones. */
        boost: Math.max(0, 20 - daysUntil * 2),
      });
    }
  }

  /* 4. Weak topics. No deadline — these fill whatever peak hour the deadlines
        left, which is exactly where relearning a misunderstood topic belongs. */
  for (const weak of (src.weakTopics ?? []).slice(0, 2)) {
    demands.push({
      id: `weak:${weak.topic}`,
      label: `Rebuild: ${weak.topic}`,
      kind: "subject",
      estMins: 30,
      load: 3,
      subject: weak.topic,
      href: "/analytics",
      boost: 6,
    });
  }

  return demands;
}
