/* Putting the work into the gaps.
 *
 * `availability.ts` says when the student is free and how good each stretch is.
 * This decides what goes where — the step a capable, unstructured student
 * never does, and the reason their week collapses into the night before.
 *
 * Three rules, in order:
 *
 *  1. **Deadlines are hard.** Work due Thursday is never placed on Friday. If
 *     it does not fit, it comes back as `unplaced` with a reason, because
 *     "there is four hours of work and two hours of week left" is the single
 *     most useful thing we can tell someone, and quietly moving the deadline
 *     is the one thing a planner must never do.
 *  2. **Hard work gets good hours.** A demand's `load` decides whether it wants
 *     a high-energy window. New material takes the peak; flashcards are happy
 *     in the tired half-hour after training, and putting them there frees the
 *     peak for something that needs it.
 *  3. **Sooner beats better.** A slightly better window tomorrow loses to a
 *     good-enough window today, more strongly the more urgent the work is.
 *
 * The scheduler is deterministic and pure: same inputs, same plan. That is what
 * lets the timeline recompute on every render without the day reshuffling
 * itself under the student, which would destroy the one thing this feature is
 * selling — the sense that the day is decided and they can stop deciding. */

import type { FreeWindow } from "./availability";
import { parseLocalDate } from "./date";

export type DemandKind = "review" | "task" | "exam" | "subject";

/** 1 = mechanical (flashcards, re-reading), 2 = ordinary practice,
 *  3 = genuinely hard (new material, past papers, essay planning). */
export type CognitiveLoad = 1 | 2 | 3;

export interface StudyDemand {
  id: string;
  label: string;
  kind: DemandKind;
  /** Minutes this is worth. Rough is fine; it only has to be honest. */
  estMins: number;
  load: CognitiveLoad;
  /** Hard deadline. Nothing is ever scheduled after it. */
  dueDate?: string | null;
  subject?: string | null;
  folderId?: string | null;
  /** Where clicking the block should take the student. */
  href?: string;
  /** Nudges an item up the queue independently of its deadline. */
  boost?: number;
}

export interface ScheduledBlock {
  id: string;
  demandId: string;
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  kind: DemandKind;
  load: CognitiveLoad;
  subject: string | null;
  folderId: string | null;
  href?: string;
  /** Energy of the window this landed in, 0-1. Drives the "prime focus" tag. */
  energy: number;
  /** Set only when a demand had to be split across windows. */
  part?: { index: number; total: number };
}

export type UnplacedReason = "no-room-before-due" | "week-is-full";

export interface UnplacedDemand {
  demand: StudyDemand;
  /** Minutes we could not find a home for. */
  remainingMins: number;
  reason: UnplacedReason;
}

export interface Schedule {
  blocks: ScheduledBlock[];
  unplaced: UnplacedDemand[];
}

export interface ScheduleOptions {
  /** Longest single sitting. Anything longer is split with a break between. */
  maxBlockMins: number;
  /** Shortest chunk worth placing. */
  minBlockMins: number;
  /** Dead time left after a block so the next one does not start cold. */
  breakMins: number;
  /** Today, so "overdue" and "due today" can be told apart. */
  today: string;
}

/** How loudly this demand is asking to be done first, 0-100ish.
 *
 * Overdue outranks everything. After that it is a decay on days-until-due, with
 * exams pulled forward because exam work done the day before is worth a
 * fraction of the same work done a week out, and reviews held high because
 * memory decays on its own schedule and a skipped review costs more later than
 * it saves today. */
export function urgencyScore(demand: StudyDemand, today: string): number {
  const base = demand.kind === "exam" ? 22 : demand.kind === "review" ? 30 : 12;

  if (!demand.dueDate) return base + (demand.boost ?? 0);

  const days = Math.round(
    (parseLocalDate(demand.dueDate).getTime() -
      parseLocalDate(today).getTime()) /
      86400000,
  );
  if (days < 0) return 120 + base + (demand.boost ?? 0);

  /* 100 at due-today, ~55 a week out, ~30 a month out. Chosen so a
     due-tomorrow task beats a due-next-week exam, but an exam three days out
     beats a task three weeks out. */
  const proximity = 100 / (1 + days * 0.7);
  return proximity + base + (demand.boost ?? 0);
}

interface OpenWindow {
  date: string;
  /** Moves right as the window is consumed. */
  cursorMin: number;
  endMin: number;
  energy: number;
  dayOffset: number;
}

/** How much a window suits this demand, ignoring when it is.
 *
 * Load 3 wants the peak. Load 1 actively wants the trough — not because
 * flashcards go better when you are tired, but because putting them there is
 * what keeps the peak free for the work that cannot be done tired. Load 2 is
 * indifferent and lets the day-cost decide. */
function fitScore(load: CognitiveLoad, energy: number): number {
  if (load === 3) return energy;
  if (load === 1) return 0.35 + (1 - energy) * 0.65;
  return 0.6;
}

/* Per-day-of-delay cost, scaled by urgency. At the floor a demand will slide a
   day for a 0.15 better window; at the ceiling essentially nothing moves it. */
function dayCost(urgency: number): number {
  return 0.15 + Math.min(0.35, urgency / 300);
}

function blockId(demandId: string, date: string, startMin: number): string {
  return `${demandId}@${date}T${startMin}`;
}

/** Place demands into windows. Windows are consumed left to right within a day
 *  so the student's timeline reads chronologically, whatever order we chose. */
export function autoSchedule(
  demands: StudyDemand[],
  windows: FreeWindow[],
  options: ScheduleOptions,
): Schedule {
  const { maxBlockMins, minBlockMins, breakMins, today } = options;

  const dates = [...new Set(windows.map((w) => w.date))].sort();
  const open: OpenWindow[] = windows
    .filter((w) => w.endMin - w.startMin >= minBlockMins)
    .map((w) => ({
      date: w.date,
      cursorMin: w.startMin,
      endMin: w.endMin,
      energy: w.energy,
      dayOffset: dates.indexOf(w.date),
    }))
    /* Chronological within each day, so consuming a window left to right also
       fills the day left to right and the timeline reads in clock order. */
    .sort((a, b) =>
      a.date === b.date ? a.cursorMin - b.cursorMin : a.date < b.date ? -1 : 1,
    );

  const queue = [...demands]
    .filter((d) => d.estMins > 0)
    .map((d) => ({ demand: d, urgency: urgencyScore(d, today) }))
    .sort((a, b) => b.urgency - a.urgency);

  const blocks: ScheduledBlock[] = [];
  const unplaced: UnplacedDemand[] = [];

  for (const { demand, urgency } of queue) {
    let remaining = demand.estMins;
    const parts: ScheduledBlock[] = [];

    /* The smallest room a window must have to be worth using for this demand.
       Normally a full block, but a demand *shorter* than a block still has to
       land somewhere — ten minutes of due cards is worth doing, and a version
       of this that only ever asked for `minBlockMins` dropped every such
       demand without placing it or reporting it. */
    const needed = () => Math.min(remaining, minBlockMins);

    const bestWindow = () => {
      let best: OpenWindow | null = null;
      let bestScore = -Infinity;
      for (const w of open) {
        if (w.endMin - w.cursorMin < needed()) continue;
        if (demand.dueDate && w.date > demand.dueDate) continue;
        const score =
          fitScore(demand.load, w.energy) - w.dayOffset * dayCost(urgency);
        if (score > bestScore) {
          bestScore = score;
          best = w;
        }
      }
      return best;
    };

    while (remaining > 0) {
      const best = bestWindow();
      if (!best) break;

      const take = Math.min(
        remaining,
        maxBlockMins,
        best.endMin - best.cursorMin,
      );
      const startMin = best.cursorMin;
      parts.push({
        id: blockId(demand.id, best.date, startMin),
        demandId: demand.id,
        date: best.date,
        startMin,
        endMin: startMin + take,
        label: demand.label,
        kind: demand.kind,
        load: demand.load,
        subject: demand.subject ?? null,
        folderId: demand.folderId ?? null,
        href: demand.href,
        energy: best.energy,
      });

      remaining -= take;
      /* The break is consumed from the window but never rendered as a block —
         a timeline full of "break" rows reads as busywork. The gap speaks for
         itself, and the student can see it. */
      best.cursorMin = startMin + take + breakMins;

      /* A tail shorter than a usable block is grown into the sitting that just
         ended rather than started as a second one: ten leftover minutes of a
         task is not another session, it is five more minutes of this one. */
      if (remaining > 0 && remaining < minBlockMins) {
        const last = parts[parts.length - 1];
        const extra = Math.min(remaining, best.endMin - last.endMin);
        last.endMin += extra;
        remaining -= extra;
        best.cursorMin = last.endMin + breakMins;
        if (remaining > 0) break;
      }
    }

    if (parts.length > 1) {
      parts.forEach((p, i) => {
        p.part = { index: i + 1, total: parts.length };
      });
    }
    blocks.push(...parts);

    /* Reported only when what is left is a real sitting's worth — or, for a
       demand that was always small, all of it. Announcing "4 minutes didn't
       fit" would be technically true and pure noise. */
    if (remaining >= Math.min(demand.estMins, minBlockMins)) {
      unplaced.push({
        demand,
        remainingMins: remaining,
        reason: demand.dueDate ? "no-room-before-due" : "week-is-full",
      });
    }
  }

  blocks.sort((a, b) =>
    a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
  );
  return { blocks, unplaced };
}

/** Blocks for one date, in clock order. */
export function blocksOn(
  blocks: ScheduledBlock[],
  date: string,
): ScheduledBlock[] {
  return blocks.filter((b) => b.date === date);
}

/** Total scheduled minutes on a date. */
export function scheduledMinutes(
  blocks: ScheduledBlock[],
  date?: string,
): number {
  return blocks
    .filter((b) => !date || b.date === date)
    .reduce((sum, b) => sum + (b.endMin - b.startMin), 0);
}
