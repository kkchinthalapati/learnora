import { UI, $, Storage } from "./ui.js";
import { Sessions } from "./api.js";

/* =========================================================================
   CONSTANTS
   ========================================================================= */

const TIMER_STATE_KEY = "timer_state";
const TIMER_END_KEY = "timer_end_time";

// Tracks the last quote shown to avoid repeating it immediately.
let _lastQuoteIndex = -1;

// The four timer styles the workspace supports.
const TYPES = ["pomodoro", "countdown", "stopwatch", "flowtime"];

const QUOTES = [
  "Focus on the step in front of you.",
  "Don't stop until you're proud.",
  "Small progress is still progress.",
  "The secret of getting ahead is getting started.",
  "You don't have to be great to start, but you have to start to be great.",
  "Discipline is choosing between what you want now and what you want most.",
  "Push yourself, because no one else is going to do it for you.",
  "Study while they sleep. Work while they play.",
];

/* =========================================================================
   TIMER MODULE

   Two internal clock directions unify all four types:
     • count-DOWN  — pomodoro, countdown, and the break phase of flowtime.
                     Driven by `targetEndTime` so it stays accurate across
                     reloads / backgrounded tabs.
     • count-UP    — stopwatch, and the focus phase of flowtime.
                     Driven by `startedAt` + `countUpBase` (accumulated
                     seconds banked at each pause), so elapsed time also
                     survives reloads.

   Only ONE timer is ever live. Changing a preset / type while a timer runs
   never cancels it — the change is *staged* (see stageType/stagePreset) and
   only takes effect on an explicit Apply & Reset.
   ========================================================================= */

export const Timer = {
  state: {
    interval: null,
    isRunning: false,
    type: "pomodoro",
    mode: "Focus",               // Focus | ShortBreak | LongBreak | Break
    timeLeft: 25 * 60,           // count-down: seconds remaining
    totalTime: 25 * 60,          // count-down: full duration (for progress + logging)
    targetEndTime: null,         // count-down: epoch ms when it hits zero
    elapsed: 0,                  // count-up: seconds elapsed
    countUpBase: 0,              // count-up: seconds banked before the current run segment
    startedAt: null,             // count-up: epoch ms the current run segment began
    cycles: 0,
    stagedType: null,            // a type queued to apply on next Apply & Reset (transient)
    config: { focus: 25, short: 5, long: 15, maxCycles: 4, countdown: 15 },
  },

  /* ------ Type helpers ------ */

  // True when the active phase counts upward rather than down.
  _isCountUp() {
    return (
      this.state.type === "stopwatch" ||
      (this.state.type === "flowtime" && this.state.mode === "Focus")
    );
  },

  // Seconds a fresh Focus phase should start with (0 for count-up types).
  _focusSeconds() {
    switch (this.state.type) {
      case "countdown": return Math.max(1, this.state.config.countdown) * 60;
      case "pomodoro":  return Math.max(1, this.state.config.focus) * 60;
      default:          return 0; // stopwatch / flowtime start at 0 and count up
    }
  },

  // Live count-up seconds, whether running or banked.
  _currentCountUpSeconds() {
    if (this.state.isRunning && this.state.startedAt) {
      return this.state.countUpBase + Math.floor((Date.now() - this.state.startedAt) / 1000);
    }
    return this.state.elapsed;
  },

  isRunning() { return this.state.isRunning; },
  currentType() { return this.state.type; },
  stagedType() { return this.state.stagedType; },

  /* ------ Lifecycle ------ */

  init() {
    const saved = Storage.get(TIMER_STATE_KEY);
    if (saved) {
      this.state.config = { ...this.state.config, ...saved.config };
      this.state.type = TYPES.includes(saved.type) ? saved.type : "pomodoro";
      this.state.mode = saved.mode || "Focus";
      this.state.totalTime = saved.totalTime ?? this._focusSeconds();
      this.state.cycles = saved.cycles || 0;
      this.state.countUpBase = saved.countUpBase || 0;
      this.state.elapsed = saved.elapsed || 0;
      this.state.startedAt = saved.startedAt || null;

      if (this._isCountUp()) {
        if (saved.isRunning && this.state.startedAt) {
          // Resume a running stopwatch — elapsed keeps accruing across the gap.
          this.state.elapsed = this._currentCountUpSeconds();
          this.state.isRunning = true;
          this._startInterval();
        } else {
          this.state.isRunning = false;
          this.state.elapsed = saved.elapsed || 0;
          this.state.countUpBase = this.state.elapsed;
        }
      } else {
        const endTime = localStorage.getItem(TIMER_END_KEY);
        if (saved.isRunning && endTime) {
          const end = parseInt(endTime, 10);
          this.state.targetEndTime = end;
          if (end > Date.now()) {
            this.state.timeLeft = Math.round((end - Date.now()) / 1000);
            this.state.isRunning = true;
            this._startInterval();
          } else {
            // Finished while the tab was closed.
            this.state.timeLeft = 0;
            this._handleEnd();
          }
        } else {
          this.state.timeLeft = saved.timeLeft ?? this.state.totalTime;
          this.state.isRunning = false;
        }
      }
    }
    this._syncTypeUI();
    this._syncConfigInputs();
    this.updateUI();
    this.randomizeQuote();
    this.loadFavs();
  },

  save() {
    Storage.set(TIMER_STATE_KEY, {
      isRunning: this.state.isRunning,
      type: this.state.type,
      mode: this.state.mode,
      timeLeft: this.state.timeLeft,
      totalTime: this.state.totalTime,
      cycles: this.state.cycles,
      countUpBase: this.state.countUpBase,
      startedAt: this.state.startedAt,
      elapsed: this.state.elapsed,
      config: this.state.config,
    });
  },

  /* ------ Configuration & staging ------ */

  _sanitize(p = {}) {
    const out = {};
    if (p.focus != null)     out.focus = Math.max(1, p.focus | 0);
    if (p.short != null)     out.short = Math.max(1, p.short | 0);
    if (p.long != null)      out.long = Math.max(1, p.long | 0);
    if (p.maxCycles != null) out.maxCycles = Math.max(1, p.maxCycles | 0);
    if (p.countdown != null) out.countdown = Math.max(1, p.countdown | 0);
    return out;
  },

  // Read the current config-panel inputs into a partial config object.
  readInputs() {
    const g = (id, d) => parseInt($(id)?.value || String(d), 10);
    return {
      focus: g("config-focus", 25),
      short: g("config-short", 5),
      long: g("config-long", 15),
      maxCycles: g("config-cycles", 4),
      countdown: g("config-countdown", 15),
    };
  },

  // Commit settings immediately and reset to a fresh timer of `type`.
  applyNow(partial = {}, type = null) {
    this.state.stagedType = null;
    if (type && TYPES.includes(type)) this.state.type = type;
    this.state.config = { ...this.state.config, ...this._sanitize(partial) };
    this._showStageHint(false);
    this._syncTypeUI();
    this._syncConfigInputs();
    this.reset();
  },

  // Queue a different type without touching the running timer. The config
  // panel switches to that type's inputs so the user can set it up.
  stageType(type) {
    if (!TYPES.includes(type)) return;
    this.state.stagedType = type;
    const radio = document.querySelector(`input[name="timer-type"][value="${type}"]`);
    if (radio) radio.checked = true;
    this._showConfigSections(type);
    this._showStageHint(true);
    this.save();
  },

  // Queue a preset's durations (+ its type) without cancelling the run.
  stagePreset(partial, type = "pomodoro") {
    this.stageType(type);
    this.state.config = { ...this.state.config, ...this._sanitize(partial) };
    this._syncConfigInputs();
    this.save();
  },

  /* ------ Controls ------ */

  start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;

    if (this._isCountUp()) {
      this.state.startedAt = Date.now();
    } else {
      if (this.state.timeLeft <= 0) {
        this.state.timeLeft = this._focusSeconds() || this.state.totalTime;
        this.state.totalTime = this.state.timeLeft;
      }
      this.state.targetEndTime = Date.now() + this.state.timeLeft * 1000;
      localStorage.setItem(TIMER_END_KEY, String(this.state.targetEndTime));
    }

    this.save();
    this._startInterval();
    this.updateUI();
  },

  pause() {
    if (!this.state.isRunning) return;
    this._stopInterval();
    this.state.isRunning = false;

    if (this._isCountUp()) {
      this.state.elapsed = this._currentCountUpSeconds();
      this.state.countUpBase = this.state.elapsed;
      this.state.startedAt = null;
    } else {
      this.state.targetEndTime = null;
      localStorage.removeItem(TIMER_END_KEY);
    }

    this.save();
    this.updateUI();
  },

  // Pause when running, resume when paused — used by the mini-timer button.
  toggle() {
    this.state.isRunning ? this.pause() : this.start();
  },

  reset() {
    // A count-up session with real time on the clock is worth logging.
    if (this._isCountUp()) {
      const secs = this._currentCountUpSeconds();
      if (secs >= 60) this._logSession(Math.round(secs / 60));
    }

    this._stopInterval();
    this.state.isRunning = false;
    this.state.cycles = 0;
    this.state.stagedType = null;
    this.state.targetEndTime = null;
    localStorage.removeItem(TIMER_END_KEY);
    this.state.countUpBase = 0;
    this.state.startedAt = null;
    this.state.elapsed = 0;

    this.state.mode = "Focus";
    this.state.timeLeft = this._focusSeconds();
    this.state.totalTime = this.state.timeLeft;

    this._showStageHint(false);
    this.save();
    this.updateUI();
  },

  extend() {
    if (this._isCountUp()) return; // nothing to extend on a count-up clock
    const addSeconds = 5 * 60;
    this.state.timeLeft += addSeconds;
    this.state.totalTime += addSeconds;
    if (this.state.isRunning && this.state.targetEndTime) {
      this.state.targetEndTime += addSeconds * 1000;
      localStorage.setItem(TIMER_END_KEY, String(this.state.targetEndTime));
    }
    this.save();
    this.updateUI();
  },

  // Flowtime: end the open-ended focus phase and take a proportional break.
  takeBreak() {
    if (this.state.type !== "flowtime" || this.state.mode !== "Focus") return;

    const focusMins = Math.max(0, Math.round(this._currentCountUpSeconds() / 60));
    if (focusMins >= 1) this._logSession(focusMins);

    this._stopInterval();
    this.state.isRunning = false;
    this.state.countUpBase = 0;
    this.state.startedAt = null;
    this.state.elapsed = 0;

    const breakMins = Math.max(1, Math.round(focusMins / 5)); // ~1:5 work-to-rest
    this.state.mode = "Break";
    this.state.timeLeft = breakMins * 60;
    this.state.totalTime = this.state.timeLeft;
    this.state.targetEndTime = null;
    this.save();

    UI.showPopup(
      `Nice — ${focusMins}m of focus logged. Take a ${breakMins}m break, then dive back in.`,
      "Flow break",
    );
    this.updateUI();
    this.start(); // roll straight into the break countdown
  },

  _startInterval() {
    this._stopInterval();
    this.state.interval = setInterval(() => this._tick(), 1000);
  },

  _stopInterval() {
    if (this.state.interval) clearInterval(this.state.interval);
    this.state.interval = null;
  },

  _tick() {
    if (this._isCountUp()) {
      this.state.elapsed = this._currentCountUpSeconds();
      this.updateUI();
    } else {
      this.state.timeLeft = Math.max(
        0,
        Math.round((this.state.targetEndTime - Date.now()) / 1000),
      );
      if (this.state.timeLeft <= 0) this._handleEnd();
      else this.updateUI();
    }
  },

  /* ------ End-of-period transitions ------ */

  _handleEnd() {
    this.pause();

    if (this.state.type === "pomodoro") {
      if (this.state.mode === "Focus") {
        // totalTime includes any +5m extensions — log the real length.
        this._logSession(Math.round(this.state.totalTime / 60));
        this.state.cycles++;
        if (this.state.cycles >= this.state.config.maxCycles) {
          this.state.mode = "LongBreak";
          this.state.timeLeft = this.state.config.long * 60;
          this.state.cycles = 0;
        } else {
          this.state.mode = "ShortBreak";
          this.state.timeLeft = this.state.config.short * 60;
        }
      } else {
        this.state.mode = "Focus";
        this.state.timeLeft = this.state.config.focus * 60;
      }
      this.state.totalTime = this.state.timeLeft;
      this.save();
      const label = this._modeLabel();
      UI.showPopup(`${label} time started!`, "Timer Finished");
      this._tryNotify(label);
    } else if (this.state.type === "countdown") {
      this._logSession(Math.round(this.state.totalTime / 60));
      this.state.mode = "Focus";
      this.state.timeLeft = this._focusSeconds();
      this.state.totalTime = this.state.timeLeft;
      this.save();
      UI.showPopup("Countdown complete — session logged. 🎉", "Timer Finished");
      this._tryNotify("Countdown");
    } else if (this.state.type === "flowtime") {
      // The break just ended — return to a fresh focus phase.
      this.state.mode = "Focus";
      this.state.elapsed = 0;
      this.state.countUpBase = 0;
      this.state.startedAt = null;
      this.state.timeLeft = 0;
      this.state.totalTime = 0;
      this.save();
      UI.showPopup("Break's over — ready for another flow session?", "Flow break done");
      this._tryNotify("Flow");
    }

    this.updateUI();
    this.randomizeQuote();
  },

  /* ------ Session logging ------ */

  _logSession(mins) {
    if (!mins || mins < 1) return;
    const sessions = Storage.get("sessions", []);
    const taskEl = $("active-task-select");
    const taskName = taskEl && taskEl.value !== "None" ? taskEl.value : "General Study";
    const folderEl = $("active-folder-select");
    const folderId = folderEl && folderEl.value !== "" ? folderEl.value : null;
    const ts = new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    sessions.unshift({ id: Date.now(), timestamp: ts, minutes: mins, task: taskName });
    if (sessions.length > 500) sessions.length = 500;

    Storage.set("sessions", sessions);

    // Local history above is the source of truth for instant UI; the Supabase
    // write is best-effort so a flaky connection never drops a logged session.
    Sessions.log({ minutes: mins, task: taskName, folderId, timerType: this.state.type })
      .catch((err) => console.warn("[Timer] Supabase session log failed (local copy preserved):", err));

    window.dispatchEvent(new Event("sessionLogged"));
  },

  /* ------ Browser notifications ------ */

  _tryNotify(label) {
    if (!UI.loadSettings().notifyTimerAlerts) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("Learnora", { body: `${label} time! Let's go.`, icon: "learnora.jpg" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  },

  /* ------ Display helpers ------ */

  _format(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  },

  _modeLabel() {
    switch (this.state.type) {
      case "countdown": return "Countdown";
      case "stopwatch": return "Stopwatch";
      case "flowtime":  return this.state.mode === "Break" ? "Flow Break" : "Flow";
      default:
        return this.state.mode === "Focus"
          ? "Focus"
          : this.state.mode === "ShortBreak"
            ? "Short Break"
            : "Long Break";
    }
  },

  _progressFraction() {
    if (this._isCountUp()) {
      // Map stopwatch/flowtime progress smoothly from 0 to 1 over a 60-minute window (3600s)
      return Math.min(1, this.state.elapsed / 3600);
    }
    return this.state.totalTime > 0
      ? Math.max(0, Math.min(1, (this.state.totalTime - this.state.timeLeft) / this.state.totalTime))
      : 0;
  },

  // Is a session in progress (running, or started-but-not-fresh)?
  _isActive() {
    if (this.state.isRunning) return true;
    if (this._isCountUp()) return this.state.elapsed > 0;
    return this.state.timeLeft > 0 && this.state.timeLeft < this.state.totalTime;
  },

  /* ------ UI rendering ------ */

  updateUI() {
    const countUp = this._isCountUp();
    const secs = countUp ? this.state.elapsed : this.state.timeLeft;

    const timeEl = $("time-display");
    if (timeEl) timeEl.textContent = this._format(secs);

    const modeEl = $("timer-mode-label");
    if (modeEl) modeEl.textContent = this._modeLabel();

    const cycleEl = $("cycle-counter");
    if (cycleEl) {
      if (this.state.type === "pomodoro") {
        cycleEl.textContent = `Cycle: ${this.state.cycles} / ${this.state.config.maxCycles}`;
        cycleEl.classList.remove("hidden");
      } else {
        cycleEl.textContent = "";
        cycleEl.classList.add("hidden");
      }
    }

    const frac = this._progressFraction();
    const progressEl = $("timer-progress");
    if (progressEl) progressEl.style.width = `${frac * 100}%`;

    const ringEl = document.getElementById("timer-ring-progress");
    if (ringEl) {
      const circumference = 2 * Math.PI * 90; // r=90
      ringEl.style.strokeDashoffset = circumference * (1 - frac);
    }

    // Control visibility adapts to the timer type.
    const startBtn = $("btn-timer-start");
    const pauseBtn = $("btn-timer-pause");
    const extendBtn = $("btn-timer-extend");
    const breakBtn = $("btn-timer-break");
    const resetBtn = $("btn-timer-reset");

    if (startBtn) startBtn.classList.toggle("hidden", this.state.isRunning);
    if (pauseBtn) pauseBtn.classList.toggle("hidden", !this.state.isRunning);
    if (extendBtn) extendBtn.classList.toggle("hidden", countUp);
    if (breakBtn) {
      const showBreak = this.state.type === "flowtime" && this.state.mode === "Focus";
      breakBtn.classList.toggle("hidden", !showBreak);
    }
    if (resetBtn) {
      const isStopAndLog = countUp && this._currentCountUpSeconds() >= 60;
      resetBtn.textContent = isStopAndLog ? "Stop & log" : "Reset";
      if (isStopAndLog) {
        resetBtn.classList.remove("btn-ghost-danger");
        resetBtn.classList.add("btn-ghost-success");
      } else {
        resetBtn.classList.remove("btn-ghost-success");
        resetBtn.classList.add("btn-ghost-danger");
      }
    }

    this._renderMini();
  },

  _renderMini() {
    const mini = document.getElementById("mini-timer");
    if (!mini) return;

    const route = window.location.hash.replace("#", "") || "dashboard";
    const show = this._isActive() && route !== "timer";
    mini.classList.toggle("hidden", !show);
    if (!show) return;

    const secs = this._isCountUp() ? this.state.elapsed : this.state.timeLeft;
    const timeEl = document.getElementById("mini-timer-time");
    const labelEl = document.getElementById("mini-timer-label");
    const barEl = document.getElementById("mini-timer-bar");
    const toggleEl = document.getElementById("mini-timer-toggle");

    if (timeEl) timeEl.textContent = this._format(secs);
    if (labelEl) labelEl.textContent = this._modeLabel();
    if (barEl) barEl.style.width = `${this._progressFraction() * 100}%`;
    if (toggleEl) {
      toggleEl.textContent = this.state.isRunning ? "⏸" : "▶";
      toggleEl.setAttribute("aria-label", this.state.isRunning ? "Pause timer" : "Resume timer");
    }
    mini.classList.toggle("mini-timer-running", this.state.isRunning);
  },

  // Show only the config section for `type`.
  _showConfigSections(type) {
    const map = {
      pomodoro: "cfg-pomodoro",
      countdown: "cfg-countdown",
      stopwatch: "cfg-stopwatch",
      flowtime: "cfg-flowtime",
    };
    for (const [t, id] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", t !== type);
    }
  },

  _syncTypeUI() {
    const radio = document.querySelector(`input[name="timer-type"][value="${this.state.type}"]`);
    if (radio) radio.checked = true;
    this._showConfigSections(this.state.type);
  },

  _showStageHint(show) {
    const el = document.getElementById("timer-stage-hint");
    if (!el) return;
    if (show) {
      el.textContent =
        "Saved for your next session — your current timer keeps running (docked bottom-left). Press Apply & Reset to switch to it now.";
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  },

  _syncConfigInputs() {
    const map = {
      "config-focus": this.state.config.focus,
      "config-short": this.state.config.short,
      "config-long": this.state.config.long,
      "config-cycles": this.state.config.maxCycles,
      "config-countdown": this.state.config.countdown,
    };
    for (const [id, value] of Object.entries(map)) {
      const el = $(id);
      if (el) el.value = value;
    }
  },

  randomizeQuote() {
    const el = $("quote-display");
    if (!el) return;
    el.classList.add("fade-out");
    setTimeout(() => {
      let idx;
      // Re-roll until we get a different quote (only skip if there's more than one).
      do {
        idx = Math.floor(Math.random() * QUOTES.length);
      } while (idx === _lastQuoteIndex && QUOTES.length > 1);
      _lastQuoteIndex = idx;
      el.textContent = `"${QUOTES[idx]}"`;
      el.classList.remove("fade-out");
    }, 250);
  },

  /* ------ Favorite presets (Pomodoro durations) ------ */

  async saveFav() {
    const name = await UI.promptText("Save these durations as a reusable preset.", {
      title: "Name this preset",
      placeholder: "e.g. Math Prep",
      confirmText: "Save preset",
    });
    if (!name?.trim()) return;

    const favs = Storage.get("fav_times", []);
    favs.push({
      name: name.trim(),
      type: this.state.type,
      config: { ...this.state.config },
      // Legacy fields for backward compatibility
      focus: this.state.config.focus,
      short: this.state.config.short,
      long: this.state.config.long,
      cycles: this.state.config.maxCycles,
    });
    Storage.set("fav_times", favs);
    this.loadFavs();
  },

  loadFavs() {
    const container = $("fav-presets-container");
    if (!container) return;

    const favs = Storage.get("fav_times", []);
    container.innerHTML = "";

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn-secondary full-width mt-16";
    saveBtn.id = "btn-save-fav";
    saveBtn.textContent = "⭐ Save Current as Preset";
    saveBtn.addEventListener("click", () => this.saveFav());
    container.appendChild(saveBtn);

    favs.forEach((f, i) => {
      const wrapper = document.createElement("div");
      wrapper.className = "fav-preset-row flex-row mt-8";
      wrapper.style.gap = "8px";

      const btn = document.createElement("button");
      btn.className = "btn-secondary mt-0";
      btn.style.flex = "1";
      const type = f.type || "pomodoro";
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const dur = type === "countdown" ? f.config?.countdown : f.focus;
      const durStr = dur ? ` (${dur}m)` : "";
      
      btn.textContent = `⭐ ${f.name} [${typeLabel}]${durStr}`;
      btn.addEventListener("click", () => {
        const partial = f.config ? f.config : { focus: f.focus, short: f.short, long: f.long, maxCycles: f.cycles };
        // Never cancel a running timer — stage it instead.
        if (this.state.isRunning) this.stagePreset(partial, type);
        else this.applyNow(partial, type);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "btn-danger mt-0";
      delBtn.style.padding = "8px 12px";
      delBtn.textContent = "✖";
      delBtn.setAttribute("aria-label", `Delete preset: ${f.name}`);
      delBtn.addEventListener("click", () => {
        favs.splice(i, 1);
        Storage.set("fav_times", favs);
        this.loadFavs();
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(delBtn);
      container.appendChild(wrapper);
    });
  },
};
