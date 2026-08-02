/* Executes the action tags in a model reply and rebuilds the reply as parts —
 * ports js/ai.js:1096-1240.
 *
 * The vanilla did this in two passes: execute every tag, then run seven
 * `.replace()` calls over the original string to swap each tag block for a
 * widget, parking the widget HTML behind an opaque token so it wouldn't be
 * escaped. One pass over the matches produces the same result, and because
 * the output is a list of parts rather than a string, the widgets never need
 * to become HTML at all — which is what lets the chat render without
 * `dangerouslySetInnerHTML` (see lib/markdownToReact.tsx).
 *
 * Everything here is I/O-free except the injected handlers, so the whole
 * action contract — what runs, what asks first, what a declined action looks
 * like — is testable without rendering a chat.
 */

import { ACTION_TAGS, type ActionTag } from "./actionTags";
import type { ActionWidget, ReplyPart } from "../context/chat";

/** The vanilla's cap (js/ai.js:1058). A reply that tries to create fifty
 *  tasks is a malfunction, not a request. */
export const MAX_TASKS_PER_REPLY = 10;

export type ExamDifficulty = "Easy" | "Medium" | "Hard";

export interface ActionHandlers {
  /** Returns true when the student allows the action. */
  confirm: (
    message: string,
    options: { title: string; confirmText: string; danger?: boolean },
  ) => Promise<boolean>;
  /** `dueDate` is a plain YYYY-MM-DD, or omitted for an undated task — see
   *  the ADD_TASK case for where the `||DUE:` suffix is parsed out. */
  addTask: (text: string, dueDate?: string) => Promise<void>;
  /** These four all resolve `name` against the student's current tasks/exams
   *  by exact text match (case-insensitive) — the model only ever sees task
   *  and exam *names* in WORKSPACE STATE, never a stable id, so a name match
   *  is the only handle chat has on an existing row. Each returns false when
   *  nothing matched, so the caller can tell the student rather than
   *  silently doing nothing. */
  completeTask: (name: string) => Promise<boolean>;
  deleteTask: (name: string) => Promise<boolean>;
  rescheduleTask: (name: string, dueDate: string) => Promise<boolean>;
  deleteExam: (name: string) => Promise<boolean>;
  /** Applies and starts a countdown of `minutes`. */
  startTimer: (minutes: number) => void;
  /** Returns false when the value names no theme the app has. */
  setTheme: (value: string) => boolean;
  /** Returns false when the value names no route the app has. */
  navigate: (view: string) => boolean;
  /** Fire-and-forget: the chat must not block on a 30-second generation. */
  generateQuiz: (topic: string) => void;
  generateDeck: (topic: string) => void;
  generatePlan: () => void;
  /** Scores whichever flashcard is currently on screen in the review view.
   *  A no-op when no review session is mounted to grade. */
  gradeFlashcard: (score: number) => void;
  addExam: (
    name: string,
    date: string,
    difficulty: ExamDifficulty,
  ) => Promise<void>;
}

interface TagMatch {
  tag: ActionTag;
  payload: string;
  start: number;
  end: number;
}

/** Plain YYYY-MM-DD, matching what every date `<input>` in the app produces
 *  and every date column stores. Anything else (a relative phrase the model
 *  didn't resolve, a malformed string) is rejected rather than passed on to
 *  a Postgres date column that would reject it anyway with a worse error. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EXAM_DIFFICULTIES: readonly ExamDifficulty[] = ["Easy", "Medium", "Hard"];

/** Splits `ADD_TASK`'s optional `Task text||DUE:YYYY-MM-DD` payload. A
 *  malformed or missing date suffix is treated as "no due date" rather than
 *  rejecting the whole task — the task itself is still worth creating. */
function parseTaskPayload(payload: string): {
  text: string;
  dueDate?: string;
} {
  const sep = payload.lastIndexOf("||DUE:");
  if (sep === -1) return { text: payload };
  const text = payload.slice(0, sep).trim();
  const dueDate = payload.slice(sep + "||DUE:".length).trim();
  return DATE_RE.test(dueDate) ? { text, dueDate } : { text: text || payload };
}

/** Splits `ADD_EXAM`'s `Name||YYYY-MM-DD||Difficulty` payload. Difficulty is
 *  optional and defaults to Medium, matching ExamPanel's own default; an
 *  unrecognised value falls back the same way rather than rejecting the tag
 *  over a detail the student didn't actually specify. */
function parseExamPayload(
  payload: string,
): { name: string; date: string; difficulty: ExamDifficulty } | null {
  const parts = payload.split("||").map((p) => p.trim());
  const [name, date, difficultyRaw] = parts;
  if (!name || !date || !DATE_RE.test(date)) return null;
  const difficulty = EXAM_DIFFICULTIES.includes(difficultyRaw as ExamDifficulty)
    ? (difficultyRaw as ExamDifficulty)
    : "Medium";
  return { name, date, difficulty };
}

/** Splits `RESCHEDULE_TASK`'s `Name||YYYY-MM-DD` payload. Unlike ADD_TASK's
 *  due date, the date isn't optional here — "reschedule" with no new date
 *  isn't a coherent request, so a missing or malformed one cancels the whole
 *  tag rather than silently leaving the task where it was. */
function parseReschedulePayload(
  payload: string,
): { name: string; date: string } | null {
  const sep = payload.lastIndexOf("||");
  if (sep === -1) return null;
  const name = payload.slice(0, sep).trim();
  const date = payload.slice(sep + 2).trim();
  return name && DATE_RE.test(date) ? { name, date } : null;
}

const BLOCK_RE = new RegExp(
  `<(${ACTION_TAGS.join("|")})>([\\s\\S]*?)</\\1>`,
  "g",
);

function findTags(text: string): TagMatch[] {
  const out: TagMatch[] = [];
  let match: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    out.push({
      tag: match[1] as ActionTag,
      payload: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return out;
}

const ok = (
  icon: ActionWidget["icon"],
  text: string,
  subject?: string,
): ActionWidget => ({ icon, text, subject, cancelled: false });

const cancelled = (text: string, subject?: string): ActionWidget => ({
  icon: "x",
  text,
  subject,
  cancelled: true,
});

/** Execute the reply's action tags and return it as text-and-widget parts.
 *  A tag that produced no widget (the vanilla returned `''` for a failed
 *  NAVIGATE and GRADE_FLASHCARD) simply leaves a gap where it was. */
export async function executeActions(
  reply: string,
  handlers: ActionHandlers,
): Promise<ReplyPart[]> {
  const matches = findTags(reply);
  const parts: ReplyPart[] = [];

  let tasksAdded = 0;
  /* The vanilla executed only the *first* occurrence of every tag except
     ADD_TASK, but its `.replace()` pass then rendered a success widget for
     every occurrence — so a reply with two `<START_TIMER>` blocks claimed two
     timers had started when one had. Later occurrences are marked cancelled
     here instead, which is what actually happened.

     COMPLETE_TASK and DELETE_TASK join ADD_TASK in being allowed to repeat —
     "mark my finished readings as done" is a normal batch request, and
     unlike ADD_TASK's spam risk (an invented task costs nothing to generate),
     these can only ever act on tasks that already exist, which bounds them
     naturally. RESCHEDULE_TASK, DELETE_EXAM and ADD_DECK stay single-
     occurrence, matching ADD_QUIZ/ADD_PLAN/SET_THEME/NAVIGATE, since a batch
     reschedule or multi-exam deletion in one reply is rare enough that
     forcing separate turns is the safer default. */
  const REPEATABLE_TAGS: ReadonlySet<ActionTag> = new Set([
    "ADD_TASK",
    "COMPLETE_TASK",
    "DELETE_TASK",
  ]);
  const done = new Set<ActionTag>();

  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ kind: "text", text: reply.slice(cursor, match.start) });
    }
    cursor = match.end;

    const widget = await runTag(match, handlers, {
      isRepeat: done.has(match.tag),
      tasksAdded,
      addTask: () => {
        tasksAdded++;
      },
    });
    if (!REPEATABLE_TAGS.has(match.tag)) done.add(match.tag);
    if (widget) parts.push({ kind: "widget", widget });
  }

  if (cursor < reply.length) {
    parts.push({ kind: "text", text: reply.slice(cursor) });
  }

  return parts;
}

async function runTag(
  { tag, payload }: TagMatch,
  handlers: ActionHandlers,
  ctx: { isRepeat: boolean; tasksAdded: number; addTask: () => void },
): Promise<ActionWidget | null> {
  switch (tag) {
    case "ADD_TASK": {
      if (!payload) return null;
      const { text, dueDate } = parseTaskPayload(payload);
      if (!text) return null;
      if (ctx.tasksAdded >= MAX_TASKS_PER_REPLY) {
        return cancelled("Canceled adding task:", text);
      }
      const dueNote = dueDate ? ` — due ${dueDate}` : "";
      const allowed = await handlers.confirm(
        `AI wants to create a new task:\n\n"${text}"${dueNote}\n\nAllow this?`,
        { title: "AI Task Creation", confirmText: "Add Task" },
      );
      if (!allowed) return cancelled("Canceled adding task:", text);
      // Passed positionally only when present, so a caller asserting the
      // one-arg call for an undated task (still the overwhelmingly common
      // case) isn't broken by an always-present `undefined`.
      if (dueDate) await handlers.addTask(text, dueDate);
      else await handlers.addTask(text);
      ctx.addTask();
      return ok(
        "check",
        dueDate ? `Added task (due ${dueDate}):` : "Added task:",
        text,
      );
    }

    case "COMPLETE_TASK": {
      if (!payload) return null;
      const allowed = await handlers.confirm(
        `AI wants to mark this task as done:\n\n"${payload}"\n\nAllow this?`,
        { title: "AI Task Update", confirmText: "Mark Done" },
      );
      if (!allowed) return cancelled("Canceled completing task:", payload);
      const found = await handlers.completeTask(payload);
      return found
        ? ok("check", "Marked task done:", payload)
        : cancelled("Couldn't find that task:", payload);
    }

    case "DELETE_TASK": {
      if (!payload) return null;
      const allowed = await handlers.confirm(
        `AI wants to delete this task:\n\n"${payload}"\n\nAllow this?`,
        { title: "AI Task Deletion", confirmText: "Delete Task", danger: true },
      );
      if (!allowed) return cancelled("Canceled deleting task:", payload);
      const found = await handlers.deleteTask(payload);
      return found
        ? ok("trash", "Deleted task:", payload)
        : cancelled("Couldn't find that task:", payload);
    }

    case "RESCHEDULE_TASK": {
      if (!payload || ctx.isRepeat) {
        return cancelled("Canceled rescheduling task");
      }
      const parsed = parseReschedulePayload(payload);
      if (!parsed) return cancelled("Canceled rescheduling task");
      const { name, date } = parsed;
      const allowed = await handlers.confirm(
        `AI wants to reschedule this task:\n\n"${name}" — new due date ${date}\n\nAllow this?`,
        { title: "AI Task Update", confirmText: "Reschedule" },
      );
      if (!allowed) return cancelled("Canceled rescheduling task:", name);
      const found = await handlers.rescheduleTask(name, date);
      return found
        ? ok("calendar", `Rescheduled to ${date}:`, name)
        : cancelled("Couldn't find that task:", name);
    }

    case "ADD_EXAM": {
      if (!payload) return null;
      const parsed = parseExamPayload(payload);
      if (!parsed) return cancelled("Canceled adding exam");
      const { name, date, difficulty } = parsed;
      const allowed = await handlers.confirm(
        `AI wants to add an exam to your calendar:\n\n"${name}" on ${date} (${difficulty})\n\nAllow this?`,
        { title: "AI Exam Creation", confirmText: "Add Exam" },
      );
      if (!allowed) return cancelled("Canceled adding exam:", name);
      await handlers.addExam(name, date, difficulty);
      return ok("calendar", `Added exam (${date}):`, name);
    }

    case "DELETE_EXAM": {
      if (!payload || ctx.isRepeat) {
        return cancelled("Canceled deleting exam");
      }
      const allowed = await handlers.confirm(
        `AI wants to remove this exam from your calendar:\n\n"${payload}"\n\nAllow this?`,
        { title: "AI Exam Deletion", confirmText: "Delete Exam", danger: true },
      );
      if (!allowed) return cancelled("Canceled deleting exam:", payload);
      const found = await handlers.deleteExam(payload);
      return found
        ? ok("trash", "Deleted exam:", payload)
        : cancelled("Couldn't find that exam:", payload);
    }

    case "START_TIMER": {
      const minutes = Number.parseInt(payload, 10);
      if (ctx.isRepeat || !Number.isFinite(minutes) || minutes <= 0) {
        return cancelled("Canceled focus timer");
      }
      handlers.startTimer(minutes);
      return ok("clock", `Started focus timer for ${minutes}m`);
    }

    case "SET_THEME": {
      const value = payload.toLowerCase();
      if (ctx.isRepeat || !handlers.setTheme(value)) {
        return cancelled("Failed to switch theme");
      }
      return ok("palette", `Switched theme to ${value}`);
    }

    case "NAVIGATE": {
      const view = payload.toLowerCase();
      /* The vanilla rendered nothing when navigation failed, rather than
         telling the student an action was cancelled they never asked for. */
      if (ctx.isRepeat || !handlers.navigate(view)) return null;
      return ok("compass", `Navigated to ${view}`);
    }

    case "GRADE_FLASHCARD": {
      /* The vanilla's own tag-replace pass swapped this block for '' whether
         or not a score button existed to click (js/router.js:1130-1139) — it
         never rendered a confirmation, unlike every other executed tag. That
         behaviour is kept exactly: only the side effect is new. A malformed
         or out-of-range score, or a repeat, simply grades nothing — matching
         "the click target was missing". */
      const score = Number.parseInt(payload, 10);
      if (!ctx.isRepeat && score >= 1 && score <= 4) {
        handlers.gradeFlashcard(score);
      }
      return null;
    }

    case "ADD_QUIZ": {
      if (!payload || ctx.isRepeat) {
        return cancelled("Canceled quiz generation");
      }
      const allowed = await handlers.confirm(
        `AI wants to generate a formal interactive quiz on "${payload}".\n\nAllow this?`,
        { title: "AI Quiz Generation", confirmText: "Generate Quiz" },
      );
      if (!allowed) return cancelled("Canceled quiz generation");
      handlers.generateQuiz(payload);
      return ok("help-circle", "Generating quiz:", payload);
    }

    case "ADD_DECK": {
      if (!payload || ctx.isRepeat) {
        return cancelled("Canceled flashcard generation");
      }
      const allowed = await handlers.confirm(
        `AI wants to generate a flashcard deck on "${payload}".\n\nAllow this?`,
        { title: "AI Flashcard Generation", confirmText: "Generate Deck" },
      );
      if (!allowed) return cancelled("Canceled flashcard generation");
      handlers.generateDeck(payload);
      return ok("layers", "Generating flashcards:", payload);
    }

    case "ADD_PLAN": {
      if (ctx.isRepeat) return cancelled("Canceled plan generation");
      const allowed = await handlers.confirm(
        "AI wants to generate a weekly study schedule.\n\nAllow this?",
        {
          title: "AI Plan Generation",
          confirmText: "Generate Plan",
          danger: true,
        },
      );
      if (!allowed) return cancelled("Canceled plan generation");
      handlers.generatePlan();
      return ok("calendar", "Generating your weekly study plan");
    }

    /* Never taught in chatPrompt.ts's CAPABILITIES — only notesChatPrompt.ts
       teaches it, and NotesAiSidebar.tsx has its own tiny extraction step
       for it rather than going through executeActions at all (see that
       file's comment on why: it writes into a live Quill instance, not an
       API call). This case exists purely so the ActionTag switch stays
       exhaustive and a stray tag reaching the general workspace chat is
       inert instead of a TypeScript error. */
    case "INSERT_INTO_NOTE":
      return null;
  }
}

/** Vanilla hash routes → React paths, for `<NAVIGATE>`. Returns null for
 *  anything the app has no route for, so an invented destination is ignored
 *  rather than pushing the student onto the not-found page. */
export function pathForNavigateTarget(view: string): string | null {
  const routes: Record<string, string> = {
    dashboard: "/",
    home: "/",
    todo: "/tasks",
    tasks: "/tasks",
    exams: "/exams",
    timer: "/timer",
    library: "/library",
    folders: "/library",
    materials: "/library/materials",
    flashcards: "/library/flashcards",
    quizzes: "/library/quizzes",
    plan: "/plan",
    settings: "/settings",
  };
  return routes[view] ?? null;
}
