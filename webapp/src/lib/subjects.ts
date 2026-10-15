import type { Exam, Folder, Material } from "../api/types";
import type { PlanBlock, WeeklyPlanJson } from "./aiJson";
import { matchExamFolder } from "./examReadiness";
import { daysUntil } from "./quizForecast";
import type { LessonProgress } from "./lessons";
import type { ScheduledBlock } from "./autoSchedule";
import { formatClock } from "./lifeContext";

/* A subject is a folder (webapp/DESIGN.md 0.1) and gathers its lessons, its
 * exams and its share of the week plan. The plan and older exams name a
 * subject in free text, so both are matched the way matchExamFolder already
 * matches exams: an explicit folder id first, then the name, exact or
 * contained either way ("Chemistry Paper 1" ↔ "Chemistry"). Pure, so the
 * Subjects page and a subject's page can't disagree. */

export function subjectNameMatches(text: string, subjectName: string): boolean {
  const a = text.toLowerCase().trim();
  const b = subjectName.toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export interface DatedBlock {
  date: string;
  block: PlanBlock;
  /** Set on blocks from the computed schedule, which knows the subject's id. */
  folderId?: string | null;
}

/** This week's blocks from `today` on, optionally for one subject, in order. */
export function upcomingBlocks(
  plan: WeeklyPlanJson | null | undefined,
  today: string,
  subjectName?: string,
): DatedBlock[] {
  if (!plan) return [];
  const out: DatedBlock[] = [];
  for (const day of [...plan.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < today) continue;
    for (const block of day.blocks ?? []) {
      if (subjectName && !subjectNameMatches(block.subject, subjectName)) continue;
      out.push({ date: day.date, block });
    }
  }
  return out;
}

/** The computed week (free time, tasks and exams — what the Plan page shows
 *  when no AI plan has been made) in the same shape as a stored plan. */
export function blocksFromSchedule(blocks: ScheduledBlock[], today: string): DatedBlock[] {
  return blocks
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)
    .map((b) => ({
      date: b.date,
      folderId: b.folderId,
      block: {
        subject: b.subject ?? b.label,
        durationMins: b.endMin - b.startMin,
        startHint: formatClock(b.startMin),
        reason: b.label,
      },
    }));
}

/** A subject's share of the week: by its id when the block knows it, else
 *  by name. */
export function blocksForSubject(blocks: DatedBlock[], folder: Pick<Folder, "id" | "name">): DatedBlock[] {
  return blocks.filter((b) =>
    b.folderId ? b.folderId === folder.id : subjectNameMatches(b.block.subject, folder.name),
  );
}

/** Upcoming exams that belong to `folder`, soonest first. */
export function examsForSubject(
  exams: Exam[] | null | undefined,
  folder: Folder,
  folders: Folder[],
  today: string,
): Exam[] {
  return (exams ?? [])
    .filter((e) => e.exam_date >= today && matchExamFolder(e, folders)?.id === folder.id)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
}

/** "in 6 days" / "tomorrow" / "today". */
export function examWhen(exam: Pick<Exam, "exam_date">, today: string): string {
  const days = daysUntil(exam.exam_date, today);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "Biology Paper 2 in 6 days" / "… is today" / "… tomorrow". */
export function examCountdown(exam: Pick<Exam, "exam_name" | "exam_date">, today: string): string {
  const when = examWhen(exam, today);
  return `${exam.exam_name} ${when === "today" ? "is today" : when}`;
}

/** Cards practised across every lesson in a subject. */
export function subjectProgress(
  lessons: Pick<Material, "id">[],
  progress: Map<string, LessonProgress>,
): LessonProgress {
  return lessons.reduce(
    (sum, m) => {
      const p = progress.get(m.id);
      return p ? { total: sum.total + p.total, practised: sum.practised + p.practised } : sum;
    },
    { total: 0, practised: 0 },
  );
}

/** Minutes, said plainly: "45 min", "1 hr 30 min". */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
