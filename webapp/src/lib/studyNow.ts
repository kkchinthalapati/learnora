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
 * A note on the rule. The original design called for "the concept the most
 * other topics on the paper depend on". This app has no concept dependency
 * graph — there is no prerequisite edge anywhere in the schema — so that
 * number cannot be computed and must not be invented: a fabricated "4 other
 * topics depend on this" reads as certainty the app has not earned. The
 * ledger's own signal is used instead, and it is arguably the better one:
 * `timesObserved` is how many separate times this misconception has actually
 * resurfaced in this student's work. That is evidence, not inference.
 */

import { misconceptionsForSubject, type Misconception } from "./misconceptions";

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
      const when = new Date(e.exam_date);
      if (Number.isNaN(when.getTime())) return false;
      return daysBetween(now, when) >= 0;
    })
    .sort(
      (a, b) =>
        new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime(),
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

  const [best] = [...open].sort((a, b) => {
    /* Most-repeated first: a belief that has resurfaced four times is costing
       more marks than one seen once, whatever a model rated its severity. */
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
    daysUntilExam: daysBetween(now, new Date(exam.exam_date)),
    timesObserved: best.timesObserved,
    otherOpenOnPaper: open.length - 1,
    estimatedMinutes: STUDY_NOW_MINUTES,
  };
}
