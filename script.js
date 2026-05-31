// ==========================================
// 1. GLOBAL UI & LAYOUT LOGIC
// ==========================================

// Real-time Clock
setInterval(() => {
  const now = new Date();
  document.getElementById("live-clock").innerText = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}, 1000);

// Sidebar Toggle
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

// Tab Switching
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
    exams: "Upcoming Exams",
    timer: "Study Timer",
    todo: "Task Manager",
  };
  document.getElementById("page-title").innerText = titles[tabId];
}

// Theme Engine (SVG Switch)
const sunIcon =
  '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
const moonIcon = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';

if (localStorage.getItem("theme") === "dark") {
  document.body.setAttribute("data-theme", "dark");
  document.getElementById("theme-icon").innerHTML = sunIcon;
}

function toggleTheme() {
  const isDark = document.body.toggleAttribute("data-theme", "dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  document.getElementById("theme-icon").innerHTML = isDark ? sunIcon : moonIcon;
}

// ==========================================
// 2. EXAM ENGINE
// ==========================================
let exams = JSON.parse(localStorage.getItem("exams")) || [];

function addExam() {
  const subject = document.getElementById("subject").value;
  const date = document.getElementById("examDate").value;
  const level = document.getElementById("level").value;

  if (!subject || !date) return alert("Fill in all fields!");

  exams.push({ id: Date.now(), subject, date, level });
  document.getElementById("subject").value = "";
  document.getElementById("examDate").value = "";

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
  exams.sort((a, b) => new Date(a.date) - new Date(b.date)); // Auto-sort

  document.getElementById("empty-state").style.display =
    exams.length === 0 ? "block" : "none";

  exams.forEach((exam) => {
    const daysLeft = Math.ceil(
      (new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24),
    );
    const li = document.createElement("li");
    li.className = "exam-card";
    li.innerHTML = `
            <div class="exam-info">
                <strong>${exam.subject}</strong>
                <small>⏳ ${daysLeft > 0 ? daysLeft + " days left" : "Today/Passed"} (${exam.level})</small>
            </div>
            <button class="delete-btn" onclick="deleteExam(${exam.id})">Drop</button>
        `;
    list.appendChild(li);
  });
}
renderExams();

// ==========================================
// 3. SMART TIMER ENGINE
// ==========================================
let timerInterval;
let timeLeft = 25 * 60;
let isRunning = false;
let currentMode = "Focus"; // 'Focus', 'ShortBreak', 'LongBreak'
let completedCycles = 0;

let config = { focus: 25, short: 5, long: 15, cycles: 4 };

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
  document.title = isRunning ? `(${m}:${s}) ${currentMode}` : "Study App";
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
  if (currentMode === "Focus") {
    completedCycles++;
    if (completedCycles >= config.cycles) {
      currentMode = "LongBreak";
      timeLeft = config.long * 60;
      completedCycles = 0; // Reset after long break
    } else {
      currentMode = "ShortBreak";
      timeLeft = config.short * 60;
    }
  } else {
    currentMode = "Focus";
    timeLeft = config.focus * 60;
  }
  alert(`${currentMode} time!`);
  updateTimerDisplay();
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
}
function resetTimer() {
  pauseTimer();
  currentMode = "Focus";
  timeLeft = config.focus * 60;
  completedCycles = 0;
  updateTimerDisplay();
}

// ** SMART AUTO-PAUSE **
// Explanation: If the browser tab is not visible, it forces the pause function.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isRunning) {
    pauseTimer();
    console.log("Tab hidden: Timer Auto-Paused");
  }
});
updateTimerDisplay();

// ==========================================
// 4. TO-DO ENGINE
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
  e.stopPropagation(); // Prevents triggering the toggle click
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
}

function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
  renderTodos();
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  list.innerHTML = "";
  todos.forEach((todo) => {
    const li = document.createElement("li");
    li.className = `todo-item ${todo.done ? "done" : ""}`;
    li.onclick = () => toggleTodo(todo.id);

    li.innerHTML = `
            <span class="todo-text">${todo.text}</span>
            <button class="delete-btn" onclick="deleteTodo(${todo.id}, event)">X</button>
        `;
    list.appendChild(li);
  });
}
renderTodos();
