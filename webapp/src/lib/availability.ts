/* From "here is my life" to "here is when you can actually study".
 *
 * Takes the student's `LifeContext` plus any events imported from their real
 * calendar and answers one question per day: which stretches of this day are
 * free, and how good is each one for thinking?
 *
 * Two ideas do most of the work here.
 *
 * **Buffers.** A gap between a lecture ending at 11:00 and a shift starting at
 * 11:30 is not thirty minutes of study, it is a walk. Every busy block is
 * padded before it is subtracted, so the windows that come out are ones a
 * person could really sit down in.
 *
 * **Energy.** Two free hours are not equal. A night owl's 9am and their 9pm are
 * different hours, and the hour after a shift is different again. Every window
 * carries a 0-1 score, and `autoSchedule.ts` spends the best ones on the
 * hardest work. This is the part a student cannot do for themselves — not
 * because it is difficult, but because nobody ever told them it mattered. */

import {
  commitmentMinutes,
  isDrainingKind,
  toMinutes,
  type Chronotype,
  type Commitment,
  type LifeContext,
  type Weekday,
} from "./lifeContext";
import type { IcsEvent } from "./icsImport";
import { localDateStr, parseLocalDate } from "./date";

export type BusySource = "commitment" | "calendar";

export interface BusyBlock {
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  source: BusySource;
  /** True when the hour after this one is likely to be a flat one. */
  draining: boolean;
}

export interface FreeWindow {
  date: string;
  startMin: number;
  endMin: number;
  /** 0-1. How well this student's head is likely to work in this stretch. */
  energy: number;
}

export interface DayAvailability {
  date: string;
  weekday: Weekday;
  busy: BusyBlock[];
  windows: FreeWindow[];
  /** All-day calendar entries — shown as context, never treated as busy. */
  notes: string[];
  /** Minutes we are willing to schedule on this day. */
  capacityMins: number;
  /** Minutes of window actually offered, after the capacity trim. */
  availableMins: number;
  /** Set when the student has claimed the day back entirely. */
  protectedDay: boolean;
}

/* Energy anchors: [minute of day, score]. Linear between anchors, flat outside.
 *
 * These are shaped from the uncontroversial parts of the chronotype research —
 * a post-lunch dip everyone gets, a morning peak that early types keep and
 * late types never have, an evening peak that is real for late types and a
 * losing bet for early ones. They are coarse on purpose: the decision they
 * inform is "morning or evening", and a more precise curve would imply a
 * confidence we do not have. */
const ENERGY_CURVES: Record<Chronotype, [number, number][]> = {
  early: [
    [5 * 60, 0.55],
    [8 * 60, 1.0],
    [11 * 60, 0.95],
    [13 * 60, 0.6],
    [15 * 60, 0.75],
    [18 * 60, 0.5],
    [21 * 60, 0.3],
    [24 * 60, 0.2],
  ],
  neutral: [
    [6 * 60, 0.4],
    [9 * 60, 0.85],
    [11 * 60, 0.95],
    [13 * 60, 0.6],
    [15 * 60, 0.8],
    [18 * 60, 0.85],
    [21 * 60, 0.6],
    [24 * 60, 0.35],
  ],
  night: [
    [6 * 60, 0.25],
    [9 * 60, 0.4],
    [12 * 60, 0.6],
    [15 * 60, 0.7],
    [18 * 60, 0.85],
    [21 * 60, 1.0],
    [23 * 60, 0.9],
    [24 * 60, 0.7],
  ],
};

/** The student's likely focus quality at a given minute of the day, 0-1. */
export function energyAt(chronotype: Chronotype, minute: number): number {
  const curve = ENERGY_CURVES[chronotype] ?? ENERGY_CURVES.neutral;
  if (minute <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i];
    if (minute <= x1) {
      const [x0, y0] = curve[i - 1];
      const t = x1 === x0 ? 0 : (minute - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return curve[curve.length - 1][1];
}

/** Mean energy across a window, sampled every 10 minutes. Sampling rather than
 *  taking the midpoint so a window straddling the post-lunch dip is scored for
 *  the dip it contains instead of the peak it happens to be centred on. */
export function windowEnergy(
  chronotype: Chronotype,
  startMin: number,
  endMin: number,
): number {
  if (endMin <= startMin) return 0;
  let total = 0;
  let samples = 0;
  for (let m = startMin; m < endMin; m += 10) {
    total += energyAt(chronotype, m);
    samples += 1;
  }
  return samples ? total / samples : 0;
}

/** How much this student is willing to study on this date. Weekends get their
 *  own number because "study more at the weekend" and "the weekend is when I
 *  actually get a life" are both real, and only the student knows which. */
export function capacityForDate(ctx: LifeContext, date: string): number {
  const day = parseLocalDate(date).getDay();
  return day === 0 || day === 6
    ? ctx.weekendCapacityMins
    : ctx.weekdayCapacityMins;
}

/** The commitments that apply on a given weekday, as blocks on that date. */
export function commitmentsOn(
  commitments: Commitment[],
  date: string,
  weekday: Weekday,
): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const c of commitments) {
    if (!c.days.includes(weekday)) continue;
    const span = commitmentMinutes(c);
    if (!span) continue;
    out.push({
      date,
      startMin: span.startMin,
      endMin: span.endMin,
      label: c.label.trim() || "Commitment",
      source: "commitment",
      draining: isDrainingKind(c.kind),
    });
  }
  return out;
}

/** Everything standing between this student and a free hour on this date. */
export function busyBlocksForDate(
  ctx: LifeContext,
  date: string,
  calendar: IcsEvent[] = [],
): BusyBlock[] {
  const weekday = parseLocalDate(date).getDay() as Weekday;
  const fromCalendar: BusyBlock[] = calendar
    .filter((e) => e.date === date && !e.allDay && e.endMin > e.startMin)
    .map((e) => ({
      date,
      startMin: e.startMin,
      endMin: e.endMin,
      label: e.label,
      source: "calendar" as const,
      /* We cannot know whether an imported event is a lecture or a shift, and
         guessing from its title would be wrong often and invisibly. Imported
         events are treated as neutral; the student can add the draining ones
         as commitments if the distinction matters to them. */
      draining: false,
    }));

  return [
    ...commitmentsOn(ctx.commitments, date, weekday),
    ...fromCalendar,
  ].sort((a, b) => a.startMin - b.startMin);
}

interface Interval {
  startMin: number;
  endMin: number;
}

/** Pad each block by `buffer` either side and merge what now overlaps. Merging
 *  matters as much as padding: back-to-back lectures would otherwise leave a
 *  phantom 30-minute window made entirely of the two buffers. */
export function mergeBusy(blocks: Interval[], buffer: number): Interval[] {
  const padded = blocks
    .map((b) => ({
      startMin: Math.max(0, b.startMin - buffer),
      endMin: Math.min(24 * 60, b.endMin + buffer),
    }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const merged: Interval[] = [];
  for (const b of padded) {
    const last = merged[merged.length - 1];
    if (last && b.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, b.endMin);
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

/** Subtract busy intervals from the waking day. */
function subtract(
  dayStart: number,
  dayEnd: number,
  busy: Interval[],
): Interval[] {
  const out: Interval[] = [];
  let cursor = dayStart;
  for (const b of busy) {
    if (b.endMin <= cursor) continue;
    if (b.startMin > cursor) {
      out.push({ startMin: cursor, endMin: Math.min(b.startMin, dayEnd) });
    }
    cursor = Math.max(cursor, b.endMin);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) out.push({ startMin: cursor, endMin: dayEnd });
  return out.filter((w) => w.endMin > w.startMin);
}

/* How long a draining commitment keeps costing after it ends, and how much of
   the window's energy it takes. An hour after a closing shift is not a zero —
   it is a fine hour for flashcards and a poor one for new material. */
const RECOVERY_MINS = 60;
const RECOVERY_PENALTY = 0.35;

function recoveryPenalty(busy: BusyBlock[], startMin: number): number {
  const draining = busy.filter((b) => b.draining);
  for (const b of draining) {
    if (startMin >= b.endMin && startMin - b.endMin < RECOVERY_MINS) {
      const closeness = 1 - (startMin - b.endMin) / RECOVERY_MINS;
      return RECOVERY_PENALTY * closeness;
    }
  }
  return 0;
}

/** The whole picture for one date: what is booked, what is left, how good it
 *  is, and how much of it we are prepared to ask for. */
export function dayAvailability(
  ctx: LifeContext,
  date: string,
  calendar: IcsEvent[] = [],
): DayAvailability {
  const weekday = parseLocalDate(date).getDay() as Weekday;
  const busy = busyBlocksForDate(ctx, date, calendar);
  const notes = calendar
    .filter((e) => e.date === date && e.allDay)
    .map((e) => e.label);
  const capacityMins = capacityForDate(ctx, date);
  const protectedDay = ctx.protectedDays.includes(weekday);

  if (protectedDay || capacityMins <= 0) {
    return {
      date,
      weekday,
      busy,
      windows: [],
      notes,
      capacityMins: protectedDay ? 0 : capacityMins,
      availableMins: 0,
      protectedDay,
    };
  }

  const dayStart = toMinutes(ctx.wakeTime) ?? 7 * 60;
  const dayEnd = toMinutes(ctx.sleepTime) ?? 23 * 60;

  const raw = subtract(dayStart, dayEnd, mergeBusy(busy, ctx.bufferMins));
  const scored: FreeWindow[] = raw
    .filter((w) => w.endMin - w.startMin >= ctx.minBlockMins)
    .map((w) => ({
      date,
      startMin: w.startMin,
      endMin: w.endMin,
      energy: Math.max(
        0,
        Math.min(
          1,
          windowEnergy(ctx.chronotype, w.startMin, w.endMin) -
            recoveryPenalty(busy, w.startMin),
        ),
      ),
    }));

  const windows = trimToCapacity(scored, capacityMins, ctx.minBlockMins);

  return {
    date,
    weekday,
    busy,
    windows,
    notes,
    capacityMins,
    availableMins: windows.reduce((sum, w) => sum + (w.endMin - w.startMin), 0),
    protectedDay,
  };
}

/** Spend the day's capacity on its best hours.
 *
 * A student with six free hours and a 150-minute honest limit should be offered
 * their best 150 minutes, not the first 150 the clock happens to produce. So
 * windows are taken in order of energy, and the one that crosses the budget is
 * trimmed — from whichever end is weaker, so a long evening window with a good
 * second half keeps the good half. */
export function trimToCapacity(
  windows: FreeWindow[],
  capacityMins: number,
  minBlockMins: number,
): FreeWindow[] {
  const byEnergy = [...windows].sort((a, b) => b.energy - a.energy);
  const kept: FreeWindow[] = [];
  let budget = capacityMins;

  for (const w of byEnergy) {
    if (budget < minBlockMins) break;
    const length = w.endMin - w.startMin;
    if (length <= budget) {
      kept.push(w);
      budget -= length;
      continue;
    }
    /* Trim from the weaker end. Comparing the two halves rather than assuming
       "keep the front" is what makes this right for a night owl, whose good
       hours are at the back of every window they have. */
    const mid = (w.startMin + w.endMin) / 2;
    const frontIsBetter =
      windowEnergy("neutral", w.startMin, mid) >=
      windowEnergy("neutral", mid, w.endMin);
    kept.push(
      frontIsBetter
        ? { ...w, endMin: w.startMin + budget }
        : { ...w, startMin: w.endMin - budget },
    );
    budget = 0;
  }

  return kept.sort((a, b) => a.startMin - b.startMin);
}

/** `dayAvailability` for each of `days` dates starting at `startDate`. */
export function availabilityRange(
  ctx: LifeContext,
  startDate: string,
  days: number,
  calendar: IcsEvent[] = [],
): DayAvailability[] {
  const out: DayAvailability[] = [];
  const cursor = parseLocalDate(startDate);
  for (let i = 0; i < days; i += 1) {
    out.push(dayAvailability(ctx, localDateStr(cursor), calendar));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
