import { translations } from "../i18n.js";

export const UI = {
  showPopup(message, title = "Learnora") {
    const overlay = document.getElementById("popup-overlay");
    if (document.getElementById("popup-title"))
      document.getElementById("popup-title").innerText = title;
    if (document.getElementById("popup-message"))
      document.getElementById("popup-message").innerText = message;
    if (overlay) overlay.classList.remove("hidden");
  },

  hidePopup() {
    document.getElementById("popup-overlay")?.classList.add("hidden");
  },

  setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".loader");

    if (isLoading) {
      btn.disabled = true;
      text?.classList.add("hidden");
      loader?.classList.remove("hidden");
    } else {
      btn.disabled = false;
      text?.classList.remove("hidden");
      loader?.classList.add("hidden");
    }
  },

  switchTab(targetId) {
    document
      .querySelectorAll(".tab-content")
      .forEach((sec) => (sec.style.display = "none"));
    document
      .querySelectorAll(".nav-links li")
      .forEach((nav) => nav.classList.remove("active"));

    const targetSection = document.getElementById(`${targetId}-section`);
    if (targetSection) targetSection.style.display = "block";

    const activeNav = document.querySelector(
      `.nav-item[data-target="${targetId}"]`,
    );
    if (activeNav) {
      activeNav.classList.add("active");
      const rawText = activeNav.innerText
        .replace(
          /[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g,
          "",
        )
        .trim();
      if (document.getElementById("page-title"))
        document.getElementById("page-title").innerText = rawText;
    }
  },

  toggleTheme() {
    document.body.classList.toggle("dark-theme");
    const isDark = document.body.classList.contains("dark-theme");
    localStorage.setItem("learnora_theme", isDark ? "dark" : "light");
  },

  initTheme() {
    if (localStorage.getItem("learnora_theme") === "light")
      document.body.classList.remove("dark-theme");
  },

  loadSettings() {
    const defaultSettings = {
      aiPersona: "tutor",
      aiConciseness: "medium",
      uiLanguage: "en",
      aiLanguage: "English",
    };
    return (
      JSON.parse(localStorage.getItem("learnora_settings")) || defaultSettings
    );
  },

  saveSettings() {
    const settings = {
      aiPersona: document.getElementById("config-persona")?.value || "tutor",
      aiConciseness:
        document.getElementById("config-length")?.value || "medium",
      uiLanguage: document.getElementById("config-ui-lang")?.value || "en",
      aiLanguage: document.getElementById("config-ai-lang")?.value || "English",
    };
    localStorage.setItem("learnora_settings", JSON.stringify(settings));
    this.applyTranslations();
    this.showPopup(
      "Your settings have been saved successfully.",
      "Settings Saved",
    );
  },

  populateSettingsUI() {
    const settings = this.loadSettings();
    if (document.getElementById("config-persona"))
      document.getElementById("config-persona").value = settings.aiPersona;
    if (document.getElementById("config-length"))
      document.getElementById("config-length").value = settings.aiConciseness;
    if (document.getElementById("config-ui-lang"))
      document.getElementById("config-ui-lang").value = settings.uiLanguage;
    if (document.getElementById("config-ai-lang"))
      document.getElementById("config-ai-lang").value = settings.aiLanguage;
  },

  applyTranslations() {
    const lang = this.loadSettings().uiLanguage;
    const dict = translations[lang] || translations["en"];
    if (!dict) return;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) {
        if (el.tagName === "INPUT" && el.placeholder)
          el.placeholder = dict[key];
        else el.innerHTML = dict[key];
      }
    });
  },
};
