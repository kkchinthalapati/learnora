import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  FAVS_KEY,
  TIMER_END_KEY,
  TIMER_STATE_KEY,
  applyNow,
  currentCountUpSeconds,
  extend,
  flushCountUpSession,
  focusSeconds,
  format,
  handleEnd,
  initialTimerState,
  isActive,
  isCountUp,
  isStopAndLog,
  modeLabel,
  nextQuoteIndex,
  pause,
  persistTimerState,
  progressFraction,
  readFavs,
  reset,
  restoreTimerState,
  sanitizeConfig,
  stagePreset,
  stageType,
  start,
  takeBreak,
  tick,
  writeFavs,
  type TimerState,
} from "./timer";

const T0 = 1_800_000_000_000; // a fixed "now"

function stateOf(patch: Partial<TimerState> = {}): TimerState {
  return { ...initialTimerState(), ...patch };
}

describe("format", () => {
  it("shows mm:ss under an hour and h:mm:ss beyond it", () => {
    expect(format(0)).toBe("00:00");
    expect(format(59)).toBe("00:59");
    expect(format(25 * 60)).toBe("25:00");
    expect(format(3599)).toBe("59:59");
    expect(format(3600)).toBe("1:00:00");
    expect(format(3661)).toBe("1:01:01");
  });

  it("floors fractions and never goes negative", () => {
    expect(format(59.9)).toBe("00:59");
    expect(format(-10)).toBe("00:00");
  });
});

describe("isCountUp", () => {
  it("is true for the stopwatch and for flowtime's focus phase only", () => {
    expect(isCountUp(stateOf({ type: "stopwatch" }))).toBe(true);
    expect(isCountUp(stateOf({ type: "flowtime", mode: "Focus" }))).toBe(true);
    expect(isCountUp(stateOf({ type: "flowtime", mode: "Break" }))).toBe(false);
    expect(isCountUp(stateOf({ type: "pomodoro" }))).toBe(false);
    expect(isCountUp(stateOf({ type: "countdown" }))).toBe(false);
  });
});

describe("focusSeconds", () => {
  it("uses each type's own configured duration, 0 for count-up types", () => {
    expect(focusSeconds(stateOf({ type: "pomodoro" }))).toBe(25 * 60);
    expect(focusSeconds(stateOf({ type: "countdown" }))).toBe(15 * 60);
    expect(focusSeconds(stateOf({ type: "stopwatch" }))).toBe(0);
    expect(focusSeconds(stateOf({ type: "flowtime" }))).toBe(0);
  });

  it("never returns less than a minute for a configured type", () => {
    const s = stateOf({ type: "countdown" });
    s.config.countdown = 0;
    expect(focusSeconds(s)).toBe(60);
  });
});

describe("currentCountUpSeconds", () => {
  it("adds the live segment on top of the banked base while running", () => {
    const s = stateOf({
      type: "stopwatch",
      isRunning: true,
      countUpBase: 100,
      startedAt: T0,
    });
    expect(currentCountUpSeconds(s, T0 + 30_000)).toBe(130);
  });

  it("reports the banked value when paused", () => {
    const s = stateOf({ type: "stopwatch", isRunning: false, elapsed: 42 });
    expect(currentCountUpSeconds(s, T0 + 999_999)).toBe(42);
  });
});

describe("start / pause", () => {
  it("anchors a count-down to a wall-clock end time", () => {
    const s = start(stateOf({ timeLeft: 300 }), T0);
    expect(s.isRunning).toBe(true);
    expect(s.targetEndTime).toBe(T0 + 300_000);
  });

  it("anchors a count-up to the moment it started", () => {
    const s = start(stateOf({ type: "stopwatch" }), T0);
    expect(s.startedAt).toBe(T0);
    expect(s.targetEndTime).toBeNull();
  });

  it("refills an exhausted count-down rather than starting at zero", () => {
    const s = start(stateOf({ type: "pomodoro", timeLeft: 0 }), T0);
    expect(s.timeLeft).toBe(25 * 60);
    expect(s.totalTime).toBe(25 * 60);
  });

  it("is a no-op when already running", () => {
    const running = start(stateOf(), T0);
    expect(start(running, T0 + 5000)).toBe(running);
  });

  it("banks the live segment on pause so it survives a resume", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const paused = pause(running, T0 + 90_000);
    expect(paused.elapsed).toBe(90);
    expect(paused.countUpBase).toBe(90);
    expect(paused.startedAt).toBeNull();

    // Resuming and running another 30s continues from 90, not from 0.
    const resumed = start(paused, T0 + 200_000);
    expect(currentCountUpSeconds(resumed, T0 + 230_000)).toBe(120);
  });

  it("drops the end anchor when a count-down pauses", () => {
    const paused = pause(start(stateOf({ timeLeft: 300 }), T0), T0 + 1000);
    expect(paused.targetEndTime).toBeNull();
  });
});

describe("tick", () => {
  it("derives a count-down from the wall clock, not from accumulated ticks", () => {
    /* This is what makes a throttled background tab catch up instead of
       drifting behind. */
    const running = start(stateOf({ timeLeft: 300 }), T0);
    expect(tick(running, T0 + 10_000).state.timeLeft).toBe(290);
    // Jump ahead as a backgrounded tab would: still correct, not 299.
    expect(tick(running, T0 + 120_000).state.timeLeft).toBe(180);
  });

  it("reports the end of a count-down exactly once it reaches zero", () => {
    const running = start(stateOf({ timeLeft: 5 }), T0);
    expect(tick(running, T0 + 4000).ended).toBe(false);
    expect(tick(running, T0 + 5000).ended).toBe(true);
    expect(tick(running, T0 + 9000).state.timeLeft).toBe(0);
  });

  it("never ends a count-up", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const t = tick(running, T0 + 7_200_000);
    expect(t.ended).toBe(false);
    expect(t.state.elapsed).toBe(7200);
  });
});

describe("flushCountUpSession", () => {
  it("banks a minute or more from a running stopwatch, measured to the flush", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const { state, effects } = flushCountUpSession(running, T0 + 125_000);
    expect(effects.logMinutes).toBe(2);
    expect(state.elapsed).toBe(0);
    expect(state.countUpBase).toBe(0);
    expect(state.startedAt).toBeNull();
  });

  it("logs nothing under a minute", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    expect(
      flushCountUpSession(running, T0 + 59_000).effects.logMinutes,
    ).toBeUndefined();
  });

  it("logs nothing for a count-down type", () => {
    const s = stateOf({ type: "pomodoro", elapsed: 600 });
    expect(flushCountUpSession(s, T0).effects.logMinutes).toBeUndefined();
  });

  it("clears the counters even when nothing was logged", () => {
    /* Leaving them behind let a type switch read a pomodoro's stale `elapsed`
       as a brand-new stopwatch session and log time nobody spent. */
    const s = stateOf({ type: "pomodoro", elapsed: 600, countUpBase: 600 });
    const { state } = flushCountUpSession(s, T0);
    expect(state.elapsed).toBe(0);
    expect(state.countUpBase).toBe(0);
  });

  it("is safe to call twice — the second finds nothing left", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const first = flushCountUpSession(running, T0 + 125_000);
    expect(first.effects.logMinutes).toBe(2);
    expect(
      flushCountUpSession(first.state, T0 + 125_000).effects.logMinutes,
    ).toBeUndefined();
  });
});

describe("applyNow", () => {
  it("banks the outgoing count-up session BEFORE switching type", () => {
    /* The whole reason flush runs first: reset() asks isCountUp(), which reads
       `type`, so switching first made a stopwatch look like a countdown and
       silently dropped the minutes the user had banked. */
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const { state, effects } = applyNow(running, {}, "pomodoro", T0 + 300_000);
    expect(effects.logMinutes).toBe(5);
    expect(state.type).toBe("pomodoro");
  });

  it("does not double-log despite resetting after the flush", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const { effects } = applyNow(running, {}, "stopwatch", T0 + 300_000);
    expect(effects.logMinutes).toBe(5);
  });

  it("commits the config and resets to a fresh phase", () => {
    const { state } = applyNow(
      stateOf({ cycles: 3, mode: "ShortBreak" }),
      { focus: 50 },
      "pomodoro",
      T0,
    );
    expect(state.config.focus).toBe(50);
    expect(state.timeLeft).toBe(50 * 60);
    expect(state.totalTime).toBe(50 * 60);
    expect(state.mode).toBe("Focus");
    expect(state.cycles).toBe(0);
    expect(state.isRunning).toBe(false);
  });

  it("clears any staged type", () => {
    const staged = stageType(stateOf(), "flowtime");
    expect(applyNow(staged, {}, "pomodoro", T0).state.stagedType).toBeNull();
  });

  it("ignores an unknown type", () => {
    const { state } = applyNow(
      stateOf({ type: "countdown" }),
      {},
      "nonsense" as never,
      T0,
    );
    expect(state.type).toBe("countdown");
  });
});

describe("staging", () => {
  it("queues a type without touching the running clock", () => {
    const running = start(stateOf({ timeLeft: 300 }), T0);
    const staged = stageType(running, "flowtime");
    expect(staged.stagedType).toBe("flowtime");
    expect(staged.type).toBe("pomodoro");
    expect(staged.isRunning).toBe(true);
    expect(staged.targetEndTime).toBe(running.targetEndTime);
  });

  it("queues a preset's durations and its type together", () => {
    const running = start(stateOf(), T0);
    const staged = stagePreset(running, { focus: 90, short: 15 }, "pomodoro");
    expect(staged.config.focus).toBe(90);
    expect(staged.config.short).toBe(15);
    expect(staged.stagedType).toBe("pomodoro");
    // The live clock is untouched — the change only lands on Apply & Reset.
    expect(staged.timeLeft).toBe(running.timeLeft);
  });
});

describe("extend", () => {
  it("adds five minutes to the clock, the total and the end anchor", () => {
    const running = start(stateOf({ timeLeft: 300, totalTime: 300 }), T0);
    const extended = extend(running);
    expect(extended.timeLeft).toBe(600);
    expect(extended.totalTime).toBe(600);
    expect(extended.targetEndTime).toBe(running.targetEndTime! + 300_000);
  });

  it("does nothing to a count-up clock", () => {
    const s = stateOf({ type: "stopwatch" });
    expect(extend(s)).toBe(s);
  });
});

describe("takeBreak", () => {
  it("logs the focus time and starts a break about a fifth as long", () => {
    const running = start(stateOf({ type: "flowtime" }), T0);
    const { state, effects } = takeBreak(running, T0 + 50 * 60_000);
    expect(effects.logMinutes).toBe(50);
    expect(state.mode).toBe("Break");
    expect(state.timeLeft).toBe(10 * 60);
    expect(state.totalTime).toBe(10 * 60);
    expect(effects.toast?.message).toContain("50m of focus logged");
    expect(effects.toast?.message).toContain("10m break");
  });

  it("still gives at least a one-minute break after a very short focus", () => {
    const running = start(stateOf({ type: "flowtime" }), T0);
    const { state, effects } = takeBreak(running, T0 + 30_000);
    /* Carried over from the vanilla, inconsistency included: takeBreak rounds
       (so 30s logs as 1 minute) where flushCountUpSession requires a full 60s
       before it logs anything. */
    expect(effects.logMinutes).toBe(1);
    expect(state.timeLeft).toBe(60);
  });

  it("does nothing outside flowtime's focus phase", () => {
    const s = stateOf({ type: "pomodoro" });
    expect(takeBreak(s, T0).state).toBe(s);
    const onBreak = stateOf({ type: "flowtime", mode: "Break" });
    expect(takeBreak(onBreak, T0).state).toBe(onBreak);
  });

  it("zeroes the count-up counters so the break isn't measured as focus", () => {
    const running = start(stateOf({ type: "flowtime" }), T0);
    const { state } = takeBreak(running, T0 + 50 * 60_000);
    expect(state.elapsed).toBe(0);
    expect(state.countUpBase).toBe(0);
    expect(state.startedAt).toBeNull();
  });
});

describe("handleEnd", () => {
  it("logs a pomodoro focus phase and moves to a short break", () => {
    const s = stateOf({ type: "pomodoro", mode: "Focus", totalTime: 25 * 60 });
    const { state, effects } = handleEnd(s, T0);
    expect(effects.logMinutes).toBe(25);
    expect(state.mode).toBe("ShortBreak");
    expect(state.timeLeft).toBe(5 * 60);
    expect(state.cycles).toBe(1);
    expect(state.isRunning).toBe(false);
  });

  it("logs the extended length, not the configured one", () => {
    /* totalTime carries any +5m extensions, so the session logged is the real
       length the user sat through. */
    const s = stateOf({ type: "pomodoro", mode: "Focus", totalTime: 30 * 60 });
    expect(handleEnd(s, T0).effects.logMinutes).toBe(30);
  });

  it("takes a long break on the last cycle and resets the counter", () => {
    const s = stateOf({
      type: "pomodoro",
      mode: "Focus",
      totalTime: 25 * 60,
      cycles: 3,
    });
    const { state } = handleEnd(s, T0);
    expect(state.mode).toBe("LongBreak");
    expect(state.timeLeft).toBe(15 * 60);
    expect(state.cycles).toBe(0);
  });

  it("returns to focus after a break without logging the break", () => {
    const s = stateOf({
      type: "pomodoro",
      mode: "ShortBreak",
      totalTime: 5 * 60,
    });
    const { state, effects } = handleEnd(s, T0);
    expect(effects.logMinutes).toBeUndefined();
    expect(state.mode).toBe("Focus");
    expect(state.timeLeft).toBe(25 * 60);
  });

  it("logs a countdown and rearms it", () => {
    const s = stateOf({ type: "countdown", totalTime: 15 * 60 });
    const { state, effects } = handleEnd(s, T0);
    expect(effects.logMinutes).toBe(15);
    expect(state.timeLeft).toBe(15 * 60);
    expect(effects.toast?.message).toContain("Countdown complete");
  });

  it("returns flowtime to a fresh focus phase after its break", () => {
    const s = stateOf({ type: "flowtime", mode: "Break", totalTime: 10 * 60 });
    const { state, effects } = handleEnd(s, T0);
    expect(state.mode).toBe("Focus");
    expect(state.elapsed).toBe(0);
    expect(state.timeLeft).toBe(0);
    // The break itself is never logged as study time.
    expect(effects.logMinutes).toBeUndefined();
  });

  it("always asks for a fresh quote", () => {
    expect(handleEnd(stateOf(), T0).effects.newQuote).toBe(true);
  });
});

describe("reset", () => {
  it("banks a count-up session on the way out", () => {
    const running = start(stateOf({ type: "stopwatch" }), T0);
    const { effects } = reset(running, T0 + 180_000);
    expect(effects.logMinutes).toBe(3);
  });

  it("returns to a fresh focus phase and clears everything transient", () => {
    const s = stateOf({
      isRunning: true,
      mode: "LongBreak",
      cycles: 3,
      stagedType: "flowtime",
      targetEndTime: T0,
      elapsed: 90,
    });
    const { state } = reset(s, T0);
    expect(state.isRunning).toBe(false);
    expect(state.mode).toBe("Focus");
    expect(state.cycles).toBe(0);
    expect(state.stagedType).toBeNull();
    expect(state.targetEndTime).toBeNull();
    expect(state.elapsed).toBe(0);
    expect(state.timeLeft).toBe(25 * 60);
  });
});

describe("progressFraction / isActive / isStopAndLog", () => {
  it("measures a count-down against its total", () => {
    expect(progressFraction(stateOf({ timeLeft: 300, totalTime: 600 }))).toBe(
      0.5,
    );
    expect(progressFraction(stateOf({ timeLeft: 600, totalTime: 600 }))).toBe(
      0,
    );
    expect(progressFraction(stateOf({ timeLeft: 0, totalTime: 600 }))).toBe(1);
  });

  it("maps a count-up across a one-hour window and caps at 1", () => {
    expect(
      progressFraction(stateOf({ type: "stopwatch", elapsed: 1800 })),
    ).toBe(0.5);
    expect(
      progressFraction(stateOf({ type: "stopwatch", elapsed: 9999 })),
    ).toBe(1);
  });

  it("treats a fresh timer as inactive and a part-used one as active", () => {
    expect(isActive(stateOf())).toBe(false);
    expect(isActive(stateOf({ isRunning: true }))).toBe(true);
    expect(isActive(stateOf({ timeLeft: 300, totalTime: 600 }))).toBe(true);
    expect(isActive(stateOf({ type: "stopwatch", elapsed: 5 }))).toBe(true);
    expect(isActive(stateOf({ type: "stopwatch", elapsed: 0 }))).toBe(false);
  });

  it("offers Stop & log only once a count-up has a minute banked", () => {
    expect(isStopAndLog(stateOf({ type: "stopwatch", elapsed: 59 }))).toBe(
      false,
    );
    expect(isStopAndLog(stateOf({ type: "stopwatch", elapsed: 60 }))).toBe(
      true,
    );
    expect(isStopAndLog(stateOf({ type: "pomodoro", timeLeft: 5 }))).toBe(
      false,
    );
  });
});

describe("modeLabel", () => {
  it("names each type and phase the way the vanilla did", () => {
    expect(modeLabel(stateOf({ type: "countdown" }))).toBe("Countdown");
    expect(modeLabel(stateOf({ type: "stopwatch" }))).toBe("Stopwatch");
    expect(modeLabel(stateOf({ type: "flowtime", mode: "Focus" }))).toBe(
      "Flow",
    );
    expect(modeLabel(stateOf({ type: "flowtime", mode: "Break" }))).toBe(
      "Flow Break",
    );
    expect(modeLabel(stateOf({ mode: "Focus" }))).toBe("Focus");
    expect(modeLabel(stateOf({ mode: "ShortBreak" }))).toBe("Short Break");
    expect(modeLabel(stateOf({ mode: "LongBreak" }))).toBe("Long Break");
  });
});

describe("sanitizeConfig", () => {
  it("floors every value at one minute and drops fractions", () => {
    expect(sanitizeConfig({ focus: 0, short: -5, long: 12.7 })).toEqual({
      focus: 1,
      short: 1,
      long: 12,
    });
  });

  it("only carries the keys it was given", () => {
    expect(sanitizeConfig({ focus: 30 })).toEqual({ focus: 30 });
  });
});

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(restoreTimerState(T0).state).toEqual(initialTimerState());
  });

  it("round-trips a paused count-down", () => {
    const s = pause(
      start(stateOf({ timeLeft: 600, totalTime: 600 }), T0),
      T0 + 60_000,
    );
    persistTimerState(s);
    const { state, endedWhileAway } = restoreTimerState(T0 + 120_000);
    expect(endedWhileAway).toBe(false);
    expect(state.isRunning).toBe(false);
    expect(state.timeLeft).toBe(540);
  });

  it("resumes a running count-down against the stored end time", () => {
    persistTimerState(start(stateOf({ timeLeft: 600 }), T0));
    const { state, endedWhileAway } = restoreTimerState(T0 + 100_000);
    expect(endedWhileAway).toBe(false);
    expect(state.isRunning).toBe(true);
    expect(state.timeLeft).toBe(500);
  });

  it("reports a count-down that expired while the tab was closed", () => {
    persistTimerState(start(stateOf({ timeLeft: 60 }), T0));
    const { state, endedWhileAway } = restoreTimerState(T0 + 120_000);
    expect(endedWhileAway).toBe(true);
    expect(state.timeLeft).toBe(0);
  });

  it("keeps a running stopwatch accruing across the reload", () => {
    /* isRunning has to be applied before the elapsed read, or the display
       shows the pre-reload time until the first tick lands. */
    persistTimerState(start(stateOf({ type: "stopwatch" }), T0));
    const { state } = restoreTimerState(T0 + 90_000);
    expect(state.isRunning).toBe(true);
    expect(state.elapsed).toBe(90);
  });

  it("restores a paused stopwatch's banked time as its base", () => {
    const paused = pause(
      start(stateOf({ type: "stopwatch" }), T0),
      T0 + 45_000,
    );
    persistTimerState(paused);
    const { state } = restoreTimerState(T0 + 999_999);
    expect(state.isRunning).toBe(false);
    expect(state.elapsed).toBe(45);
    expect(state.countUpBase).toBe(45);
  });

  it("clears the end-time key when the timer isn't running", () => {
    persistTimerState(start(stateOf({ timeLeft: 60 }), T0));
    expect(localStorage.getItem(TIMER_END_KEY)).not.toBeNull();
    persistTimerState(pause(start(stateOf({ timeLeft: 60 }), T0), T0 + 1000));
    expect(localStorage.getItem(TIMER_END_KEY)).toBeNull();
  });

  it("rejects an unknown stored type", () => {
    localStorage.setItem(
      TIMER_STATE_KEY,
      JSON.stringify({ type: "hourglass", config: {} }),
    );
    expect(restoreTimerState(T0).state.type).toBe("pomodoro");
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem(TIMER_STATE_KEY, "}{");
    expect(restoreTimerState(T0).state).toEqual(initialTimerState());
  });

  it("clamps a hand-edited config", () => {
    localStorage.setItem(
      TIMER_STATE_KEY,
      JSON.stringify({ type: "pomodoro", config: { focus: -3 } }),
    );
    expect(restoreTimerState(T0).state.config.focus).toBe(1);
  });
});

describe("favourite presets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips, and writes the legacy flat fields the vanilla reads", () => {
    writeFavs([
      {
        name: "Math Prep",
        type: "pomodoro",
        config: { ...DEFAULT_CONFIG, focus: 50 },
      },
    ]);
    const raw = JSON.parse(localStorage.getItem(FAVS_KEY)!) as Record<
      string,
      unknown
    >[];
    expect(raw[0]).toMatchObject({ name: "Math Prep", focus: 50, cycles: 4 });
    expect(readFavs()[0].config.focus).toBe(50);
  });

  it("reads a legacy preset that has only the flat fields", () => {
    localStorage.setItem(
      FAVS_KEY,
      JSON.stringify([
        { name: "Old", focus: 40, short: 8, long: 20, cycles: 3 },
      ]),
    );
    const [fav] = readFavs();
    expect(fav.type).toBe("pomodoro");
    expect(fav.config).toMatchObject({
      focus: 40,
      short: 8,
      long: 20,
      maxCycles: 3,
    });
  });

  it("survives a non-array payload", () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify({ nope: true }));
    expect(readFavs()).toEqual([]);
  });
});

describe("nextQuoteIndex", () => {
  it("never repeats the quote currently shown", () => {
    for (let current = 0; current < 8; current++) {
      // A generator that keeps proposing the current index first.
      const proposals = [current / 8, ((current + 3) % 8) / 8];
      let i = 0;
      expect(nextQuoteIndex(current, () => proposals[i++])).not.toBe(current);
    }
  });
});
