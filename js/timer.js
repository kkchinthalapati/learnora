import { UI } from "./ui.js";

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

  quotes: [
    "Focus on the step in front of you.",
    "Don't stop until you're proud.",
    "Small progress is still progress.",
  ],

  init() {
    const saved = JSON.parse(localStorage.getItem("timer_state"));
    if (saved) {
      this.state.config = saved.config || this.state.config;
      this.state.mode = saved.mode || "Focus";
      this.state.totalTime = saved.totalTime || this.state.config.focus * 60;
      this.state.cycles = saved.cycles || 0;

      const endTime = localStorage.getItem("timer_end_time");
      if (saved.isRunning && endTime && parseInt(endTime) > Date.now()) {
        this.state.targetEndTime = parseInt(endTime);
        this.state.timeLeft = Math.round(
          (this.state.targetEndTime - Date.now()) / 1000,
        );
        this.start();
      } else {
        this.state.timeLeft = saved.timeLeft ?? this.state.totalTime;
      }
    }
    this.updateUI();
    this.randomizeQuote();
    this.loadFavs();
  },

  save() {
    localStorage.setItem(
      "timer_state",
      JSON.stringify({
        isRunning: this.state.isRunning,
        timeLeft: this.state.timeLeft,
        mode: this.state.mode,
        totalTime: this.state.totalTime,
        cycles: this.state.cycles,
        config: this.state.config,
      }),
    );
  },

  applyConfig(f, s, l, c) {
    this.state.config = { focus: f, short: s, long: l, maxCycles: c };
    this.reset();
  },

  start() {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.targetEndTime = Date.now() + this.state.timeLeft * 1000;
    localStorage.setItem("timer_end_time", this.state.targetEndTime);
    this.save();

    this.state.interval = setInterval(() => {
      this.state.timeLeft = Math.max(
        0,
        Math.round((this.state.targetEndTime - Date.now()) / 1000),
      );
      if (this.state.timeLeft <= 0) this.handleEnd();
      else this.updateUI();
    }, 1000);
  },

  pause() {
    if (!this.state.isRunning) return;
    clearInterval(this.state.interval);
    this.state.isRunning = false;
    this.state.targetEndTime = null;
    localStorage.removeItem("timer_end_time");
    this.save();
    this.updateUI();
  },

  reset() {
    clearInterval(this.state.interval);
    this.state.isRunning = false;
    this.state.mode = "Focus";
    this.state.timeLeft = this.state.config.focus * 60;
    this.state.totalTime = this.state.timeLeft;
    this.state.cycles = 0;
    this.state.targetEndTime = null;
    localStorage.removeItem("timer_end_time");
    this.save();
    this.updateUI();
  },

  extend() {
    this.state.timeLeft += 5 * 60;
    this.state.totalTime += 5 * 60;
    if (this.state.isRunning) {
      this.state.targetEndTime += 5 * 60 * 1000;
      localStorage.setItem("timer_end_time", this.state.targetEndTime);
    }
    this.save();
    this.updateUI();
  },

  handleEnd() {
    this.pause();
    if (this.state.mode === "Focus") {
      this.logSession(this.state.config.focus);
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
    UI.showPopup(`${this.state.mode} time started!`, "Timer Finished");
    this.updateUI();
    this.randomizeQuote();
  },

  logSession(mins) {
    let logs = JSON.parse(localStorage.getItem("sessions")) || [];
    const taskEl = document.getElementById("active-task-select");
    const taskName =
      taskEl && taskEl.value !== "None" ? taskEl.value : "General Study";
    const ts = new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    logs.unshift({
      id: Date.now(),
      timestamp: ts,
      minutes: mins,
      task: taskName,
    });
    localStorage.setItem("sessions", JSON.stringify(logs));
    window.dispatchEvent(new Event("sessionLogged"));
  },

  updateUI() {
    const m = Math.floor(this.state.timeLeft / 60)
      .toString()
      .padStart(2, "0");
    const s = (this.state.timeLeft % 60).toString().padStart(2, "0");
    if (document.getElementById("time-display"))
      document.getElementById("time-display").innerText = `${m}:${s}`;
    if (document.getElementById("timer-mode-label"))
      document.getElementById("timer-mode-label").innerText =
        `${this.state.mode} Mode`;
    if (document.getElementById("cycle-counter"))
      document.getElementById("cycle-counter").innerText =
        `Cycle: ${this.state.cycles} / ${this.state.config.maxCycles}`;
    if (document.getElementById("timer-progress"))
      document.getElementById("timer-progress").style.width =
        `${((this.state.totalTime - this.state.timeLeft) / this.state.totalTime) * 100}%`;
  },

  randomizeQuote() {
    const q = this.quotes[Math.floor(Math.random() * this.quotes.length)];
    if (document.getElementById("quote-display"))
      document.getElementById("quote-display").innerText = `"${q}"`;
  },

  saveFav() {
    const name = prompt("Name this preset (e.g., Math Prep):");
    if (!name) return;
    const favs = JSON.parse(localStorage.getItem("fav_times")) || [];
    favs.push({
      name,
      focus: this.state.config.focus,
      short: this.state.config.short,
      long: this.state.config.long,
      cycles: this.state.config.maxCycles,
    });
    localStorage.setItem("fav_times", JSON.stringify(favs));
    this.loadFavs();
  },

  loadFavs() {
    const container = document.getElementById("fav-presets-container");
    if (!container) return;
    const favs = JSON.parse(localStorage.getItem("fav_times")) || [];
    container.innerHTML = `<button class="btn-secondary full-width mt-16" id="btn-save-fav">⭐ Save Current as Preset</button>`;
    document.getElementById("btn-save-fav").onclick = () => this.saveFav();

    favs.forEach((f, i) => {
      const btn = document.createElement("button");
      btn.className = "btn-secondary full-width mt-8";
      btn.innerText = `⭐ ${f.name} (${f.focus}m)`;
      btn.onclick = () => {
        this.applyConfig(f.focus, f.short, f.long, f.cycles);
        document.getElementById("config-focus").value = f.focus;
        document.getElementById("config-short").value = f.short;
        document.getElementById("config-long").value = f.long;
      };
      container.appendChild(btn);
    });
  },
};
