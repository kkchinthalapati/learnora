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
});

/* =========================================================================
   UI MODULE — Exported public API
   ========================================================================= */

export const UI = {

  /* ------ Active tab tracking ------ */
  _activeTab: "dashboard",

  /* ------ Popup ------ */

  showPopup(message, title = "Learnora") {
    const overlay = $("popup-overlay");
    const titleEl = $("popup-title");
    const msgEl = $("popup-message");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (overlay) overlay.classList.remove("hidden");
  },

  hidePopup() {
    $("popup-overlay")?.classList.add("hidden");
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

      overlay.classList.remove("hidden");
      requestAnimationFrame(() => (isPrompt ? input : confirmBtn).focus());

      const cleanup = () => {
        overlay.classList.add("hidden");
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("mousedown", onOverlay);
        document.removeEventListener("keydown", onKey);
      };
      const onConfirm = () => {
        const val = isPrompt ? input.value.trim() : true;
        cleanup();
        resolve(isPrompt ? (val || null) : true);
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

  /* ------ Theme ------ */

  toggleTheme() {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    Storage.set(THEME_KEY, isDark ? "dark" : "light");
    this._updateThemeIcon();
  },

  initTheme() {
    const saved = Storage.get(THEME_KEY);
    if (saved === "light") {
      document.body.classList.remove("dark-theme");
    }
    this._updateThemeIcon();
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

export { $, $$, esc, Storage };
