import { UI, $, Storage } from "./ui.js";

/* =========================================================================
   CONSTANTS
   ========================================================================= */

const TIMER_STATE_KEY = "timer_state";
const TIMER_END_KEY = "timer_end_time";

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
   ========================================================================= */

export const Timer = {
  state: {
    interval: null,
    isRunning: false,
    mode: "Focus",
    timeLeft: 25 * 60,
    totalTime: 25 * 60,
    targetEndTime: null,
    cycles: 0,
    config: { focus: 25, short: 5, long: 15, maxCycles: 4 },
  },

  /* ------ Lifecycle ------ */

  init() {
    const saved = Storage.get(TIMER_STATE_KEY);
    if (saved) {
      this.state.config = { ...this.state.config, ...saved.config };
      this.state.mode = saved.mode || "Focus";
      this.state.totalTime = saved.totalTime || this.state.config.focus * 60;
      this.state.cycles = saved.cycles || 0;

      const endTime = localStorage.getItem(TIMER_END_KEY);
      if (saved.isRunning && endTime) {
        if (parseInt(endTime, 10) > Date.now()) {
          this.state.targetEndTime = parseInt(endTime, 10);
          this.state.timeLeft = Math.round((this.state.targetEndTime - Date.now()) / 1000);
          this.start();
        } else {
          // Timer completed while offline
          this.state.targetEndTime = parseInt(endTime, 10);
          this.state.timeLeft = 0;
          this._handleEnd();
        }
      } else {
        this.state.timeLeft = saved.timeLeft ?? this.state.totalTime;
        this.state.isRunning = false;
      }
    }
    this._syncConfigInputs();
    this.updateUI();
    this.randomizeQuote();
    this.loadFavs();
  },

  save() {
    Storage.set(TIMER_STATE_KEY, {
      isRunning: this.state.isRunning,
      timeLeft: this.state.timeLeft,
      mode: this.state.mode,
      totalTime: this.state.totalTime,
      cycles: this.state.cycles,
      config: this.state.config,
    });
  },

  /* ------ Configuration ------ */

  applyConfig(f, s, l, c) {
    this.state.config = {
      focus: Math.max(1, f),
      short: Math.max(1, s),
      long: Math.max(1, l),
      maxCycles: Math.max(1, c),
    };
    this.reset();
    this._syncConfigInputs();
  },

  _syncConfigInputs() {
    const map = {
      "config-focus": this.state.config.focus,
      "config-short": this.state.config.short,
      "config-long": this.state.config.long,
      "config-cycles": this.state.config.maxCycles,
    };
    for (const [id, value] of Object.entries(map)) {
      const el = $(id);
      if (el) el.value = value;
    }
  },

  /* ------ Controls ------ */

  start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.targetEndTime = Date.now() + this.state.timeLeft * 1000;
    localStorage.setItem(TIMER_END_KEY, String(this.state.targetEndTime));
    this.save();

    this.state.interval = setInterval(() => {
      this.state.timeLeft = Math.max(
        0,
        Math.round((this.state.targetEndTime - Date.now()) / 1000),
      );
      if (this.state.timeLeft <= 0) {
        this._handleEnd();
      } else {
        this.updateUI();
      }
    }, 1000);
    this.updateUI();
  },

  pause() {
    if (!this.state.isRunning) return;
    clearInterval(this.state.interval);
    this.state.interval = null;
    this.state.isRunning = false;
    this.state.targetEndTime = null;
    localStorage.removeItem(TIMER_END_KEY);
    this.save();
    this.updateUI();
  },

  reset() {
    clearInterval(this.state.interval);
    this.state.interval = null;
    this.state.isRunning = false;
    this.state.mode = "Focus";
    this.state.timeLeft = this.state.config.focus * 60;
    this.state.totalTime = this.state.timeLeft;
    this.state.cycles = 0;
    this.state.targetEndTime = null;
    localStorage.removeItem(TIMER_END_KEY);
    this.save();
    this.updateUI();
  },

  extend() {
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

  /* ------ End-of-period transition ------ */

  _handleEnd() {
    this.pause();

    if (this.state.mode === "Focus") {
      this._logSession(this.state.config.focus);
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

    const modeLabel = this.state.mode === "Focus"
      ? "Focus"
      : this.state.mode === "ShortBreak"
        ? "Short Break"
        : "Long Break";
    UI.showPopup(`${modeLabel} time started!`, "Timer Finished");

    this._tryNotify(modeLabel);
    this.updateUI();
    this.randomizeQuote();
  },

  /* ------ Session logging ------ */

  _logSession(mins) {
    const sessions = Storage.get("sessions", []);
    const taskEl = $("active-task-select");
    const taskName = taskEl && taskEl.value !== "None" ? taskEl.value : "General Study";
    const ts = new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    sessions.unshift({
      id: Date.now(),
      timestamp: ts,
      minutes: mins,
      task: taskName,
    });

    // Keep a reasonable cap
    if (sessions.length > 500) sessions.length = 500;

    Storage.set("sessions", sessions);
    window.dispatchEvent(new Event("sessionLogged"));
  },

  /* ------ Browser notifications ------ */

  _tryNotify(label) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("Learnora", { body: `${label} time! Let's go.`, icon: "learnora.jpg" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  },

  /* ------ UI rendering ------ */

  updateUI() {
    const m = String(Math.floor(this.state.timeLeft / 60)).padStart(2, "0");
    const s = String(this.state.timeLeft % 60).padStart(2, "0");

    const timeEl = $("time-display");
    const modeEl = $("timer-mode-label");
    const cycleEl = $("cycle-counter");
    const progressEl = $("timer-progress");
    const startBtn = $("btn-timer-start");
    const pauseBtn = $("btn-timer-pause");

    if (timeEl) timeEl.textContent = `${m}:${s}`;
    if (modeEl) {
      const label = this.state.mode === "Focus"
        ? "Focus"
        : this.state.mode === "ShortBreak"
          ? "Short Break"
          : "Long Break";
      modeEl.textContent = `${label} Mode`;
    }
    if (cycleEl) {
      cycleEl.textContent = `Cycle: ${this.state.cycles} / ${this.state.config.maxCycles}`;
    }
    if (progressEl) {
      const pct = this.state.totalTime > 0
        ? ((this.state.totalTime - this.state.timeLeft) / this.state.totalTime) * 100
        : 0;
      progressEl.style.width = `${pct}%`;
    }

    // Update circular SVG ring
    const ringEl = document.getElementById("timer-ring-progress");
    if (ringEl) {
      const circumference = 2 * Math.PI * 90; // r=90
      const progress = this.state.totalTime > 0
        ? (this.state.totalTime - this.state.timeLeft) / this.state.totalTime
        : 0;
      ringEl.style.strokeDashoffset = circumference * (1 - progress);
    }

    // Toggle start/pause button visibility
    if (startBtn) startBtn.classList.toggle("hidden", this.state.isRunning);
    if (pauseBtn) pauseBtn.classList.toggle("hidden", !this.state.isRunning);
  },

  randomizeQuote() {
    const el = $("quote-display");
    if (!el) return;
    el.classList.add("fade-out");
    setTimeout(() => {
      el.textContent = `"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"`;
      el.classList.remove("fade-out");
    }, 250);
  },

  /* ------ Favorite presets ------ */

  saveFav() {
    const name = prompt("Name this preset (e.g., Math Prep):");
    if (!name?.trim()) return;

    const favs = Storage.get("fav_times", []);
    favs.push({
      name: name.trim(),
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

    // Save button
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
      btn.textContent = `⭐ ${f.name} (${f.focus}m)`;
      btn.addEventListener("click", () => {
        this.applyConfig(f.focus, f.short, f.long, f.cycles);
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
