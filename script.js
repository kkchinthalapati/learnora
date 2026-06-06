import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { translations } from "./i18n.js";

const supabaseUrl = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const supabaseKey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE VARIABLES ---
window.currentAiFile = null;
let todos = [];
let sessionLogs = JSON.parse(localStorage.getItem("sessions")) || [];
let cachedExams = [];
let currentDisplayDate = new Date();
let appInitialized = false; // Prevents double-fetching data

// ==========================================
// APP INITIALIZATION & AUTH (GHOST-PROOF)
// ==========================================

function updateAuthUI(session) {
  const wall = document.getElementById("auth-wall");
  const app = document.getElementById("main-app");

  if (session) {
    if (wall) wall.style.display = "none";
    if (app) app.style.display = "flex";

    // Only load data once per login
    if (!appInitialized) {
      initializeAppData();
      appInitialized = true;
    }
  } else {
    if (wall) wall.style.display = "flex";
    if (app) app.style.display = "none";
    appInitialized = false;
  }
}

// 1. Initial Boot Check (Runs once when page loads)
async function checkSessionAndBoot() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    // Hard network check: Verify the user still exists in the database
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      console.warn("Ghost session detected. Purging local cache...");
      await supabase.auth.signOut();
      localStorage.clear(); // Nuke all browser data
      updateAuthUI(null);
      return;
    }
  }
  updateAuthUI(session);
}

// Fire the boot sequence
checkSessionAndBoot();

// 2. Listen for active login/logout clicks
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
    updateAuthUI(session);
  }
});

function initializeAppData() {
  fetchTodos();
  initializeCalendar();
  loadSettingsToUI();
  applyTranslations();
  restoreTimerState();
  loadFavoriteTimes();
  renderLogs();
}

// --- AUTH ACTIONS ---
window.handleLogin = async function () {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showNotification("Login failed: " + error.message);
};

window.handleSignup = async function () {
  const name = document.getElementById("signup-name").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) showNotification("Signup failed: " + error.message);
  else showNotification("Check your email for confirmation!", "success");
};

window.switchAuth = function (view) {
  document.getElementById("login-view").style.display =
    view === "login" ? "flex" : "none";
  document.getElementById("signup-view").style.display =
    view === "signup" ? "flex" : "none";
};

// ==========================================
// CONFIGURATION ENGINE & SETTINGS
// ==========================================
const defaultSettings = {
  aiPersona: "tutor",
  aiConciseness: "medium",
  uiLanguage: "en",
  aiLanguage: "English",
};

window.userSettings =
  JSON.parse(localStorage.getItem("learnora_settings")) || defaultSettings;

window.saveSettings = function () {
  window.userSettings.aiPersona =
    document.getElementById("config-persona").value;
  window.userSettings.aiConciseness =
    document.getElementById("config-length").value;
  window.userSettings.uiLanguage =
    document.getElementById("config-ui-lang").value;
  window.userSettings.aiLanguage =
    document.getElementById("config-ai-lang").value;

  localStorage.setItem(
    "learnora_settings",
    JSON.stringify(window.userSettings),
  );
  applyTranslations();
  showNotification("Your settings have been saved!", "success");
};

function loadSettingsToUI() {
  document.getElementById("config-persona").value =
    window.userSettings.aiPersona;
  document.getElementById("config-length").value =
    window.userSettings.aiConciseness;
  document.getElementById("config-ui-lang").value =
    window.userSettings.uiLanguage;
  document.getElementById("config-ai-lang").value =
    window.userSettings.aiLanguage;
}

// --- LOCALIZATION ENGINE ---
function applyTranslations() {
  const lang = window.userSettings.uiLanguage;
  const dict = translations[lang] || translations["en"];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) {
      if (el.tagName === "INPUT" && el.placeholder) {
        el.placeholder = dict[key];
      } else {
        el.innerHTML = dict[key];
      }
    }
  });
}

// ==========================================
// DATA & PRIVACY UTILITIES
// ==========================================
window.exportData = async function () {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id);
    const { data: exams } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", user.id);

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Name,Status,Date\n";

    if (tasks)
      tasks.forEach(
        (t) =>
          (csvContent += `Task,"${t.text}",${t.is_done ? "Done" : "Pending"},\n`),
      );
    if (exams)
      exams.forEach(
        (e) =>
          (csvContent += `Exam,"${e.exam_name}",${e.status},${e.exam_date}\n`),
      );

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Learnora_Export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Data exported successfully!", "success");
  } catch (err) {
    showNotification("Failed to export data.");
  }
};

window.wipeData = async function () {
  if (
    !confirm(
      "🚨 WARNING: This will permanently delete all tasks, exams, and logs from the cloud. Are you sure?",
    )
  )
    return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("tasks").delete().eq("user_id", user.id);
      await supabase.from("exams").delete().eq("user_id", user.id);
    }

    localStorage.removeItem("sessions");
    localStorage.removeItem("timer_state");
    localStorage.removeItem("timer_end_time");
    localStorage.removeItem("fav_times");

    sessionLogs = [];
    todos = [];
    cachedExams = [];

    renderLogs();
    renderTodos();
    renderCalendarStructure();

    showNotification("All data wiped successfully.", "success");
  } catch (err) {
    showNotification("Failed to wipe data: " + err.message);
  }
};

window.logoutUser = async function () {
  await supabase.auth.signOut();
  updateAuthUI(null);
};

// --- TOAST NOTIFICATIONS ---
function showNotification(message, type = "error") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ==========================================
// UI, TAB & CLOCK LOGIC
// ==========================================
setInterval(() => {
  const clock = document.getElementById("live-clock");
  if (clock)
    clock.innerText = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}, 1000);

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

function switchTab(tabId, element) {
  document
    .querySelectorAll(".tab-content")
    .forEach((sec) => (sec.style.display = "none"));
  document
    .querySelectorAll(".nav-links li")
    .forEach((li) => li.classList.remove("active"));

  const target = document.getElementById(`${tabId}-section`);
  if (target) target.style.display = "block";
  if (element) element.classList.add("active");

  const dict =
    translations[window.userSettings.uiLanguage] || translations["en"];
  const titles = {
    timer: dict.nav_timer?.replace(/⏱️ /, ""),
    todo: dict.nav_tasks?.replace(/📝 /, ""),
    exams: dict.nav_calendar?.replace(/📚 /, ""),
    logs: dict.nav_dashboard?.replace(/📊 /, ""),
    flashcards: dict.nav_flashcards?.replace(/🗂️ /, ""),
    settings: dict.nav_settings?.replace(/⚙️ /, ""),
  };

  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.innerText = titles[tabId] || "Dashboard";
}

const sunIcon =
  '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
const moonIcon = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark-theme");
  const icon = document.getElementById("theme-icon");
  if (icon) icon.innerHTML = sunIcon;
}

function toggleTheme() {
  document.body.classList.toggle("dark-theme");
  const isDark = document.body.classList.contains("dark-theme");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  const icon = document.getElementById("theme-icon");
  if (icon) icon.innerHTML = isDark ? sunIcon : moonIcon;
}

const quotes = [
  "Focus on the step in front of you, not the whole staircase.",
  "Don't stop until you're proud.",
  "Small progress is still progress.",
  "The secret of getting ahead is getting started.",
  "You didn't come this far to only come this far.",
];

function randomizeQuote() {
  const quoteEl = document.getElementById("quote-display");
  if (!quoteEl) return;
  quoteEl.innerText = quotes[Math.floor(Math.random() * quotes.length)];
}
randomizeQuote();

// ==========================================
// CLOUD TO-DO ENGINE (RLS Protected)
// ==========================================
async function fetchTodos() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("id", { ascending: true });

  if (!error) {
    todos = data || [];
    renderTodos();
    updateTaskDropdown();
  }
}

async function addTodo() {
  const input = document.getElementById("todo-input");
  if (!input || !input.value.trim()) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    showNotification("Authentication error.");
    return;
  }

  const insertPayload = { text: input.value, is_done: false, user_id: user.id };
  const { error } = await supabase.from("tasks").insert([insertPayload]);

  if (!error) {
    input.value = "";
    fetchTodos();
  } else {
    showNotification("Error adding task: " + error.message);
  }
}

function handleTodoEnter(e) {
  if (e.key === "Enter") addTodo();
}

async function toggleTodo(id, currentStatus) {
  const { error } = await supabase
    .from("tasks")
    .update({ is_done: !currentStatus })
    .eq("id", id);
  if (!error) fetchTodos();
}

async function deleteTodo(id, e) {
  e.stopPropagation();
  const li = e.target.closest(".todo-item");
  if (li) li.classList.add("removing");
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (!error) setTimeout(fetchTodos, 300);
  else showNotification("Delete failed.");
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  if (!list) return;
  list.innerHTML = "";
  todos.forEach((t) => {
    const li = document.createElement("li");
    li.className = `todo-item ${t.is_done ? "done" : ""}`;
    li.onclick = () => toggleTodo(t.id, t.is_done);
    li.innerHTML = `<span>${t.text}</span> <button class="delete-btn" onclick="deleteTodo(${t.id}, event)">X</button>`;
    list.appendChild(li);
  });
}

function updateTaskDropdown() {
  const select = document.getElementById("active-task");
  if (!select) return;
  select.innerHTML = '<option value="None">None</option>';
  todos
    .filter((t) => !t.is_done)
    .forEach((t) => {
      select.innerHTML += `<option value="${t.text}">${t.text}</option>`;
    });
}

// ==========================================
// PERSISTENT TIMER & SESSION LOGGING
// ==========================================
let timerInterval,
  isRunning = false,
  currentMode = "Focus",
  completedCycles = 0,
  targetEndTime = null;
let config = { focus: 25, short: 5, long: 15, cycles: 4 };
let totalSessionTime = 25 * 60;
let timeLeft = totalSessionTime;

function saveTimerState() {
  localStorage.setItem(
    "timer_state",
    JSON.stringify({
      isRunning,
      timeLeft,
      currentMode,
      totalSessionTime,
      completedCycles,
      config,
    }),
  );
}

function applyPreset(type) {
  if (type === "deep") {
    document.getElementById("focusTime").value = 90;
    document.getElementById("shortBreakTime").value = 15;
  } else if (type === "cram") {
    document.getElementById("focusTime").value = 45;
    document.getElementById("shortBreakTime").value = 10;
  } else if (type === "light") {
    document.getElementById("focusTime").value = 20;
    document.getElementById("shortBreakTime").value = 5;
  }
  applyTimerConfig();
}

function applyTimerConfig() {
  const focusInput = document
    .getElementById("focusTime")
    .value.replace(/[^0-9]/g, "");
  const shortInput = document
    .getElementById("shortBreakTime")
    .value.replace(/[^0-9]/g, "");
  const longInput = document
    .getElementById("longBreakTime")
    .value.replace(/[^0-9]/g, "");
  const cyclesInput = document
    .getElementById("cyclesConfig")
    .value.replace(/[^0-9]/g, "");

  config.focus = parseInt(focusInput) || 25;
  config.short = parseInt(shortInput) || 5;
  config.long = parseInt(longInput) || 15;
  config.cycles = parseInt(cyclesInput) || 4;

  document.getElementById("focusTime").value = config.focus;
  document.getElementById("shortBreakTime").value = config.short;
  document.getElementById("longBreakTime").value = config.long;
  document.getElementById("cyclesConfig").value = config.cycles;

  resetTimer();
}

// --- FAVOURITE PRESETS ---
window.saveFavoriteTime = function () {
  const favs = JSON.parse(localStorage.getItem("fav_times")) || [];
  const name = prompt("Name this preset (e.g., Math Prep):");
  if (!name) return;
  favs.push({
    name,
    focus: config.focus,
    short: config.short,
    long: config.long,
    cycles: config.cycles,
  });
  localStorage.setItem("fav_times", JSON.stringify(favs));
  loadFavoriteTimes();
};

window.applyFavPreset = function (index) {
  const favs = JSON.parse(localStorage.getItem("fav_times")) || [];
  const f = favs[index];
  if (!f) return;
  document.getElementById("focusTime").value = f.focus;
  document.getElementById("shortBreakTime").value = f.short;
  document.getElementById("longBreakTime").value = f.long;
  document.getElementById("cyclesConfig").value = f.cycles;
  applyTimerConfig();
};

function loadFavoriteTimes() {
  let presetDiv = document.querySelector(".preset-buttons");
  if (!presetDiv) return;

  let container = document.getElementById("fav-presets-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "fav-presets-container";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "10px";
    container.style.marginTop = "10px";
    presetDiv.appendChild(container);

    let saveBtn = document.createElement("button");
    saveBtn.innerText = "⭐ Save Current as Preset";
    saveBtn.className = "btn-secondary";
    saveBtn.onclick = window.saveFavoriteTime;
    presetDiv.appendChild(saveBtn);
  }

  const favs = JSON.parse(localStorage.getItem("fav_times")) || [];
  container.innerHTML = "";
  favs.forEach((f, i) => {
    let btn = document.createElement("button");
    btn.innerText = `⭐ ${f.name} (${f.focus}m)`;
    btn.onclick = () => window.applyFavPreset(i);
    container.appendChild(btn);
  });
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const s = (timeLeft % 60).toString().padStart(2, "0");
  const display = document.getElementById("time-display");
  if (display) display.innerText = `${m}:${s}`;

  const mode = document.getElementById("timer-mode");
  if (mode) mode.innerText = currentMode + " Mode";

  const cycle = document.getElementById("cycle-counter");
  if (cycle) cycle.innerText = `Cycle: ${completedCycles} / ${config.cycles}`;

  const prog = document.getElementById("timer-progress");
  if (prog)
    prog.style.width = `${((totalSessionTime - timeLeft) / totalSessionTime) * 100}%`;
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  targetEndTime = Date.now() + timeLeft * 1000;
  localStorage.setItem("timer_end_time", targetEndTime);
  saveTimerState();
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeLeft = Math.round((targetEndTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimerDisplay();
      handleCycleEnd();
    } else {
      updateTimerDisplay();
    }
  }, 1000);
}

function handleCycleEnd() {
  pauseTimer();
  randomizeQuote();

  if (currentMode === "Focus") {
    const taskEl = document.getElementById("active-task");
    const taskName = taskEl && taskEl.value !== "None" ? taskEl.value : null;
    logSession(config.focus, taskName || "General Study");

    completedCycles++;
    if (completedCycles >= config.cycles) {
      currentMode = "LongBreak";
      totalSessionTime = config.long * 60;
      completedCycles = 0;
    } else {
      currentMode = "ShortBreak";
      totalSessionTime = config.short * 60;
    }
  } else {
    currentMode = "Focus";
    totalSessionTime = config.focus * 60;
  }

  timeLeft = totalSessionTime;
  saveTimerState();
  showNotification(`${currentMode} time!`, "success");
  updateTimerDisplay();
}

function pauseTimer() {
  if (!isRunning) return;
  clearInterval(timerInterval);
  isRunning = false;
  targetEndTime = null;
  localStorage.removeItem("timer_end_time");
  saveTimerState();
  updateTimerDisplay();
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  currentMode = "Focus";
  totalSessionTime = config.focus * 60;
  timeLeft = totalSessionTime;
  completedCycles = 0;
  targetEndTime = null;
  localStorage.removeItem("timer_end_time");
  saveTimerState();
  updateTimerDisplay();
}

function extendTimer() {
  timeLeft += 5 * 60;
  totalSessionTime += 5 * 60;
  if (isRunning) {
    targetEndTime += 5 * 60 * 1000;
    localStorage.setItem("timer_end_time", targetEndTime);
  }
  saveTimerState();
  updateTimerDisplay();
}

function restoreTimerState() {
  const savedState = JSON.parse(localStorage.getItem("timer_state"));
  const savedEndTime = localStorage.getItem("timer_end_time");

  if (savedState) {
    config = savedState.config || config;
    currentMode = savedState.currentMode || currentMode;
    totalSessionTime = savedState.totalSessionTime || totalSessionTime;
    completedCycles = savedState.completedCycles || completedCycles;

    if (savedState.isRunning && savedEndTime) {
      const now = Date.now();
      targetEndTime = parseInt(savedEndTime, 10);
      if (targetEndTime > now) {
        timeLeft = Math.round((targetEndTime - now) / 1000);
        startTimer();
      } else {
        timeLeft = 0;
        handleCycleEnd();
      }
    } else {
      timeLeft =
        savedState.timeLeft !== undefined
          ? savedState.timeLeft
          : totalSessionTime;
      updateTimerDisplay();
    }
  }
}

function logSession(minutes, task) {
  const timestamp = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  sessionLogs.unshift({ id: Date.now(), timestamp, minutes, task });
  localStorage.setItem("sessions", JSON.stringify(sessionLogs));
  renderLogs();
}

// ==========================================
// DASHBOARD WIDGETS & LOG RENDERING
// ==========================================
function renderLogs() {
  const list = document.getElementById("log-list");
  if (!list) return;
  list.innerHTML =
    sessionLogs.length === 0 ? "<li>No sessions logged yet.</li>" : "";

  let totalMinutes = 0;
  sessionLogs.forEach((log) => {
    totalMinutes += log.minutes || 0;
    const li = document.createElement("li");
    li.className = "log-item";
    const taskStr =
      log.task && log.task !== "General Study"
        ? ` on <strong>${log.task}</strong>`
        : "";
    li.innerHTML = `<span><span class="log-mode">${log.minutes}m Focus</span>${taskStr}</span> <span>${log.timestamp}</span>`;
    list.appendChild(li);
  });

  renderDashboardWidgets(totalMinutes);
}

function renderDashboardWidgets(totalMinutes = 0) {
  const logsSection = document.getElementById("logs-section");
  if (!logsSection) return;

  let widgetContainer = document.getElementById("dashboard-widgets");
  if (!widgetContainer) {
    widgetContainer = document.createElement("div");
    widgetContainer.id = "dashboard-widgets";
    widgetContainer.className = "grid-list";
    widgetContainer.style.marginBottom = "24px";
    logsSection.insertBefore(widgetContainer, logsSection.children[1]);
  }

  const hours = (totalMinutes / 60).toFixed(1);
  const upcoming = cachedExams
    .filter((e) => e.status !== "Completed")
    .slice(0, 3);

  let examsHtml =
    upcoming.length > 0
      ? upcoming
          .map(
            (e) =>
              `<div style="font-weight: 500;">📅 ${e.exam_name} <span style="opacity: 0.6; float:right;">${e.exam_date}</span></div>`,
          )
          .join("")
      : `<div style="opacity: 0.6;">No upcoming exams! Relax.</div>`;

  widgetContainer.innerHTML = `
        <div class="glass-panel" style="padding: 24px; margin-bottom: 0;">
            <h3 style="opacity: 0.8; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">📈 Total Focus Time</h3>
            <h2 style="font-size: 40px; color: var(--primary); margin-top: 10px; line-height: 1;">${hours} <span style="font-size: 16px; color: var(--text-color);">hours</span></h2>
        </div>
        <div class="glass-panel" style="padding: 24px; margin-bottom: 0;">
            <h3 style="opacity: 0.8; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">🚀 Upcoming Deadlines</h3>
            <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px;">
                ${examsHtml}
            </div>
        </div>
    `;
}

// ==========================================
// CALENDAR & EXAM SYSTEM (RLS Protected)
// ==========================================
async function initializeCalendar() {
  const grid = document.getElementById("calendar-days");
  if (!grid) return;
  await fetchExams();
  renderCalendarStructure();
  renderDashboardWidgets();
}

async function fetchExams() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", user.id);
    if (error) throw error;
    cachedExams = data || [];
  } catch (err) {
    console.error("Error fetching calendar exam data:", err.message);
  }
}

function renderCalendarStructure() {
  const calendarDaysGrid = document.getElementById("calendar-days");
  const monthYearDisplay = document.getElementById("month-year-display");
  if (!calendarDaysGrid || !monthYearDisplay) return;

  calendarDaysGrid.innerHTML = "";
  const year = currentDisplayDate.getFullYear();
  const month = currentDisplayDate.getMonth();
  const monthNames = [
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
  monthYearDisplay.innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day-cell empty";
    calendarDaysGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day-cell";
    const currentStringDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    dayCell.setAttribute("data-date", currentStringDate);

    const dayNumberSpan = document.createElement("span");
    dayNumberSpan.className = "day-number";
    dayNumberSpan.innerText = day;
    dayCell.appendChild(dayNumberSpan);

    if (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    ) {
      dayCell.classList.add("today");
    }

    dayCell.addEventListener("click", (e) => {
      if (e.target === dayCell || e.target.className === "day-number")
        showModal(null, currentStringDate);
    });

    const matchingExams = cachedExams.filter(
      (exam) => exam.exam_date === currentStringDate,
    );
    matchingExams.forEach((exam) => {
      const examElement = document.createElement("div");
      examElement.className = `exam-bar diff-${exam.difficulty.toLowerCase()} status-${exam.status.toLowerCase()}`;
      examElement.innerText = exam.exam_name;
      examElement.addEventListener("click", (e) => {
        e.stopPropagation();
        showModal(exam);
      });
      dayCell.appendChild(examElement);
    });
    calendarDaysGrid.appendChild(dayCell);
  }
}

function changeMonth(direction) {
  currentDisplayDate.setMonth(currentDisplayDate.getMonth() + direction);
  renderCalendarStructure();
}

function showModal(exam = null, defaultDate = "") {
  const examModal = document.getElementById("exam-modal");
  const examForm = document.getElementById("exam-form");
  if (!examModal || !examForm) return;

  examModal.classList.remove("hidden");

  if (exam) {
    document.getElementById("modal-title").innerText = "Modify Exam Settings";
    document.getElementById("modal-exam-id").value = exam.id;
    document.getElementById("exam-name").value = exam.exam_name;
    document.getElementById("exam-date").value = exam.exam_date;
    document.getElementById("exam-difficulty").value = exam.difficulty;
    document.getElementById("exam-status").value = exam.status;
    document.getElementById("delete-exam-btn").classList.remove("hidden");
  } else {
    document.getElementById("modal-title").innerText = "Schedule New Exam";
    examForm.reset();
    document.getElementById("modal-exam-id").value = "";
    document.getElementById("exam-date").value = defaultDate;
    document.getElementById("delete-exam-btn").classList.add("hidden");
  }
}

function hideModal() {
  document.getElementById("exam-modal").classList.add("hidden");
  document.getElementById("exam-form").reset();
}

async function handleExamFormSubmit(e) {
  e.preventDefault();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const examId = document.getElementById("modal-exam-id").value;
  const examPayload = {
    exam_name: document.getElementById("exam-name").value,
    exam_date: document.getElementById("exam-date").value,
    difficulty: document.getElementById("exam-difficulty").value,
    status: document.getElementById("exam-status").value,
    user_id: user.id,
  };

  try {
    if (examId) {
      await supabase.from("exams").update(examPayload).eq("id", examId);
      showNotification("Exam updated!", "success");
    } else {
      await supabase.from("exams").insert([examPayload]);
      showNotification("Exam scheduled!", "success");
    }
    hideModal();
    await initializeCalendar();
  } catch (err) {
    showNotification(`Database error: ${err.message}`);
  }
}

async function deleteCurrentExam() {
  const examId = document.getElementById("modal-exam-id").value;
  if (
    !examId ||
    !confirm("Confirm destructive mutation: Remove this exam from database?")
  )
    return;

  try {
    const { error } = await supabase.from("exams").delete().eq("id", examId);
    if (error) throw error;
    showNotification("Exam deleted", "success");
    hideModal();
    await initializeCalendar();
  } catch (err) {
    showNotification(`Deletion failed: ${err.message}`);
  }
}

// ==========================================
// TURBO AI LOGIC
// ==========================================
window.openAiModal = function () {
  const modal = document.getElementById("turbo-chat");
  modal.classList.remove("hidden");
  modal.classList.remove("minimized");
};

window.toggleAiFullscreen = function () {
  const modal = document.getElementById("turbo-chat");
  modal.classList.toggle("minimized");
  if (!modal.classList.contains("minimized")) {
    modal.style.top = "";
    modal.style.left = "";
  }
};

window.handleAiFileInput = function (e) {
  if (e.target.files && e.target.files.length > 0)
    window.processAiFile(e.target.files[0]);
};

window.processAiFile = function (file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    window.currentAiFile = {
      name: file.name,
      mimeType: file.type,
      data: e.target.result.split(",")[1],
    };
    document.getElementById("file-name").innerText = file.name;
    document
      .getElementById("file-preview-container")
      .classList.remove("hidden");
  };
  reader.readAsDataURL(file);
};

window.removeAiFile = function () {
  window.currentAiFile = null;
  document.getElementById("file-preview-container").classList.add("hidden");
  document.getElementById("file-upload").value = "";
};

window.renderFlashcards = function (flashcardsArray) {
  const grid = document.getElementById("flashcards-grid");
  if (!grid) return;
  grid.innerHTML = "";
  flashcardsArray.forEach((card) => {
    const div = document.createElement("div");
    div.className = "card-container";
    div.onclick = () => div.classList.toggle("flipped");
    div.innerHTML = `<div class="card-inner"><div class="card-front">${card.front}</div><div class="card-back">${card.back}</div></div>`;
    grid.appendChild(div);
  });
  const flashcardTabBtn = document.querySelector('li[onclick*="flashcards"]');
  if (flashcardTabBtn) switchTab("flashcards", flashcardTabBtn);
  document.getElementById("turbo-chat").classList.add("hidden");
  showNotification("Flashcards generated!", "success");
};

window.sendChat = async function () {
  const input = document.getElementById("chat-input");
  const msgBox = document.getElementById("chat-messages");
  const typingIndicator = document.getElementById("typing-indicator");

  if (!input.value.trim() && !window.currentAiFile) return;

  const userQuery = input.value || "Please analyze this file.";
  const payloadFile = window.currentAiFile;
  const userMsg = document.createElement("div");
  userMsg.className = "chat-bubble user-bubble";
  userMsg.innerHTML = payloadFile
    ? `📎 <em>${payloadFile.name}</em><br/><br/>${userQuery}`
    : userQuery;
  msgBox.appendChild(userMsg);
  input.value = "";
  window.removeAiFile();
  msgBox.scrollTop = msgBox.scrollHeight;
  typingIndicator.classList.remove("hidden");
  msgBox.appendChild(typingIndicator);
  msgBox.scrollTop = msgBox.scrollHeight;

  try {
    const { data, error } = await supabase.functions.invoke("learnora-ai", {
      body: {
        query: userQuery,
        file: payloadFile,
        settings: window.userSettings,
      },
    });
    if (error) throw error;
    typingIndicator.classList.add("hidden");

    try {
      const cleanJson = data.text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        window.renderFlashcards(parsed);
        return;
      }
    } catch (e) {
      // Fallback
    }

    const aiMsg = document.createElement("div");
    aiMsg.className = "chat-bubble ai-bubble";
    aiMsg.innerHTML = marked.parse(data.text || "No response.");
    msgBox.appendChild(aiMsg);
    msgBox.scrollTop = msgBox.scrollHeight;
  } catch (err) {
    typingIndicator.classList.add("hidden");
    const errorMsg = document.createElement("div");
    errorMsg.className = "chat-bubble ai-bubble ai-bubble-error";
    errorMsg.innerText = "Error: " + err.message;
    msgBox.appendChild(errorMsg);
  }
};

window.handleChatEnter = function (e) {
  if (e.key === "Enter") window.sendChat();
};

// ==========================================
// BIND EVENTS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("prev-month-btn")
    ?.addEventListener("click", () => changeMonth(-1));
  document
    .getElementById("next-month-btn")
    ?.addEventListener("click", () => changeMonth(1));
  document
    .getElementById("close-modal-btn")
    ?.addEventListener("click", hideModal);
  document
    .getElementById("delete-exam-btn")
    ?.addEventListener("click", deleteCurrentExam);
  document
    .getElementById("exam-form")
    ?.addEventListener("submit", handleExamFormSubmit);

  const aiModal = document.getElementById("turbo-chat");
  const dragOverlay = document.getElementById("drag-overlay");

  if (aiModal && dragOverlay) {
    aiModal.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!aiModal.classList.contains("hidden"))
        dragOverlay.classList.remove("hidden");
    });
    aiModal.addEventListener("dragleave", (e) => {
      e.preventDefault();
      if (e.target === dragOverlay) dragOverlay.classList.add("hidden");
    });
    aiModal.addEventListener("drop", (e) => {
      e.preventDefault();
      dragOverlay.classList.add("hidden");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0)
        window.processAiFile(e.dataTransfer.files[0]);
    });
  }

  const chatHeader = document.getElementById("ai-chat-header");
  let isDragging = false,
    startX,
    startY,
    initialX,
    initialY;

  if (chatHeader) {
    chatHeader.addEventListener("mousedown", (e) => {
      if (
        !aiModal.classList.contains("minimized") ||
        e.target.closest(".header-controls")
      )
        return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = aiModal.offsetLeft;
      initialY = aiModal.offsetTop;
      document.addEventListener("mousemove", dragAiModal);
      document.addEventListener("mouseup", stopDragAiModal);
    });
  }

  function dragAiModal(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    aiModal.style.left = `${initialX + dx}px`;
    aiModal.style.top = `${initialY + dy}px`;
    aiModal.style.bottom = "auto";
    aiModal.style.right = "auto";
  }

  function stopDragAiModal() {
    isDragging = false;
    document.removeEventListener("mousemove", dragAiModal);
    document.removeEventListener("mouseup", stopDragAiModal);
  }
});

// Global bindings for inline HTML clicks
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.addTodo = addTodo;
window.handleTodoEnter = handleTodoEnter;
window.deleteTodo = deleteTodo;
window.toggleTodo = toggleTodo;
window.applyPreset = applyPreset;
window.applyTimerConfig = applyTimerConfig;
window.startTimer = startTimer;
window.pauseTimer = pauseTimer;
window.resetTimer = resetTimer;
window.extendTimer = extendTimer;
window.toggleTheme = toggleTheme;
