import { UI, $ } from "./ui.js";

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
    if (route === "folders") {
      this.loadFolders();
    }
  },

  async loadFolders() {
    // This will connect to api.js Folders.fetch() later
    const container = $("folders-container");
    if (!container) return;
    container.innerHTML = "<p>Loading folders...</p>";
    // Placeholder until we implement API
    setTimeout(() => {
      container.innerHTML = `
        <div class="glass-panel text-center">
            <h3>No folders yet.</h3>
            <p>Create a folder to start organizing your study materials.</p>
            <button class="btn-primary mt-16">Create Folder</button>
        </div>
      `;
    }, 500);
  }
};
