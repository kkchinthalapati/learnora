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

export interface ActionHandlers {
  /** Returns true when the student allows the action. */
  confirm: (
    message: string,
    options: { title: string; confirmText: string; danger?: boolean },
  ) => Promise<boolean>;
  addTask: (text: string) => Promise<void>;
  /** Applies and starts a countdown of `minutes`. */
  startTimer: (minutes: number) => void;
  /** Returns false when the value names no theme the app has. */
  setTheme: (value: string) => boolean;
  /** Returns false when the value names no route the app has. */
  navigate: (view: string) => boolean;
  /** Fire-and-forget: the chat must not block on a 30-second generation. */
  generateQuiz: (topic: string) => void;
  generatePlan: () => void;
}

interface TagMatch {
  tag: ActionTag;
  payload: string;
  start: number;
  end: number;
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
     here instead, which is what actually happened. */
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
    if (match.tag !== "ADD_TASK") done.add(match.tag);
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
      if (ctx.tasksAdded >= MAX_TASKS_PER_REPLY) {
        return cancelled("Canceled adding task:", payload);
      }
      const allowed = await handlers.confirm(
        `AI wants to create a new task:\n\n"${payload}"\n\nAllow this?`,
        { title: "AI Task Creation", confirmText: "Add Task" },
      );
      if (!allowed) return cancelled("Canceled adding task:", payload);
      await handlers.addTask(payload);
      ctx.addTask();
      return ok("check", "Added task:", payload);
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
      /* Parsed so the tag never survives into the visible reply, but not
         executed: the vanilla clicked the review screen's score buttons, and
         there is no React flashcard review until ledger step 18. Rendering
         nothing matches the vanilla's own behaviour when the click target was
         missing. */
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
