/**
 * "Study this now" — the one thing worth doing before the next exam.
 *
 * Six screens in this app ask the student to choose a subject, a topic, a
 * persona, an intensity. None of them answer the question they actually
 * arrived with: what should I do right now. The app already holds every input
 * needed to answer it — exam dates, and a ledger of what this student
 * currently believes that is wrong — and still makes them assemble it.
 *
 * Pure on purpose, like `examReadiness` and `misconceptions`: the selection
 * rule is the part worth testing, and it should be testable without a
 * database double.
 *
 * The rule, as specified: of the concepts the nearest exam depends on, take
 * those still open; choose the one with the most dependents; break ties by
 * how often it has resurfaced (the ledger's evidence that it is weak), then
 * severity, then age.
 *
 * "Dependents" come from the student's own Debugger traces. Each trace is a
 * chain — root prerequisite at level 1, the surface mistake at the top — and
 * every layer above another sits on top of it. That is a real prerequisite
 * edge, observed in this student's work, not inferred from a syllabus.
 * Stand-in traces are excluded for the same reason the ledger refuses them:
 * a template is not evidence of anything the student believes. Traces are
 * stored per device, so on a device with none the rule falls through to the
 * evidence tie-breaks rather than inventing a count.
 */

import {
  conceptKey,
  misconceptionsForSubject,
  type Misconception,
} from "./misconceptions";

/** Minimum shape needed from an exam row. */
export interface StudyNowExam {
  exam_name: string;
  exam_date: string;
  folder_id?: string | null;
}

/** Minimum shape needed from a subject folder. */
export interface StudyNowFolder {
  id: string;
  name: string;
}

/** Minimum shape needed from a saved Debugger trace. */
export interface StudyNowTrace {
  subject: string;
  layers: { level: number; concept: string }[];
  degraded?: unknown;
}

/**
 * For each concept, the set of other concepts that sit on top of it in any of
 * this subject's traces. Keyed by conceptKey so "Chain rule" and "the chain
 * rule" are one node, matching how the ledger dedupes.
 */
export function dependentsBySubject(
  traces: StudyNowTrace[] | null | undefined,
  subject: string,
): Map<string, Set<string>> {
  const target = subject.trim().toLowerCase();
  const graph = new Map<string, Set<string>>();

  for (const trace of traces ?? []) {
    if (trace.degraded) continue;
    if ((trace.subject ?? "").trim().toLowerCase() !== target) continue;

    const layers = (trace.layers ?? [])
      .filter((l) => l.concept && l.concept.trim())
      .map((l) => ({ level: l.level, key: conceptKey(l.concept) }));

    for (const below of layers) {
      for (const above of layers) {
        if (above.level <= below.level || above.key === below.key) continue;
        let set = graph.get(below.key);
        if (!set) graph.set(below.key, (set = new Set()));
        set.add(above.key);
      }
    }
  }
  return graph;
}

export interface StudyNowPick {
  /** The ledger row this recommendation is about. */
  misconceptionId: string;
  /** Human-readable concept name, shown as the card's heading. */
  concept: string;
  /** What this student currently believes that is wrong. */
  summary: string;
  subject: string;
  examName: string;
  /** Whole days from today to the exam. 0 means the exam is today. */
  daysUntilExam: number;
  /** How many separate times this has resurfaced in their work. */
  timesObserved: number;
  /** Other still-open concepts on the same paper. */
  otherOpenOnPaper: number;
  /** Distinct concepts on this paper that sit on top of this one, from the
   *  student's own traces. 0 when no trace links it to anything. */
  dependents: number;
  estimatedMinutes: number;
}

/** A short, honest revision slot. Long enough to be worth opening, short
 *  enough that a student the night before an exam will actually start. */
export const STUDY_NOW_MINUTES = 15;

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  moderate: 1,
  minor: 2,
};

/** Midnight-to-midnight day difference, so "tomorrow" does not become 0 days
 *  because the exam is at 9am and it is currently 6pm. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** An exam's day as a local date. `exam_date` is a plain YYYY-MM-DD, and a
 *  bare `new Date("2026-09-30")` is UTC midnight — the evening before
 *  anywhere west of Greenwich. `daysBetween` reads local fields, so on exam
 *  day a student in the Americas had their exam counted as already past
 *  (dropped from "Study this next") and every countdown was a day short. */
export function examDay(examDate: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(examDate)
    ? new Date(`${examDate}T00:00:00`)
    : new Date(examDate);
}

/**
 * The exam that is soonest and has not happened yet. An exam dated today
 * still counts — that is the most urgent case there is, not an expired one.
 */
export function nextUpcomingExam<T extends StudyNowExam>(
  exams: T[] | null | undefined,
  now: Date = new Date(),
): T | null {
  if (!exams || exams.length === 0) return null;

  const upcoming = exams
    .filter((e) => {
      const when = examDay(e.exam_date);
      if (Number.isNaN(when.getTime())) return false;
      return daysBetween(now, when) >= 0;
    })
    .sort(
      (a, b) =>
        examDay(a.exam_date).getTime() - examDay(b.exam_date).getTime(),
    );

  return upcoming[0] ?? null;
}

/**
 * Which subject an exam is about.
 *
 * Same rule as matchExamFolder() in examReadiness, kept local so this module
 * stays free of that file's Supabase-shaped types: an exam that names its
 * subject outright wins, because a guess must never overrule what the student
 * actually chose. Otherwise fall back to the name heuristic, which is what
 * turns an exam called "Physics Paper 1" into the subject "Physics" — without
 * it, nothing in the ledger would ever match a realistically named exam.
 */
export function examSubject(
  exam: StudyNowExam,
  folders: StudyNowFolder[] | null | undefined,
): string {
  const all = folders ?? [];

  if (exam.folder_id) {
    const chosen = all.find((f) => f.id === exam.folder_id);
    if (chosen) return chosen.name;
  }

  const name = exam.exam_name.toLowerCase().trim();
  const matched = all.find((f) => {
    const folderName = f.name.toLowerCase().trim();
    return (
      folderName === name ||
      name.includes(folderName) ||
      folderName.includes(name)
    );
  });
  if (matched) return matched.name;

  return exam.exam_name;
}

/**
 * Pick the one concept to put in front of the student, or null.
 *
 * Returns null rather than a filler recommendation when there is no upcoming
 * exam, or when the ledger holds nothing open for that exam's subject. An
 * empty card is worse than no card: it teaches the student that the block is
 * decoration.
 */
export function pickStudyNow(input: {
  exams: StudyNowExam[] | null | undefined;
  folders: StudyNowFolder[] | null | undefined;
  misconceptions: Misconception[] | null | undefined;
  traces?: StudyNowTrace[] | null;
  now?: Date;
}): StudyNowPick | null {
  const now = input.now ?? new Date();

  const exam = nextUpcomingExam(input.exams, now);
  if (!exam) return null;

  const subject = examSubject(exam, input.folders);

  const all = input.misconceptions ?? [];
  const open = misconceptionsForSubject(all, subject, now).filter(
    (m) => m.status !== "resolved",
  );
  if (open.length === 0) return null;

  const graph = dependentsBySubject(input.traces, subject);
  /* Recomputed from the name rather than read from the row: a stored key was
     written by whatever version of conceptKey() was current at the time, and
     the graph is keyed by today's. Both sides must use the same function. */
  const dependentsOf = (m: Misconception) =>
    graph.get(conceptKey(m.concept))?.size ?? 0;

  const [best] = [...open].sort((a, b) => {
    /* Most dependents first: fixing a root that three other topics sit on
       moves more marks than fixing a leaf. */
    const deps = dependentsOf(b) - dependentsOf(a);
    if (deps !== 0) return deps;
    /* Then most-repeated: a belief that has resurfaced four times is weaker
       than one seen once, whatever a model rated its severity. */
    if (b.timesObserved !== a.timesObserved) {
      return b.timesObserved - a.timesObserved;
    }
    const sev =
      (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (sev !== 0) return sev;
    /* Oldest unresolved last resort, so the pick is stable across renders
       rather than flipping between two equal rows. */
    return (
      new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime()
    );
  });

  return {
    misconceptionId: best.id,
    concept: best.concept,
    summary: best.summary,
    subject,
    examName: exam.exam_name,
    daysUntilExam: daysBetween(now, examDay(exam.exam_date)),
    timesObserved: best.timesObserved,
    otherOpenOnPaper: open.length - 1,
    dependents: dependentsOf(best),
    estimatedMinutes: STUDY_NOW_MINUTES,
  };
}
