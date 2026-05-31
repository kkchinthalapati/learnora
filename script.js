let exams = JSON.parse(localStorage.getItem("exams")) || [];

// Affirmations logic
const affirmations = [
  "You're crushing it, bro.",
  "One exam at a time. You got this.",
  "Progress is better than perfection.",
  "Take a breath. You're doing great.",
];

function showAffirmation() {
  const box = document.getElementById("affirmation-box");
  box.innerText = affirmations[Math.floor(Math.random() * affirmations.length)];
}

// Progress bar logic
function updateProgressBar() {
  const progressFill = document.getElementById("progress-fill");
  // Example: If you have 1-5 exams, it fills up.
  // You can change '5' to however many exams you want as a 'max'
  const percentage = Math.min((exams.length / 5) * 100, 100);
  progressFill.style.width = percentage + "%";
}

// Core functions
const today = new Date().toISOString().split("T")[0];
document.getElementById("examDate").setAttribute("min", today);

renderExams();
showAffirmation(); // Run on load

function addExam() {
  const subject = document.getElementById("subject").value;
  const date = document.getElementById("examDate").value;
  const level = document.getElementById("level").value;

  if (!subject || !date) return alert("Fill in everything, bro!");
  if (date < today) return alert("Date is in the past!");

  exams.push({ subject, date, level });
  saveAndRender();

  document.getElementById("subject").value = "";
  document.getElementById("examDate").value = "";
}

function saveAndRender() {
  exams.sort((a, b) => new Date(a.date) - new Date(b.date));
  localStorage.setItem("exams", JSON.stringify(exams));
  renderExams();
}

function renderExams() {
  const list = document.getElementById("examList");
  list.innerHTML = "";

  exams.forEach((ex, index) => {
    const diff = Math.ceil(
      (new Date(ex.date) - new Date()) / (1000 * 60 * 60 * 24),
    );
    const item = document.createElement("li");
    item.className = ex.level;
    item.innerHTML = `
            <span><strong>${ex.subject}</strong> - ${ex.date} (${diff} days left)</span>
            <button class="delete-btn" onclick="deleteExam(${index})">Delete</button>
        `;
    list.appendChild(item);
  });

  updateProgressBar(); // This triggers the bar to resize every time the list changes
}

function deleteExam(index) {
  exams.splice(index, 1);
  saveAndRender();
}
