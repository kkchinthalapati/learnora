import { UI } from "./ui.js";
import { Auth, Tasks, Exams, DataAdmin } from "./api.js";
import { Timer } from "./timer.js";
import { AI } from "./ai.js";

let displayDate = new Date();
let cachedExams = [];

/**
 * ORCHESTRATOR: Initializes the app and binds all UI events.
 * This file acts as the central traffic controller for Learnora.
 */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. BOOT SEQUENCE
  UI.initTheme();
  UI.populateSettingsUI();
  UI.applyTranslations();

  const user = await Auth.getSession();

  if (user) {
    document.getElementById("auth-wall")?.classList.add("hidden");
    document.getElementById("main-app")?.classList.remove("hidden");

    const name = user.user_metadata?.full_name?.split(" ")[0] || "Student";
    const hr = new Date().getHours();
    const greetingEl = document.getElementById("user-greeting");
    if (greetingEl) {
      greetingEl.innerText = `${hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening"}, ${name}! 👋`;
    }

    initWorkspace();
  } else {
    document.getElementById("auth-wall")?.classList.remove("hidden");
    if (document.getElementById("main-app"))
      document.getElementById("main-app").style.display = "none";
  }

  // 2. AUTH BINDINGS
  document
    .getElementById("login-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.setLoading("login-btn", true);
      const ok = await Auth.login(
        document.getElementById("login-email").value,
        document.getElementById("login-password").value,
      );
      if (ok) window.location.reload();
      UI.setLoading("login-btn", false);
    });

  document
    .getElementById("signup-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      UI.setLoading("signup-btn", true);
      const ok = await Auth.signup(
        document.getElementById("signup-name").value,
        document.getElementById("signup-email").value,
        document.getElementById("signup-password").value,
        document.getElementById("signup-dob").value,
      );
      if (ok) UI.setLoading("signup-btn", false);
    });

  document.getElementById("btn-show-signup")?.addEventListener("click", () => {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("signup-form").style.display = "flex";
  });

  document.getElementById("btn-show-login")?.addEventListener("click", () => {
    document.getElementById("signup-form").style.display = "none";
    document.getElementById("login-form").style.display = "flex";
  });

  document.getElementById("btn-logout")?.addEventListener("click", Auth.logout);

  // 3. UI/TAB BINDINGS
  document
    .getElementById("btn-close-popup")
    ?.addEventListener("click", UI.hidePopup);
  document
    .getElementById("theme-toggle")
    ?.addEventListener("click", UI.toggleTheme);
  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    if (window.innerWidth <= 768) {
      // On mobile, "collapsed" actually brings it INTO view (left: 0)
      sidebar.classList.toggle("collapsed");
    } else {
      // On desktop, "collapsed" shrinks it (width: 0)
      sidebar.classList.toggle("collapsed");
    }
  });

  // Mobile UX: Auto-close sidebar when a tab is clicked
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      UI.switchTab(e.target.dataset.target);
      if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.remove("collapsed");
      }
    });
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) =>
      UI.switchTab(e.target.dataset.target),
    );
  });

  // Settings & Data
  document
    .getElementById("btn-save-settings")
    ?.addEventListener("click", () => UI.saveSettings());
  document
    .getElementById("btn-export-data")
    ?.addEventListener("click", DataAdmin.exportCSV);
  document.getElementById("btn-wipe-data")?.addEventListener("click", () => {
    if (confirm("🚨 WARNING: Permanently delete all tasks and exams?"))
      DataAdmin.wipe();
  });

  // 4. TIMER BINDINGS
  Timer.init();
  document
    .getElementById("btn-timer-start")
    ?.addEventListener("click", () => Timer.start());
  document
    .getElementById("btn-timer-pause")
    ?.addEventListener("click", () => Timer.pause());
  document
    .getElementById("btn-timer-reset")
    ?.addEventListener("click", () => Timer.reset());
  document
    .getElementById("btn-timer-extend")
    ?.addEventListener("click", () => Timer.extend());

  document.getElementById("btn-apply-timer")?.addEventListener("click", () => {
    Timer.applyConfig(
      parseInt(document.getElementById("config-focus").value || 25),
      parseInt(document.getElementById("config-short").value || 5),
      parseInt(document.getElementById("config-long").value || 15),
      parseInt(document.getElementById("config-cycles").value || 4),
    );
  });

  document.querySelectorAll(".btn-preset").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const p = e.target.dataset.preset;
      if (p === "deep") Timer.applyConfig(90, 15, 30, 4);
      if (p === "cram") Timer.applyConfig(45, 10, 20, 4);
      if (p === "light") Timer.applyConfig(20, 5, 15, 4);

      if (document.getElementById("config-focus"))
        document.getElementById("config-focus").value =
          Timer.state.config.focus;
      if (document.getElementById("config-short"))
        document.getElementById("config-short").value =
          Timer.state.config.short;
      if (document.getElementById("config-long"))
        document.getElementById("config-long").value = Timer.state.config.long;
    });
  });

  // 5. TASKS ENGINE
  async function loadTasks() {
    const tasks = await Tasks.fetch();
    const list = document.getElementById("todo-list");
    const select = document.getElementById("active-task-select");
    if (list) list.innerHTML = "";
    if (select) select.innerHTML = '<option value="None">None</option>';

    tasks.forEach((t) => {
      const li = document.createElement("li");
      li.className = `todo-item ${t.is_done ? "done" : ""}`;
      li.innerHTML = `<span>${t.text}</span> <button class="delete-btn">✖</button>`;

      li.addEventListener("click", async (e) => {
        if (e.target.tagName !== "BUTTON") {
          await Tasks.toggle(t.id, t.is_done);
          loadTasks();
        }
      });

      li.querySelector("button").addEventListener("click", async (e) => {
        e.stopPropagation();
        li.style.opacity = 0;
        await Tasks.delete(t.id);
        setTimeout(loadTasks, 300);
      });

      list.appendChild(li);
      if (!t.is_done && select)
        select.innerHTML += `<option value="${t.text}">${t.text}</option>`;
    });
  }

  document
    .getElementById("btn-add-todo")
    ?.addEventListener("click", async () => {
      const input = document.getElementById("todo-input");
      if (input && input.value.trim()) {
        await Tasks.add(input.value.trim());
        input.value = "";
        loadTasks();
      }
    });

  document.getElementById("todo-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btn-add-todo")?.click();
  });

  // 6. CALENDAR & EXAM LOGIC
  async function loadCalendar() {
    cachedExams = await Exams.fetch();
    renderCalendar();
    renderDashboard();
  }

  function renderCalendar() {
    const grid = document.getElementById("calendar-days");
    const title = document.getElementById("month-year-display");
    if (!grid || !title) return;

    grid.innerHTML = "";
    const y = displayDate.getFullYear(),
      m = displayDate.getMonth();
    const mNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    title.innerText = `${mNames[m]} ${y}`;

    const firstDay = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++)
      grid.innerHTML += `<div class="calendar-day-cell empty"></div>`;

    for (let d = 1; d <= totalDays; d++) {
      const cell = document.createElement("div");
      cell.className = `calendar-day-cell ${d === today.getDate() && m === today.getMonth() && y === today.getFullYear() ? "today" : ""}`;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cell.innerHTML = `<span class="day-number">${d}</span>`;

      cachedExams
        .filter((e) => e.exam_date === dateStr)
        .forEach((e) => {
          const bar = document.createElement("div");
          bar.className = `exam-bar diff-${e.difficulty.toLowerCase()} status-${e.status.toLowerCase()}`;
          bar.innerText = e.exam_name;
          bar.onclick = (evt) => {
            evt.stopPropagation();
            openModal(e);
          };
          cell.appendChild(bar);
        });
      cell.onclick = () => openModal(null, dateStr);
      grid.appendChild(cell);
    }
  }

  document.getElementById("btn-prev-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("btn-next-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() + 1);
    renderCalendar();
  });

  function openModal(exam = null, dateStr = "") {
    document.getElementById("exam-modal")?.classList.remove("hidden");
    if (exam) {
      document.getElementById("modal-exam-title").innerText = "Edit Exam";
      document.getElementById("modal-exam-id").value = exam.id;
      document.getElementById("exam-name").value = exam.exam_name;
      document.getElementById("exam-date").value = exam.exam_date;
      document.getElementById("exam-difficulty").value = exam.difficulty;
      document.getElementById("exam-status").value = exam.status;
      document.getElementById("btn-delete-exam").classList.remove("hidden");
    } else {
      document.getElementById("modal-exam-title").innerText = "New Exam";
      document.getElementById("exam-form").reset();
      document.getElementById("modal-exam-id").value = "";
      document.getElementById("exam-date").value = dateStr;
      document.getElementById("btn-delete-exam").classList.add("hidden");
    }
  }

  document
    .getElementById("btn-cancel-exam")
    ?.addEventListener("click", () =>
      document.getElementById("exam-modal")?.classList.add("hidden"),
    );

  document
    .getElementById("exam-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ok = await Exams.save(
        {
          exam_name: document.getElementById("exam-name").value,
          exam_date: document.getElementById("exam-date").value,
          difficulty: document.getElementById("exam-difficulty").value,
          status: document.getElementById("exam-status").value,
        },
        document.getElementById("modal-exam-id").value || null,
      );

      if (ok) {
        document.getElementById("exam-modal").classList.add("hidden");
        loadCalendar();
      }
    });

  document
    .getElementById("btn-delete-exam")
    ?.addEventListener("click", async () => {
      if (confirm("Remove this exam?")) {
        await Exams.delete(document.getElementById("modal-exam-id").value);
        document.getElementById("exam-modal").classList.add("hidden");
        loadCalendar();
      }
    });

  // 7. DASHBOARD LOGS
  function renderDashboard() {
    const logs = JSON.parse(localStorage.getItem("sessions")) || [];
    const list = document.getElementById("log-list");
    let mins = 0;
    if (list) {
      list.innerHTML = logs.length
        ? ""
        : "<li><span class='opacity-70'>No sessions logged.</span></li>";
      logs.forEach((log) => {
        mins += log.minutes || 0;
        list.innerHTML += `<li class="log-item"><span><strong class="text-primary">${log.minutes}m Focus</strong> ${log.task !== "General Study" ? ` on ${log.task}` : ""}</span> <span class="opacity-70">${log.timestamp}</span></li>`;
      });
    }
    if (document.getElementById("total-hours-display"))
      document.getElementById("total-hours-display").innerHTML =
        `${(mins / 60).toFixed(1)} <span>hours</span>`;

    const upcoming = document.getElementById("upcoming-exams-display");
    if (upcoming) {
      const next = cachedExams
        .filter((e) => e.status !== "Completed")
        .slice(0, 3);
      upcoming.innerHTML = next.length
        ? next
            .map(
              (e) =>
                `<div><span>📅 ${e.exam_name}</span> <span class="opacity-70" style="float:right;">${e.exam_date}</span></div>`,
            )
            .join("")
        : `<div class="opacity-70">No upcoming exams.</div>`;
    }
  }
  window.addEventListener("sessionLogged", renderDashboard);

  // 8. AI BINDINGS
  document
    .getElementById("nav-ai-trigger")
    ?.addEventListener("click", () =>
      document.getElementById("turbo-chat")?.classList.remove("hidden"),
    );
  document
    .getElementById("turbo-toggle")
    ?.addEventListener("click", () =>
      document.getElementById("turbo-chat")?.classList.remove("hidden"),
    );
  document
    .getElementById("btn-ai-close")
    ?.addEventListener("click", () =>
      document.getElementById("turbo-chat")?.classList.add("hidden"),
    );
  document
    .getElementById("btn-ai-fullscreen")
    ?.addEventListener("click", () => {
      const m = document.getElementById("turbo-chat");
      m.classList.toggle("fullscreen");
      m.classList.toggle("minimized");
    });

  document.getElementById("btn-send-chat")?.addEventListener("click", () => {
    const i = document.getElementById("chat-input");
    if (i.value.trim() || AI.currentFile) {
      AI.send(i.value || "Analyze this.");
      i.value = "";
    }
  });

  document.getElementById("chat-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("btn-send-chat").click();
  });
  document.getElementById("file-upload")?.addEventListener("change", (e) => {
    if (e.target.files[0]) AI.processFile(e.target.files[0]);
  });
  document
    .getElementById("btn-remove-file")
    ?.addEventListener("click", () => AI.setFile(null));

  function initWorkspace() {
    loadTasks();
    loadCalendar();
    Timer.init();
    AI.initDragDrop();
    setInterval(() => {
      const c = document.getElementById("live-clock");
      if (c)
        c.innerText = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
    }, 1000);
  }
});
