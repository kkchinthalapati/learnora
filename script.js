import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// --- DATABASE SETUP ---
const supabaseUrl = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const supabaseKey = "sb_publishable_mN1UvxPjHhn6L583LjrSFw_FWY8kRrt";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- AUTH WALL LOGIC ---
supabase.auth.onAuthStateChange((event, session) => {
  const wall = document.getElementById("auth-wall");
  const app = document.getElementById("main-app");
  if (session && wall && app) {
    wall.style.display = "none";
    app.style.display = "block";
    fetchTodos();
  } else if (wall && app) {
    wall.style.display = "flex";
    app.style.display = "none";
  }
});

async function handleLogin() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
}

async function handleSignup() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("Check your email for the confirmation link!");
}

// ==========================================
// 1. UI, TAB & CLOCK LOGIC
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
  element.classList.add("active");

  const titles = {
    timer: "Study Timer",
    todo: "Task Manager",
    exams: "Upcoming Exams",
    logs: "Dashboard",
  };
  document.getElementById("page-title").innerText = titles[tabId];
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
// 2. CLOUD TO-DO ENGINE (Supabase)
// ==========================================
let todos = [];

async function fetchTodos() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("id", { ascending: true });
  if (error) console.error("Error fetching:", error);
  else {
    todos = data;
    renderTodos();
    updateTaskDropdown();
  }
}

async function addTodo() {
  const input = document.getElementById("todo-input");
  if (!input || !input.value.trim()) return;
  const { error } = await supabase
    .from("tasks")
    .insert([{ text: input.value, is_done: false }]);
  if (!error) {
    input.value = "";
    fetchTodos();
  } else console.error("Error adding:", error);
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
  else console.error("Delete failed:", error);
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
// 3. TIMER & LOGGING
// ==========================================
let timerInterval,
  isRunning = false,
  currentMode = "Focus",
  completedCycles = 0,
  config = { focus: 25, short: 5, long: 15, cycles: 4 };
let totalSessionTime = 25 * 60,
  timeLeft = totalSessionTime;

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
  randomizeQuote();
  if (currentMode === "Focus") {
    const taskName = document.getElementById("active-task")?.value;
    logSession(config.focus, taskName);
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
  totalSessionTime = config.focus * 60;
  timeLeft = totalSessionTime;
  completedCycles = 0;
  updateTimerDisplay();
}
function extendTimer() {
  if (!isRunning) return;
  timeLeft += 5 * 60;
  totalSessionTime += 5 * 60;
  updateTimerDisplay();
}

// ==========================================
// 4. SESSION LOGGING & EXAMS
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
  if (!list) return;
  list.innerHTML =
    sessionLogs.length === 0 ? "<li>No sessions logged yet.</li>" : "";
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
  if (!list) return;
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

// Global Window Attachments
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
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
window.addExam = addExam;
window.deleteExam = deleteExam;
window.toggleTheme = toggleTheme;
