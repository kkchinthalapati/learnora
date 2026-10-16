/* The adaptive session — Study's one "Start".
 *
 * Instead of asking the student to pick a mode, the session picks each
 * activity for them, in this order when it applies:
 *
 *   1. a quick check     Practice on the focus, which records any wrong
 *                        answer in the misconception ledger;
 *   2. flashcards        Recall, with the cards on the focus first, when
 *                        any are due;
 *   3. teach it back     Teach, on a misconception the ledger holds for the
 *                        focus, preferring one the check just found;
 *   4. exam traps        Practice with a clock, when an exam is close or the
 *                        ledger has something on this focus to trap.
 *
 * Each activity is an ordinary Session in one mode (views/session), so the
 * engines are the existing ones. What is new is only the choice of the next
 * one, and that choice is made when the student gets there, from the ledger
 * as it is then — so what the check found decides the teach-back.
 *
 * Pure on purpose, like `studyNow`: the picking rule is the part worth
 * testing. The small run store at the bottom remembers where a student is
 * in a run on this device. */

import type { Misconception } from "./misconceptions";
import { newSessionHref, type SessionMode } from "./sessionModes";
import {
  daysBetween,
  examDay,
  examSubject,
  nextUpcomingExam,
  type StudyNowExam,
  type StudyNowFolder,
} from "./studyNow";
import { collection } from "./storage";

export type ActivityKind = "check" | "flashcards" | "teach" | "traps";

export const ACTIVITY_ORDER: readonly ActivityKind[] = [
  "check",
  "flashcards",
  "teach",
  "traps",
];

export const ACTIVITY_TITLES: Record<ActivityKind, string> = {
  check: "Quick check",
  flashcards: "Cards",
  teach: "Teach it back",
  traps: "Exam traps",
};

/** Exam traps join the session when an exam is this close, even with
 *  nothing in the ledger yet. */
export const TRAPS_EXAM_WINDOW_DAYS = 28;

/** What the session is about. */
export interface SessionFocus {
  topic: string;
  subject?: string;
  /** Set when the focus came from a ledger row. */
  misconceptionId?: string;
}

/** The nearest exam, as the picker needs it. */
export interface ExamContext {
  name: string;
  subject: string;
  daysUntil: number;
}

export interface Activity {
  kind: ActivityKind;
  mode: SessionMode;
  title: string;
  topic: string;
  misconceptionId?: string;
  preset?: "traps";
  /** One sentence on why this, now. */
  why: string;
}

export interface PickInput {
  focus: SessionFocus;
  /** Unresolved ledger rows, most urgent first (useMisconceptions().ranked). */
  ranked: Misconception[];
  /** Flashcards due now. */
  dueCards: number;
  exam: ExamContext | null;
  /** Activities already done in this run. */
  done: readonly ActivityKind[];
  /** Ledger rows already taught back in this run. */
  taught?: readonly string[];
  /** When the run started: a row seen since then was found by this run. */
  startedAt?: string;
}

const same = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();

/** The nearest upcoming exam and its subject, or null. */
export function examContext(
  exams: StudyNowExam[] | null | undefined,
  folders: StudyNowFolder[] | null | undefined,
  now: Date = new Date(),
): ExamContext | null {
  const exam = nextUpcomingExam(exams, now);
  if (!exam) return null;
  return {
    name: exam.exam_name,
    subject: examSubject(exam, folders),
    daysUntil: daysBetween(now, examDay(exam.exam_date)),
  };
}

/** What a session started now would be about: what the student typed;
 *  otherwise the most urgent ledger row, from the next exam's subject when
 *  it has any; otherwise that exam's subject. Null when there is nothing to
 *  go on — the student is asked instead of handed a made-up topic. */
export function resolveFocus(input: {
  topic?: string;
  ranked: Misconception[];
  exam: ExamContext | null;
}): SessionFocus | null {
  const typed = input.topic?.trim();
  if (typed) return { topic: typed };
  const onPaper = input.exam
    ? input.ranked.find((m) => same(m.subject, input.exam!.subject))
    : undefined;
  const row = onPaper ?? input.ranked[0];
  if (row) {
    return {
      topic: row.concept,
      subject: row.subject || undefined,
      misconceptionId: row.id,
    };
  }
  if (input.exam)
    return { topic: input.exam.subject, subject: input.exam.subject };
  return null;
}

/** Is this ledger row about the session's focus? */
function aboutFocus(m: Misconception, focus: SessionFocus): boolean {
  if (focus.misconceptionId === m.id) return true;
  if (focus.subject) return same(m.subject, focus.subject);
  const topic = focus.topic.toLowerCase();
  const concept = m.concept.trim().toLowerCase();
  const subject = m.subject.trim().toLowerCase();
  return (
    (concept.length > 0 &&
      (topic.includes(concept) || concept.includes(topic))) ||
    (subject.length > 0 && topic.includes(subject))
  );
}

/** A slip (a misread, a sum, the clock) is not a belief, and there is
 *  nothing in it to teach back. */
const isBelief = (m: Misconception) =>
  !m.errorType || m.errorType === "concept";

function foundSince(m: Misconception, startedAt: string | undefined): boolean {
  if (!startedAt) return false;
  /* Compared as times: the server writes "+00:00", this device "Z". */
  return Date.parse(m.lastSeenAt) >= Date.parse(startedAt);
}

/** The ledger row to teach back: one this run found first, then one that
 *  has come back after being corrected, then the ledger's own order. */
export function pickTeachRow(input: PickInput): Misconception | null {
  const taught = new Set(input.taught ?? []);
  const candidates = input.ranked.filter(
    (m) =>
      !taught.has(m.id) &&
      isBelief(m) &&
      (aboutFocus(m, input.focus) || foundSince(m, input.startedAt)),
  );
  const score = (m: Misconception) =>
    (foundSince(m, input.startedAt) ? 2 : 0) + (m.timesObserved > 1 ? 1 : 0);
  /* Array.prototype.sort is stable, so ties keep the ledger's ranking. */
  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function examPhrase(exam: ExamContext): string {
  if (exam.daysUntil === 0) return `Your ${exam.name} exam is today`;
  if (exam.daysUntil === 1) return `Your ${exam.name} exam is tomorrow`;
  return `Your ${exam.name} exam is in ${exam.daysUntil} days`;
}

/** The next activity in a run, or null when the run is over. */
export function pickNextActivity(input: PickInput): Activity | null {
  const { focus, exam } = input;
  const done = new Set(input.done);
  const topic = focus.topic;

  if (!done.has("check")) {
    return {
      kind: "check",
      mode: "practice",
      title: ACTIVITY_TITLES.check,
      topic,
      misconceptionId: focus.misconceptionId,
      /* The exam is named once, on the traps step, which is the part of
         the session it changes. */
      why: `A few problems on ${topic} to see where you stand. Anything you get wrong decides what comes next.`,
    };
  }

  if (!done.has("flashcards") && input.dueCards > 0) {
    return {
      kind: "flashcards",
      mode: "recall",
      title: ACTIVITY_TITLES.flashcards,
      topic,
      why: `${input.dueCards} ${input.dueCards === 1 ? "card is" : "cards are"} due. The ones on ${topic} come first.`,
    };
  }

  if (!done.has("teach")) {
    const row = pickTeachRow(input);
    if (row) {
      const found = foundSince(row, input.startedAt);
      return {
        kind: "teach",
        mode: "teach",
        title: ACTIVITY_TITLES.teach,
        topic: row.concept,
        misconceptionId: row.id,
        why: found
          ? `The check just caught this: ${row.summary || row.concept}. Explaining it to someone new shows what you skipped.`
          : row.timesObserved > 1
            ? `This has come back ${row.timesObserved} times after being corrected. Teaching it is the fastest way through.`
            : `${row.summary || "Your work shows a gap here."} Explaining it to someone new shows what you skipped.`,
      };
    }
  }

  if (!done.has("traps")) {
    const examClose = exam !== null && exam.daysUntil <= TRAPS_EXAM_WINDOW_DAYS;
    const somethingToTrap = input.ranked.some(
      (m) => aboutFocus(m, focus) || foundSince(m, input.startedAt),
    );
    if (examClose || somethingToTrap) {
      return {
        kind: "traps",
        mode: "practice",
        title: ACTIVITY_TITLES.traps,
        topic,
        preset: "traps",
        why: examClose
          ? `${examPhrase(exam!)}. Ten minutes on the clock, against the wrong answers examiners set.`
          : `Ten minutes on the clock, against the wrong answers examiners set around ${topic}.`,
      };
    }
  }

  return null;
}

/** The whole session as it looks from here, for the Start screen. Only a
 *  preview: each step is re-picked when the student reaches it. */
export function planSession(input: Omit<PickInput, "done">): Activity[] {
  const done: ActivityKind[] = [];
  const taught = [...(input.taught ?? [])];
  const plan: Activity[] = [];
  for (let i = 0; i < ACTIVITY_ORDER.length; i++) {
    const next = pickNextActivity({ ...input, done, taught });
    if (!next) break;
    plan.push(next);
    done.push(next.kind);
    if (next.kind === "teach" && next.misconceptionId)
      taught.push(next.misconceptionId);
  }
  return plan;
}

/** The Session that runs one activity, tagged with its run. */
export function activityHref(activity: Activity, runId: string): string {
  return newSessionHref(activity.mode, {
    topic: activity.topic,
    misconception: activity.misconceptionId,
    preset: activity.preset,
    run: runId,
  });
}

/* ------------------------------------------------------------ run store */

/** Where a student is in one adaptive session, on this device. */
export interface SessionRun {
  id: string;
  focus: SessionFocus;
  startedAt: string;
  done: ActivityKind[];
  taught: string[];
  /** The activity in progress, and the Session running it once it exists. */
  current: (Activity & { sessionId?: string }) | null;
  finishedAt?: string;
}

const runs = collection<SessionRun>("learnora_session_runs", (r) => r.id, {
  limit: 10,
});

export function startRun(focus: SessionFocus, first: Activity): SessionRun {
  const rand = Math.random().toString(36).slice(2, 8);
  const run: SessionRun = {
    id: `r-${Date.now().toString(36)}-${rand}`,
    focus,
    startedAt: new Date().toISOString(),
    done: [],
    taught: [],
    current: first,
  };
  runs.save(run);
  return run;
}

export function loadRun(id: string): SessionRun | null {
  return runs.find(id);
}

export function saveRun(run: SessionRun): void {
  runs.save(run);
}

/** Mark the current activity done and move on to `next` (null ends it). */
export function advanceRun(run: SessionRun, next: Activity | null): SessionRun {
  const current = run.current;
  const advanced: SessionRun = {
    ...run,
    done: current ? [...run.done, current.kind] : run.done,
    taught:
      current?.kind === "teach" && current.misconceptionId
        ? [...run.taught, current.misconceptionId]
        : run.taught,
    current: next,
    finishedAt: next ? undefined : new Date().toISOString(),
  };
  runs.save(advanced);
  return advanced;
}
