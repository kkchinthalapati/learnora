// ==========================================
// 1. GLOBAL LAYOUT & THEME LOGIC
// ==========================================

// Load saved theme on boot
if (localStorage.getItem("theme") === "dark") {
  document.body.setAttribute("data-theme", "dark");
  document.getElementById("theme-toggle").innerText = "☀️";
}

function toggleTheme() {
  const body = document.body;
  const isDark = body.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";

  body.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  document.getElementById("theme-toggle").innerText = isDark ? "🌙" : "☀️";
}

function switchTab(tabId, element) {
  // Hide all tab sections
  document
    .querySelectorAll(".tab-content")
    .forEach((sec) => (sec.style.display = "none"));

  // Remove 'active' class from all sidebar links
  document
    .querySelectorAll(".nav-links li")
    .forEach((li) => li.classList.remove("active"));

  // Show selected tab & highlight link
  document.getElementById(`${tabId}-section`).style.display = "block";
  element.classList.add("active");

  // Update Header
  document.getElementById("page-title").innerText =
    tabId === "exams" ? "Upcoming Exams" : "Study Timer";
}

// ==========================================
// 2. EXAM TRACKER LOGIC
// ==========================================
let exams = JSON.parse(localStorage.getItem("exams")) || [];

function saveExams() {
  localStorage.setItem("exams", JSON.stringify(exams));
  renderExams();
}

function addExam() {
  const subject = document.getElementById("subject").value;
  const date = document.getElementById("examDate").value;
  const level = document.getElementById("level").value;

  if (!subject || !date) return alert("Fill in all fields bro.");

  exams.push({ id: Date.now(), subject, date, level });

  // Clear inputs
  document.getElementById("subject").value = "";
  document.getElementById("examDate").value = "";

  saveExams();
}

function deleteExam(id) {
  exams = exams.filter((e) => e.id !== id);
  saveExams();
}

function renderExams() {
  const list = document.getElementById("examList");
  const emptyState = document.getElementById("empty-state");
  list.innerHTML = "";

  // Auto-sort by nearest date (The Panic Fix)
  exams.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (exams.length === 0) {
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    exams.forEach((exam) => {
      // Calculate Countdown
      const daysLeft = Math.ceil(
        (new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24),
      );
      let timeText =
        daysLeft > 1
          ? `${daysLeft} days left`
          : daysLeft === 1
            ? "Tomorrow!"
            : "Today/Passed";

      const li = document.createElement("li");
      li.className = "exam-card";
      li.innerHTML = `
                <div class="exam-info">
                    <strong>${exam.subject}</strong>
                    <span style="opacity: 0.7; font-size: 14px; text-transform: capitalize;">(${exam.level})</span>
                    <small>⏳ ${timeText}</small>
                </div>
                <button class="delete-btn" onclick="deleteExam(${exam.id})">Drop</button>
            `;
      list.appendChild(li);
    });
  }
  updateProgress();
}

function updateProgress() {
  const maxExams = 10;
  let percentage = (exams.length / maxExams) * 100;
  if (percentage > 100) percentage = 100;

  document.getElementById("progress-fill").style.width = percentage + "%";

  const affirmations = [
    "Let's get this bread.",
    "Small steps bro, you got this.",
    "Lock in.",
    "Future you is thanking you right now.",
    "Grind time.",
  ];

  document.getElementById("affirmation-box").innerText =
    exams.length > 0
      ? affirmations[Math.floor(Math.random() * affirmations.length)]
      : "";
}

// ==========================================
// 3. STUDY TIMER LOGIC
// ==========================================
let timerInterval;
let timeLeft = 25 * 60; // 25 mins
let isRunning = false;
let isBreak = false;
let completedCycles = 0;

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  document.getElementById("time-display").innerText = `${mins}:${secs}`;
  document.title = isRunning
    ? `(${mins}:${secs}) ${isBreak ? "Break" : "Focus"}`
    : "Study Dashboard";
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerDisplay();
    } else {
      // Cycle Finished
      clearInterval(timerInterval);
      isRunning = false;

      if (!isBreak) {
        completedCycles++;
        isBreak = true;
        timeLeft = 5 * 60; // Set break to 5 mins
        alert("Focus session done! Take a 5-min break.");
      } else {
        isBreak = false;
        timeLeft = 25 * 60; // Reset to 25 mins
        alert("Break over! Back to work.");
      }
      updateTimerDisplay();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
}

function resetTimer() {
  pauseTimer();
  isBreak = false;
  timeLeft = 25 * 60;
  updateTimerDisplay();
}
