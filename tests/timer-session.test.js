import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* js/timer.js reaches js/api.js, which imports the Supabase client from a CDN
   URL that Node can't resolve, so the Timer object is sliced out of the real
   source and evaluated against stubs — same approach as tests/quiz-parse.test.js
   and tests/safety.test.js, and for the same reason: a copy of the module in
   the test would drift from the shipped one. */
const SOURCE = readFileSync(new URL("../js/timer.js", import.meta.url), "utf8");

test("the Timer module is still where the test expects it", () => {
  assert.ok(
    SOURCE.includes("export const Timer = {"),
    "`export const Timer = {` not found in js/timer.js"
  );
});

/* Evaluate the whole module rather than slicing the object literal out: the
   Timer closes over module-level constants (TYPES, QUOTES, the storage keys,
   _lastQuoteIndex), and re-declaring those in the test would be one more
   thing to keep in sync. Imports are dropped so the stubs in the vm context
   stand in for UI / Sessions / Storage / $. */
const MODULE_BODY = SOURCE.replace(/^import[^\n]*\n/gm, "").replace(
  /^export const Timer =/m,
  "this.Timer ="
);

/* Builds a fresh Timer with stubbed collaborators. `logged` collects every
   session the timer tries to persist, which is what these tests assert on. */
function makeTimer(seed = {}) {
  const logged = [];
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));

  const context = {
    Timer: null,
    console: { warn() {}, error() {} },
    Date,
    Math,
    String,
    Number,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    // Timer only ever reads config inputs and the task/folder selects; a null
    // lookup makes it fall back to its own defaults, which is what we want.
    $: () => null,
    document: { getElementById: () => null, querySelector: () => null },
    window: { dispatchEvent() {}, location: { hash: "" } },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    Storage: {
      get: (k, fallback = null) => (store.has(k) ? JSON.parse(store.get(k)) : fallback),
      set: (k, v) => store.set(k, JSON.stringify(v)),
      remove: (k) => store.delete(k),
    },
    UI: {
      showPopup() {},
      // Keeps _tryNotify from touching the Notification API.
      loadSettings: () => ({ notifyTimerAlerts: false, notifyStudyReminders: false }),
    },
    Sessions: {
      log(payload) {
        logged.push(payload);
        return Promise.resolve();
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(MODULE_BODY, context);
  return { timer: context.Timer, logged };
}

/* Puts a count-up timer on the clock with `seconds` already banked, paused —
   the exact state a user is in when they stop a stopwatch and go change the
   timer type in the config panel. */
function pausedStopwatch(timer, seconds) {
  timer.state.type = "stopwatch";
  timer.state.mode = "Focus";
  timer.state.isRunning = false;
  timer.state.elapsed = seconds;
  timer.state.countUpBase = seconds;
  timer.state.startedAt = null;
}

test("switching timer type never discards banked focus time", async (t) => {
  await t.test("stopwatch → pomodoro logs the stopwatch session", () => {
    const { timer, logged } = makeTimer();
    pausedStopwatch(timer, 10 * 60);

    // "Apply & Reset" with the Pomodoro type selected.
    timer.applyNow({ focus: 25 }, "pomodoro");

    assert.strictEqual(logged.length, 1, "the 10 minutes must reach the session log");
    assert.strictEqual(logged[0].minutes, 10);
    assert.strictEqual(
      logged[0].timerType,
      "stopwatch",
      "it should be logged as the stopwatch session it actually was"
    );
  });

  await t.test("stopwatch → countdown logs the stopwatch session", () => {
    const { timer, logged } = makeTimer();
    pausedStopwatch(timer, 25 * 60);

    timer.applyNow({ countdown: 15 }, "countdown");

    assert.strictEqual(logged.length, 1);
    assert.strictEqual(logged[0].minutes, 25);
  });

  await t.test("a running stopwatch counts up to the moment of the switch", () => {
    const { timer, logged } = makeTimer();
    timer.state.type = "stopwatch";
    timer.state.isRunning = true;
    timer.state.countUpBase = 0;
    timer.state.startedAt = Date.now() - 7 * 60 * 1000;

    timer.applyNow({ focus: 25 }, "pomodoro");

    assert.strictEqual(logged.length, 1);
    assert.strictEqual(logged[0].minutes, 7, "live elapsed time must be banked, not the stale field");
  });

  await t.test("flowtime focus → pomodoro logs the flow session", () => {
    const { timer, logged } = makeTimer();
    timer.state.type = "flowtime";
    timer.state.mode = "Focus";
    timer.state.elapsed = 12 * 60;
    timer.state.countUpBase = 12 * 60;

    timer.applyNow({ focus: 25 }, "pomodoro");

    assert.strictEqual(logged.length, 1);
    assert.strictEqual(logged[0].minutes, 12);
  });
});

test("the flush never invents or duplicates a session", async (t) => {
  await t.test("applyNow + reset logs once, not twice", () => {
    // applyNow() flushes and then calls reset(), which flushes again.
    const { timer, logged } = makeTimer();
    pausedStopwatch(timer, 30 * 60);

    timer.applyNow({}, "stopwatch");

    assert.strictEqual(logged.length, 1, "the same session must not be logged twice");
  });

  await t.test("switching to a count-up type does not log phantom time", () => {
    const { timer, logged } = makeTimer();
    timer.state.type = "pomodoro";
    timer.state.mode = "Focus";
    timer.state.timeLeft = 25 * 60;
    timer.state.totalTime = 25 * 60;
    // Left over from an earlier count-up run; must not be read as new time
    // once the type flips to stopwatch.
    timer.state.elapsed = 40 * 60;
    timer.state.countUpBase = 40 * 60;

    timer.applyNow({}, "stopwatch");

    assert.strictEqual(logged.length, 0, "a countdown switch must not fabricate a session");
  });

  await t.test("under a minute is not worth logging", () => {
    const { timer, logged } = makeTimer();
    pausedStopwatch(timer, 45);

    timer.applyNow({ focus: 25 }, "pomodoro");

    assert.strictEqual(logged.length, 0);
  });

  await t.test("the counters are cleared after a flush", () => {
    const { timer } = makeTimer();
    pausedStopwatch(timer, 10 * 60);

    timer.applyNow({ focus: 25 }, "pomodoro");

    assert.strictEqual(timer.state.elapsed, 0);
    assert.strictEqual(timer.state.countUpBase, 0);
    assert.strictEqual(timer.state.startedAt, null);
  });

  await t.test("a plain reset still logs the session", () => {
    // The pre-existing path must keep working.
    const { timer, logged } = makeTimer();
    pausedStopwatch(timer, 15 * 60);

    timer.reset();

    assert.strictEqual(logged.length, 1);
    assert.strictEqual(logged[0].minutes, 15);
  });

  await t.test("resetting a countdown logs nothing", () => {
    const { timer, logged } = makeTimer();
    timer.state.type = "countdown";
    timer.state.timeLeft = 5 * 60;
    timer.state.totalTime = 15 * 60;

    timer.reset();

    assert.strictEqual(logged.length, 0);
  });
});

test("applyNow still applies the settings it was given", async (t) => {
  await t.test("the new type and config take effect", () => {
    const { timer } = makeTimer();
    pausedStopwatch(timer, 10 * 60);

    timer.applyNow({ focus: 50, short: 10 }, "pomodoro");

    assert.strictEqual(timer.state.type, "pomodoro");
    assert.strictEqual(timer.state.config.focus, 50);
    assert.strictEqual(timer.state.config.short, 10);
    assert.strictEqual(timer.state.timeLeft, 50 * 60, "the clock resets to the new focus length");
    assert.strictEqual(timer.state.isRunning, false);
  });

  await t.test("an unknown type is ignored", () => {
    const { timer } = makeTimer();
    timer.state.type = "pomodoro";

    timer.applyNow({}, "not-a-timer-type");

    assert.strictEqual(timer.state.type, "pomodoro");
  });
});

test("a running stopwatch resumes at the right elapsed time after a reload", async (t) => {
  await t.test("init() accrues the time the tab was closed for", () => {
    // Exactly what save() persists for a stopwatch that was running when the
    // tab closed eight minutes ago.
    const { timer } = makeTimer({
      timer_state: {
        isRunning: true,
        type: "stopwatch",
        mode: "Focus",
        timeLeft: 0,
        totalTime: 0,
        cycles: 0,
        countUpBase: 0,
        startedAt: Date.now() - 8 * 60 * 1000,
        elapsed: 0,
        config: { focus: 25, short: 5, long: 15, maxCycles: 4, countdown: 15 },
      },
    });

    timer.init();

    assert.strictEqual(timer.state.isRunning, true, "the stopwatch should still be running");
    assert.ok(
      timer.state.elapsed >= 8 * 60,
      `elapsed should have accrued to ~480s before the first tick, got ${timer.state.elapsed}`
    );
  });

  await t.test("a paused stopwatch restores its banked time untouched", () => {
    const { timer, logged } = makeTimer({
      timer_state: {
        isRunning: false,
        type: "stopwatch",
        mode: "Focus",
        cycles: 0,
        countUpBase: 300,
        startedAt: null,
        elapsed: 300,
        config: { focus: 25, short: 5, long: 15, maxCycles: 4, countdown: 15 },
      },
    });

    timer.init();

    assert.strictEqual(timer.state.isRunning, false);
    assert.strictEqual(timer.state.elapsed, 300);
    assert.strictEqual(logged.length, 0, "booting must not log anything on its own");
  });
});
