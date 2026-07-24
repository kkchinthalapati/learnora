import { UI, $, $$, esc, Storage, ModalManager, localDateStr, mondayOfWeek } from "./ui.js";
import { Auth, Tasks, Exams, DataAdmin, Folders, Materials, Sessions, Flashcards, Quizzes } from "./api.js";
import { Timer } from "./timer.js";
import { AI } from "./ai.js";
import { Router } from "./router.js";
import { supabase } from "./supabase.js";

/* =========================================================================
   STATE
   ========================================================================= */

let displayDate = new Date();
let cachedExams = [];

/* =========================================================================
   HELPERS
   ========================================================================= */

function getGreeting(name) {
  const hr = new Date().getHours();
  const period = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}! 👋`;
}

function formatDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Pending tasks with the soonest/overdue due date first, undated pending
// tasks after (in their original order), completed tasks last.
function sortTasksByUrgency(tasks) {
  const pending = tasks.filter((t) => !t.is_done);
  const done = tasks.filter((t) => t.is_done);
  pending.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
  return [...pending, ...done];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* =========================================================================
   BOOT
   ========================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  UI.initTheme();
  UI.populateSettingsUI();
  UI.applyTranslations();

  const user = await Auth.getSession();

  if (user) {
    $("auth-wall")?.classList.add("hidden");
    $("main-app")?.classList.remove("hidden");

    const name = user.user_metadata?.full_name?.split(" ")[0] || "Student";
    const greetingEl = $("user-greeting");
    if (greetingEl) greetingEl.textContent = getGreeting(name);

    Router.init();
    initWorkspace();
  } else {
    $("auth-wall")?.classList.remove("hidden");
    const mainApp = $("main-app");
    if (mainApp) mainApp.style.display = "none";
  }

  UI.setGlobalLoading(false);

  bindAuth();
  bindNavigation();
  bindSettings();
  bindTimer();
  bindTasks();
  bindCalendar();
  bindAI();
  bindUploadHub();
});

/* =========================================================================
   UPLOAD HUB (Phase 2)
   ========================================================================= */

function bindUploadHub() {
  const typeRadios = document.querySelectorAll('input[name="material-type"]');
  const dropzone = document.getElementById('upload-dropzone');
  const linkInput = document.getElementById('upload-link-input');
  const fileInput = document.getElementById('hub-file-upload');
  const folderSelect = document.getElementById('upload-folder');
  const processBtn = document.getElementById('btn-process-material');

  if (!dropzone) return;

  $("btn-browse-files")?.addEventListener("click", () => fileInput.click());

  // Friction fix: brand-new users with zero folders would otherwise hit a
  // dead end here, forced to detour to #folders before they can upload anything.
  $("btn-upload-new-folder")?.addEventListener("click", async () => {
    const name = await UI.promptText("Give it a name so it's easy to find later.", {
      title: "New folder",
      placeholder: "e.g. CS101, Biology",
      confirmText: "Create folder",
    });
    if (!name) return;
    const colors = ["#4A90E2", "#E24A4A", "#4AE283", "#E2A84A", "#9B4AE2"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newFolder = await Folders.add(name, randomColor);
    if (newFolder && folderSelect) {
      const opt = document.createElement("option");
      opt.value = newFolder.id;
      opt.textContent = newFolder.name;
      folderSelect.appendChild(opt);
      folderSelect.value = newFolder.id;
    }
  });

  // Toggle UI based on material type
  typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'youtube' || type === 'text') {
        dropzone.classList.add('hidden');
        linkInput.classList.remove('hidden');
        if (type === 'text') {
          linkInput.querySelector('label').textContent = "Paste Text Content";
          linkInput.querySelector('input').type = "text";
          linkInput.querySelector('input').placeholder = "Paste your notes or text here...";
        } else {
          linkInput.querySelector('label').textContent = "YouTube URL";
          linkInput.querySelector('input').type = "url";
          linkInput.querySelector('input').placeholder = "https://youtube.com/watch?v=...";
        }
      } else {
        dropzone.classList.remove('hidden');
        linkInput.classList.add('hidden');
      }
    });
  });

  // Handle Drag & Drop styling
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
    dropzone.style.backgroundColor = 'transparent';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
    dropzone.style.backgroundColor = 'transparent';
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      const h3 = dropzone.querySelector('h3');
      if (h3) h3.textContent = e.dataTransfer.files[0].name;
      const ext = e.dataTransfer.files[0].name.split('.').pop().toLowerCase();
      const isAudio = ['mp3', 'mp4', 'wav', 'm4a', 'aac', 'ogg'].includes(ext);
      document.querySelector(`input[name="material-type"][value="${isAudio ? 'audio' : 'pdf'}"]`).checked = true;
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length) {
      const h3 = dropzone.querySelector('h3');
      if (h3) h3.textContent = fileInput.files[0].name;
      const ext = fileInput.files[0].name.split('.').pop().toLowerCase();
      const isAudio = ['mp3', 'mp4', 'wav', 'm4a', 'aac', 'ogg'].includes(ext);
      document.querySelector(`input[name="material-type"][value="${isAudio ? 'audio' : 'pdf'}"]`).checked = true;
    }
  });

  processBtn.addEventListener('click', async () => {
    const type = document.querySelector('input[name="material-type"]:checked').value;
    const folderId = folderSelect.value;
    const customTitle = document.getElementById('upload-custom-title')?.value.trim() || "";
    
    if (!folderId) {
      UI.showPopup("Please select or create a folder first.", "Folder Required");
      return;
    }

    const originalBtnText = processBtn.innerHTML;
    processBtn.innerHTML = "⏳ Processing Material (This may take a minute)...";
    processBtn.disabled = true;

    try {
      let material;
      let fileDataPayload = null;

      if (type === 'pdf' || type === 'audio') {
        if (!fileInput.files.length) throw new Error("Please select a file.");
        const file = fileInput.files[0];
        // Same limit as the chat uploader — reading a huge file into base64
        // freezes the tab, and the edge function rejects it anyway
        if (file.size > 10 * 1024 * 1024) {
          throw new Error("File too large. Maximum size is 10MB.");
        }
        material = await Materials.uploadFile(file, folderId, type, customTitle);
        
        // Read file into base64 to send to edge function
        fileDataPayload = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve({
            name: file.name,
            mimeType: file.type,
            data: e.target.result.split(',')[1]
          });
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });

      } else {
        const urlOrText = linkInput.querySelector('input').value;
        if (!urlOrText) throw new Error("Please provide a link or text.");
        material = await Materials.addLink(urlOrText, folderId, customTitle);
        
        // Pass the raw text or link directly
        fileDataPayload = { name: (type === 'youtube' ? "YouTube Link" : "Raw Text"), mimeType: "text/plain", data: btoa(unescape(encodeURIComponent(urlOrText))) };
      }
      
      // TRIGGER AI GENERATION IN THE BACKGROUND
      let container = document.getElementById("toast-container");
      UI.setAILoading(true, [
        "AI is thinking...",
        "Analyzing your material...",
        "Generating flashcards...",
        "Synthesizing notes...",
        "Almost there..."
      ]);

      try {
        await AI.generateStudyMaterial(material, folderId, fileDataPayload);
        UI.setAILoading(false);
        // Reset UI
        fileInput.value = "";
        if (document.getElementById('upload-custom-title')) document.getElementById('upload-custom-title').value = "";
        linkInput.querySelector('input').value = "";
        const h3 = dropzone.querySelector('h3');
        if (h3) h3.textContent = "Drag & Drop";
        
        // Redirect to folder
        window.location.hash = `folder-${folderId}`;
      } catch (err) {
        UI.setAILoading(false);
        console.error("AI Generation failed:", err);
        UI.showPopup(err.message || "Generation failed.", "Error");
      }
    } catch (err) {
      UI.showPopup(err.message, "Upload Failed");
    } finally {
      processBtn.innerHTML = originalBtnText;
      processBtn.disabled = false;
    }
  });
}

/* =========================================================================
   AUTH BINDINGS
   ========================================================================= */

function bindAuth() {
  let signingUp = false;
  let loggingIn = false;

  // Keep the shared brand header in sync with the active auth view.
  const setAuthHeader = (title, sub) => {
    const h1 = document.querySelector(".brand-header h1");
    const p = document.querySelector(".brand-header p");
    if (h1) h1.textContent = title;
    if (p) p.textContent = sub;
  };

  // Show inline feedback inside the auth card (popup-overlay is inside #main-app
  // which is hidden during auth, so we use the dedicated #auth-status banner).
  const showAuthStatus = (msg, type = "error") => {
    const el = $("auth-status");
    if (!el) return;
    el.textContent = msg;
    el.className = `auth-status status-${type}`;
    el.classList.remove("hidden");
    // Auto-hide after 6 seconds
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add("hidden"), 6000);
  };

  const clearAuthStatus = () => {
    const el = $("auth-status");
    if (el) { el.classList.add("hidden"); el.textContent = ""; }
  };

  // Auto-refresh when session is established, but only if the user is currently on the auth wall
  supabase.auth.onAuthStateChange((event, session) => {
    const authWallVisible = !$("auth-wall")?.classList.contains("hidden");
    if (event === "PASSWORD_RECOVERY") {
      $("auth-wall")?.classList.remove("hidden");
      const mainApp = $("main-app");
      if (mainApp) mainApp.style.display = "none";
      
      $$(".auth-form").forEach(f => f.classList.add("hidden"));
      $("reset-password-form")?.classList.remove("hidden");
      setAuthHeader("Reset Password", "Choose a strong, new password.");
      return;
    }
    if (session?.user && authWallVisible && event !== "PASSWORD_RECOVERY") {
      window.location.reload();
    }
  });

  // Toggle password visibility
  $$(".password-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const input = e.currentTarget.parentElement.querySelector("input");
      if (input.type === "password") {
        input.type = "text";
        e.currentTarget.textContent = "Hide";
      } else {
        input.type = "password";
        e.currentTarget.textContent = "Show";
      }
    });
  });

  // Password strength logic
  const bindStrengthMeter = (inputId, containerId, textId) => {
    const inputEl = $(inputId);
    const containerEl = $(containerId);
    const textEl = $(textId);
    if (!inputEl || !containerEl || !textEl) return;

    inputEl.addEventListener("input", (e) => {
      const val = e.target.value;
      if (!val) {
        containerEl.classList.add("hidden");
        return;
      }
      containerEl.classList.remove("hidden");
      
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
      if (/\d/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      containerEl.className = "password-strength-container"; // reset
      if (score <= 1 || val.length < 8) {
        containerEl.classList.add("strength-weak");
        textEl.textContent = "Too Weak (Need 8+ chars & mix)";
      } else if (score === 2) {
        containerEl.classList.add("strength-fair");
        textEl.textContent = "Fair";
      } else if (score === 3) {
        containerEl.classList.add("strength-good");
        textEl.textContent = "Good";
      } else {
        containerEl.classList.add("strength-strong");
        textEl.textContent = "Strong";
      }
    });
  };

  bindStrengthMeter("signup-password", "password-strength-container", "strength-text");
  bindStrengthMeter("reset-password", "reset-password-strength-container", "reset-strength-text");
  $("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loggingIn) return;
    loggingIn = true;
    clearAuthStatus();
    UI.setLoading("login-btn", true);
    try {
      const ok = await Auth.login(
        $("login-email").value.trim(),
        $("login-password").value,
      );
      if (ok) {
        window.location.reload();
        return;
      }
      // Auth.login calls UI.showPopup internally, but since popup-overlay lives
      // inside #main-app (hidden), we also mirror it to the inline auth-status banner.
      showAuthStatus("Invalid email or password. Please try again.");
    } catch (err) {
      console.error("[Auth.login] Unhandled:", err);
      showAuthStatus("Something went wrong. Please try again.");
    }
    UI.setLoading("login-btn", false);
    loggingIn = false;
  });

  $("signup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const pass = $("signup-password").value;
    const confirmPass = $("signup-confirm-password").value;

    if (pass.length < 8) {
      showAuthStatus("Password must be at least 8 characters long.");
      return;
    }
    if (pass !== confirmPass) {
      showAuthStatus("Passwords do not match. Please re-enter them.");
      return;
    }

    if (signingUp) return;
    signingUp = true;
    UI.setLoading("signup-btn", true);
    try {
      const email = $("signup-email").value.trim();
      const ok = await Auth.signup(
        $("signup-name").value.trim(),
        email,
        pass,
        $("signup-dob").value,
      );
      if (ok === "verification-sent") {
        UI.setLoading("signup-btn", false);
        const form = $("signup-form");
        const inputs = form ? form.querySelectorAll("input, button") : [];
        inputs.forEach((el) => (el.disabled = true));
        const btnText = $("signup-btn")?.querySelector(".btn-text");
        if (btnText) btnText.textContent = "Check your email inbox! ✉️";

        // Background poll: silently log in once the email is confirmed, then refresh.
        // Every silent attempt is a real auth request that counts toward Supabase's
        // rate limit, so we keep the cadence gentle: every 20s for ~5 minutes.
        if (window.authPollInterval) clearInterval(window.authPollInterval);
        let pollAttempts = 0;
        const MAX_POLL_ATTEMPTS = 15;
        const pollInterval = setInterval(async () => {
          pollAttempts++;
          if (pollAttempts > MAX_POLL_ATTEMPTS) {
            clearInterval(pollInterval);
            // Give up gracefully: re-enable the form so the user can log in manually.
            inputs.forEach((el) => (el.disabled = false));
            if (btnText) btnText.textContent = "Sign up";
            UI.showPopup(
              "Once you've clicked the confirmation link in your email, just log in normally.",
              "Almost there",
            );
            return;
          }
          try {
            const loggedIn = await Auth.login(email, pass, true); // silent login attempt
            if (loggedIn) {
              clearInterval(pollInterval);
              window.location.reload();
            }
          } catch (e) {
            // Suppress errors during polling
          }
        }, 20000);

        // Save interval to prevent multiple polling loops
        window.authPollInterval = pollInterval;
        return;
      }
      if (ok) {
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error("[Auth.signup] Unhandled:", err);
      showAuthStatus("Something went wrong. Please try again.");
    }
    UI.setLoading("signup-btn", false);
    signingUp = false;
  });

  $("btn-show-signup")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("signup-form")?.classList.remove("hidden");
    clearAuthStatus();
    setAuthHeader("Create your account", "Start studying smarter in minutes.");
  });

  $("btn-show-login")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("login-form")?.classList.remove("hidden");
    clearAuthStatus();
    setAuthHeader("Welcome back", "Sign in to your study workspace.");
  });

  $("btn-show-forgot")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("forgot-password-form")?.classList.remove("hidden");
    clearAuthStatus();
    setAuthHeader("Reset Password", "We'll send you a recovery link.");
  });

  $("btn-show-login-from-forgot")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("login-form")?.classList.remove("hidden");
    clearAuthStatus();
    setAuthHeader("Welcome back", "Sign in to your study workspace.");
  });

  $("forgot-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI.setLoading("forgot-btn", true);
    const email = $("forgot-email").value.trim();
    const ok = await Auth.resetPasswordRequest(email);
    UI.setLoading("forgot-btn", false);
    if (ok) {
      showAuthStatus("If an account exists, a reset link has been sent to your email.", "success");
      $("btn-show-login-from-forgot")?.click(); // Go back to login
    }
  });

  $("reset-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("reset-password").value;
    const confirmPass = $("reset-confirm-password").value;

    if (pass.length < 8) {
      showAuthStatus("Password must be at least 8 characters long.");
      UI.setLoading("reset-btn", false);
      return;
    }
    if (pass !== confirmPass) {
      showAuthStatus("Passwords do not match. Please re-enter them.");
      UI.setLoading("reset-btn", false);
      return;
    }

    UI.setLoading("reset-btn", true);
    const ok = await Auth.updatePassword(pass);
    UI.setLoading("reset-btn", false);
    if (ok) {
      showAuthStatus("Your password has been updated successfully. You are now logged in.", "success");
      setTimeout(() => window.location.reload(), 1500);
    }
  });

  // #btn-logout no longer exists in index.html — the two live logout buttons
  // are in the settings panel and the header.
  // Settings panel also has a logout button
  $("settings-logout-btn")?.addEventListener("click", Auth.logout);
  $("header-logout-btn")?.addEventListener("click", Auth.logout);
}

/* =========================================================================
   NAVIGATION BINDINGS
   ========================================================================= */

function bindNavigation() {
  $("btn-close-popup")?.addEventListener("click", UI.hidePopup);
  $("theme-toggle")?.addEventListener("click", () => UI.toggleTheme());

  $("menu-toggle")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("collapsed");
  });

  // Auto-close sidebar on mobile when a nav link is clicked
  document.querySelector(".nav-links")?.addEventListener("click", (e) => {
    if (e.target.closest("a.nav-link")) {
      if (window.innerWidth <= 768) {
        $("sidebar")?.classList.add("collapsed"); // add = collapse/hide on mobile
      }
    }
  });
}

/* =========================================================================
   SETTINGS BINDINGS
   ========================================================================= */

/** Show inline feedback (success or error) next to a settings control */
function showFeedback(elementId, message, type = "success") {
  const el = $(elementId);
  if (!el) return;
  el.className = `inline-feedback show ${type}`;
  el.textContent = (type === "success" ? "✓ " : "✗ ") + message;
  // Auto-hide after 5 seconds
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 5000);
}


function bindSettings() {
  // ----- Tab switching -----
  document.querySelectorAll(".settings-tab-btn[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.settingsTab;
      // Update active tab button
      document.querySelectorAll(".settings-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Show matching panel
      document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
      const panel = $(`settings-panel-${tab}`);
      if (panel) panel.classList.add("active");
    });
  });

  // ----- Save Preferences (AI + Localization) -----
  $("btn-save-settings")?.addEventListener("click", () => UI.saveSettings());

  // ----- Appearance Controls -----
  document.querySelectorAll(".mode-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ mode: btn.dataset.mode });
    });
  });

  document.querySelectorAll(".theme-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ accent: btn.dataset.theme });
    });
  });

  document.querySelectorAll(".font-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ font: btn.dataset.font });
    });
  });

  document.querySelectorAll(".size-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ size: btn.dataset.size });
    });
  });

  document.querySelectorAll(".sidebar-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ sidebar: btn.dataset.sidebar });
    });
  });

  document.querySelectorAll(".bg-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      UI.applyAppearance({ bg: btn.dataset.bg });
    });
  });

  // ----- Custom Colour Studio -----

  // Pointer capture keeps the drag alive when the cursor leaves the element,
  // and makes the same code path work for mouse, touch and pen.
  const bindDragArea = (el, onMove) => {
    if (!el) return;
    const emit = (e) => {
      const r = el.getBoundingClientRect();
      onMove(
        r.width ? (e.clientX - r.left) / r.width : 0,
        r.height ? (e.clientY - r.top) / r.height : 0
      );
    };
    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      // Capture can throw if the pointer is already gone; the flag above is
      // the real drag state so the gesture still works without it.
      try { el.setPointerCapture(e.pointerId); } catch { /* no capture */ }
      emit(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (dragging) emit(e);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    el.addEventListener("pointerup", endDrag);
    // Touch drags get cancelled when the browser claims the gesture — without
    // this the control would stay latched to the pointer.
    el.addEventListener("pointercancel", endDrag);
  };

  bindDragArea($("custom-sv-field"), (x, y) => UI.setPickerHsv({ s: x, v: 1 - y }));
  bindDragArea($("custom-hue-track"), (x) => UI.setPickerHsv({ h: x * 360 }));

  $("custom-sv-field")?.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves = {
      ArrowLeft: { s: -step }, ArrowRight: { s: step },
      ArrowUp: { v: step }, ArrowDown: { v: -step },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const cur = UI._pickerHsv();
    UI.setPickerHsv({
      s: move.s != null ? cur.s + move.s : cur.s,
      v: move.v != null ? cur.v + move.v : cur.v,
    });
  });

  $("custom-hue-track")?.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 15 : 3;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    UI.setPickerHsv({ h: UI._pickerHsv().h + (e.key === "ArrowRight" ? step : -step) });
  });

  const hexInput = $("custom-hex-input");
  hexInput?.addEventListener("input", () => {
    hexInput.classList.toggle("is-invalid", !UI.setCustomColourHex(hexInput.value));
  });
  hexInput?.addEventListener("blur", () => {
    // Discard a half-typed value rather than leaving the field out of sync.
    hexInput.classList.remove("is-invalid");
    UI.syncCustomThemeUI({ force: true });
  });
  hexInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hexInput.blur();
  });

  // EyeDropper is Chromium-only — the button stays hidden everywhere else.
  const eyedropperBtn = $("custom-eyedropper-btn");
  if (eyedropperBtn && "EyeDropper" in window) {
    eyedropperBtn.classList.remove("hidden");
    eyedropperBtn.addEventListener("click", async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        UI.setCustomColourHex(sRGBHex);
      } catch {
        /* user pressed Escape — nothing to do */
      }
    });
  }

  // Swatch chips are re-rendered on every change, so delegate from the row.
  $("custom-swatch-row")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-swatch]");
    if (removeBtn) {
      e.stopPropagation();
      UI.removeCustomColour(Number(removeBtn.dataset.removeSwatch));
      return;
    }
    const chip = e.target.closest("[data-swatch-index]");
    if (chip) UI.updateCustomTheme({ activeIndex: Number(chip.dataset.swatchIndex) });
  });

  $("custom-add-colour-btn")?.addEventListener("click", () => UI.addCustomColour());

  $("custom-intensity")?.addEventListener("input", (e) => {
    UI.updateCustomTheme({ intensity: e.target.value });
  });

  $("custom-surprise-btn")?.addEventListener("click", () => UI.surpriseCustomTheme());
  $("custom-reset-btn")?.addEventListener("click", () => UI.resetCustomTheme());

  $("btn-save-appearance")?.addEventListener("click", () => UI.saveAppearance());
  $("btn-reset-appearance")?.addEventListener("click", () => UI.resetAppearance());

  // ----- Export Data -----
  $("btn-export-data")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "Download a CSV copy of all your study logs and tasks to your device?",
      { title: "Export Data?", confirmText: "Export" }
    );
    if (ok) DataAdmin.exportCSV();
  });

  // ----- Edit Display Name -----
  $("btn-edit-name")?.addEventListener("click", () => {
    const form = $("name-edit-form");
    if (form) form.classList.toggle("open");
    const isOpen = form?.classList.contains("open");
    const btn = $("btn-edit-name");
    if (btn) btn.textContent = isOpen ? "Cancel" : "Edit";
    if (isOpen) $("settings-name-input")?.focus();
  });

  $("btn-save-name")?.addEventListener("click", async () => {
    const nameInput = $("settings-name-input");
    const newName = nameInput?.value.trim();
    if (!newName) {
      showFeedback("name-feedback", "Name cannot be empty.", "error");
      return;
    }
    const btn = $("btn-save-name");
    btn.disabled = true;
    btn.textContent = "Saving...";

    const result = await Auth.updateProfile({ full_name: newName });
    if (result.ok) {
      showFeedback("name-feedback", "Display name updated.", "success");
      // Update the UI immediately
      $("settings-display-name").textContent = newName;
      const initials = newName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      $("settings-avatar-initials").textContent = initials;
      $("user-greeting").textContent = getGreeting(newName.split(" ")[0]);
      $("name-edit-form")?.classList.remove("open");
    } else {
      showFeedback("name-feedback", result.message, "error");
    }
    btn.disabled = false;
    btn.textContent = "Save";
  });

  // ----- Change Email -----
  $("btn-change-email-toggle")?.addEventListener("click", () => {
    const form = $("email-edit-form");
    if (form) form.classList.toggle("open");
    const isOpen = form?.classList.contains("open");
    const btn = $("btn-change-email-toggle");
    if (btn) btn.textContent = isOpen ? "Cancel" : "Change";
    if (isOpen) $("settings-new-email")?.focus();
  });

  $("btn-submit-email")?.addEventListener("click", async () => {
    const newEmail = $("settings-new-email")?.value.trim();
    if (!newEmail || !newEmail.includes("@")) {
      showFeedback("email-feedback", "Please enter a valid email address.", "error");
      return;
    }
    // Check if same as current
    const currentEmail = $("settings-email-display")?.textContent;
    if (newEmail === currentEmail) {
      showFeedback("email-feedback", "This is already your current email.", "error");
      return;
    }

    const btn = $("btn-submit-email");
    btn.disabled = true;
    btn.textContent = "Sending...";

    const result = await Auth.updateEmail(newEmail);
    if (result.ok) {
      showFeedback("email-feedback", `Confirmation email sent to ${newEmail}. Check your inbox.`, "success");
      $("settings-new-email").value = "";
    } else {
      showFeedback("email-feedback", result.message, "error");
    }
    btn.disabled = false;
    btn.textContent = "Update";
  });

  // ----- Browser Notifications (Settings tab) -----
  const updateNotifUI = () => {
    const desc = $("notif-permission-desc");
    const btnRow = $("notif-permission-row");
    const btn = $("btn-request-notif-perm");
    if (!desc || !btn || !btnRow) return;

    if (!("Notification" in window)) {
      desc.textContent = "Your browser does not support notifications.";
      btn.classList.add("hidden");
      return;
    }

    if (Notification.permission === "granted") {
      desc.textContent = "✓ Enabled";
      desc.style.color = "var(--success)";
      btn.classList.add("hidden");
    } else if (Notification.permission === "denied") {
      desc.textContent = "Denied. Please enable in your browser settings.";
      desc.style.color = "var(--danger)";
      btn.classList.add("hidden");
    } else {
      desc.textContent = "Not enabled yet.";
      desc.style.color = "var(--text-muted)";
      btn.classList.remove("hidden");
    }
  };

  updateNotifUI();

  $("btn-request-notif-perm")?.addEventListener("click", () => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(() => {
      updateNotifUI();
    });
  });

  $("notif-study-reminders")?.addEventListener("change", () => UI.saveSettings());
  $("notif-timer-alerts")?.addEventListener("change", () => UI.saveSettings());

  // ----- Change Password (Security tab) -----
  // Bind the password strength meter for the settings page
  const bindSettingsStrength = () => {
    const inputEl = $("settings-new-password");
    const containerEl = $("settings-password-strength-container");
    const textEl = $("settings-strength-text");
    if (!inputEl || !containerEl || !textEl) return;

    inputEl.addEventListener("input", () => {
      const val = inputEl.value;
      if (!val) { containerEl.classList.add("hidden"); return; }
      containerEl.classList.remove("hidden");

      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
      if (/\d/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      containerEl.className = "password-strength-container";
      if (score <= 1 || val.length < 8) {
        containerEl.classList.add("strength-weak");
        textEl.textContent = "Too Weak (Need 8+ chars & mix)";
      } else if (score === 2) {
        containerEl.classList.add("strength-fair");
        textEl.textContent = "Fair";
      } else if (score === 3) {
        containerEl.classList.add("strength-good");
        textEl.textContent = "Good";
      } else {
        containerEl.classList.add("strength-strong");
        textEl.textContent = "Strong";
      }
    });
  };
  bindSettingsStrength();

  // Bind password toggle buttons added in the settings Security tab
  document.querySelectorAll("#settings-panel-security .password-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const input = e.currentTarget.parentElement.querySelector("input");
      if (input.type === "password") {
        input.type = "text";
        e.currentTarget.textContent = "Hide";
      } else {
        input.type = "password";
        e.currentTarget.textContent = "Show";
      }
    });
  });

  $("btn-change-password")?.addEventListener("click", async () => {
    const newPass = $("settings-new-password")?.value;
    const confirmPass = $("settings-confirm-password")?.value;

    if (!newPass || newPass.length < 8) {
      showFeedback("password-feedback", "Password must be at least 8 characters.", "error");
      return;
    }
    if (newPass !== confirmPass) {
      showFeedback("password-feedback", "Passwords do not match.", "error");
      return;
    }

    const btn = $("btn-change-password");
    btn.disabled = true;
    btn.textContent = "Updating...";

    const result = await Auth.changePassword(newPass);
    if (result.ok) {
      showFeedback("password-feedback", "Password updated. Other sessions have been signed out.", "success");
      $("settings-new-password").value = "";
      $("settings-confirm-password").value = "";
      $("settings-password-strength-container")?.classList.add("hidden");
    } else {
      showFeedback("password-feedback", result.message, "error");
    }
    btn.disabled = false;
    btn.textContent = "Update Password";
  });

  // ----- Sign Out Others -----
  $("btn-signout-others")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "This will sign you out of all other browsers and devices.",
      { title: "Sign out other sessions?", confirmText: "Sign Out Others", danger: true }
    );
    if (!ok) return;

    const result = await Auth.signOutOthers();
    if (result.ok) {
      showFeedback("sessions-feedback", "All other sessions have been signed out.", "success");
    } else {
      showFeedback("sessions-feedback", result.message, "error");
    }
  });

  // ----- Wipe Data (Danger Zone) -----
  $("btn-wipe-data")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "This permanently deletes all your tasks, study logs, exams, weekly plans, quizzes, and saved timer presets from the cloud and this device. Folders, materials, notes, and flashcards are not affected. This cannot be undone.",
      { title: "Wipe all data?", confirmText: "Delete everything", danger: true },
    );
    if (ok) DataAdmin.wipe();
  });

  // ----- Delete Account (Danger Zone) -----
  $("btn-delete-account")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "This will permanently delete your account and all data. This action is IRREVERSIBLE.",
      { title: "Delete your account?", confirmText: "Yes, delete my account", danger: true }
    );
    if (!ok) return;

    // Double confirmation
    const doubleOk = await UI.confirm(
      "Last chance — are you absolutely sure?",
      { title: "Final confirmation", confirmText: "Delete forever", danger: true }
    );
    if (!doubleOk) return;

    const result = await Auth.deleteAccount();
    if (result.ok) {
      window.location.reload();
    } else {
      showFeedback("danger-feedback", result.message, "error");
    }
  });
}

/* =========================================================================
   TIMER BINDINGS
   ========================================================================= */

function bindTimer() {
  Timer.init();

  $("btn-timer-start")?.addEventListener("click", () => Timer.start());
  $("btn-timer-pause")?.addEventListener("click", () => Timer.pause());
  $("btn-timer-reset")?.addEventListener("click", () => {
    const isCountDown = !Timer._isCountUp();
    const hasStarted = Timer.state.timeLeft < Timer.state.totalTime;
    
    if (isCountDown && hasStarted) {
      UI.confirm("Are you sure you want to discard your current session progress?", {
        title: "Reset Timer",
        confirmText: "Reset",
        danger: true
      }).then(confirmed => {
        if (confirmed) Timer.reset();
      });
    } else {
      Timer.reset();
    }
  });
  $("btn-timer-extend")?.addEventListener("click", () => Timer.extend());
  $("btn-timer-break")?.addEventListener("click", () => Timer.takeBreak());

  // Timer-type selector. While a timer runs, switching type never cancels it —
  // it's staged and the config panel switches to that type for setup.
  document.querySelectorAll('input[name="timer-type"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      if (Timer.isRunning()) Timer.stageType(radio.value);
      else Timer.applyNow(Timer.readInputs(), radio.value);
    });
  });

  // Apply & Reset — the one explicit "switch now" action. If a timer is
  // running, confirm before we tear it down.
  $("btn-apply-timer")?.addEventListener("click", async () => {
    const type = Timer.stagedType() || Timer.currentType();
    if (Timer.isRunning()) {
      const ok = await UI.confirm(
        "A timer is currently running. Switch to these settings and reset it now?",
        {
          title: "Timer running",
          confirmText: "Reset & switch",
          cancelText: "Keep running",
          danger: true,
        },
      );
      if (!ok) return;
    }
    Timer.applyNow(Timer.readInputs(), type);
  });

  // Workflow presets (Pomodoro durations) — event delegation.
  document.querySelector(".preset-buttons")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-preset");
    if (!btn) return;
    const presets = {
      deep: { focus: 90, short: 15, long: 30, maxCycles: 4 },
      cram: { focus: 45, short: 10, long: 20, maxCycles: 4 },
      light: { focus: 20, short: 5, long: 15, maxCycles: 4 },
    };
    const p = presets[btn.dataset.preset];
    if (!p) return;
    
    // Bug 9: Only change the config inputs
    const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };
    setVal("config-focus", p.focus);
    setVal("config-short", p.short);
    setVal("config-long", p.long);
    setVal("config-cycles", p.maxCycles);

    // Auto-select pomodoro mode if it isn't active
    const radio = document.querySelector('input[name="timer-type"][value="pomodoro"]');
    if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
    }
  });

  // Persistent mini-timer controls.
  $("mini-timer-open")?.addEventListener("click", () => UI.switchTab("timer"));
  $("mini-timer-toggle")?.addEventListener("click", () => Timer.toggle());

  // Keep the mini-timer's show/hide in sync as the user navigates views.
  window.addEventListener("hashchange", () => {
    Timer.updateUI();
    if (window.location.hash !== "#timer") return;

    // Pre-stage a plan block's subject/duration when arriving via a
    // "Start focus session" button on the #plan view (Router's start-plan-block action).
    const pendingTask = sessionStorage.getItem("pending_timer_task");
    const pendingMins = sessionStorage.getItem("pending_timer_focus_mins");
    if (!pendingTask && !pendingMins) return;
    sessionStorage.removeItem("pending_timer_task");
    sessionStorage.removeItem("pending_timer_focus_mins");

    if (pendingMins) {
      const focusInput = $("config-focus");
      if (focusInput) focusInput.value = pendingMins;
    }
    if (pendingTask) {
      const taskSelect = $("active-task-select");
      if (taskSelect) {
        const exists = Array.from(taskSelect.options).some((o) => o.value === pendingTask);
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = pendingTask;
          opt.textContent = pendingTask;
          taskSelect.appendChild(opt);
        }
        taskSelect.value = pendingTask;
      }
    }
  });
}

/* =========================================================================
   TASKS ENGINE
   ========================================================================= */

let _taskLoadDebounce = null;

async function loadTasks() {
  const tasks = await Tasks.fetch();
  const list = $("todo-list");
  const select = $("active-task-select");
  if (!list) return;

  const selectedValue = select ? select.value : "None";

  list.innerHTML = "";

  if (tasks.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "todo-item empty-state-sm flex-center";
    emptyLi.textContent = "No tasks yet - add one above!";
    list.appendChild(emptyLi);
  }

  if (select) select.innerHTML = '<option value="None">None</option>';

  sortTasksByUrgency(tasks).forEach((t) => {
    const li = document.createElement("li");
    li.className = `todo-item${t.is_done ? " done" : ""}`;
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", t.is_done ? "true" : "false");
    li.setAttribute("tabindex", "0");

    const span = document.createElement("span");
    span.textContent = t.text;
    span.className = "todo-text";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "✖";
    delBtn.setAttribute("aria-label", `Delete task: ${t.text}`);
    delBtn.setAttribute("tabindex", "0");

    li.appendChild(span);

    let dueBadge = null;
    if (!t.is_done) {
      dueBadge = document.createElement("span");
      dueBadge.className = "todo-due";
      dueBadge.setAttribute("tabindex", "0");
      dueBadge.setAttribute("role", "button");
      dueBadge.setAttribute("aria-label", t.due_date ? `Due date: ${t.due_date}. Click to change.` : "Set a due date");

      const renderDueBadge = () => {
        const today = formatDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
        dueBadge.classList.remove("overdue", "due-today", "unset");
        if (t.due_date) {
          dueBadge.textContent = `📅 ${t.due_date}`;
          if (t.due_date < today) dueBadge.classList.add("overdue");
          else if (t.due_date === today) dueBadge.classList.add("due-today");
        } else {
          dueBadge.textContent = "+ due date";
          dueBadge.classList.add("unset");
        }
      };
      renderDueBadge();

      const editDueDate = (e) => {
        e.stopPropagation();
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "todo-due-edit-input";
        dateInput.value = t.due_date || "";

        let hasSaved = false;
        const saveDue = async () => {
          if (hasSaved) return;
          hasSaved = true;
          const newDate = dateInput.value || null;
          if (newDate !== t.due_date) {
            const ok = await Tasks.updateDueDate(t.id, newDate);
            if (ok) {
              t.due_date = newDate;
            } else {
              UI.showPopup("Failed to update due date.", "Error");
            }
          }
          dateInput.replaceWith(dueBadge);
          renderDueBadge();
          loadTasks();
        };

        dateInput.addEventListener("change", saveDue);
        dateInput.addEventListener("blur", saveDue);
        dateInput.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape") {
            hasSaved = true;
            dateInput.replaceWith(dueBadge);
          }
        });

        dueBadge.replaceWith(dateInput);
        dateInput.focus();
        if (typeof dateInput.showPicker === "function") {
          try { dateInput.showPicker(); } catch { /* not supported/allowed — input stays focused */ }
        }
      };

      dueBadge.addEventListener("click", editDueDate);
      dueBadge.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          editDueDate(e);
        }
      });

      li.appendChild(dueBadge);
    }

    li.appendChild(delBtn);

    // Toggle done (Optimistic update)
    const toggleDone = async () => {
      if (li.style.pointerEvents === "none") return;
      li.classList.toggle("done");
      const isNowDone = li.classList.contains("done");
      li.setAttribute("aria-checked", isNowDone ? "true" : "false");
      li.style.pointerEvents = "none";
      
      const ok = await Tasks.toggle(t.id, t.is_done);
      if (!ok) {
        li.classList.toggle("done");
        li.setAttribute("aria-checked", t.is_done ? "true" : "false");
        li.style.pointerEvents = "";
        UI.showPopup("Failed to toggle task status.", "Connection Error");
      } else {
        t.is_done = !t.is_done;
        li.style.pointerEvents = "";
        
        if (_taskLoadDebounce) clearTimeout(_taskLoadDebounce);
        _taskLoadDebounce = setTimeout(() => {
          loadTasks();
        }, 300);
      }
    };

    li.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      toggleDone();
    });

    li.addEventListener("keydown", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleDone();
      }
    });

    // Double-click inline edit
    span.addEventListener("dblclick", () => {
      if (t.is_done) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "todo-edit-input";
      input.value = t.text;
      input.setAttribute("aria-label", "Edit task text");

      let hasSaved = false;
      const saveEdit = async () => {
        if (hasSaved) return;
        hasSaved = true;

        const newText = input.value.trim();
        if (newText && newText !== t.text) {
          span.textContent = newText;
          const ok = await Tasks.updateText(t.id, newText);
          if (!ok) {
            span.textContent = t.text;
            UI.showPopup("Failed to edit task name.", "Error");
          } else {
            t.text = newText;
          }
        }
        input.replaceWith(span);
        loadTasks();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          saveEdit();
        } else if (e.key === "Escape") {
          hasSaved = true;
          input.replaceWith(span);
        }
      });

      input.addEventListener("blur", () => {
        saveEdit();
      });

      span.replaceWith(input);
      input.focus();
    });

    // Delete (with a 4s Undo window before the DB delete actually fires)
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      li.style.display = "none";

      let undone = false;
      UI.showToast("Task deleted.", {
        duration: 4000,
        actionLabel: "Undo",
        onAction: () => {
          undone = true;
          li.style.display = "";
        },
      });

      setTimeout(async () => {
        if (undone) return;
        const ok = await Tasks.delete(t.id);
        if (!ok) {
          li.style.display = "";
          UI.showPopup("Failed to delete task.", "Error");
        } else {
          loadTasks();
        }
      }, 4000);
    });

    delBtn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.stopPropagation();
        delBtn.click();
      }
    });

    list.appendChild(li);

    if (!t.is_done && select) {
      const opt = document.createElement("option");
      opt.value = t.text;
      opt.textContent = t.text;
      select.appendChild(opt);
    }
  });

  if (select) {
    const exists = Array.from(select.options).some((o) => o.value === selectedValue);
    if (exists) {
      select.value = selectedValue;
    } else {
      select.value = "None";
    }
  }

  // Keep the dashboard's compact task list in sync from the same fetch.
  renderDashboardTasks(tasks);
}

function bindTasks() {
  $("btn-add-todo")?.addEventListener("click", async () => {
    const input = $("todo-input");
    const dueInput = $("todo-due-date");
    const text = input?.value.trim();
    if (!text) {
      if (input) {
        input.classList.remove("input-error");
        void input.offsetWidth;
        input.classList.add("input-error");
      }
      return;
    }
    const dueDate = dueInput?.value || null;
    input.value = "";
    if (dueInput) dueInput.value = "";
    await Tasks.add(text, dueDate);
    loadTasks();
  });

  $("todo-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("btn-add-todo")?.click();
    }
  });

  // Dashboard quick-add — same flow, different entry point.
  const dashAdd = async () => {
    const input = $("dash-task-input");
    const text = input?.value.trim();
    if (!text) {
      if (input) {
        input.classList.remove("input-error");
        void input.offsetWidth;
        input.classList.add("input-error");
      }
      return;
    }
    input.value = "";
    await Tasks.add(text);
    loadTasks();
  };
  $("dash-task-add")?.addEventListener("click", dashAdd);
  $("dash-task-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dashAdd();
    }
  });
}

/* =========================================================================
   CALENDAR & EXAM LOGIC
   ========================================================================= */

async function loadCalendar() {
  cachedExams = await Exams.fetch();
  renderCalendar();
  renderDashboard();
}

function renderCalendar() {
  const grid = $("calendar-days");
  const title = $("month-year-display");
  if (!grid || !title) return;

  grid.innerHTML = "";
  const y = displayDate.getFullYear();
  const m = displayDate.getMonth();
  title.textContent = `${MONTH_NAMES[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const totalDays = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day-cell empty";
    empty.setAttribute("aria-hidden", "true");
    grid.appendChild(empty);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = formatDateStr(y, m, d);
    const isToday = dateStr === todayStr;

    const cell = document.createElement("div");
    cell.className = `calendar-day-cell${isToday ? " today" : ""}`;
    cell.dataset.date = dateStr;
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${MONTH_NAMES[m]} ${d}, ${y}`);

    const dayNum = document.createElement("span");
    dayNum.className = "day-number";
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    const examsForDate = cachedExams.filter((e) => e.exam_date === dateStr);
    const maxExamsToShow = 2;

    const isPastDate = dateStr < todayStr;

    examsForDate.slice(0, maxExamsToShow).forEach((exam) => {
      const bar = document.createElement("div");
      const status = (exam.status || "Scheduled").toLowerCase();
      bar.className = `exam-bar diff-${(exam.difficulty || "Medium").toLowerCase()} status-${status}${isPastDate && status !== "completed" ? " is-past" : ""}`;
      bar.textContent = exam.exam_name;
      bar.addEventListener("click", (evt) => {
        evt.stopPropagation();
        openExamModal(exam);
      });
      cell.appendChild(bar);
    });

    if (examsForDate.length > maxExamsToShow) {
      const overflowCount = examsForDate.length - maxExamsToShow;
      const overflowBadge = document.createElement("div");
      overflowBadge.className = "calendar-overflow-badge";
      overflowBadge.textContent = `+${overflowCount} more`;
      cell.appendChild(overflowBadge);
    }

    const handleCellClick = (e) => {
      const date = e.currentTarget.dataset.date;
      if (examsForDate.length > 0) {
        openDayDetailModal(date, examsForDate);
      } else {
        openExamModal(null, date);
      }
    };
    cell.addEventListener("click", handleCellClick);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCellClick(e);
      }
    });

    grid.appendChild(cell);
  }
}

function setExamDifficulty(value) {
  const target = document.querySelector(
    `input[name="exam-difficulty"][value="${value}"]`,
  );
  (target || document.querySelector('input[name="exam-difficulty"][value="Medium"]')).checked = true;
}

function openExamModal(exam = null, dateStr = "") {
  ModalManager.open("exam-modal");

  const dateInput = $("exam-date");
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 5);
  if (dateInput) dateInput.max = localDateStr(maxDate);

  if (exam) {
    // Editing an existing exam - show status and the delete affordance.
    // No `min` here: an existing exam's date may legitimately be in the
    // past (e.g. marking it Completed after the fact).
    dateInput?.removeAttribute("min");
    $("modal-exam-title").textContent = "Edit exam";
    $("modal-exam-subtitle").textContent = "Update the details or remove it from your calendar.";
    $("btn-save-exam").textContent = "Save changes";
    $("modal-exam-id").value = exam.id;
    $("exam-name").value = exam.exam_name;
    $("exam-date").value = exam.exam_date;
    setExamDifficulty(exam.difficulty);
    $("exam-status").value = exam.status;
    $("exam-status-group")?.classList.remove("hidden");
    $("btn-delete-exam")?.classList.remove("hidden");
  } else {
    // Creating
    if (dateInput) dateInput.min = localDateStr();
    $("modal-exam-title").textContent = "New exam";
    $("modal-exam-subtitle").textContent = "Add it to your calendar and we'll count down to the day.";
    $("btn-save-exam").textContent = "Add exam";
    $("exam-form")?.reset();
    setExamDifficulty("Medium");
    $("modal-exam-id").value = "";
    $("exam-date").value = dateStr;
    $("exam-status").value = "Scheduled";
    $("exam-status-group")?.classList.add("hidden");
    $("btn-delete-exam")?.classList.add("hidden");
  }
  // Focus is handled by ModalManager.open() (focuses the first focusable
  // element, which is exam-name).
}

function openDayDetailModal(dateStr, exams) {
  const modal = $("day-detail-modal");
  if (!modal) return;
  ModalManager.open("day-detail-modal");

  // T00:00:00 forces local-midnight parsing — bare `new Date(dateStr)`
  // parses YYYY-MM-DD as UTC and can show the wrong day for negative-offset
  // timezones.
  const formattedDate = new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $("modal-day-title").textContent = `Exams on ${formattedDate}`;
  
  const listEl = $("day-detail-list");
  listEl.innerHTML = "";
  
  exams.forEach(exam => {
    const item = document.createElement("div");
    item.className = "flex-between";
    item.style.padding = "var(--s-3)";
    item.style.background = "var(--surface-active)";
    item.style.borderRadius = "var(--r-md)";
    item.style.cursor = "pointer";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-label", `Edit exam: ${exam.exam_name}`);
    item.innerHTML = `
      <div class="flex-column" style="gap: 4px; min-width: 0;">
        <span class="day-detail-exam-name">${esc(exam.exam_name)}</span>
        <span class="text-sm" style="color: var(--text-muted);">${exam.difficulty} • ${exam.status}</span>
      </div>
      <span class="icon-btn" aria-hidden="true">✎</span>
    `;
    const openForEdit = () => {
      ModalManager.close("day-detail-modal");
      openExamModal(exam, dateStr);
    };
    item.addEventListener("click", openForEdit);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openForEdit();
      }
    });
    listEl.appendChild(item);
  });

  const btnAdd = $("btn-add-exam-for-day");
  if (btnAdd) {
    // Replace element to clear old listeners
    const newBtn = btnAdd.cloneNode(true);
    btnAdd.parentNode.replaceChild(newBtn, btnAdd);
    newBtn.addEventListener("click", () => {
      ModalManager.close("day-detail-modal");
      openExamModal(null, dateStr);
    });
  }
}

function bindCalendar() {
  $("btn-prev-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() - 1);
    renderCalendar();
  });

  $("btn-next-month")?.addEventListener("click", () => {
    displayDate.setMonth(displayDate.getMonth() + 1);
    renderCalendar();
  });

  $("btn-add-exam")?.addEventListener("click", () => {
    // localDateStr(), not toISOString(): the latter converts to UTC and
    // returns *yesterday* for positive-offset timezones in the evening,
    // which lands below the input's `min` and blocks submission.
    openExamModal(null, localDateStr());
  });

  $("btn-cancel-exam")?.addEventListener("click", () => {
    ModalManager.close("exam-modal");
  });

  $("btn-close-day-detail")?.addEventListener("click", () => {
    ModalManager.close("day-detail-modal");
  });

  // Escape-key handling for exam-modal/day-detail-modal/popup-overlay is
  // centralized in ModalManager (js/ui.js) — it always closes only the
  // top-most open modal instead of every listener firing independently.

  $("exam-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const isEditing = !!$("modal-exam-id").value;
    const dateInput = $("exam-date");
    if (!isEditing && dateInput.value < localDateStr()) {
      dateInput.classList.remove("input-error");
      void dateInput.offsetWidth; // trigger reflow so the shake replays
      dateInput.classList.add("input-error");
      UI.showPopup("Exam date can't be in the past.", "Invalid Date");
      return;
    }
    const difficulty =
      document.querySelector('input[name="exam-difficulty"]:checked')?.value || "Medium";
    const ok = await Exams.save(
      {
        exam_name: $("exam-name").value,
        exam_date: $("exam-date").value,
        difficulty,
        status: $("exam-status").value,
      },
      $("modal-exam-id").value || null,
    );
    if (ok) {
      ModalManager.close("exam-modal");
      loadCalendar();
    }
  });

  $("btn-delete-exam")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "This exam will be removed from your calendar.",
      { title: "Remove exam?", confirmText: "Remove", danger: true },
    );
    if (ok) {
      await Exams.delete($("modal-exam-id").value);
      ModalManager.close("exam-modal");
      loadCalendar();
    }
  });
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */

function formatFocusTime(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function renderDashboard() {
  const sessions = Storage.get("sessions", []);
  const list = $("log-list");
  let totalMins = 0;
  let todayMins = 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  if (list) {
    list.innerHTML = "";

    if (sessions.length === 0) {
      const li = document.createElement("li");
      li.innerHTML = "<span class='text-muted'>No sessions yet — start a focus block to see it here.</span>";
      list.appendChild(li);
    } else {
      // Only render the most recent handful; the full history stays in storage.
      sessions.slice(0, 8).forEach((log) => {
        const li = document.createElement("li");
        li.className = "log-item";

        const left = document.createElement("span");
        left.innerHTML = `<strong class="text-primary">${formatFocusTime(log.minutes)} Focus</strong>${
          log.task !== "General Study" ? ` on ${esc(log.task)}` : ""
        }`;

        const right = document.createElement("span");
        right.className = "text-muted";
        right.textContent = log.timestamp;

        li.appendChild(left);
        li.appendChild(right);
        list.appendChild(li);
      });
    }

    // Totals span the entire session log, not just the rendered slice.
    sessions.forEach((log) => {
      totalMins += log.minutes || 0;
      // `id` is Date.now() at log time — a reliable timestamp for "today".
      if (typeof log.id === "number" && log.id >= startOfTodayMs) {
        todayMins += log.minutes || 0;
      }
    });
  }

  const totalDisplay = $("total-hours-display");
  if (totalDisplay) {
    totalDisplay.innerHTML = `${formatFocusTime(totalMins)} <span>total</span>`;
  }

  const todayDisplay = $("dash-today-focus");
  if (todayDisplay) {
    todayDisplay.textContent = formatFocusTime(todayMins);
  }

  renderNextExam();
}

function renderNextExam() {
  const el = $("dash-next-exam");
  if (!el) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Use local-date formatting (matches the calendar). toISOString() converts to
  // UTC and returns the wrong day for positive-offset timezones (e.g. IST).
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const next = cachedExams
    .filter((e) => e.status !== "Completed" && e.exam_date >= todayStr)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];

  if (!next) {
    el.innerHTML = `
      <span class="dash-eyebrow">Next exam</span>
      <p class="empty-state-sm">No exams scheduled. You're all clear — or add one to start planning.</p>
      <a href="#exams" class="dash-link">Open calendar →</a>`;
    return;
  }

  const examDate = new Date(next.exam_date + "T00:00:00");
  const days = Math.round((examDate - today) / 86400000);
  let big, unit;
  if (days <= 0) {
    big = "Today";
    unit = "Good luck!";
  } else if (days === 1) {
    big = "1";
    unit = "day away";
  } else {
    big = String(days);
    unit = "days away";
  }

  const prettyDate = examDate.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const diff = (next.difficulty || "Medium");

  el.innerHTML = `
    <span class="dash-eyebrow">Next exam</span>
    <div class="dash-countdown">${esc(big)}<span class="dash-countdown-unit">${esc(unit)}</span></div>
    <div>
      <div class="dash-exam-name">${esc(next.exam_name)}</div>
      <div class="dash-exam-meta mt-8">
        <span>📅 ${esc(prettyDate)}</span>
        <span class="dash-pill diff-${esc(diff.toLowerCase())}">${esc(diff)}</span>
      </div>
    </div>
    <a href="#exams" class="dash-link">Open calendar →</a>`;
}

/* Render the compact "today's tasks" list on the dashboard. */
function renderDashboardTasks(tasks) {
  const list = $("dash-today-tasks");
  if (!list) return;

  const pending = sortTasksByUrgency(tasks.filter((t) => !t.is_done)).slice(0, 6);
  list.innerHTML = "";

  if (pending.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state-sm";
    li.textContent = tasks.length
      ? "All caught up — nothing pending. 🎉"
      : "No tasks yet. Add your first above.";
    list.appendChild(li);
    return;
  }

  pending.forEach((t) => {
    const li = document.createElement("li");
    li.className = "dash-task";
    li.setAttribute("role", "checkbox");
    li.setAttribute("aria-checked", "false");
    li.setAttribute("tabindex", "0");

    const check = document.createElement("span");
    check.className = "dash-task-check";

    const label = document.createElement("span");
    label.className = "dash-task-label";
    label.textContent = t.text;

    li.appendChild(check);
    li.appendChild(label);

    const complete = async () => {
      if (li.dataset.busy) return;
      li.dataset.busy = "1";
      li.classList.add("done");
      li.setAttribute("aria-checked", "true");
      const ok = await Tasks.toggle(t.id, t.is_done);
      if (ok) {
        loadTasks();
      } else {
        li.classList.remove("done");
        li.setAttribute("aria-checked", "false");
        delete li.dataset.busy;
        UI.showPopup("Failed to update task.", "Connection Error");
      }
    };

    li.addEventListener("click", complete);
    li.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        complete();
      }
    });

    list.appendChild(li);
  });
}

/* =========================================================================
   ANALYTICS & STREAKS (Area 1)
   ========================================================================= */

function safeColorLocal(color) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color || "")) ? color : "#4A90E2";
}

async function loadActiveFolderSelect() {
  const select = $("active-folder-select");
  if (!select) return;
  const folders = await Folders.fetch();
  const selectedValue = select.value;
  select.innerHTML = '<option value="">Unassigned</option>';
  folders.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  if (Array.from(select.options).some((o) => o.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function computeStreak(sessions) {
  const dayTotals = {};
  sessions.forEach((s) => {
    const day = new Date(s.started_at).toDateString();
    dayTotals[day] = (dayTotals[day] || 0) + (s.minutes || 0);
  });
  const MIN_MINS = 5;
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // Today is a grace day: a streak shouldn't read 0 every morning simply
  // because the user hasn't studied *yet*. If today doesn't qualify, start
  // counting from yesterday; only a missed full day actually breaks it.
  if ((dayTotals[cursor.toDateString()] || 0) < MIN_MINS) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while ((dayTotals[cursor.toDateString()] || 0) >= MIN_MINS) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function renderAnalytics() {
  const card = $("dash-streak-card");
  if (!card) return;

  const sessions = await Sessions.fetchSince(90);

  if (sessions.length === 0) {
    card.innerHTML = `
      <span class="dash-eyebrow">Streak</span>
      <p class="empty-state-sm">Start your first streak today — complete a focus session to begin.</p>
    `;
    return;
  }

  const streak = computeStreak(sessions);

  // Supabase-sourced totals reconcile the instant-paint localStorage numbers
  // renderDashboard() already set — single source of truth across devices.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  let totalMins = 0, todayMins = 0;
  sessions.forEach((s) => {
    totalMins += s.minutes || 0;
    if (new Date(s.started_at) >= startOfToday) todayMins += s.minutes || 0;
  });
  const totalDisplay = $("total-hours-display");
  if (totalDisplay) totalDisplay.innerHTML = `${formatFocusTime(totalMins)} <span>total</span>`;
  const todayDisplay = $("dash-today-focus");
  if (todayDisplay) todayDisplay.textContent = formatFocusTime(todayMins);

  // Last 7 days sparkline
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ label: d.toLocaleDateString([], { weekday: "narrow" }), key: d.toDateString(), mins: 0 });
  }
  sessions.forEach((s) => {
    const key = new Date(s.started_at).toDateString();
    const day = days.find((d) => d.key === key);
    if (day) day.mins += s.minutes || 0;
  });
  const maxMins = Math.max(1, ...days.map((d) => d.mins));
  const barsHTML = days.map((d) => `
    <div class="dash-streak-bar-col" title="${formatFocusTime(d.mins)}">
      <div class="dash-streak-bar" style="height:${Math.max(4, Math.round((d.mins / maxMins) * 40))}px"></div>
      <span class="dash-streak-bar-label">${esc(d.label)}</span>
    </div>
  `).join("");

  // Folder breakdown
  const folders = await Folders.fetch();
  const folderInfo = {};
  folders.forEach((f) => { folderInfo[f.id] = { name: f.name, color: f.color }; });
  const folderTotals = {};
  sessions.forEach((s) => {
    const key = s.folder_id || "unassigned";
    folderTotals[key] = (folderTotals[key] || 0) + (s.minutes || 0);
  });
  const breakdownHTML = Object.entries(folderTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, mins]) => {
      const info = folderInfo[id] || { name: "Unassigned", color: "#888" };
      return `
        <div class="dash-folder-row flex-between">
          <span><span class="dash-folder-dot" style="background:${safeColorLocal(info.color)};"></span>${esc(info.name)}</span>
          <span class="text-muted">${formatFocusTime(mins)}</span>
        </div>`;
    }).join("");

  card.innerHTML = `
    <span class="dash-eyebrow">Streak</span>
    <h2 class="stat-number">🔥 ${streak} <span>day${streak === 1 ? "" : "s"}</span></h2>
    <div class="dash-streak-bars mt-16">${barsHTML}</div>
    ${breakdownHTML ? `<div class="dash-folder-breakdown mt-16">${breakdownHTML}</div>` : ""}
  `;
}

/* =========================================================================
   SRS DUE-TODAY REMINDERS (Area 2)
   ========================================================================= */

function notifyDueCardsOncePerDay(count) {
  if (!UI.loadSettings().notifyStudyReminders) return;
  if (!("Notification" in window)) return;
  const todayKey = new Date().toDateString();
  if (Storage.get("srs_notified_date") === todayKey) return;

  if (Notification.permission === "granted") {
    new Notification("Learnora", {
      body: `${count} flashcard${count > 1 ? "s" : ""} due for review today.`,
      icon: "learnora.jpg",
    });
    Storage.set("srs_notified_date", todayKey);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}

async function renderDueCards() {
  const count = await Flashcards.fetchDueCount();

  const badge = $("nav-flashcards-badge");
  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle("hidden", count === 0);
  }

  const dueEl = $("dash-srs-due");
  if (dueEl) {
    if (count > 0) {
      dueEl.classList.remove("hidden");
      dueEl.innerHTML = `
        <div class="flex-between">
          <span>🗂️ ${count} card${count === 1 ? "" : "s"} due today</span>
          <a href="#flashcards" class="dash-link">Review now →</a>
        </div>`;
    } else {
      dueEl.classList.add("hidden");
      dueEl.innerHTML = "";
    }
  }

  const banner = $("flashcards-due-banner");
  if (banner) {
    if (count > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML = `🗂️ <strong>${count}</strong> card${count === 1 ? "" : "s"} due for review today.`;
    } else {
      banner.classList.add("hidden");
      banner.innerHTML = "";
    }
  }

  if (count > 0) notifyDueCardsOncePerDay(count);
}

/* =========================================================================
   AI WEAK-TOPICS SURFACING (Area 3b)
   ========================================================================= */

async function renderWeakTopics() {
  const el = $("dash-weak-topics");
  if (!el) return;
  const topics = await Quizzes.fetchWeakTopics(3);
  if (topics.length === 0) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = `<span class="text-muted text-sm">Struggling with: </span>` +
    topics.map((t) => `<span class="glass-pill" style="font-size:0.75rem; padding:4px 10px; margin:2px;">${esc(t.topic)}</span>`).join("");
}

/* =========================================================================
   ONBOARDING (Area 4)
   ========================================================================= */

async function maybeRenderOnboardingBanner() {
  const banner = $("dash-onboarding-banner");
  if (!banner) return;
  if (Storage.get("onboarding_dismissed", false)) {
    banner.classList.add("hidden");
    return;
  }

  const [folders, tasks] = await Promise.all([Folders.fetch(), Tasks.fetch()]);
  const hasData = folders.length > 0 || tasks.length > 0 || cachedExams.length > 0;
  if (hasData) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div class="flex-between">
      <div>
        <h3>👋 Welcome to Learnora!</h3>
        <p class="text-muted mt-8">Upload your first study material or add a task to get started — Learnora AI will build notes, flashcards, and quizzes from it.</p>
      </div>
      <button id="btn-dismiss-onboarding" class="icon-btn" aria-label="Dismiss">✖</button>
    </div>
    <div class="flex-gap mt-16">
      <button class="btn-primary" data-hash="upload">📤 Upload material</button>
      <button class="btn-secondary" id="btn-onboarding-add-task">📝 Add a task</button>
    </div>
  `;
  $("btn-dismiss-onboarding")?.addEventListener("click", () => {
    Storage.set("onboarding_dismissed", true);
    banner.classList.add("hidden");
  });
  $("btn-onboarding-add-task")?.addEventListener("click", () => {
    $("dash-task-input")?.focus();
  });
}

/* =========================================================================
   AI BINDINGS
   ========================================================================= */

function bindAI() {
  const openAIChat = () => {
    ModalManager.open("turbo-chat");
    // Recover a panel that a previous drag + resize left off-screen, so
    // reopening is always enough to get the close button back.
    AI.clampWindowIntoView();
  };

  $("nav-ai-trigger")?.addEventListener("click", (e) => {
    // Prevent the #ai hash from routing (there is no view-ai section,
    // which would hide the current view and fall back to the dashboard)
    e.preventDefault();
    openAIChat();
  });

  $("turbo-toggle")?.addEventListener("click", () => {
    openAIChat();
  });

  $("btn-ai-close")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.remove("fullscreen");
    ModalManager.close("turbo-chat");
    // Ensure no orphaned teal ghosts
    document.querySelectorAll('.streaming-pulse, .ripple, .ai-widget, .avatar-circle').forEach(el => {
       if (el.parentNode === document.body) el.remove();
    });
  });

  $("btn-ai-fullscreen")?.addEventListener("click", () => {
    const m = $("turbo-chat");
    if (!m) return;
    m.classList.toggle("fullscreen");
    // Leaving fullscreen restores any pre-drag inline position, which may no
    // longer fit the current viewport.
    if (!m.classList.contains("fullscreen")) AI.clampWindowIntoView();
  });

  $("btn-send-chat")?.addEventListener("click", () => {
    const input = $("chat-input");
    if (!input) return;
    if (input.value.trim() || AI.currentFile) {
      AI.send(input.value || "Analyze this.");
      input.value = "";
    }
  });

  $("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("btn-send-chat")?.click();
    }
  });

  // Removed: handleGlobalAI() and its two bindings. #global-ai-input and
  // #global-ai-submit do not exist anywhere in index.html, so the optional
  // chaining made ~35 lines of dead code that never ran. The dashboard
  // command bar (#dashboard-command-input) is the live equivalent and is
  // wired in js/ui.js.

  $("file-upload")?.addEventListener("change", (e) => {
    if (e.target.files?.[0]) AI.processFile(e.target.files[0]);
  });

  $("btn-remove-file")?.addEventListener("click", () => AI.setFile(null));

  // Quick-action pills / dashboard AI actions (CSP-safe, no inline onclick).
  // Works from inside the chat and from the dashboard: always reveal the panel.
  $$("[data-chat-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $("chat-input");
      if (!input) return;
      ModalManager.open("turbo-chat");
      input.value = btn.dataset.chatPrompt;
      if (btn.dataset.chatSend) {
        $("btn-send-chat")?.click();
      } else {
        input.focus();
      }
    });
  });

  // "Plan my week" — generates a real persisted weekly plan instead of a chat reply.
  $("dash-plan-week-btn")?.addEventListener("click", async () => {
    const btn = $("dash-plan-week-btn");
    const { Plans } = await import("./api.js");
    const weekStartISO = localDateStr(mondayOfWeek());
    const existing = await Plans.fetchForWeek(weekStartISO);
    if (existing) {
      const ok = await UI.confirm(
        "This will replace your current weekly plan. Continue?",
        { title: "Regenerate Weekly Plan", confirmText: "Regenerate", danger: true },
      );
      if (!ok) return;
    }

    const original = btn.innerHTML;
    btn.innerHTML = '<span class="dash-ai-icon">🗓️</span> Generating…';
    btn.disabled = true;
    const plan = await AI.generateWeeklyPlan();
    btn.innerHTML = original;
    btn.disabled = false;
    if (plan) window.location.hash = "plan";
  });

  $("dash-quiz-me-btn")?.addEventListener("click", async () => {
    const btn = $("dash-quiz-me-btn");
    const material = await Materials.fetchMostRecent();
    if (!material) {
      UI.showPopup("Upload a study material first, then Learnora AI can quiz you on it.", "No materials yet");
      return;
    }
    UI.showQuizConfigModal(material.id, material.folder_id, material.title);
  });

  // Standalone "Quizzes" tab — the main entry point for creating a quiz on
  // any topic, with no folder/material required (materialId/folderId null
  // means AI.generateQuiz() falls back to topic-only generation).
  $("btn-generate-quiz-standalone")?.addEventListener("click", () => {
    UI.showQuizConfigModal(null, null, "");
  });

  $("btn-cancel-quiz-config")?.addEventListener("click", () => {
    ModalManager.close("quiz-config-modal");
  });

  $("quiz-personality")?.addEventListener("change", () => UI.syncQuizPersonalityDesc());

  $("quiz-config-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const materialId = $("quiz-material-id").value || null;
    const folderId = $("quiz-folder-id").value || null;
    
    const config = {
      topic: $("quiz-topic").value.trim(),
      difficulty: document.querySelector('input[name="quiz-difficulty"]:checked')?.value || "Medium",
      personality: $("quiz-personality").value,
      length: parseInt(document.querySelector('input[name="quiz-length"]:checked')?.value) || 10
    };

    UI.setAILoading(true, [
      "AI is thinking...",
      "Analyzing material context...",
      "Formulating quiz questions...",
      "Validating answers...",
      "Almost ready..."
    ]);

    try {
      const quiz = await AI.generateQuiz(materialId, folderId, config);
      UI.setAILoading(false);
      if (quiz) {
        ModalManager.close("quiz-config-modal");
        window.location.hash = `quiz-${quiz.id}`;
      }
    } catch (e) {
      UI.setAILoading(false);
      console.error(e);
      UI.showPopup(e.message || "Failed to generate quiz.", "Error");
    }
  });

  // "Regenerate" on the #plan view — upsert just overwrites this week's plan.
  $("btn-regenerate-plan")?.addEventListener("click", async () => {
    const btn = $("btn-regenerate-plan");
    const ok = await UI.promptConfirm(
      "This will overwrite your current weekly plan. Are you sure you want to regenerate it?",
      { title: "Regenerate Weekly Plan", confirmText: "Regenerate", danger: true },
    );
    if (!ok) return;

    UI.setAILoading(true, [
      "AI is thinking...",
      "Analyzing your tasks...",
      "Balancing your study load...",
      "Drafting a weekly schedule...",
      "Finalizing plan..."
    ]);

    try {
      const plan = await AI.generateWeeklyPlan();
      UI.setAILoading(false);
      if (plan) {
        // Force refresh
        const { router } = await import("./router.js");
        router.loadPlanView();
      }
    } catch (err) {
      UI.setAILoading(false);
      console.error(err);
      UI.showPopup("Could not generate a weekly plan.", "Error");
    }
  });
}

/* =========================================================================
   WORKSPACE INIT
   ========================================================================= */

function initWorkspace() {
  loadTasks();
  loadCalendar();
  loadActiveFolderSelect();
  renderAnalytics();
  renderDueCards();
  renderWeakTopics();
  maybeRenderOnboardingBanner();
  // Timer.init() is already called by bindTimer() during boot — no second init.
  AI.initDragDrop();
  startClock();
  window.addEventListener("sessionLogged", () => {
    renderDashboard();
    renderAnalytics();
  });
  // When the AI assistant creates tasks, refresh the Task Manager list and the
  // dashboard's compact task widget (loadTasks() re-renders both).
  window.addEventListener("tasksUpdated", loadTasks);
  // A flashcard review can change which cards are due next.
  window.addEventListener("flashcardReviewed", renderDueCards);
}

function startClock() {
  const clock = $("live-clock");
  if (!clock) return;

  const update = () => {
    clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Render immediately, then sync the first tick to the next minute boundary
  // so the display is never more than ~1 s stale.
  update();
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    update();
    setInterval(update, 60_000);
  }, msToNextMinute);
}
