let exams = JSON.parse(localStorage.getItem("exams")) || [];

// Set min date to today on load
const today = new Date().toISOString().split("T")[0];
document.getElementById("examDate").setAttribute("min", today);

// Initial render
renderExams();

function addExam() {
  const subject = document.getElementById("subject").value;
  const date = document.getElementById("examDate").value;
  const level = document.getElementById("level").value;

  if (!subject || !date) return alert("Fill in everything, bro!");
  if (date < today) return alert("Date is in the past!");

  exams.push({ subject, date, level });
  saveAndRender();

  // Clear fields
  document.getElementById("subject").value = "";
  document.getElementById("examDate").value = "";
}

function saveAndRender() {
  // Sort by date (closest first)
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
}

function deleteExam(index) {
  exams.splice(index, 1);
  saveAndRender();
}
