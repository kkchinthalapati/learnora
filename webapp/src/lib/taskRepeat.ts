import { dateInDays, formatDateStr, localDateStr, parseLocalDate } from "./date";
import { TASK_MAX } from "./fieldLimits";

/* How a task repeats, and when its next occurrence falls.
 *
 * The repeat lives in the task's own text as a trailing tag ("Lab report
 * [🔁 Weekly]"), which is how weekly repetition has always been stored: the
 * `tasks` table has no recurrence column, so a new repeat type is a new tag
 * and needs no migration. Completing a repeating task inserts a fresh copy
 * with the next due date (see useTaskActions).
 *
 * Everything here is a plain local YYYY-MM-DD, like every date in the app,
 * and `today` is a parameter for the reason formatDueDate gives: the caller
 * and this module can't disagree across midnight, and tests need no clock. */

export type TaskRepeat =
  | "daily"
  | "weekdays"
  | "weekly"
  | "biweekly"
  | "monthly";

/** `label` is what the picker shows and what is written into the tag;
 *  `adjective` fills "Scheduled next … task". */
const REPEAT_META: Record<TaskRepeat, { label: string; adjective: string }> = {
  daily: { label: "Daily", adjective: "daily" },
  weekdays: { label: "Weekdays", adjective: "weekday" },
  weekly: { label: "Weekly", adjective: "weekly" },
  biweekly: { label: "Every 2 weeks", adjective: "biweekly" },
  monthly: { label: "Monthly", adjective: "monthly" },
};

/** Picker order, shortest interval first. */
export const TASK_REPEATS: readonly TaskRepeat[] = [
  "daily",
  "weekdays",
  "weekly",
  "biweekly",
  "monthly",
];

/** The picker label for a repeat ("Every 2 weeks"). */
export function taskRepeatLabel(repeat: TaskRepeat): string {
  return REPEAT_META[repeat].label;
}

/** The repeat as it reads before "task" ("weekday", "monthly"). */
export function taskRepeatAdjective(repeat: TaskRepeat): string {
  return REPEAT_META[repeat].adjective;
}

/* The bare "[Weekly]" and unbracketed "🔁 Weekly" spellings predate the
   picker and are still in people's task lists, so they keep parsing. The
   newer types only match the full "[🔁 …]" form: a task called "Read the
   [Daily] briefing" is a title, not a schedule. */
const REPEAT_TAG_SOURCE =
  "\\[🔁\\s*(daily|weekdays|weekly|every\\s*2\\s*weeks|monthly(?:\\s+(\\d{1,2}))?)\\]|\\[weekly\\]|🔁\\s*weekly";
const REPEAT_TAG_RE = new RegExp(REPEAT_TAG_SOURCE, "i");
const REPEAT_TAG_RE_ALL = new RegExp(REPEAT_TAG_SOURCE, "gi");

export interface ParsedTaskRepeat {
  repeat: TaskRepeat;
  /** Monthly only: the day of the month the task is really meant for, kept
   *  when a short month forced an earlier date (see nextTaskOccurrence). */
  monthDay: number | null;
}

/** The repeat a task's text carries, or null for a one-off task. */
export function parseTaskRepeat(taskText: string): ParsedTaskRepeat | null {
  const m = REPEAT_TAG_RE.exec(taskText);
  if (!m) return null;
  const word = (m[1] ?? "weekly").toLowerCase();
  if (word.startsWith("monthly")) {
    const day = m[2] ? Number(m[2]) : null;
    return {
      repeat: "monthly",
      monthDay: day !== null && day >= 1 && day <= 31 ? day : null,
    };
  }
  const repeat: TaskRepeat = word.startsWith("every")
    ? "biweekly"
    : (word as TaskRepeat);
  return { repeat, monthDay: null };
}

/** Strips recurrence tags from a task description for clean display. */
export function formatRecurrenceCleanText(taskText: string): string {
  return taskText
    .replace(REPEAT_TAG_RE_ALL, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The task text with its repeat set to `repeat` (null removes it). */
export function setTaskRepeat(
  taskText: string,
  repeat: TaskRepeat | null,
  monthDay: number | null = null,
): string {
  const clean = formatRecurrenceCleanText(taskText);
  if (!repeat) return clean;
  const label = REPEAT_META[repeat].label;
  const tag =
    repeat === "monthly" && monthDay
      ? `[🔁 ${label} ${monthDay}]`
      : `[🔁 ${label}]`;
  /* tasksApi cuts text at TASK_MAX, and the tag sits at the end: on a title
     already at the limit the cut would land inside the tag and the task
     would silently stop repeating. Shorten the title instead. */
  const title = clean.slice(0, TASK_MAX - tag.length - 1).trimEnd();
  return title ? `${title} ${tag}` : tag;
}

function daysBetween(from: string, to: string): number {
  /* Rounded, because a local-midnight span across a DST change is 23 or 25
     hours, not 24. */
  return Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000,
  );
}

/** `day` of the month `monthOffset` months after `from`'s, pulled back to the
 *  month's last day when it has no such day (the 31st in a 30-day month). */
function clampedMonthDate(from: Date, monthOffset: number, day: number): string {
  const first = new Date(from.getFullYear(), from.getMonth() + monthOffset, 1);
  const lastDay = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  return formatDateStr(
    first.getFullYear(),
    first.getMonth(),
    Math.min(day, lastDay),
  );
}

export interface TaskOccurrence {
  text: string;
  dueDate: string;
  repeat: TaskRepeat;
}

/* The copy to create when a repeating task is ticked off; null if the task
 * does not repeat.
 *
 * The next date is counted from the task's due date (today, if it has none),
 * so the rhythm holds: a Thursday task stays on Thursdays however early or
 * late it was done. It is also always after today. A task finished weeks late
 * would otherwise come back already overdue, once for every occurrence that
 * was missed, and a daily task left for a fortnight would need fourteen
 * ticks to catch up. Missed occurrences are skipped, not queued.
 *
 * Monthly keeps the day it was set for. Jan 31 has to become Feb 28, and
 * counting on from Feb 28 would make it the 28th forever, so the tag records
 * the intended day ("[🔁 Monthly 31]") once a month has cut it short. The
 * record is only trusted while the due date still agrees with it: someone who
 * moves the task to the 15th by hand means the 15th from then on. */
export function nextTaskOccurrence(
  taskText: string,
  dueDate: string | null | undefined,
  today: string = localDateStr(),
): TaskOccurrence | null {
  const parsed = parseTaskRepeat(taskText);
  if (!parsed) return null;
  const base = dueDate || today;

  switch (parsed.repeat) {
    case "daily":
    case "weekdays": {
      let next = dateInDays(1, base > today ? base : today);
      if (parsed.repeat === "weekdays") {
        /* Sat → Mon, Sun → Mon. */
        const weekday = parseLocalDate(next).getDay();
        if (weekday === 6) next = dateInDays(2, next);
        else if (weekday === 0) next = dateInDays(1, next);
      }
      return { text: taskText, dueDate: next, repeat: parsed.repeat };
    }
    case "weekly":
    case "biweekly": {
      const step = parsed.repeat === "weekly" ? 7 : 14;
      const behind = daysBetween(base, today);
      const steps = behind < 0 ? 1 : Math.floor(behind / step) + 1;
      return {
        text: taskText,
        dueDate: dateInDays(steps * step, base),
        repeat: parsed.repeat,
      };
    }
    case "monthly": {
      const from = parseLocalDate(base);
      const todayDate = parseLocalDate(today);
      const kept =
        parsed.monthDay !== null &&
        clampedMonthDate(from, 0, parsed.monthDay) === base
          ? parsed.monthDay
          : from.getDate();
      let months = Math.max(
        1,
        (todayDate.getFullYear() - from.getFullYear()) * 12 +
          (todayDate.getMonth() - from.getMonth()),
      );
      let next = clampedMonthDate(from, months, kept);
      if (next <= today) {
        months += 1;
        next = clampedMonthDate(from, months, kept);
      }
      /* Days 1-28 exist in every month, so there is nothing to remember. */
      return {
        text: setTaskRepeat(taskText, "monthly", kept > 28 ? kept : null),
        dueDate: next,
        repeat: "monthly",
      };
    }
  }
}
