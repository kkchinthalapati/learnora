// ==========================================
// 1. GLOBAL & UI LOGIC
// ==========================================
setInterval(() => {
  document.getElementById("live-clock").innerText =
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  document.getElementById(`${tabId}-section`).style.display = "block";
  element.classList.add("active");

  const titles = {
    timer: "Study Timer",
    todo: "Task Manager",
    exams: "Upcoming Exams",
    logs: "Session Dashboard",
  };
  document.getElementById("page-title").innerText = titles[tabId];
}

// Fixed Theme Engine
const sunIcon =
  '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
const moonIcon = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';

if (localStorage.getItem("theme") === "dark") {
  document.body.setAttribute("data-theme", "dark");
  document.getElementById("theme-icon").innerHTML = sunIcon;
}

window.toggleTheme = function () {
  const isDark = document.body.toggleAttribute("data-theme", "dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  document.getElementById("theme-icon").innerHTML = isDark ? sunIcon : moonIcon;
};

// ==========================================
// 2. TO-DO ENGINE (Syncs with Timer)
// ==========================================
let todos = JSON.parse(localStorage.getItem("todos")) || [];

function addTodo() {
  const input = document.getElementById("todo-input");
  if (!input.value.trim()) return;
  todos.push({ id: Date.now(), text: input.value, done: false });
  input.value = "";
  saveTodos();
}
function handleTodoEnter(e) {
  if (e.key === "Enter") addTodo();
}
function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
  saveTodos();
}
function deleteTodo(id, e) {
  e.stopPropagation();
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
}
function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
  renderTodos();
  updateTaskDropdown();
}
function renderTodos() {
  const list = document.getElementById("todo-list");
  list.innerHTML = "";
  todos.forEach((t) => {
    const li = document.createElement("li");
    li.className = `todo-item ${t.done ? "done" : ""}`;
    li.onclick = () => toggleTodo(t.id);
    li.innerHTML = `<span class="todo-text">${t.text}</span> <button class="delete-btn" onclick="deleteTodo(${t.id}, event)">X</button>`;
    list.appendChild(li);
  });
}
function updateTaskDropdown() {
  const select = document.getElementById("active-task");
  select.innerHTML = '<option value="None">None</option>';
  todos
    .filter((t) => !t.done)
    .forEach((t) => {
      select.innerHTML += `<option value="${t.text}">${t.text}</option>`;
    });
}
renderTodos();
updateTaskDropdown();

// ==========================================
// 3. GOD-MODE TIMER & LOGGER
// ==========================================
let timerInterval;
let timeLeft = 25 * 60;
let isRunning = false;
let currentMode = "Focus";
let completedCycles = 0;
let config = { focus: 25, short: 5, long: 15, cycles: 4 };

// Presets
function applyPreset(type) {
  if (type === "deep") {
    document.getElementById("focusTime").value = 90;
    document.getElementById("shortBreakTime").value = 15;
  }
  if (type === "cram") {
    document.getElementById("focusTime").value = 45;
    document.getElementById("shortBreakTime").value = 10;
  }
  if (type === "light") {
    document.getElementById("focusTime").value = 20;
    document.getElementById("shortBreakTime").value = 5;
  }
  applyTimerConfig();
}

function applyTimerConfig() {
  config.focus = parseInt(document.getElementById("focusTime").value) || 25;
  config.short = parseInt(document.getElementById("shortBreakTime").value) || 5;
  config.long = parseInt(document.getElementById("longBreakTime").value) || 15;
  config.cycles = parseInt(document.getElementById("cyclesConfig").value) || 4;
  resetTimer();
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const s = (timeLeft % 60).toString().padStart(2, "0");
  document.getElementById("time-display").innerText = `${m}:${s}`;
  document.title = isRunning ? `(${m}:${s}) ${currentMode}` : "Command Center";
  document.getElementById("timer-mode").innerText = currentMode + " Mode";
  document.getElementById("cycle-counter").innerText =
    `Cycle: ${completedCycles} / ${config.cycles}`;
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerDisplay();
    } else {
      handleCycleEnd();
    }
  }, 1000);
}

function handleCycleEnd() {
  pauseTimer();

  // Log the session if it was a Focus block
  if (currentMode === "Focus") {
    const taskName = document.getElementById("active-task").value;
    logSession(config.focus, taskName);
    completedCycles++;

    if (completedCycles >= config.cycles) {
      currentMode = "LongBreak";
      timeLeft = config.long * 60;
      completedCycles = 0;
    } else {
      currentMode = "ShortBreak";
      timeLeft = config.short * 60;
    }
  } else {
    currentMode = "Focus";
    timeLeft = config.focus * 60;
  }

  // Play a browser beep (no external assets needed)
  new Audio(
    "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU",
  )
    .play()
    .catch(() => console.log("Audio skipped"));
  alert(`${currentMode} time!`);
  updateTimerDisplay();
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  updateTimerDisplay();
}
function resetTimer() {
  pauseTimer();
  currentMode = "Focus";
  timeLeft = config.focus * 60;
  completedCycles = 0;
  updateTimerDisplay();
}
function extendTimer() {
  timeLeft += 5 * 60;
  updateTimerDisplay();
} // Adds 5 mins

// Auto-Pause System
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isRunning) {
    pauseTimer();
    console.log("Tab hidden: Auto-Paused");
  }
});

updateTimerDisplay();

// ==========================================
// 4. SESSION LOGGING (Dashboard)
// ==========================================
let sessionLogs = JSON.parse(localStorage.getItem("sessions")) || [];

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

function renderLogs() {
  const list = document.getElementById("log-list");
  list.innerHTML = "";
  if (sessionLogs.length === 0)
    list.innerHTML = "<li>No sessions logged yet. Get to work!</li>";
  sessionLogs.forEach((log) => {
    const li = document.createElement("li");
    li.className = "log-item";
    const taskStr =
      log.task !== "None" ? ` on <strong>${log.task}</strong>` : "";
    li.innerHTML = `<span><span class="log-mode">${log.minutes}m Focus</span>${taskStr}</span> <span>${log.timestamp}</span>`;
    list.appendChild(li);
  });
}
renderLogs();

// ==========================================
// 5. EXAM ENGINE
// ==========================================
let exams = JSON.parse(localStorage.getItem("exams")) || [];
function addExam() {
  const subject = document.getElementById("subject").value;
  const date = document.getElementById("examDate").value;
  const level = document.getElementById("level").value;
  if (!subject || !date) return alert("Fill in all fields!");
  exams.push({ id: Date.now(), subject, date, level });
  localStorage.setItem("exams", JSON.stringify(exams));
  renderExams();
}
function deleteExam(id) {
  exams = exams.filter((e) => e.id !== id);
  localStorage.setItem("exams", JSON.stringify(exams));
  renderExams();
}
function renderExams() {
  const list = document.getElementById("examList");
  list.innerHTML = "";
  exams
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((exam) => {
      const daysLeft = Math.ceil(
        (new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24),
      );
      const li = document.createElement("li");
      li.className = "exam-card";
      li.innerHTML = `<div><strong>${exam.subject}</strong> <br><small>⏳ ${daysLeft > 0 ? daysLeft + " days left" : "Passed"} (${exam.level})</small></div> <button class="delete-btn" onclick="deleteExam(${exam.id})">Drop</button>`;
      list.appendChild(li);
    });
}
renderExams();
