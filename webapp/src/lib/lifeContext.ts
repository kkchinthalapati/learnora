/* The student's *life*, as far as the planner needs to know it.
 *
 * Everything else in Learnora models the studying — materials, decks, plans,
 * sessions. None of it knows when this person is actually free. So the weekly
 * plan has always been a wish ("do 90 minutes of Chemistry on Tuesday") rather
 * than a schedule, and a student with a 9am lecture, a Thursday shift and
 * football on Saturday has to do the placement themselves. That placement is
 * exactly the work the people we are building for don't know how to do.
 *
 * This module is the one place that answers "when is this person's life?" —
 * sleep window, recurring commitments, how much they will realistically study
 * on a given day, and when their head works best. `availability.ts` turns that
 * into free windows; `autoSchedule.ts` fills the windows in.
 *
 * Stored in localStorage alongside `learnora_settings` and the dashboard
 * layout, for the same reason those are: it is a preference, it must be
 * readable synchronously on first paint, and a student's timetable is not
 * worth a round-trip before the dashboard can render.
 *
 * Times are minutes-from-local-midnight everywhere inside the engine and
 * "HH:MM" strings only at the storage and UI boundary. Minutes compare and
 * subtract; "09:05" does neither, and most bugs in scheduling code come from
 * someone comparing clock strings. */

import { Storage } from "./storage";

export const LIFE_CONTEXT_KEY = "learnora_life_context_v1";

/** 0 = Sunday, matching `Date.prototype.getDay()`. Deliberately *not* the
 *  Monday-first ordering `date.ts`'s `mondayOfWeek` uses — these index a JS
 *  date directly, and a second convention here would be a silent off-by-one. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Monday-first order for display. The values are still `getDay()` indices. */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export type CommitmentKind =
  "class" | "work" | "sport" | "social" | "commute" | "other";

export const COMMITMENT_KINDS: {
  value: CommitmentKind;
  label: string;
  /* Whether the hour *after* this ends is usually a poor study hour. A lecture
     leaves you primed; a shift or a match leaves you flat. `availability.ts`
     discounts the recovery window rather than blocking it — a tired hour is
     still worth flashcards, just not worth new material. */
  draining: boolean;
}[] = [
  { value: "class", label: "Class or lecture", draining: false },
  { value: "work", label: "Work or shift", draining: true },
  { value: "sport", label: "Sport or training", draining: true },
  { value: "social", label: "Family or social", draining: false },
  { value: "commute", label: "Commute", draining: true },
  { value: "other", label: "Other", draining: false },
];

export function commitmentKindLabel(kind: CommitmentKind): string {
  return COMMITMENT_KINDS.find((k) => k.value === kind)?.label ?? "Other";
}

export function isDrainingKind(kind: CommitmentKind): boolean {
  return COMMITMENT_KINDS.find((k) => k.value === kind)?.draining ?? false;
}

export interface Commitment {
  id: string;
  label: string;
  kind: CommitmentKind;
  /** Days of the week this repeats on. Empty means it never applies. */
  days: Weekday[];
  /** "HH:MM" local. */
  start: string;
  /** "HH:MM" local. */
  end: string;
}

/** How a student's usable attention moves across a day. The three curves are
 *  deliberately coarse: we are choosing between "put the hard thing at 9am or
 *  at 9pm", not modelling circadian science. */
export type Chronotype = "early" | "neutral" | "night";

export const CHRONOTYPES: {
  value: Chronotype;
  label: string;
  hint: string;
}[] = [
  {
    value: "early",
    label: "Morning person",
    hint: "Sharpest before noon, fading after dinner",
  },
  {
    value: "neutral",
    label: "Steady all day",
    hint: "A dip after lunch, otherwise even",
  },
  {
    value: "night",
    label: "Night owl",
    hint: "Slow to start, best work happens late",
  },
];

export interface LifeContext {
  version: 1;
  /** Nothing is ever scheduled outside [wakeTime, sleepTime]. */
  wakeTime: string;
  sleepTime: string;
  chronotype: Chronotype;
  /** The honest ceiling on study minutes for a day of each kind. A schedule
   *  that ignores this is the schedule students abandon on day three. */
  weekdayCapacityMins: number;
  weekendCapacityMins: number;
  /** Below this a gap is breathing room, not a study block. */
  minBlockMins: number;
  /** Above this we split and insert a break — nobody holds three hours. */
  maxBlockMins: number;
  breakMins: number;
  /** Kept clear either side of every commitment: travel, changing, settling. */
  bufferMins: number;
  commitments: Commitment[];
  /** Days the student has claimed back. Nothing is scheduled on them. */
  protectedDays: Weekday[];
  /** Raw ICS text of an imported calendar, and where it came from. Kept so a
   *  reload rebuilds the same schedule without re-reading someone's calendar,
   *  and so the import is visibly revocable — it is their private data and it
   *  never leaves the device. */
  importedIcs?: string | null;
  importedLabel?: string | null;
  importedAt?: string | null;
}

export const DEFAULT_LIFE_CONTEXT: LifeContext = {
  version: 1,
  wakeTime: "07:30",
  sleepTime: "23:00",
  chronotype: "neutral",
  weekdayCapacityMins: 150,
  weekendCapacityMins: 210,
  minBlockMins: 25,
  maxBlockMins: 55,
  breakMins: 10,
  bufferMins: 15,
  commitments: [],
  protectedDays: [],
  importedIcs: null,
  importedLabel: null,
  importedAt: null,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:30" → 570. Returns `null` for anything that is not a real 24-hour time
 *  so callers decide whether to skip the entry or fall back; an invalid time
 *  silently coerced to 0 would schedule study at midnight. */
export function toMinutes(time: string): number | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 570 → "09:30", clamped to the day. */
export function fromMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The way a student reads a clock, in their own locale — "9:30 am" in some
 *  places, "09:30" in others. Built from a fixed date so the formatter can
 *  never pick up today's DST offset and shift the label by an hour. */
export function formatClock(mins: number): string {
  const d = new Date(2000, 0, 1, 0, 0, 0);
  d.setMinutes(Math.max(0, Math.round(mins)));
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "1h 20m", "45m", "2h" — durations as spoken, not as decimals. */
export function formatDuration(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** A commitment's span, or `null` if it cannot be honoured (bad times, or an
 *  end that does not come after its start).
 *
 *  Overnight spans are out of scope on purpose: a block wrapping midnight
 *  breaks the one-array-per-date shape the whole engine relies on, and the
 *  honest fix is for the student to enter a night shift as two commitments. */
export function commitmentMinutes(
  c: Commitment,
): { startMin: number; endMin: number } | null {
  const startMin = toMinutes(c.start);
  const endMin = toMinutes(c.end);
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

export function createCommitment(patch: Partial<Commitment> = {}): Commitment {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    kind: "class",
    days: [],
    start: "09:00",
    end: "10:00",
    ...patch,
  };
}

/** True once the student has told us something real about their week. Drives
 *  the choice between the setup invitation and the live timeline — an empty
 *  context would otherwise render a plausible-looking but fictional day. */
export function isLifeContextConfigured(ctx: LifeContext): boolean {
  return ctx.commitments.length > 0 || Boolean(ctx.importedIcs);
}

/** Merge a stored — possibly older, possibly hand-edited — object onto the
 *  defaults. `Storage.get` never throws but it also never validates, and a
 *  missing `commitments` array would take the dashboard down on first render. */
export function normalizeLifeContext(raw: unknown): LifeContext {
  const base = { ...DEFAULT_LIFE_CONTEXT };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<LifeContext>;

  const time = (v: unknown, fallback: string) =>
    typeof v === "string" && toMinutes(v) !== null ? v : fallback;
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(lo, Math.min(hi, Math.round(v)))
      : fallback;
  const days = (v: unknown): Weekday[] =>
    Array.isArray(v)
      ? (v.filter(
          (d) => typeof d === "number" && d >= 0 && d <= 6,
        ) as Weekday[])
      : [];

  const commitments = Array.isArray(r.commitments)
    ? r.commitments
        .filter((c): c is Commitment => Boolean(c) && typeof c === "object")
        .map((c) => ({ ...createCommitment(), ...c, days: days(c.days) }))
        .filter((c) => commitmentMinutes(c) !== null)
    : [];

  const wakeTime = time(r.wakeTime, base.wakeTime);
  let sleepTime = time(r.sleepTime, base.sleepTime);
  /* A sleep time at or before the wake time would leave a negative day and
     every downstream window would come out empty, which reads to the student
     as "the feature is broken" rather than "these two fields disagree". */
  if ((toMinutes(sleepTime) ?? 0) <= (toMinutes(wakeTime) ?? 0)) {
    sleepTime = base.sleepTime;
  }

  const minBlockMins = num(r.minBlockMins, base.minBlockMins, 10, 120);
  const maxBlockMins = Math.max(
    minBlockMins,
    num(r.maxBlockMins, base.maxBlockMins, 15, 180),
  );

  return {
    ...base,
    ...r,
    version: 1,
    wakeTime,
    sleepTime,
    chronotype: CHRONOTYPES.some((c) => c.value === r.chronotype)
      ? (r.chronotype as Chronotype)
      : base.chronotype,
    weekdayCapacityMins: num(
      r.weekdayCapacityMins,
      base.weekdayCapacityMins,
      0,
      900,
    ),
    weekendCapacityMins: num(
      r.weekendCapacityMins,
      base.weekendCapacityMins,
      0,
      900,
    ),
    minBlockMins,
    maxBlockMins,
    breakMins: num(r.breakMins, base.breakMins, 0, 60),
    bufferMins: num(r.bufferMins, base.bufferMins, 0, 60),
    commitments,
    protectedDays: days(r.protectedDays),
  };
}

export function loadLifeContext(): LifeContext {
  return normalizeLifeContext(Storage.get<unknown>(LIFE_CONTEXT_KEY, null));
}

export function saveLifeContext(ctx: LifeContext): void {
  Storage.set(LIFE_CONTEXT_KEY, ctx);
}

/** Fired after a write so any mounted surface repaints against the new week.
 *  A `storage` event only reaches *other* tabs, never the one that wrote —
 *  the same reason `TimerProvider` dispatches its own session-logged event. */
export const LIFE_CONTEXT_CHANGED_EVENT = "learnora:lifeContextChanged";
