import { UI, $ } from "./ui.js";
import { Folders, Materials, Decks, Notes, Flashcards } from "./api.js";

/* =========================================================================
   ROUTER — Simple Hash-Based Navigation
   ========================================================================= */

export const Router = {
  currentRoute: "dashboard",

  init() {
    window.addEventListener("hashchange", () => this.handleHashChange());
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
    
    // Update active state in sidebar
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${route}`) {
        link.classList.add("active");
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
  },

  async loadFolders(route) {
    UI.setGlobalLoading(true);
    const folders = await Folders.fetch();
    UI.setGlobalLoading(false);
    
    if (route === "folders") {
      const container = $("folders-container");
      if (!container) return;
      
      if (folders.length === 0) {
        container.innerHTML = `
          <div class="glass-panel text-center" style="grid-column: 1 / -1; padding: 40px;">
              <h3>No folders yet.</h3>
              <p class="opacity-70 mt-8 mb-16">Create a folder to start organizing your study materials.</p>
              <button class="btn-primary" onclick="Router.createNewFolder()">+ Create Folder</button>
          </div>
        `;
      } else {
        container.innerHTML = folders.map(f => `
          <div class="glass-panel stat-card cursor-pointer" style="border-top: 4px solid ${f.color}; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='none'" onclick="window.location.hash='folder-${f.id}'">
            <h3>📁 ${f.name}</h3>
            <p class="opacity-70 mt-8">View contents →</p>
          </div>
        `).join("") + `
          <div class="glass-panel text-center cursor-pointer flex-center" style="border: 2px dashed rgba(255,255,255,0.2);" onclick="Router.createNewFolder()">
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
    
    if (!materialsList || !decksList) { UI.setGlobalLoading(false); return; }
    
    materialsList.innerHTML = "<p>Loading...</p>";
    decksList.innerHTML = "<p>Loading...</p>";

    // We fetch globally exposed API objects if they aren't imported here.
    // Let's assume they are globally available from main.js or we will fix imports.
    const materials = await Materials.fetch(folderId);
    const decks = await Decks.fetch(folderId);
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
          <div class="todo-item cursor-pointer" onclick="window.location.hash='notes-${m.id}'" style="display:flex; align-items:center; gap:12px; margin-bottom:8px; padding:12px; border-radius:var(--radius-md); background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); transition: all 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.05)'">
            <span style="font-size:1.5rem;">${icon}</span>
            <span class="todo-text" style="font-weight:500;">${m.title}</span>
          </div>
        `;
      }).join("");
    }

    if (decks.length === 0) {
      decksList.innerHTML = "<p class='opacity-70'>No flashcard decks yet.</p>";
    } else {
      decksList.innerHTML = decks.map(d => `
        <div class="todo-item cursor-pointer" onclick="window.location.hash='review-${d.id}'">
          <span class="todo-text">🗂️ ${d.title}</span>
        </div>
      `).join("");
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
        <div class="text-center">
          <h3 class="opacity-70">No notes available for this material yet.</h3>
          <p>The AI is likely still processing it. Refresh in a minute.</p>
        </div>
      `;
    }
  },

  async createNewFolder() {
    const name = prompt("Enter folder name (e.g. 'CS101', 'Biology'):");
    if (!name) return;
    const colors = ['#4A90E2', '#E24A4A', '#4AE283', '#E2A84A', '#9B4AE2'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newFolder = await Folders.add(name, randomColor);
    if (newFolder) {
      this.loadFolders("folders");
    }
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
      front.innerHTML = `<h3>All caught up! 🎉</h3><p style="font-size: 1rem;" class="mt-16 opacity-70">No cards due for review in this deck right now.</p>`;
      return;
    }

    let currentIndex = 0;

    const showCard = () => {
      if (currentIndex >= cards.length) {
        front.innerHTML = `<h3>Review Complete! 🧠</h3><p style="font-size: 1rem;" class="mt-16 opacity-70">Great job.</p>`;
        back.classList.add("hidden");
        controls.classList.add("hidden");
        hint.classList.add("hidden");
        return;
      }
      
      const card = cards[currentIndex];
      progress.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
      front.innerHTML = card.front.replace(/\n/g, '<br/>');
      back.innerHTML = card.back.replace(/\n/g, '<br/>');
      
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
      
      currentIndex++;
      showCard();
    };

    // Bind scores (we remove previous listeners by cloning or just assigning on onclick)
    $("btn-score-again").onclick = (e) => { e.stopPropagation(); scoreCard(1); };
    $("btn-score-hard").onclick = (e) => { e.stopPropagation(); scoreCard(2); };
    $("btn-score-good").onclick = (e) => { e.stopPropagation(); scoreCard(3); };
    $("btn-score-easy").onclick = (e) => { e.stopPropagation(); scoreCard(4); };

    showCard();
  }
};
// Expose for inline onclick
window.Router = Router;
