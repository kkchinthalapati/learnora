import { UI, $ } from "./ui.js";
import { Folders } from "./api.js";

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
    const folders = await Folders.fetch();
    
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
          <div class="glass-panel stat-card cursor-pointer" style="border-top: 4px solid ${f.color}; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='none'">
            <h3>📁 ${f.name}</h3>
            <p class="opacity-70 mt-8">0 materials</p>
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

  async createNewFolder() {
    const name = prompt("Enter folder name (e.g. 'CS101', 'Biology'):");
    if (!name) return;
    const colors = ['#4A90E2', '#E24A4A', '#4AE283', '#E2A84A', '#9B4AE2'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newFolder = await Folders.add(name, randomColor);
    if (newFolder) {
      this.loadFolders("folders");
    }
  }
};
// Expose for inline onclick
window.Router = Router;
