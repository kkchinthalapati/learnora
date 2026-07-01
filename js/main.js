import { UI, $, $$, esc, Storage } from "./ui.js";
import { Auth, Tasks, Exams, DataAdmin } from "./api.js";
import { Timer } from "./timer.js";
import { AI } from "./ai.js";
import { Router } from "./router.js";

/* =========================================================================
   STATE
   ========================================================================= */

let displayDate = new Date();
let cachedExams = [];

/* =========================================================================
   HELPERS
   ========================================================================= */

function getGreeting(name) {
  const hr = new Date().getHours();
  const period = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}! 👋`;
}

function formatDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* =========================================================================
   BOOT
   ========================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  UI.initTheme();
  UI.populateSettingsUI();
  UI.applyTranslations();

  const user = await Auth.getSession();

  if (user) {
    $("auth-wall")?.classList.add("hidden");
    $("main-app")?.classList.remove("hidden");

    const name = user.user_metadata?.full_name?.split(" ")[0] || "Student";
    const greetingEl = $("user-greeting");
    if (greetingEl) greetingEl.textContent = getGreeting(name);

    Router.init();
    initWorkspace();
  } else {
    $("auth-wall")?.classList.remove("hidden");
    const mainApp = $("main-app");
    if (mainApp) mainApp.style.display = "none";
  }

  bindAuth();
  bindNavigation();
  bindSettings();
  bindTimer();
  bindTasks();
  bindCalendar();
  bindAI();
});

/* =========================================================================
   AUTH BINDINGS
   ========================================================================= */

function bindAuth() {
  let signingUp = false;
  let loggingIn = false;

  $("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loggingIn) return;
    loggingIn = true;
    UI.setLoading("login-btn", true);
    try {
      const ok = await Auth.login(
        $("login-email").value.trim(),
        $("login-password").value,
      );
      if (ok) {
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error("[Auth.login] Unhandled:", err);
      UI.showPopup("Something went wrong. Please try again.", "Login Error");
    }
    UI.setLoading("login-btn", false);
    loggingIn = false;
  });

  $("signup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (signingUp) return;
    signingUp = true;
    UI.setLoading("signup-btn", true);
    try {
      const ok = await Auth.signup(
        $("signup-name").value.trim(),
        $("signup-email").value.trim(),
        $("signup-password").value,
        $("signup-dob").value,
      );
      if (ok) {
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error("[Auth.signup] Unhandled:", err);
      UI.showPopup("Something went wrong. Please try again.", "Signup Error");
    }
    UI.setLoading("signup-btn", false);
    signingUp = false;
  });

  $("btn-show-signup")?.addEventListener("click", () => {
    $("login-form")?.classList.add("hidden");
    $("signup-form")?.classList.remove("hidden");
  });

  $("btn-show-login")?.addEventListener("click", () => {
    $("signup-form")?.classList.add("hidden");
    $("login-form")?.classList.remove("hidden");
  });

  $("btn-logout")?.addEventListener("click", Auth.logout);
}

/* =========================================================================
   NAVIGATION BINDINGS
   ========================================================================= */

function bindNavigation() {
  $("btn-close-popup")?.addEventListener("click", UI.hidePopup);
  $("theme-toggle")?.addEventListener("click", () => UI.toggleTheme());

  $("menu-toggle")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("collapsed");
  });

  // Auto-close sidebar on mobile when a nav link is clicked
  document.querySelector(".nav-links")?.addEventListener("click", (e) => {
    if (e.target.closest("a.nav-link")) {
      if (window.innerWidth <= 768) {
        $("sidebar")?.classList.remove("collapsed");
      }
    }
  });
}

/* =========================================================================
   SETTINGS BINDINGS
   ========================================================================= */

function bindSettings() {
  $("btn-save-settings")?.addEventListener("click", () => UI.saveSettings());
  $("btn-export-data")?.addEventListener("click", DataAdmin.exportCSV);

  $("btn-wipe-data")?.addEventListener("click", () => {
    if (confirm("🚨 WARNING: Permanently delete all tasks and exams?")) {
      DataAdmin.wipe();
    }
  });
}

/* =========================================================================
   TIMER BINDINGS
   ========================================================================= */

function bindTimer() {
  Timer.init();

  $("btn-timer-start")?.addEventListener("click", () => Timer.start());
  $("btn-timer-pause")?.addEventListener("click", () => Timer.pause());
  $("btn-timer-reset")?.addEventListener("click", () => Timer.reset());
  $("btn-timer-extend")?.addEventListener("click", () => Timer.extend());

  $("btn-apply-timer")?.addEventListener("click", () => {
    Timer.applyConfig(
      parseInt($("config-focus")?.value || "25", 10),
      parseInt($("config-short")?.value || "5", 10),
      parseInt($("config-long")?.value || "15", 10),
      parseInt($("config-cycles")?.value || "4", 10),
    );
  });

  // Presets — event delegation
  document.querySelector(".preset-buttons")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-preset");
    if (!btn) return;
    const presets = {
      deep: [90, 15, 30, 4],
      cram: [45, 10, 20, 4],
      light: [20, 5, 15, 4],
    };
    const p = presets[btn.dataset.preset];
    if (p) Timer.applyConfig(...p);
  });
}

/* =========================================================================
   TASKS ENGINE
   ========================================================================= */

let _taskLoadDebounce = null;

async function loadTasks() {
  const tasks = await Tasks.fetch();
  const list = $("todo-list");
  const select = $("active-task-select");
  if (!list) return;

  const selectedValue = select ? select.value : "None";

  list.innerHTML = "";

  if (tasks.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "todo-item";
    emptyLi.style.justifyContent = "center";
    emptyLi.style.opacity = "0.6";
    emptyLi.style.cursor = "default";
    emptyLi.textContent = "No tasks yet — add one above!";
    list.appendChild(emptyLi);
  }

  if (select) select.innerHTML = '<option value="None">None</option>';

  tasks.forEach((t) => {
    const li = document.createElement("li");
    li.className = `todo-item${t.is_done ? " done" : ""}`;
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", t.is_done ? "true" : "false");
    li.setAttribute("tabindex", "0");

    const span = document.createElement("span");
    span.textContent = t.text;
    span.className = "todo-text";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "✖";
    delBtn.setAttribute("aria-label", `Delete task: ${t.text}`);
    delBtn.setAttribute("tabindex", "0");

    li.appendChild(span);
    li.appendChild(delBtn);

    // Toggle done (Optimistic update)
    const toggleDone = async () => {
      li.classList.toggle("done");
      li.setAttribute("aria-checked", li.classList.contains("done") ? "true" : "false");
      li.style.pointerEvents = "none";
      
      const ok = await Tasks.toggle(t.id, t.is_done);
      li.style.pointerEvents = "";
      if (!ok) {
        li.classList.toggle("done");
        li.setAttribute("aria-checked", t.is_done ? "true" : "false");
        UI.showPopup("Failed to toggle task status.", "Connection Error");
      } else {
        t.is_done = !t.is_done;
      }
      loadTasks();
    };

    li.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      toggleDone();
    });

    li.addEventListener("keydown", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleDone();
      }
    });

    // Double-click inline edit
    span.addEventListener("dblclick", () => {
      if (t.is_done) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "todo-edit-input";
      input.value = t.text;
      input.setAttribute("aria-label", "Edit task text");

      let hasSaved = false;
      const saveEdit = async () => {
        if (hasSaved) return;
        hasSaved = true;

        const newText = input.value.trim();
        if (newText && newText !== t.text) {
          span.textContent = newText;
          const ok = await Tasks.updateText(t.id, newText);
          if (!ok) {
            span.textContent = t.text;
            UI.showPopup("Failed to edit task name.", "Error");
          } else {
            t.text = newText;
          }
        }
        input.replaceWith(span);
        loadTasks();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveEdit();
        } else if (e.key === "Escape") {
          hasSaved = true;
          input.replaceWith(span);
        }
      });

      input.addEventListener("blur", () => {
        saveEdit();
      });

      span.replaceWith(input);
      input.focus();
    });

    // Delete
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      li.style.opacity = "0";
      li.style.transform = "translateX(20px)";
      const ok = await Tasks.delete(t.id);
      if (!ok) {
        li.style.opacity = "";
        li.style.transform = "";
        UI.showPopup("Failed to delete task.", "Error");
      } else {
        setTimeout(loadTasks, 250);
      }
    });

    delBtn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.stopPropagation();
        delBtn.click();
      }
    });

    list.appendChild(li);

    if (!t.is_done && select) {
      const opt = document.createElement("option");
      opt.value = t.text;
      opt.textContent = t.text;
      select.appendChild(opt);
    }
  });

  if (select) {
    const exists = Array.from(select.options).some((o) => o.value === selectedValue);
    if (exists) {
      select.value = selectedValue;
    } else {
      select.value = "None";
    }
  }
}

function bindTasks() {
  $("btn-add-todo")?.addEventListener("click", async () => {
    const input = $("todo-input");
    const text = input?.value.trim();
    if (!text) return;
    input.value = "";
    await Tasks.add(text);
    loadTasks();
  });

  $("todo-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("btn-add-todo")?.click();
    }
  });
}

/* =========================================================================
   CALENDAR & EXAM LOGIC
   ========================================================================= */

async function loadCalendar() {
  cachedExams = await Exams.fetch();
  renderCalendar();
  renderDashboard();
}

function renderCalendar() {
  const grid = $("calendar-days");
  const title = $("month-year-display");
  if (!grid || !title) return;

  grid.innerHTML = "";
  const y = displayDate.getFullYear();
  const m = displayDate.getMonth();
  title.textContent = `${MONTH_NAMES[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day-cell empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateStr(y, m, d);
    const isToday = dateStr === todayStr;

    const cell = document.createElement("div");
    cell.className = `calendar-day-cell${isToday ? " today" : ""}`;
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${MONTH_NAMES[m]} ${d}, ${y}`);

    const dayNum = document.createElement("span");
    dayNum.className = "day-number";
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    const examsForDate = cachedExams.filter((e) => e.exam_date === dateStr);
    const maxExamsToShow = 2;

    examsForDate.slice(0, maxExamsToShow).forEach((exam) => {
      const bar = document.createElement("div");
      bar.className = `exam-bar diff-${exam.difficulty.toLowerCase()} status-${exam.status.toLowerCase()}`;
      bar.textContent = exam.exam_name;
      bar.addEventListener("click", (evt) => {
        evt.stopPropagation();
        openExamModal(exam);
      });
      cell.appendChild(bar);
    });

    if (examsForDate.length > maxExamsToShow) {
      const overflowCount = examsForDate.length - maxExamsToShow;
      const overflowBadge = document.createElement("div");
      overflowBadge.className = "calendar-overflow-badge";
      overflowBadge.textContent = `+${overflowCount} more`;
      cell.appendChild(overflowBadge);
    }

    const openNewExam = () => openExamModal(null, dateStr);
    cell.addEventListener("click", openNewExam);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openNewExam();
      }
    });

    grid.appendChild(cell);
  }
}

function openExamModal(exam = null, dateStr = "") {
  const modal = $("exam-modal");
  modal?.classList.remove("hidden");

  if (exam) {
    $("modal-exam-title").textContent = "Edit Exam";
    $("modal-exam-id").value = exam.id;
    $("exam-name").value = exam.exam_name;
    $("exam-date").value = exam.exam_date;
    $("exam-difficulty").value = exam.difficulty;
    $("exam-status").value = exam.status;
    $("btn-delete-exam")?.classList.remove("hidden");
  } else {
    $("modal-exam-title").textContent = "New Exam";
    $("exam-form")?.reset();
    $("modal-exam-id").value = "";
    $("exam-date").value = dateStr;
    $("btn-delete-exam")?.classList.add("hidden");
  }

  // Auto-focus the name field
  requestAnimationFrame(() => $("exam-name")?.focus());
}

function bindCalendar() {
  $("btn-prev-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() - 1);
    renderCalendar();
  });

  $("btn-next-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() + 1);
    renderCalendar();
  });

  $("btn-cancel-exam")?.addEventListener("click", () => {
    $("exam-modal")?.classList.add("hidden");
  });

  // Close modal on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("exam-modal")?.classList.add("hidden");
      $("popup-overlay")?.classList.add("hidden");
    }
  });

  $("exam-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await Exams.save(
      {
        exam_name: $("exam-name").value,
        exam_date: $("exam-date").value,
        difficulty: $("exam-difficulty").value,
        status: $("exam-status").value,
      },
      $("modal-exam-id").value || null,
    );
    if (ok) {
      $("exam-modal")?.classList.add("hidden");
      loadCalendar();
    }
  });

  $("btn-delete-exam")?.addEventListener("click", async () => {
    if (confirm("Remove this exam?")) {
      await Exams.delete($("modal-exam-id").value);
      $("exam-modal")?.classList.add("hidden");
      loadCalendar();
    }
  });
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */

function renderDashboard() {
  const sessions = Storage.get("sessions", []);
  const list = $("log-list");
  let totalMins = 0;

  if (list) {
    list.innerHTML = "";

    if (sessions.length === 0) {
      const li = document.createElement("li");
      li.innerHTML = "<span class='opacity-70'>No sessions logged yet. Start the timer!</span>";
      list.appendChild(li);
    } else {
      sessions.forEach((log) => {
        totalMins += log.minutes || 0;
        const li = document.createElement("li");
        li.className = "log-item";

        const left = document.createElement("span");
        left.innerHTML = `<strong class="text-primary">${esc(String(log.minutes))}m Focus</strong>${
          log.task !== "General Study" ? ` on ${esc(log.task)}` : ""
        }`;

        const right = document.createElement("span");
        right.className = "opacity-70";
        right.textContent = log.timestamp;

        li.appendChild(left);
        li.appendChild(right);
        list.appendChild(li);
      });
    }
  }

  const totalDisplay = $("total-hours-display");
  if (totalDisplay) {
    totalDisplay.innerHTML = `${(totalMins / 60).toFixed(1)} <span>hours</span>`;
  }

  // Upcoming exams widget
  const upcoming = $("upcoming-exams-display");
  if (upcoming) {
    const now = new Date().toISOString().slice(0, 10);
    const next = cachedExams
      .filter((e) => e.status !== "Completed" && e.exam_date >= now)
      .slice(0, 3);

    upcoming.innerHTML = "";
    if (next.length === 0) {
      upcoming.innerHTML = '<div class="opacity-70">No upcoming exams.</div>';
    } else {
      next.forEach((e) => {
        const row = document.createElement("div");
        row.innerHTML = `<span>📅 ${esc(e.exam_name)}</span> <span class="opacity-70" style="float:right;">${esc(e.exam_date)}</span>`;
        upcoming.appendChild(row);
      });
    }
  }
}

/* =========================================================================
   AI BINDINGS
   ========================================================================= */

function bindAI() {
  $("nav-ai-trigger")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.remove("hidden");
  });

  $("turbo-toggle")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.remove("hidden");
  });

  $("btn-ai-close")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.add("hidden");
  });

  $("btn-ai-fullscreen")?.addEventListener("click", () => {
    const m = $("turbo-chat");
    if (!m) return;
    m.classList.toggle("fullscreen");
    m.classList.toggle("minimized");
  });

  $("btn-send-chat")?.addEventListener("click", () => {
    const input = $("chat-input");
    if (!input) return;
    if (input.value.trim() || AI.currentFile) {
      AI.send(input.value || "Analyze this.");
      input.value = "";
    }
  });

  $("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("btn-send-chat")?.click();
    }
  });

  $("file-upload")?.addEventListener("change", (e) => {
    if (e.target.files?.[0]) AI.processFile(e.target.files[0]);
  });

  $("btn-remove-file")?.addEventListener("click", () => AI.setFile(null));
}

/* =========================================================================
   WORKSPACE INIT
   ========================================================================= */

function initWorkspace() {
  loadTasks();
  loadCalendar();
  Timer.init();
  AI.initDragDrop();
  startClock();
  window.addEventListener("sessionLogged", renderDashboard);
}

function startClock() {
  const clock = $("live-clock");
  if (!clock) return;

  const update = () => {
    clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  update();
  setInterval(update, 30000); // 30s is enough for HH:MM display
}
