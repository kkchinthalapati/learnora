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
