import { translations } from "../i18n.js";

/* =========================================================================
   DOM — Cached element lookups with null-safety
   ========================================================================= */

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

/* =========================================================================
   SANITIZATION — Prevent XSS in all dynamic text rendering
   ========================================================================= */

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================================
   DATES — Local-timezone-safe date helpers. Never use .toISOString() to
   derive a calendar date: it converts to UTC and silently returns the
   wrong day for positive-offset timezones near local midnight.
   ========================================================================= */

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOfWeek(d = new Date()) {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/* =========================================================================
   STORAGE — Safe localStorage wrapper
   ========================================================================= */

const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded — silent */ }
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

/* =========================================================================
   SETTINGS — Centralized settings state
   ========================================================================= */

const SETTINGS_KEY = "learnora_settings";
const THEME_KEY = "learnora_theme";

const DEFAULT_SETTINGS = Object.freeze({
  aiPersona: "tutor",
  aiConciseness: "medium",
  uiLanguage: "en",
  aiLanguage: "English",
  notifyStudyReminders: true,
  notifyTimerAlerts: true,
});

/* =========================================================================
   MODAL MANAGER — single source of truth for which modal is "on top".
   Coordinates Escape-key routing, body scroll locking, focus trapping,
   and focus restoration for the plain show/hide modals (popup, exam,
   day-detail, quiz-config). `UI._dialog()` (the app-dialog confirm/prompt)
   stays self-contained — it already manages its own Escape/focus
   lifecycle — but shares the same scroll-lock counter and focus-trap
   helper, and the global Escape handler below defers to it when open.
   ========================================================================= */

const _modalStack = [];
let _scrollLockCount = 0;

function _lockScroll() {
  _scrollLockCount++;
  if (_scrollLockCount === 1) document.body.style.overflow = "hidden";
}
function _unlockScroll() {
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if (_scrollLockCount === 0) document.body.style.overflow = "";
}

function _getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);
}

function _trapFocus(modal) {
  const onKeydown = (e) => {
    if (e.key !== "Tab") return;
    const focusables = _getFocusable(modal);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  modal.addEventListener("keydown", onKeydown);
  return () => modal.removeEventListener("keydown", onKeydown);
}

export const ModalManager = {
  open(id) {
    const modal = $(id);
    if (!modal || !modal.classList.contains("hidden")) return;
    const trigger = document.activeElement;
    modal.classList.remove("hidden");
    _lockScroll();
    const untrap = _trapFocus(modal);
    _modalStack.push({ id, trigger, untrap });
    requestAnimationFrame(() => {
      const focusables = _getFocusable(modal);
      (focusables[0] || modal).focus?.();
    });
  },

  close(id) {
    const idx = id ? _modalStack.findIndex((m) => m.id === id) : _modalStack.length - 1;
    if (idx === -1) return;
    const entry = _modalStack[idx];
    $(entry.id)?.classList.add("hidden");
    entry.untrap();
    _modalStack.splice(idx, 1);
    _unlockScroll();
    entry.trigger?.focus?.();
  },

  closeTop() {
    if (_modalStack.length === 0) return;
    this.close(_modalStack[_modalStack.length - 1].id);
  },

  isOpen(id) {
    return _modalStack.some((m) => m.id === id);
  },
};

// Single global Escape handler for all ModalManager-tracked modals. Bails
// if app-dialog (UI._dialog, Promise-based) is open — it owns its own
// Escape handling — so Escape only ever closes one layer, top-most
// first, instead of every open modal firing independently at once.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("app-dialog")?.classList.contains("hidden")) return;
  ModalManager.closeTop();
});

/* =========================================================================
   UI MODULE — Exported public API
   ========================================================================= */

export const UI = {

  /* Alias so `UI.escapeHTML(...)` also works — `esc()` is the canonical
     standalone export, this just guards against the naming mismatch. */
  escapeHTML: esc,

  /* ------ Active tab tracking ------ */
  _activeTab: "dashboard",

  /* ------ Popup ------ */

  showPopup(message, title = "Learnora") {
    const titleEl = $("popup-title");
    const msgEl = $("popup-message");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    ModalManager.open("popup-overlay");
  },

  hidePopup() {
    ModalManager.close("popup-overlay");
  },

  /* ------ Toast — brief, self-dismissing, non-blocking notifications ------ */

  showToast(message, { error = false, duration = 6000, actionLabel = null, onAction = null } = {}) {
    let container = $("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `glass-panel toast${error ? " toast-error" : ""}`;
    toast.innerHTML = `<span>${esc(message)}</span>`;

    const timer = setTimeout(() => toast.remove(), duration);

    if (actionLabel && onAction) {
      const btn = document.createElement("button");
      btn.className = "btn-primary btn-sm";
      btn.style.marginLeft = "16px";
      btn.textContent = actionLabel;
      btn.addEventListener("click", () => {
        clearTimeout(timer);
        toast.remove();
        onAction();
      });
      toast.appendChild(btn);
    }

    container.appendChild(toast);
    return toast;
  },

  notifyFetchError(context) {
    this.showToast(`Couldn't load your ${context}. Check your connection.`, { error: true });
  },

  /* ------ Confirm / Prompt dialogs (Promise-based, glass UI) ------ */

  _dialog({
    title = "Are you sure?",
    message = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false,
    isPrompt = false,
    placeholder = "",
    defaultValue = "",
  } = {}) {
    return new Promise((resolve) => {
      const overlay = $("app-dialog");
      if (!overlay) {
        resolve(isPrompt ? null : false);
        return;
      }

      $("app-dialog-title").textContent = title;
      const msgEl = $("app-dialog-message");
      msgEl.textContent = message;
      msgEl.classList.toggle("hidden", !message);

      const inputGroup = $("app-dialog-input-group");
      const input = $("app-dialog-input");
      inputGroup.classList.toggle("hidden", !isPrompt);
      if (isPrompt) {
        input.value = defaultValue;
        input.placeholder = placeholder;
      }

      const confirmBtn = $("app-dialog-confirm");
      const cancelBtn = $("app-dialog-cancel");
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;
      confirmBtn.classList.toggle("btn-danger", danger);
      confirmBtn.classList.toggle("btn-primary", !danger);

      const trigger = document.activeElement;
      overlay.classList.remove("hidden");
      _lockScroll();
      const untrap = _trapFocus(overlay);
      requestAnimationFrame(() => (isPrompt ? input : confirmBtn).focus());

      const cleanup = () => {
        overlay.classList.add("hidden");
        untrap();
        _unlockScroll();
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("mousedown", onOverlay);
        document.removeEventListener("keydown", onKey);
        trigger?.focus?.();
      };
      const onConfirm = () => {
        if (isPrompt && !input.value.trim()) {
          input.classList.remove("input-error");
          void input.offsetWidth; // trigger reflow
          input.classList.add("input-error");
          return;
        }
        const val = isPrompt ? input.value.trim() : true;
        cleanup();
        resolve(val);
      };
      const onCancel = () => {
        cleanup();
        resolve(isPrompt ? null : false);
      };
      const onOverlay = (e) => {
        if (e.target === overlay) onCancel();
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        } else if (e.key === "Enter" && (isPrompt || document.activeElement === confirmBtn)) {
          e.preventDefault();
          onConfirm();
        }
      };

      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("mousedown", onOverlay);
      document.addEventListener("keydown", onKey);
    });
  },

  confirm(message, opts = {}) {
    return this._dialog({ message, ...opts });
  },

  promptText(message, opts = {}) {
    return this._dialog({
      title: opts.title || "Enter a value",
      message,
      isPrompt: true,
      confirmText: opts.confirmText || "Save",
      ...opts,
    });
  },

  /* ------ Loading state ------ */

  setLoading(btnId, isLoading) {
    const btn = $(btnId);
    if (!btn) return;
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".loader");

    btn.disabled = isLoading;
    btn.setAttribute("aria-busy", isLoading);
    text?.classList.toggle("hidden", isLoading);
    loader?.classList.toggle("hidden", !isLoading);
  },

  setGlobalLoading(isLoading) {
    const loader = $("global-loader");
    if (loader) {
      if (isLoading) {
        loader.classList.remove("hidden");
      } else {
        loader.classList.add("hidden");
      }
    }
  },

  _aiLoaderInterval: null,

  setAILoading(isLoading, messages = []) {
    const loader = $("ai-loader");
    const textEl = $("ai-loader-text");
    if (!loader || !textEl) return;

    if (isLoading) {
      loader.classList.remove("hidden");
      if (messages.length > 0) {
        let msgIndex = 0;
        textEl.textContent = messages[0];
        
        if (this._aiLoaderInterval) clearInterval(this._aiLoaderInterval);
        this._aiLoaderInterval = setInterval(() => {
          textEl.style.opacity = '0';
          setTimeout(() => {
            msgIndex = (msgIndex + 1) % messages.length;
            textEl.textContent = messages[msgIndex];
            textEl.style.opacity = '1';
          }, 300); // Wait for fade out
        }, 3000); // Change text every 3s
      } else {
        textEl.textContent = "AI is thinking...";
      }
    } else {
      loader.classList.add("hidden");
      if (this._aiLoaderInterval) {
        clearInterval(this._aiLoaderInterval);
        this._aiLoaderInterval = null;
      }
    }
  },

  showQuizConfigModal(materialId, folderId, defaultTopic = "") {
    if (!$("quiz-config-modal")) return;

    $("quiz-material-id").value = materialId || "";
    $("quiz-folder-id").value = folderId || "";
    $("quiz-topic").value = defaultTopic;
    this.syncQuizPersonalityDesc();

    ModalManager.open("quiz-config-modal");
  },

  QUIZ_PERSONALITY_DESC: {
    "Friendly Tutor": "Patient, supportive, explains things step by step.",
    "Strict Coach": "Tough love, no-nonsense, pushes you to improve.",
    "Sarcastic Buddy": "Casual, funny, roasts your wrong answers.",
    "Academic Professor": "Formal, precise, textbook-style explanations.",
  },

  syncQuizPersonalityDesc() {
    const select = $("quiz-personality");
    const desc = $("quiz-personality-desc");
    if (select && desc) desc.textContent = this.QUIZ_PERSONALITY_DESC[select.value] || "";
  },

  /* ------ Tab navigation ------ */

  switchTab(targetRoute) {
    if (!targetRoute) return;
    this._activeTab = targetRoute;
    window.location.hash = targetRoute;
  },

  _updatePageTitle(navElement) {
    const titleEl = $("page-title");
    if (!titleEl) return;
    const rawText = navElement.textContent
      .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "")
      .trim();
    titleEl.textContent = rawText;
  },

  /* ------ Theme & Appearance System ------ */

  toggleTheme() {
    const isDark = document.body.classList.contains("dark-theme");
    const newMode = isDark ? "light" : "dark";
    this.applyAppearance({ mode: newMode });
    Storage.set("learnora_mode", newMode);
    Storage.set(THEME_KEY, newMode);
  },

  initTheme() {
    this.applyAppearance();
    
    // Listen for system theme changes if mode is system
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (Storage.get("learnora_mode") === "system") {
          this.applyAppearance({ mode: "system" });
        }
      });
    }
  },

  applyAppearance(override = {}) {
    const mode = override.mode || this._activeAppearanceState?.mode || Storage.get("learnora_mode") || Storage.get(THEME_KEY, "dark");
    const accent = override.accent || this._activeAppearanceState?.accent || Storage.get("learnora_accent", "default");
    const sidebar = override.sidebar || this._activeAppearanceState?.sidebar || Storage.get("learnora_sidebar", "glass");
    const bg = override.bg || this._activeAppearanceState?.bg || Storage.get("learnora_bg", "none");
    const font = override.font || this._activeAppearanceState?.font || Storage.get("learnora_font", "jakarta");
    const size = override.size || this._activeAppearanceState?.size || Storage.get("learnora_size", "md");

    // Mode
    if (mode === "system") {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.classList.toggle("dark-theme", prefersDark);
    } else {
      document.body.classList.toggle("dark-theme", mode === "dark");
    }

    // Attributes
    document.body.setAttribute("data-theme-color", accent);
    document.body.setAttribute("data-sidebar-style", sidebar);
    document.body.setAttribute("data-bg-texture", bg);
    document.body.setAttribute("data-font-family", font);
    document.body.setAttribute("data-font-size", size);

    this._activeAppearanceState = { mode, accent, sidebar, bg, font, size };
    this._updateThemeIcon();
    this.syncAppearanceUI();
  },

  syncAppearanceUI() {
    const s = this._activeAppearanceState || {
      mode: Storage.get("learnora_mode", "dark"),
      accent: Storage.get("learnora_accent", "default"),
      sidebar: Storage.get("learnora_sidebar", "glass"),
      bg: Storage.get("learnora_bg", "none"),
      font: Storage.get("learnora_font", "jakarta"),
      size: Storage.get("learnora_size", "md")
    };

    // Mode options
    $$(".mode-option").forEach(el => {
      el.classList.toggle("active", el.dataset.mode === s.mode);
    });

    // Theme preset swatches
    $$(".theme-preset-btn").forEach(el => {
      el.classList.toggle("active", el.dataset.theme === s.accent);
    });

    // Font family options
    $$(".font-option").forEach(el => {
      el.classList.toggle("active", el.dataset.font === s.font);
    });

    // Font size options
    $$(".size-option").forEach(el => {
      el.classList.toggle("active", el.dataset.size === s.size);
    });

    // Sidebar options
    $$(".sidebar-option").forEach(el => {
      el.classList.toggle("active", el.dataset.sidebar === s.sidebar);
    });

    // Background options
    $$(".bg-option").forEach(el => {
      el.classList.toggle("active", el.dataset.bg === s.bg);
    });

    // Live preview badge
    const badge = $("preview-theme-badge");
    if (badge) {
      const activeThemeBtn = document.querySelector(`.theme-preset-btn[data-theme="${s.accent}"] .theme-swatch-name`);
      badge.textContent = activeThemeBtn ? activeThemeBtn.textContent : s.accent;
    }
  },

  saveAppearance() {
    const s = this._activeAppearanceState || {};
    if (s.mode) Storage.set("learnora_mode", s.mode);
    if (s.mode) Storage.set(THEME_KEY, s.mode === "system" ? (document.body.classList.contains("dark-theme") ? "dark" : "light") : s.mode);
    if (s.accent) Storage.set("learnora_accent", s.accent);
    if (s.sidebar) Storage.set("learnora_sidebar", s.sidebar);
    if (s.bg) Storage.set("learnora_bg", s.bg);
    if (s.font) Storage.set("learnora_font", s.font);
    if (s.size) Storage.set("learnora_size", s.size);

    this.showPopup("Your appearance & theme preferences have been saved! ✨", "Appearance Saved");
  },

  resetAppearance() {
    const defaults = { mode: "dark", accent: "default", sidebar: "glass", bg: "none", font: "jakarta", size: "md" };
    Storage.set("learnora_mode", defaults.mode);
    Storage.set(THEME_KEY, defaults.mode);
    Storage.set("learnora_accent", defaults.accent);
    Storage.set("learnora_sidebar", defaults.sidebar);
    Storage.set("learnora_bg", defaults.bg);
    Storage.set("learnora_font", defaults.font);
    Storage.set("learnora_size", defaults.size);
    this.applyAppearance(defaults);
    this.showPopup("Appearance settings reset to defaults ✨", "Theme Reset");
  },

  _updateThemeIcon() {
    const icon = $("theme-icon");
    if (!icon) return;
    const isDark = document.body.classList.contains("dark-theme");
    icon.innerHTML = isDark
      ? '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>'
      : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';
  },

  /* ------ Settings ------ */

  loadSettings() {
    return { ...DEFAULT_SETTINGS, ...Storage.get(SETTINGS_KEY, {}) };
  },

  saveSettings() {
    const settings = {
      aiPersona: $("config-persona")?.value || "tutor",
      aiConciseness: $("config-length")?.value || "medium",
      uiLanguage: $("config-ui-lang")?.value || "en",
      aiLanguage: $("config-ai-lang")?.value || "English",
      notifyStudyReminders: $("notif-study-reminders")?.checked ?? true,
      notifyTimerAlerts: $("notif-timer-alerts")?.checked ?? true,
    };
    Storage.set(SETTINGS_KEY, settings);
    this.applyTranslations();
    this.showPopup("Your settings have been saved successfully.", "Settings Saved");
  },

  populateSettingsUI() {
    const s = this.loadSettings();
    const fields = {
      "config-persona": s.aiPersona,
      "config-length": s.aiConciseness,
      "config-ui-lang": s.uiLanguage,
      "config-ai-lang": s.aiLanguage,
    };
    for (const [id, value] of Object.entries(fields)) {
      const el = $(id);
      if (el) el.value = value;
    }
    
    if ($("notif-study-reminders")) $("notif-study-reminders").checked = s.notifyStudyReminders;
    if ($("notif-timer-alerts")) $("notif-timer-alerts").checked = s.notifyTimerAlerts;
  },

  /* ------ Translations ------ */

  applyTranslations() {
    const lang = this.loadSettings().uiLanguage;
    const dict = translations[lang] || translations.en;
    if (!dict) return;

    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!dict[key]) return;

      // Skip the active page title — it's managed by switchTab
      if (el.id === "page-title") return;

      if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
        el.placeholder = dict[key];
      } else {
        el.innerHTML = dict[key];
      }
    });

    const activeNav = document.querySelector(`.nav-link[href="#${this._activeTab}"]`);
    if (activeNav) {
      this._updatePageTitle(activeNav);
    }
  },
};

/* =========================================================================
   PUBLIC UTILITIES — Shared across modules
   ========================================================================= */

export { $, $$, esc, Storage, localDateStr, mondayOfWeek };

/* =========================================================================
   MOBILE SIDEBAR & UI POLISH (Appended Additions)
   ========================================================================= */

// Attach mobile behaviors without modifying existing exports.
window.addEventListener("DOMContentLoaded", () => {
  const sidebar = $("sidebar");
  const menuToggle = $("menu-toggle");

  if (!sidebar || !menuToggle) return;

  // 1. Create and inject the dark overlay for mobile
  const overlay = document.createElement("div");
  overlay.id = "sidebar-overlay";
  overlay.className = "sidebar-overlay";
  // Insert it right before the sidebar for proper z-indexing
  sidebar.parentNode.insertBefore(overlay, sidebar);

  // 2. Handle the menu toggle click
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent event bubbling
    
    // In your CSS, .collapsed triggers the mobile open state
    sidebar.classList.toggle("collapsed");
    
    // Only trigger the dark overlay if we are on a mobile width
    if (window.innerWidth <= 768) {
      const isOpen = sidebar.classList.contains("collapsed");
      overlay.classList.toggle("active", isOpen);
    }
  });

  // 3. Close sidebar when clicking the dark overlay
  overlay.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
    overlay.classList.remove("active");
  });

  // 4. Auto-close sidebar on mobile when a navigation link is clicked
  const navLinks = $$(".nav-links .nav-link");
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("collapsed");
        overlay.classList.remove("active");
      }
    });
  });

  // 5. Window resize listener to prevent the overlay getting stuck if rotating a tablet/resizing
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      overlay.classList.remove("active");
    }
  });
});
  // =====================================================
  // 6. Turbo Button Toggle (Open & Close on Tap)
  // =====================================================
  const turboBtn = $("turbo-toggle");
  const turboModal = $("turbo-chat");
  
  if (turboBtn && turboModal) {
      // We use { capture: true } so this fires BEFORE your existing code does
      turboBtn.addEventListener("click", (e) => {
          const isCurrentlyOpen = !turboModal.classList.contains("hidden");
          
          if (isCurrentlyOpen) {
              // It's open. Stop everything else and close it.
              e.stopPropagation(); 
              e.preventDefault();
              turboModal.classList.add("hidden");
              turboBtn.classList.remove("turbo-active");
          } else {
              // It's closed. Let the existing code open it, but add our spinning animation class
              turboBtn.classList.add("turbo-active");
          }
      }, { capture: true });
      
      // If they close it using the 'X' inside the modal, reset the button animation
      const closeBtn = $("btn-ai-close");
      if (closeBtn) {
          closeBtn.addEventListener("click", () => {
              turboBtn.classList.remove("turbo-active");
          });
      }
  }

  // =====================================================
  // 7. Personalized Splash Screen Greeting
  // =====================================================
  const splashScreen = $("global-loader");
  const splashText = document.querySelector(".splash-content h2");
  
  if (splashScreen && splashText) {
      let greeting = "Hello there!";
      try {
          // Supabase caches the session locally. We grab it to greet the user by name instantly!
          // The key is usually sb-[project-ref]-auth-token
          const authStr = localStorage.getItem("sb-mlvgqwqiynpwpwzqufdf-auth-token");

          if (authStr) {
              const authData = JSON.parse(authStr);
              const name = authData?.user?.user_metadata?.full_name;
              if (name) {
                  // Get just their first name
                  greeting = `Hello, ${String(name).split(' ')[0]}!`;
              }
          }
      } catch (e) {
          // Safe fallback if they aren't logged in yet
          greeting = "Hello!";
      }

      // full_name is user-supplied at signup — it must never reach innerHTML.
      // Build the greeting as a text node and the sub-headline as a real element.
      splashText.textContent = greeting + " ";
      const sub = document.createElement("span");
      sub.style.cssText = "display:block; font-size: 0.55em; opacity: 0.7; margin-top: 6px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase;";
      sub.textContent = "Welcome to Learnora";
      splashText.appendChild(sub);
  }
  // =====================================================
  // 8. Cinematic Boot Sequence (Minimum Load Time)
  // =====================================================
  
  // Save a reference to your original function
  const originalSetGlobalLoading = UI.setGlobalLoading;
  let isInitialBoot = true;

  // Safely overwrite the function to intercept the "hide" command
  UI.setGlobalLoading = function(isLoading) {
      if (!isLoading && isInitialBoot) {
          // If the app tries to hide the loader on first boot, intercept it.
          // Force the splash screen to stay visible for 2 seconds to play the cool animation.
          setTimeout(() => {
              // Now call the original function to actually hide it
              originalSetGlobalLoading.call(UI, false);
              isInitialBoot = false;
          }, 2000); 
      } else {
          // If it's a normal loading event (like fetching a quiz), just run normally
          originalSetGlobalLoading.call(UI, isLoading);
      }
  };
  // =====================================================
  // 9. Bulletproof Sidebar Toggle (Desktop & Mobile)
  // =====================================================
  const menuBtn = document.getElementById("menu-toggle");
  
  if (menuBtn) {
      // Use capture and stopImmediatePropagation to ensure this is the ONLY 
      // event that fires when clicking the hamburger menu, preventing double-toggles.
      menuBtn.addEventListener("click", (e) => {
          e.stopImmediatePropagation();
          e.preventDefault();
          
          const sideNav = document.getElementById("sidebar");
          if (!sideNav) return;
          
          // Toggle the collapsed class to slide it in/out
          sideNav.classList.toggle("collapsed");
          
          // If on mobile, also toggle the dark background overlay
          if (window.innerWidth <= 768) {
              const overlay = document.getElementById("sidebar-overlay");
              if (overlay) {
                  const isOpen = sideNav.classList.contains("collapsed");
                  overlay.classList.toggle("active", isOpen);
              }
          }
      }, { capture: true });
  }
    // =====================================================
  // 10. Custom Theme Color Picker & Command Bar Polish
  // =====================================================
  // Apply saved theme & appearance settings on load
  UI.applyAppearance();


  const chatInputBox = $("chat-input");
  if (chatInputBox) {
      chatInputBox.placeholder = "";
  }
  // =====================================================
  // 11/12. Chat send + Enter-to-send
  // =====================================================
  // Intentionally NOT wired here. bindAI() in js/main.js owns the click
  // handler for #btn-send-chat and the Enter handler for #chat-input.
  // Two former blocks here duplicated both: the extra `onclick` swallowed
  // the input value before main.js's listener ran, which sent a second
  // bogus "Analyze this." message whenever a file was attached, and the
  // duplicate keydown listeners fired .click() three times per Enter.

      // =====================================================
  // Safe Dashboard Command Bar Integration
  // =====================================================
  window.addEventListener("DOMContentLoaded", () => {
      const cmdInput = document.getElementById("dashboard-command-input");
      const cmdSend = document.getElementById("dashboard-command-send");
      const turboModal = document.getElementById("turbo-chat");
      const turboToggleBtn = document.getElementById("turbo-toggle");

      if (cmdInput && cmdSend) {
          const handleCommand = () => {
              const query = cmdInput.value.trim();
              if (!query) return;
              cmdInput.value = "";

              // Open the Turbo AI modal safely if hidden
              if (turboModal && turboModal.classList.contains("hidden")) {
                  turboModal.classList.remove("hidden");
                  if (turboToggleBtn) turboToggleBtn.classList.add("turbo-active");
              }

              // Mirror the text into the main chat input and trigger submission
              const mainChatInput = document.getElementById("chat-input");
              const mainSendBtn = document.getElementById("btn-send-chat");

              if (mainChatInput) {
                  mainChatInput.value = query;
              }

              if (mainSendBtn) {
                  mainSendBtn.click();
              }
          };

          cmdSend.addEventListener("click", handleCommand);
          cmdInput.addEventListener("keydown", (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCommand();
              }
          });
      }
  });
