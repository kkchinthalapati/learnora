/* Port of js/timer.js's state machine (:1-520), with every DOM write lifted
 * out. The vanilla `Timer` object mutated one shared `state` in place and
 * repainted by hand; here the transitions are pure functions from state to
 * state, so the tricky parts (what counts as a loggable session, when a type
 * switch is allowed to drop banked minutes) are testable without a clock or a
 * document.
 *
 * Two internal clock directions unify all four types:
 *   • count-DOWN — pomodoro, countdown, and the break phase of flowtime.
 *     Driven by `targetEndTime`, so it stays accurate across reloads and
 *     backgrounded tabs (where setInterval is throttled).
 *   • count-UP — stopwatch, and the focus phase of flowtime. Driven by
 *     `startedAt` + `countUpBase` (seconds banked at each pause), so elapsed
 *     time also survives a reload.
 *
 * Only ONE timer is ever live. Changing a preset or type while a timer runs
 * never cancels it — the change is *staged* and applies on Apply & Reset. */

import { Storage } from "./storage";

export const TIMER_STATE_KEY = "timer_state";
export const TIMER_END_KEY = "timer_end_time";

export const TIMER_TYPES = [
  "pomodoro",
  "countdown",
  "stopwatch",
  "flowtime",
] as const;
export type TimerType = (typeof TIMER_TYPES)[number];

export type TimerMode = "Focus" | "ShortBreak" | "LongBreak" | "Break";

export interface TimerConfig {
  focus: number;
  short: number;
  long: number;
  maxCycles: number;
  countdown: number;
}

export interface TimerState {
  isRunning: boolean;
  type: TimerType;
  mode: TimerMode;
  /** count-down: seconds remaining */
  timeLeft: number;
  /** count-down: full duration, for progress and logging */
  totalTime: number;
  /** count-down: epoch ms when it hits zero */
  targetEndTime: number | null;
  /** count-up: seconds elapsed */
  elapsed: number;
  /** count-up: seconds banked before the current run segment */
  countUpBase: number;
  /** count-up: epoch ms the current run segment began */
  startedAt: number | null;
  cycles: number;
  /** A type queued to apply on the next Apply & Reset (transient). */
  stagedType: TimerType | null;
  config: TimerConfig;
}

export const DEFAULT_CONFIG: TimerConfig = Object.freeze({
  focus: 25,
  short: 5,
  long: 15,
  maxCycles: 4,
  countdown: 15,
});

export const WORKFLOW_PRESETS: Record<string, Partial<TimerConfig>> = {
  deep: { focus: 90, short: 15, long: 30, maxCycles: 4 },
  cram: { focus: 45, short: 10, long: 20, maxCycles: 4 },
  light: { focus: 20, short: 5, long: 15, maxCycles: 4 },
};

export const QUOTES = [
  "Focus on the step in front of you.",
  "Don't stop until you're proud.",
  "Small progress is still progress.",
  "The secret of getting ahead is getting started.",
  "You don't have to be great to start, but you have to start to be great.",
  "Discipline is choosing between what you want now and what you want most.",
  "Push yourself, because no one else is going to do it for you.",
  "Study while they sleep. Work while they play.",
] as const;

export function initialTimerState(): TimerState {
  return {
    isRunning: false,
    type: "pomodoro",
    mode: "Focus",
    timeLeft: DEFAULT_CONFIG.focus * 60,
    totalTime: DEFAULT_CONFIG.focus * 60,
    targetEndTime: null,
    elapsed: 0,
    countUpBase: 0,
    startedAt: null,
    cycles: 0,
    stagedType: null,
    config: { ...DEFAULT_CONFIG },
  };
}

/* ------------------------------------------------------------------ *
 * Derived reads
 * ------------------------------------------------------------------ */

/** True when the active phase counts upward rather than down. */
export function isCountUp(state: TimerState): boolean {
  return (
    state.type === "stopwatch" ||
    (state.type === "flowtime" && state.mode === "Focus")
  );
}

/** Seconds a fresh Focus phase starts with (0 for count-up types). */
export function focusSeconds(state: TimerState): number {
  switch (state.type) {
    case "countdown":
      return Math.max(1, state.config.countdown) * 60;
    case "pomodoro":
      return Math.max(1, state.config.focus) * 60;
    default:
      return 0; // stopwatch / flowtime start at 0 and count up
  }
}

/** Live count-up seconds, whether running or banked. */
export function currentCountUpSeconds(
  state: TimerState,
  now = Date.now(),
): number {
  if (state.isRunning && state.startedAt) {
    return state.countUpBase + Math.floor((now - state.startedAt) / 1000);
  }
  return state.elapsed;
}

export function format(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function modeLabel(state: TimerState): string {
  switch (state.type) {
    case "countdown":
      return "Countdown";
    case "stopwatch":
      return "Stopwatch";
    case "flowtime":
      return state.mode === "Break" ? "Flow Break" : "Flow";
    default:
      return state.mode === "Focus"
        ? "Focus"
        : state.mode === "ShortBreak"
          ? "Short Break"
          : "Long Break";
  }
}

export function progressFraction(state: TimerState): number {
  if (isCountUp(state)) {
    /* Count-up has no end, so progress is mapped smoothly across a 60-minute
       window — the same arbitrary-but-legible choice the vanilla made. */
    return Math.min(1, state.elapsed / 3600);
  }
  return state.totalTime > 0
    ? Math.max(
        0,
        Math.min(1, (state.totalTime - state.timeLeft) / state.totalTime),
      )
    : 0;
}

/** Is a session in progress (running, or started-but-not-fresh)? */
export function isActive(state: TimerState): boolean {
  if (state.isRunning) return true;
  if (isCountUp(state)) return state.elapsed > 0;
  return state.timeLeft > 0 && state.timeLeft < state.totalTime;
}

/** The reset button becomes "Stop & log" once there's a minute worth banking. */
export function isStopAndLog(state: TimerState, now = Date.now()): boolean {
  return isCountUp(state) && currentCountUpSeconds(state, now) >= 60;
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

export function sanitizeConfig(
  partial: Partial<TimerConfig>,
): Partial<TimerConfig> {
  const out: Partial<TimerConfig> = {};
  const clean = (n: unknown) => Math.max(1, Number(n) | 0);
  if (partial.focus != null) out.focus = clean(partial.focus);
  if (partial.short != null) out.short = clean(partial.short);
  if (partial.long != null) out.long = clean(partial.long);
  if (partial.maxCycles != null) out.maxCycles = clean(partial.maxCycles);
  if (partial.countdown != null) out.countdown = clean(partial.countdown);
  return out;
}

export function persistTimerState(state: TimerState): void {
  Storage.set(TIMER_STATE_KEY, {
    isRunning: state.isRunning,
    type: state.type,
    mode: state.mode,
    timeLeft: state.timeLeft,
    totalTime: state.totalTime,
    cycles: state.cycles,
    countUpBase: state.countUpBase,
    startedAt: state.startedAt,
    elapsed: state.elapsed,
    config: state.config,
  });
  if (state.targetEndTime != null && state.isRunning) {
    localStorage.setItem(TIMER_END_KEY, String(state.targetEndTime));
  } else {
    Storage.remove(TIMER_END_KEY);
  }
}

/* Port of `Timer.init()`'s restore logic (:96-148). Returns the state plus
 * whether the timer finished while the tab was closed, which the caller has
 * to run through `handleEnd` (it logs a session and shows a toast — effects
 * that don't belong in a pure read). */
export function restoreTimerState(now = Date.now()): {
  state: TimerState;
  endedWhileAway: boolean;
} {
  const base = initialTimerState();
  const saved = Storage.get<
    Partial<TimerState> & { config?: Partial<TimerConfig> }
  >(TIMER_STATE_KEY);
  if (!saved) return { state: base, endedWhileAway: false };

  const state: TimerState = {
    ...base,
    config: { ...base.config, ...sanitizeConfig(saved.config ?? {}) },
    type: TIMER_TYPES.includes(saved.type as TimerType)
      ? (saved.type as TimerType)
      : "pomodoro",
    mode: (saved.mode as TimerMode) || "Focus",
    cycles: saved.cycles || 0,
    countUpBase: saved.countUpBase || 0,
    elapsed: saved.elapsed || 0,
    startedAt: saved.startedAt || null,
  };
  state.totalTime = saved.totalTime ?? focusSeconds(state);

  if (isCountUp(state)) {
    if (saved.isRunning && state.startedAt) {
      /* isRunning has to be set first: currentCountUpSeconds only adds the
         time since startedAt for a running timer, so computing it beforehand
         echoed the stale saved value and the display showed the pre-reload
         time until the first tick landed. */
      state.isRunning = true;
      state.elapsed = currentCountUpSeconds(state, now);
    } else {
      state.isRunning = false;
      state.elapsed = saved.elapsed || 0;
      state.countUpBase = state.elapsed;
    }
    return { state, endedWhileAway: false };
  }

  const storedEnd = localStorage.getItem(TIMER_END_KEY);
  if (saved.isRunning && storedEnd) {
    const end = parseInt(storedEnd, 10);
    state.targetEndTime = end;
    if (end > now) {
      state.timeLeft = Math.round((end - now) / 1000);
      state.isRunning = true;
      return { state, endedWhileAway: false };
    }
    // Finished while the tab was closed.
    state.timeLeft = 0;
    return { state, endedWhileAway: true };
  }

  state.timeLeft = saved.timeLeft ?? state.totalTime;
  state.isRunning = false;
  return { state, endedWhileAway: false };
}

/* ------------------------------------------------------------------ *
 * Transitions
 *
 * Each returns the next state plus any effects the caller must perform —
 * logging a session, showing a toast, firing a notification. Keeping those
 * as data rather than side effects is what makes the whole machine testable.
 * ------------------------------------------------------------------ */

export interface TimerEffects {
  /** Minutes to log as a study session. */
  logMinutes?: number;
  /** Toast to show. */
  toast?: { message: string; title: string };
  /** Label to pass to a browser notification. */
  notify?: string;
  /** Pick a fresh motivational quote. */
  newQuote?: boolean;
}

export interface Transition {
  state: TimerState;
  effects: TimerEffects;
}

export function start(state: TimerState, now = Date.now()): TimerState {
  if (state.isRunning) return state;
  const next: TimerState = { ...state, isRunning: true };

  if (isCountUp(next)) {
    next.startedAt = now;
  } else {
    if (next.timeLeft <= 0) {
      next.timeLeft = focusSeconds(next) || next.totalTime;
      next.totalTime = next.timeLeft;
    }
    next.targetEndTime = now + next.timeLeft * 1000;
  }
  return next;
}

export function pause(state: TimerState, now = Date.now()): TimerState {
  if (!state.isRunning) return state;
  const next: TimerState = { ...state, isRunning: false };

  if (isCountUp(state)) {
    next.elapsed = currentCountUpSeconds(state, now);
    next.countUpBase = next.elapsed;
    next.startedAt = null;
  } else {
    /* Recompute from the anchor rather than trusting the last tick's value.
       The vanilla left `timeLeft` wherever the previous tick had put it, so
       pausing mid-second silently rounded up to a second of extra time — and
       a pause during a throttled background tab could keep a value many
       seconds stale. */
    if (state.targetEndTime) {
      next.timeLeft = Math.max(
        0,
        Math.round((state.targetEndTime - now) / 1000),
      );
    }
    next.targetEndTime = null;
  }
  return next;
}

/* Banks whatever count-up time is on the clock and zeroes the counters.
 * Reads `type` via isCountUp, so it has to run BEFORE any type switch.
 * Clearing the counters is what makes it safe to call twice — applyNow
 * flushes and then resets, which flushes again — because the second call
 * finds nothing left. */
export function flushCountUpSession(
  state: TimerState,
  now = Date.now(),
): Transition {
  let logMinutes = 0;
  if (isCountUp(state)) {
    const secs = currentCountUpSeconds(state, now);
    if (secs >= 60) logMinutes = Math.round(secs / 60);
  }
  /* Cleared unconditionally: whatever sits on the count-up counters belongs to
     the phase that just ended, and leaving it behind let a type switch read a
     pomodoro's stale `elapsed` as a brand-new stopwatch session and log time
     nobody actually spent. */
  const next: TimerState = {
    ...state,
    elapsed: 0,
    countUpBase: 0,
    startedAt: null,
  };
  return { state: next, effects: logMinutes ? { logMinutes } : {} };
}

export function reset(state: TimerState, now = Date.now()): Transition {
  const flushed = flushCountUpSession(state, now);
  const next: TimerState = {
    ...flushed.state,
    isRunning: false,
    cycles: 0,
    stagedType: null,
    targetEndTime: null,
    countUpBase: 0,
    startedAt: null,
    elapsed: 0,
    mode: "Focus",
  };
  next.timeLeft = focusSeconds(next);
  next.totalTime = next.timeLeft;
  return { state: next, effects: flushed.effects };
}

/** Commit settings immediately and reset to a fresh timer of `type`. */
export function applyNow(
  state: TimerState,
  partial: Partial<TimerConfig> = {},
  type: TimerType | null = null,
  now = Date.now(),
): Transition {
  /* Bank the outgoing session BEFORE the type changes: reset() decides whether
     there is anything to log by asking isCountUp(), which reads `type`, so
     switching first made a stopwatch or flow session look like a countdown and
     the minutes the user had banked were dropped without a trace. */
  const flushed = flushCountUpSession(state, now);
  const withType: TimerState = {
    ...flushed.state,
    stagedType: null,
    type: type && TIMER_TYPES.includes(type) ? type : flushed.state.type,
    config: { ...flushed.state.config, ...sanitizeConfig(partial) },
  };
  const afterReset = reset(withType, now);
  /* reset() flushes again but finds nothing, so only the first flush can
     produce minutes. */
  return {
    state: afterReset.state,
    effects: { ...afterReset.effects, ...flushed.effects },
  };
}

/** Queue a different type without touching the running timer. */
export function stageType(state: TimerState, type: TimerType): TimerState {
  if (!TIMER_TYPES.includes(type)) return state;
  return { ...state, stagedType: type };
}

/** Queue a preset's durations (and its type) without cancelling the run. */
export function stagePreset(
  state: TimerState,
  partial: Partial<TimerConfig>,
  type: TimerType = "pomodoro",
): TimerState {
  return {
    ...stageType(state, type),
    config: { ...state.config, ...sanitizeConfig(partial) },
  };
}

export function extend(state: TimerState): TimerState {
  if (isCountUp(state)) return state; // nothing to extend on a count-up clock
  const addSeconds = 5 * 60;
  const next: TimerState = {
    ...state,
    timeLeft: state.timeLeft + addSeconds,
    totalTime: state.totalTime + addSeconds,
  };
  if (state.isRunning && state.targetEndTime) {
    next.targetEndTime = state.targetEndTime + addSeconds * 1000;
  }
  return next;
}

/** Flowtime: end the open-ended focus phase and take a proportional break. */
export function takeBreak(state: TimerState, now = Date.now()): Transition {
  if (state.type !== "flowtime" || state.mode !== "Focus") {
    return { state, effects: {} };
  }

  const focusMins = Math.max(
    0,
    Math.round(currentCountUpSeconds(state, now) / 60),
  );
  const breakMins = Math.max(1, Math.round(focusMins / 5)); // ~1:5 work-to-rest

  const next: TimerState = {
    ...state,
    isRunning: false,
    countUpBase: 0,
    startedAt: null,
    elapsed: 0,
    mode: "Break",
    timeLeft: breakMins * 60,
    totalTime: breakMins * 60,
    targetEndTime: null,
  };

  return {
    state: next,
    effects: {
      logMinutes: focusMins >= 1 ? focusMins : undefined,
      toast: {
        title: "Flow break",
        message: `Nice — ${focusMins}m of focus logged. Take a ${breakMins}m break, then dive back in.`,
      },
    },
  };
}

/** A count-down phase reached zero. */
export function handleEnd(state: TimerState, now = Date.now()): Transition {
  const paused = pause({ ...state, timeLeft: 0 }, now);
  const next: TimerState = { ...paused };
  const effects: TimerEffects = { newQuote: true };

  if (state.type === "pomodoro") {
    if (state.mode === "Focus") {
      // totalTime includes any +5m extensions — log the real length.
      effects.logMinutes = Math.round(state.totalTime / 60);
      const cycles = state.cycles + 1;
      if (cycles >= state.config.maxCycles) {
        next.mode = "LongBreak";
        next.timeLeft = state.config.long * 60;
        next.cycles = 0;
      } else {
        next.mode = "ShortBreak";
        next.timeLeft = state.config.short * 60;
        next.cycles = cycles;
      }
    } else {
      next.mode = "Focus";
      next.timeLeft = state.config.focus * 60;
    }
    next.totalTime = next.timeLeft;
    const label = modeLabel(next);
    effects.toast = {
      title: "Timer Finished",
      message: `${label} time started!`,
    };
    effects.notify = label;
  } else if (state.type === "countdown") {
    effects.logMinutes = Math.round(state.totalTime / 60);
    next.mode = "Focus";
    next.timeLeft = focusSeconds(next);
    next.totalTime = next.timeLeft;
    effects.toast = {
      title: "Timer Finished",
      message: "Countdown complete — session logged. 🎉",
    };
    effects.notify = "Countdown";
  } else if (state.type === "flowtime") {
    // The break just ended — return to a fresh focus phase.
    next.mode = "Focus";
    next.elapsed = 0;
    next.countUpBase = 0;
    next.startedAt = null;
    next.timeLeft = 0;
    next.totalTime = 0;
    effects.toast = {
      title: "Flow break done",
      message: "Break's over — ready for another flow session?",
    };
    effects.notify = "Flow";
  }

  return { state: next, effects };
}

/** One second of clock. Returns null when nothing changed. */
export function tick(
  state: TimerState,
  now = Date.now(),
): { state: TimerState; ended: boolean } {
  if (isCountUp(state)) {
    return {
      state: { ...state, elapsed: currentCountUpSeconds(state, now) },
      ended: false,
    };
  }
  const timeLeft = Math.max(
    0,
    Math.round(((state.targetEndTime ?? now) - now) / 1000),
  );
  return { state: { ...state, timeLeft }, ended: timeLeft <= 0 };
}

/* ------------------------------------------------------------------ *
 * Favourite presets
 * ------------------------------------------------------------------ */

export const FAVS_KEY = "fav_times";

export interface FavPreset {
  name: string;
  type: TimerType;
  config: TimerConfig;
  /* Legacy flat fields the vanilla also wrote, kept so a preset saved by one
     app still reads correctly in the other. */
  focus?: number;
  short?: number;
  long?: number;
  cycles?: number;
}

export function readFavs(): FavPreset[] {
  const raw = Storage.get<unknown[]>(FAVS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is FavPreset => !!f && typeof f === "object")
    .map((f) => {
      const legacy = {
        focus: f.focus,
        short: f.short,
        long: f.long,
        maxCycles: f.cycles,
      };
      return {
        name: String(f.name ?? "Untitled"),
        type: TIMER_TYPES.includes(f.type) ? f.type : "pomodoro",
        config: {
          ...DEFAULT_CONFIG,
          ...sanitizeConfig(f.config ?? legacy),
        },
      };
    });
}

export function writeFavs(favs: FavPreset[]): void {
  Storage.set(
    FAVS_KEY,
    favs.map((f) => ({
      name: f.name,
      type: f.type,
      config: f.config,
      // Legacy fields for the vanilla app's reader.
      focus: f.config.focus,
      short: f.config.short,
      long: f.config.long,
      cycles: f.config.maxCycles,
    })),
  );
}

/** Picks a quote index that isn't the one currently shown. */
export function nextQuoteIndex(
  current: number,
  random: () => number = Math.random,
): number {
  if (QUOTES.length <= 1) return 0;
  let idx = current;
  while (idx === current) idx = Math.floor(random() * QUOTES.length);
  return idx;
}
