import type { Folder, StudySession } from "../api/types";
import type { PlanDay } from "./aiJson";
import { parseLocalDate } from "./date";

/* "Did last week's plan actually happen?" — feeds two things: the Plan
 * view's "last week" summary card, and the note api/aiPlan.ts folds into
 * the prompt when generating the *next* week, so a plan that got ignored
 * doesn't just get silently regenerated the same way again.
 *
 * Lives beside planShape.ts for the same reason: api/aiPlan.ts needs this
 * too, so it can't live under views/plan/. */

/** planShape.ts's fallback for a block with no duration — duplicated rather
 *  than imported, matching analytics.ts's precedent for `safeColor`: a
 *  one-line constant is cheaper to repeat than to wire up a shared import
 *  for. */
const DEFAULT_BLOCK_MINUTES = 25;

export interface SubjectAdherence {
  subject: string;
  plannedMins: number;
  actualMins: number;
}

export interface WeekAdherence {
  plannedTotal: number;
  actualTotal: number;
  /** Total minutes actually logged that week against total minutes planned
   *  that week, capped at 100 — a volume check ("did roughly this much
   *  studying happen"), not a per-subject accuracy check. Per-subject detail
   *  is `bySubject`/`neglectedSubjects` instead. */
  completionPct: number;
  bySubject: SubjectAdherence[];
  neglectedSubjects: string[];
}

function totalPlannedMinutes(days: PlanDay[]): number {
  let total = 0;
  for (const day of days) {
    for (const block of day.blocks ?? []) {
      total += block.durationMins ?? DEFAULT_BLOCK_MINUTES;
    }
  }
  return total;
}

/* Exact case-insensitive match only, not substring. A plan block's subject
 * is free text the model chose ("Chem Ch.4 review"), so a substring match
 * against folder names would produce plenty of false positives — and a
 * false "you skipped Chemistry" is worse than missing a real match the
 * looser rule would have caught. Silence (no match) is the safer failure. */
function findFolderId(subject: string, folders: Folder[]): string | null {
  const normalized = subject.trim().toLowerCase();
  return (
    folders.find((f) => f.name.trim().toLowerCase() === normalized)?.id ?? null
  );
}

function inWeek(session: StudySession, weekStartISO: string): boolean {
  const start = parseLocalDate(weekStartISO);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const started = new Date(session.started_at);
  return started >= start && started < end;
}

/** `sessions` is not expected pre-filtered — pass whatever range you have
 *  (e.g. `useSessionsSince(14)`) and this narrows to the given week itself,
 *  the same "give it the broad list, it finds today" shape `computeStreak`
 *  and friends already use in views/dashboard/analytics.ts. */
export function computeWeekAdherence(
  days: PlanDay[],
  sessions: StudySession[],
  folders: Folder[],
  weekStartISO: string,
): WeekAdherence {
  const weekSessions = sessions.filter((s) => inWeek(s, weekStartISO));

  const plannedBySubject = new Map<string, number>();
  for (const day of days) {
    for (const block of day.blocks ?? []) {
      const mins = block.durationMins ?? DEFAULT_BLOCK_MINUTES;
      plannedBySubject.set(
        block.subject,
        (plannedBySubject.get(block.subject) ?? 0) + mins,
      );
    }
  }

  const actualByFolder = new Map<string, number>();
  for (const session of weekSessions) {
    if (!session.folder_id) continue;
    actualByFolder.set(
      session.folder_id,
      (actualByFolder.get(session.folder_id) ?? 0) + (session.minutes || 0),
    );
  }

  const bySubject: SubjectAdherence[] = [];
  const neglectedSubjects: string[] = [];
  for (const [subject, plannedMins] of plannedBySubject) {
    const folderId = findFolderId(subject, folders);
    const actualMins = folderId ? (actualByFolder.get(folderId) ?? 0) : 0;
    bySubject.push({ subject, plannedMins, actualMins });
    // 20m floor keeps a token filler block ("light review", 5m) from
    // reading as "neglected" — there's nothing meaningful to neglect there.
    if (plannedMins >= 20 && actualMins < plannedMins / 3) {
      neglectedSubjects.push(subject);
    }
  }
  bySubject.sort((a, b) => b.plannedMins - a.plannedMins);

  const plannedTotal = totalPlannedMinutes(days);
  const actualTotal = weekSessions.reduce(
    (sum, s) => sum + (s.minutes || 0),
    0,
  );
  const completionPct =
    plannedTotal > 0
      ? Math.round(Math.min(1, actualTotal / plannedTotal) * 100)
      : 0;

  return {
    plannedTotal,
    actualTotal,
    completionPct,
    bySubject,
    neglectedSubjects,
  };
}

/** The one-line note folded into next week's generation prompt
 *  (api/aiPlan.ts's `buildPlanPrompt`). */
export function formatAdherenceNote(adherence: WeekAdherence): string {
  if (adherence.plannedTotal === 0) return "None";
  const neglected = adherence.neglectedSubjects;
  const neglectedNote =
    neglected.length > 0
      ? ` Under-studied relative to plan: ${neglected.join(", ")}.`
      : "";
  return `Followed about ${adherence.completionPct}% of last week's planned study time.${neglectedNote}`;
}
