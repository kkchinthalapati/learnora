import { UI, $, esc } from "./ui.js";
import { Folders, Materials, Decks, Notes, Flashcards, Quizzes } from "./api.js";

/** Only allow safe hex colors into inline style attributes */
function safeColor(color, fallback = "#4A90E2") {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color || "")) ? color : fallback;
}

/* =========================================================================
   ROUTER — Simple Hash-Based Navigation
   ========================================================================= */

export const Router = {
  currentRoute: "dashboard",

  init() {
    window.addEventListener("hashchange", () => this.handleHashChange());

    // Delegated clicks for dynamically generated content.
    // No inline onclick attributes — required for a strict CSP.
    document.addEventListener("click", (e) => {
      // Folder card quick-actions are nested inside a [data-hash] card, so
      // they must be checked (and stop here) before the data-hash handler
      // below, or clicking rename/delete would also navigate into the folder.
      const actionEl = e.target.closest("[data-action]");
      if (actionEl?.dataset.action === "rename-folder") {
        this.renameFolder(actionEl.dataset.folderId, actionEl.dataset.folderName);
        return;
      }
      if (actionEl?.dataset.action === "delete-folder") {
        this.deleteFolder(actionEl.dataset.folderId, actionEl.dataset.folderName);
        return;
      }

      const navEl = e.target.closest("[data-hash]");
      if (navEl) {
        window.location.hash = navEl.dataset.hash;
        return;
      }
      if (!actionEl) return;
      if (actionEl.dataset.action === "new-folder") this.createNewFolder();
      else if (actionEl.dataset.action === "history-back") window.history.back();
      else if (actionEl.dataset.action === "start-plan-block") {
        sessionStorage.setItem("pending_timer_task", actionEl.dataset.planSubject || "");
        sessionStorage.setItem("pending_timer_focus_mins", actionEl.dataset.planDuration || "25");
        window.location.hash = "timer";
      }
    });

    // Trigger on first load
    this.handleHashChange();
  },

  handleHashChange() {
    let hash = window.location.hash.replace("#", "");
    if (!hash) hash = "dashboard";

    this.navigate(hash);
  },

  navigate(route) {
    this.currentRoute = route;
    
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${route}` && route !== "ai") {
        link.classList.add("active");
        UI._activeTab = route;
        UI._updatePageTitle(link);
      }
    });

    // Hide all views
    document.querySelectorAll(".view-section").forEach(view => {
      view.classList.add("hidden");
    });

    // Dynamic routing for folders and notes
    if (route.startsWith("folder-")) {
      const folderId = route.replace("folder-", "");
      $(`view-folder-detail`)?.classList.remove("hidden");
      this.loadFolderDetail(folderId);
      return;
    }
    
    if (route.startsWith("notes-")) {
      const materialId = route.replace("notes-", "");
      $(`view-notes`)?.classList.remove("hidden");
      this.loadNotes(materialId);
      return;
    }
    
    if (route.startsWith("review-")) {
      const deckId = route.replace("review-", "");
      $(`view-review`)?.classList.remove("hidden");
      this.startReview(deckId);
      return;
    }

    if (route.startsWith("quiz-")) {
      const quizId = route.replace("quiz-", "");
      $(`view-quiz`)?.classList.remove("hidden");
      this.startQuiz(quizId);
      return;
    }

    // Show target view
    const targetView = $(`view-${route}`);
    if (targetView) {
      targetView.classList.remove("hidden");
    } else {
      // Fallback
      $("view-dashboard")?.classList.remove("hidden");
    }

    // specific routing logic
    if (route === "folders" || route === "upload") {
      this.loadFolders(route);
    }
    if (route === "flashcards") {
      this.loadAllFlashcards();
    }
    if (route === "quizzes") {
      this.loadAllQuizzes();
    }
    if (route === "plan") {
      this.loadPlanView();
    }

    // Populate settings profile data when navigating to settings
    if (route === "settings") {
      this.loadSettingsProfile();
    }
  },

  /** Populate settings panels with user data */
  async loadSettingsProfile() {
    // Import main.js functions would create circular deps, so we inline the logic here.
    // Get the user session from the Auth module (already imported via api.js).
    const { Auth } = await import("./api.js");
    const user = await Auth.getSession();
    if (!user) return;

    const name = user.user_metadata?.full_name || "Student";
    const email = user.email || "\u2014";
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

    const nameEl = $("settings-display-name");
    const emailEl = $("settings-user-email");
    const emailDisplay = $("settings-email-display");
    const avatarEl = $("settings-avatar-initials");
    const nameInput = $("settings-name-input");

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (emailDisplay) emailDisplay.textContent = email;
    if (avatarEl) avatarEl.textContent = initials;
    if (nameInput) nameInput.value = name;
  },

  async loadAllFlashcards() {
    UI.setGlobalLoading(true);
    const decks = await Decks.fetchAll();
    UI.setGlobalLoading(false);
    
    const container = $("flashcards-grid");
    if (!container) return;
    
    if (decks.length === 0) {
      container.innerHTML = `
        <div class="glass-panel empty-state">
            <h3>No flashcards yet.</h3>
            <p class="mt-8 mb-16">Generate flashcards from your study materials using Learnora AI.</p>
            <button class="btn-primary" data-hash="upload">📤 Upload a material →</button>
        </div>
      `;
    } else {
      container.innerHTML = decks.map(d => `
        <div class="glass-panel stat-card cursor-pointer hover-lift flex-between" data-hash="review-${encodeURIComponent(d.id)}">
          <div>
            <h3>🗂️ ${esc(d.title)}</h3>
            <p class="opacity-70 mt-4 text-sm">Created: ${new Date(d.created_at).toLocaleDateString()}</p>
          </div>
          <span class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;">Review</span>
        </div>
      `).join("");
    }
  },

  async loadFolders(route) {
    if (route !== "upload") {
      UI.setGlobalLoading(true);
    }
    const folders = await Folders.fetch();

    let materialCounts = {};
    if (route === "folders" && folders.length > 0) {
      const allMaterials = await Materials.fetch();
      materialCounts = allMaterials.reduce((acc, m) => {
        acc[m.folder_id] = (acc[m.folder_id] || 0) + 1;
        return acc;
      }, {});
    }

    if (route !== "upload") {
      UI.setGlobalLoading(false);
    }

    if (route === "folders") {
      const container = $("folders-container");
      if (!container) return;

      if (folders.length === 0) {
        container.innerHTML = `
          <div class="glass-panel empty-state">
              <h3>No folders yet.</h3>
              <p class="mt-8 mb-16">
                1. Create a folder for a course or subject &nbsp;→&nbsp;
                2. Upload a PDF, link, or notes into it &nbsp;→&nbsp;
                3. Learnora AI builds notes, flashcards, and quizzes for you.
              </p>
              <button class="btn-primary" data-action="new-folder">+ Create Folder</button>
          </div>
        `;
      } else {
        container.innerHTML = folders.map(f => {
          const count = materialCounts[f.id] || 0;
          const created = f.created_at
            ? new Date(f.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
            : "";
          return `
          <div class="glass-panel stat-card cursor-pointer hover-lift" style="border-top: 4px solid ${safeColor(f.color)}; position: relative;" data-hash="folder-${encodeURIComponent(f.id)}">
            <div class="folder-card-actions">
              <button type="button" class="icon-btn" data-action="rename-folder" data-folder-id="${f.id}" data-folder-name="${esc(f.name)}" aria-label="Rename folder" title="Rename folder">✎</button>
              <button type="button" class="icon-btn" data-action="delete-folder" data-folder-id="${f.id}" data-folder-name="${esc(f.name)}" aria-label="Delete folder" title="Delete folder">🗑</button>
            </div>
            <h3>📁 ${esc(f.name)}</h3>
            <p class="opacity-70 mt-8">${count} material${count === 1 ? "" : "s"}${created ? ` • Created ${created}` : ""}</p>
          </div>
        `;
        }).join("") + `
          <div class="glass-panel text-center cursor-pointer flex-center" style="border: 2px dashed rgba(255,255,255,0.2);" data-action="new-folder">
            <h3>+ New Folder</h3>
          </div>
        `;
      }
    }
    
    if (route === "upload") {
      const select = $("upload-folder");
      if (!select) return;
      select.innerHTML = '<option value="" disabled selected>Select a folder...</option>';
      folders.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
      });
    }
  },

  async loadFolderDetail(folderId) {
    UI.setGlobalLoading(true);
    // We need Materials and Decks imported!
    const materialsList = $("workspace-materials-list");
    const decksList = $("workspace-decks-list");
    const quizzesList = $("workspace-quizzes-list");

    if (!materialsList || !decksList) { UI.setGlobalLoading(false); return; }

    materialsList.innerHTML = "<p>Loading...</p>";
    decksList.innerHTML = "<p>Loading...</p>";
    if (quizzesList) quizzesList.innerHTML = "<p>Loading...</p>";

    const materials = await Materials.fetch(folderId);
    const decks = await Decks.fetch(folderId);
    const allQuizzes = await Quizzes.fetchAll();
    const quizzes = allQuizzes.filter((q) => q.folder_id === folderId);
    UI.setGlobalLoading(false);

    if (materials.length === 0) {
      materialsList.innerHTML = "<p class='opacity-70'>No materials yet.</p>";
    } else {
      materialsList.innerHTML = materials.map(m => {
        let icon = "📄";
        if (m.type === "youtube") icon = "📺";
        else if (m.type === "audio") icon = "🎤";
        else if (m.type === "text") icon = "📝";
        
        return `
          <div class="todo-item cursor-pointer hover-bright" data-hash="notes-${encodeURIComponent(m.id)}" style="display:flex; align-items:center; gap:12px; margin-bottom:8px; padding:12px; border-radius:var(--r-md); background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
            <span style="font-size:1.5rem;">${icon}</span>
            <span class="todo-text" style="font-weight:500;">${esc(m.title)}</span>
          </div>
        `;
      }).join("");
    }

    if (decks.length === 0) {
      decksList.innerHTML = "<p class='opacity-70'>No flashcard decks yet.</p>";
    } else {
      decksList.innerHTML = decks.map(d => `
        <div class="todo-item cursor-pointer" data-hash="review-${encodeURIComponent(d.id)}">
          <span class="todo-text">🗂️ ${esc(d.title)}</span>
        </div>
      `).join("");
    }

    if (quizzesList) {
      if (quizzes.length === 0) {
        quizzesList.innerHTML = "<p class='opacity-70'>No quizzes yet.</p>";
      } else {
        quizzesList.innerHTML = quizzes.map(q => `
          <div class="todo-item cursor-pointer" data-hash="quiz-${encodeURIComponent(q.id)}">
            <span class="todo-text">❓ ${esc(q.title)}</span>
          </div>
        `).join("");
      }

      const genBtn = $("btn-generate-quiz");
      if (genBtn) {
        const fresh = genBtn.cloneNode(true);
        genBtn.replaceWith(fresh);
        fresh.addEventListener("click", async () => {
          if (materials.length === 0) {
            UI.showPopup("Upload a material into this folder first, then generate a quiz from it.", "No materials yet");
            return;
          }
          UI.showQuizConfigModal(materials[0].id, folderId, materials[0].title);
        });
      }
    }
  },

  async loadNotes(materialId) {
    UI.setGlobalLoading(true);
    const content = $("notes-content");
    if (!content) { UI.setGlobalLoading(false); return; }
    
    content.innerHTML = "<p>Loading notes...</p>";
    
    const notes = await Notes.fetchByMaterial(materialId);
    UI.setGlobalLoading(false);
    
    if (notes.length > 0) {
      const rawMarkdown = notes[0].markdown_content;
      // Use AI module's hardened markdown renderer for consistency
      const { AI } = await import("./ai.js");
      content.innerHTML = AI.renderMarkdown(rawMarkdown);
    } else {
      content.innerHTML = `
        <div class="empty-state">
          <h3>No notes available for this material yet.</h3>
          <p class="mt-8">The AI is likely still processing it. Refresh in a minute.</p>
        </div>
      `;
    }
  },

  async createNewFolder() {
    const name = await UI.promptText("Give it a name so it's easy to find later.", {
      title: "New folder",
      placeholder: "e.g. CS101, Biology",
      confirmText: "Create folder",
    });
    if (!name) return;
    const colors = ['#4A90E2', '#E24A4A', '#4AE283', '#E2A84A', '#9B4AE2'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newFolder = await Folders.add(name, randomColor);
    if (newFolder) {
      this.loadFolders("folders");
    }
  },

  async renameFolder(id, currentName) {
    const name = await UI.promptText("Give this folder a new name.", {
      title: "Rename folder",
      defaultValue: currentName,
      confirmText: "Save",
    });
    if (!name || name === currentName) return;
    const ok = await Folders.rename(id, name);
    if (ok) this.loadFolders("folders");
  },

  async deleteFolder(id, name) {
    const ok = await UI.confirm(
      `This deletes the "${name}" folder itself. Its materials, flashcards, and quizzes are not deleted — they're detached from the folder and won't be reachable from Courses anymore.`,
      { title: "Delete folder?", confirmText: "Delete", danger: true },
    );
    if (!ok) return;
    const deleted = await Folders.delete(id);
    if (deleted) this.loadFolders("folders");
  },

  async startReview(deckId) {
    UI.setGlobalLoading(true);
    const container = $("flashcard-container");
    const front = $("flashcard-front");
    const back = $("flashcard-back");
    const hint = $("flashcard-hint");
    const controls = $("review-controls");
    const progress = $("review-progress");
    
    if (!container) { UI.setGlobalLoading(false); return; }

    front.textContent = "Loading cards...";
    back.classList.add("hidden");
    controls.classList.add("hidden");
    hint.classList.add("hidden");

    let cards = await Flashcards.fetchByDeck(deckId);
    UI.setGlobalLoading(false);
    
    // Simple filter: Only review cards due today or earlier
    const now = new Date();
    cards = cards.filter(c => !c.next_review_date || new Date(c.next_review_date) <= now);

    if (cards.length === 0) {
      front.innerHTML = `<div class="empty-state"><h3>All caught up! 🎉</h3><p class="mt-16">No cards due for review in this deck right now.</p></div>`;
      return;
    }

    let currentIndex = 0;

    const showCard = () => {
      if (currentIndex >= cards.length) {
        front.innerHTML = `<div class="empty-state"><h3>Review Complete! 🧠</h3><p class="mt-16">Great job.</p></div>`;
        back.classList.add("hidden");
        controls.classList.add("hidden");
        hint.classList.add("hidden");
        return;
      }
      
      const card = cards[currentIndex];
      progress.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
      front.innerHTML = esc(card.front).replace(/\n/g, '<br/>');
      back.innerHTML = esc(card.back).replace(/\n/g, '<br/>');
      
      back.classList.add("hidden");
      controls.classList.add("hidden");
      hint.classList.remove("hidden");
    };

    container.onclick = () => {
      if (currentIndex >= cards.length) return;
      if (back.classList.contains("hidden")) {
        back.classList.remove("hidden");
        hint.classList.add("hidden");
        controls.classList.remove("hidden");
      }
    };

    const scoreCard = async (quality) => {
      const card = cards[currentIndex];
      // Basic SRS approximation
      let ease = card.ease_factor || 2.5;
      let interval = card.srs_interval || 0;
      
      if (quality < 3) {
        interval = 0;
        ease = Math.max(1.3, ease - 0.2);
      } else {
        interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
        ease += 0.1;
      }

      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + interval);
      
      await Flashcards.updateReview(card.id, nextDate.toISOString(), interval, ease);
      window.dispatchEvent(new Event("flashcardReviewed"));

      currentIndex++;
      showCard();
    };

    // Bind review scores via cloned elements to prevent listener accumulation
    // across repeated startReview() calls on the same DOM nodes.
    const bindScore = (id, quality) => {
      const btn = $(id);
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", (e) => { e.stopPropagation(); scoreCard(quality); });
    };
    bindScore("btn-score-again", 1);
    bindScore("btn-score-hard",  2);
    bindScore("btn-score-good",  3);
    bindScore("btn-score-easy",  4);

    showCard();
  },

  async loadAllQuizzes() {
    UI.setGlobalLoading(true);
    const quizzes = await Quizzes.fetchAll();
    UI.setGlobalLoading(false);

    const container = $("quizzes-grid");
    if (!container) return;

    if (quizzes.length === 0) {
      container.innerHTML = `
        <div class="glass-panel empty-state">
            <h3>No quizzes yet.</h3>
            <p class="mt-8 mb-16">Click "+ Generate Quiz" above to test yourself on any topic — or open a folder to quiz yourself on a specific material.</p>
        </div>
      `;
    } else {
      container.innerHTML = quizzes.map(q => `
        <div class="glass-panel stat-card cursor-pointer hover-lift flex-between" data-hash="quiz-${encodeURIComponent(q.id)}">
          <div>
            <h3>❓ ${esc(q.title)}</h3>
            <p class="opacity-70 mt-4 text-sm">${(q.questions_json || []).length} questions · Created: ${new Date(q.created_at).toLocaleDateString()}</p>
          </div>
          <span class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;">Take Quiz</span>
        </div>
      `).join("");
    }
  },

  async startQuiz(quizId) {
    UI.setGlobalLoading(true);
    const quiz = await Quizzes.fetchById(quizId);
    UI.setGlobalLoading(false);

    const container = $("quiz-content");
    const hostBubble = $("quiz-host-bubble");
    const hostText = $("quiz-host-text");
    if (!container) return;

    if (!quiz) {
      container.innerHTML = `<h3>Quiz not found.</h3>`;
      return;
    }

    const questions = quiz.questions_json || [];
    let currentIndex = 0;
    const answers = [];

    const showHost = (message) => {
      if (hostBubble && hostText) {
        hostText.innerHTML = message;
        hostBubble.classList.remove("hidden");
        hostBubble.classList.add("pop-in");
        setTimeout(() => hostBubble.classList.remove("pop-in"), 300);
      }
    };
    
    const hideHost = () => {
      if (hostBubble) hostBubble.classList.add("hidden");
    };

    const renderQuestion = () => {
      hideHost();
      if (currentIndex >= questions.length) {
        const score = answers.filter(a => a.correct).length;
        const total = questions.length;
        const weakTopics = [...new Set(answers.filter(a => !a.correct).map(a => a.topic).filter(Boolean))];
        Quizzes.recordAttempt(quiz.id, score, total, answers, weakTopics);

        container.innerHTML = `
          <button class="btn-secondary mb-24" data-hash="quizzes">← Exit</button>
          <h2>Quiz Complete! 🎉</h2>
          <p class="mt-8" style="font-size: 1.5rem;">${score} / ${total} correct</p>
          ${weakTopics.length ? `<p class="opacity-70 mt-16">Topics to review: ${weakTopics.map(esc).join(", ")}</p>` : ""}
          <button class="btn-primary mt-24" data-hash="quizzes">Back to Quizzes</button>
        `;
        showHost(`Finished! You got ${score} out of ${total}. Check your weak topics and keep studying!`);
        return;
      }

      const q = questions[currentIndex];
      container.innerHTML = `
        <button class="btn-secondary mb-24" data-hash="quizzes">← Exit</button>
        <p class="opacity-70">Question ${currentIndex + 1} of ${questions.length}</p>
        <h3 class="mt-8 mb-16">${esc(q.question)}</h3>
        <div id="quiz-choices" class="flex-col flex-gap"></div>
        <div id="quiz-next-container" class="mt-24 hidden flex-end">
           <button id="btn-next-question" class="btn-primary">Next Question →</button>
        </div>
      `;

      if (currentIndex === 0) {
        showHost("Welcome to the quiz. Let's see what you've got!");
      }

      const choicesEl = $("quiz-choices");
      const nextContainer = $("quiz-next-container");
      const nextBtn = $("btn-next-question");
      
      let answered = false;

      (q.choices || []).forEach((choice, i) => {
        const btn = document.createElement("button");
        btn.className = "btn-secondary full-width";
        btn.style.textAlign = "left";
        btn.textContent = choice;
        
        btn.addEventListener("click", () => {
          if (answered) return;
          answered = true;
          
          const correct = i === q.correctIndex;
          answers.push({ questionId: q.id ?? currentIndex, chosenIndex: i, correct, topic: q.topic });
          
          // Style choices
          Array.from(choicesEl.children).forEach((childBtn, childIdx) => {
             if (childIdx === q.correctIndex) {
               childBtn.classList.add("correct-choice");
             } else if (childIdx === i && !correct) {
               childBtn.classList.add("wrong-choice");
             }
             childBtn.disabled = true;
          });

          // Show feedback from Host
          const defaultFeedback = correct ? "Correct!" : "Incorrect.";
          showHost(esc(q.feedback || defaultFeedback));

          // Reveal Next button
          nextContainer.classList.remove("hidden");
        });
        choicesEl.appendChild(btn);
      });
      
      nextBtn.addEventListener("click", () => {
         currentIndex++;
         renderQuestion();
      });
    };

    renderQuestion();
  },

  async loadPlanView() {
    UI.setGlobalLoading(true);
    const { Plans } = await import("./api.js");
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const weekStartISO = monday.toISOString().slice(0, 10);

    const plan = await Plans.fetchForWeek(weekStartISO);
    UI.setGlobalLoading(false);

    const summaryEl = $("plan-summary");
    const daysEl = $("plan-days");
    if (!summaryEl || !daysEl) return;

    if (!plan) {
      summaryEl.innerHTML = `<p class="opacity-70">No plan generated yet for this week. Click "Regenerate" to have Learnora AI build one from your exams and tasks.</p>`;
      daysEl.innerHTML = "";
      return;
    }

    const planJson = plan.plan_json || {};
    summaryEl.innerHTML = `<p>${esc(planJson.summary || "")}</p>`;
    const days = planJson.days || [];
    daysEl.innerHTML = days.map(d => `
      <div class="glass-panel">
        <h4>${esc(d.date)}</h4>
        <div class="flex-col flex-gap mt-8">
          ${(d.blocks || []).map(b => `
            <div class="todo-item">
              <div class="flex-between">
                <span class="todo-text">${esc(b.subject)} — ${esc(String(b.durationMins))}m (${esc(b.startHint || "")})</span>
                <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" data-action="start-plan-block" data-plan-subject="${esc(b.subject)}" data-plan-duration="${esc(String(b.durationMins || 25))}">Start →</button>
              </div>
              ${b.reason ? `<p class="opacity-70 mt-4 text-sm">${esc(b.reason)}</p>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }
};
