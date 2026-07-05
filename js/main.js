import { UI, $, $$, esc, Storage } from "./ui.js";
import { Auth, Tasks, Exams, DataAdmin, Folders, Materials } from "./api.js";
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

  // Toggle UI based on material type
  typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'youtube' || type === 'text') {
        dropzone.classList.add('hidden');
        linkInput.classList.remove('hidden');
        if (type === 'text') {
          linkInput.querySelector('label').textContent = "Paste Text Content";
          linkInput.querySelector('input').placeholder = "Paste your notes or text here...";
        } else {
          linkInput.querySelector('label').textContent = "YouTube URL";
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
    dropzone.style.borderColor = 'var(--primary-color)';
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
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length) {
      const h3 = dropzone.querySelector('h3');
      if (h3) h3.textContent = fileInput.files[0].name;
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
      // We don't await this because we want to unblock the UI.
      AI.generateStudyMaterial(material, folderId, fileDataPayload).catch(e => console.error("AI Generation failed:", e));
      
      UI.showPopup("Material successfully ingested. Notes and flashcards will be available shortly.", "Success");
      // Reset UI
      fileInput.value = "";
      if (document.getElementById('upload-custom-title')) document.getElementById('upload-custom-title').value = "";
      linkInput.querySelector('input').value = "";
      const h3 = dropzone.querySelector('h3');
      if (h3) h3.textContent = "Drag & Drop";
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
    } catch (err) {
      console.error("[Auth.login] Unhandled:", err);
      UI.showPopup("Something went wrong. Please try again.", "Login Error");
    }
    UI.setLoading("login-btn", false);
    loggingIn = false;
  });

  $("signup-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const pass = $("signup-password").value;
    const confirmPass = $("signup-confirm-password").value;

    if (pass.length < 8) {
      UI.showPopup("Password must be at least 8 characters long.", "Weak Password");
      return;
    }
    if (pass !== confirmPass) {
      UI.showPopup("Passwords do not match. Please re-enter them.", "Password Mismatch");
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
      UI.showPopup("Something went wrong. Please try again.", "Signup Error");
    }
    UI.setLoading("signup-btn", false);
    signingUp = false;
  });

  $("btn-show-signup")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("signup-form")?.classList.remove("hidden");
    setAuthHeader("Create your account", "Start studying smarter in minutes.");
  });

  $("btn-show-login")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("login-form")?.classList.remove("hidden");
    setAuthHeader("Welcome back", "Sign in to your study workspace.");
  });

  $("btn-show-forgot")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("forgot-password-form")?.classList.remove("hidden");
    setAuthHeader("Reset Password", "We'll send you a recovery link.");
  });

  $("btn-show-login-from-forgot")?.addEventListener("click", () => {
    $$(".auth-form").forEach(f => f.classList.add("hidden"));
    $("login-form")?.classList.remove("hidden");
    setAuthHeader("Welcome back", "Sign in to your study workspace.");
  });

  $("forgot-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI.setLoading("forgot-btn", true);
    const email = $("forgot-email").value.trim();
    const ok = await Auth.resetPasswordRequest(email);
    UI.setLoading("forgot-btn", false);
    if (ok) {
      UI.showPopup("If an account exists, a reset link has been sent to your email.", "Check Your Email");
      $("btn-show-login-from-forgot")?.click(); // Go back to login
    }
  });

  $("reset-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("reset-password").value;
    const confirmPass = $("reset-confirm-password").value;

    if (pass.length < 8) {
      UI.showPopup("Password must be at least 8 characters long.", "Weak Password");
      return;
    }
    if (pass !== confirmPass) {
      UI.showPopup("Passwords do not match. Please re-enter them.", "Password Mismatch");
      return;
    }

    UI.setLoading("reset-btn", true);
    const ok = await Auth.updatePassword(pass);
    UI.setLoading("reset-btn", false);
    if (ok) {
      UI.showPopup("Your password has been updated successfully. You are now logged in.", "Password Updated");
      window.location.reload();
    }
  });

  $("btn-logout")?.addEventListener("click", Auth.logout);
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
        $("sidebar")?.classList.remove("collapsed");
      }
    }
  });
}

/* =========================================================================
   SETTINGS BINDINGS
   ========================================================================= */

function bindSettings() {
  $("btn-save-settings")?.addEventListener("click", () => UI.saveSettings());
  $("btn-export-data")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "Download a CSV copy of all your study logs and tasks to your device?",
      { title: "Export Data?", confirmText: "Export" }
    );
    if (ok) DataAdmin.exportCSV();
  });

  $("btn-change-email")?.addEventListener("click", async () => {
    const newEmail = $("settings-new-email")?.value.trim();
    if (!newEmail || !newEmail.includes("@")) {
      UI.showPopup("Please enter a valid email address.", "Invalid Email");
      return;
    }
    const btn = $("btn-change-email");
    const originalText = btn.textContent;
    btn.textContent = "Updating...";
    btn.disabled = true;

    const ok = await Auth.updateEmail(newEmail);
    if (ok) {
      UI.showPopup("A verification link has been sent to your new email address. Please check your inbox to confirm the change.", "Check Your Email");
      if ($("settings-new-email")) $("settings-new-email").value = "";
    }
    btn.textContent = originalText;
    btn.disabled = false;
  });

  $("btn-wipe-data")?.addEventListener("click", async () => {
    const ok = await UI.confirm(
      "This permanently deletes all your tasks, logs, and exams from the cloud. This cannot be undone.",
      { title: "Wipe all data?", confirmText: "Delete everything", danger: true },
    );
    if (ok) DataAdmin.wipe();
  });
}

/* =========================================================================
   TIMER BINDINGS
   ========================================================================= */

function bindTimer() {
  Timer.init();

  $("btn-timer-start")?.addEventListener("click", () => Timer.start());
  $("btn-timer-pause")?.addEventListener("click", () => Timer.pause());
  $("btn-timer-reset")?.addEventListener("click", () => Timer.reset());
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
    // Staged while running (won't cancel the active timer), applied when idle.
    if (Timer.isRunning()) Timer.stagePreset(p, "pomodoro");
    else Timer.applyNow(p, "pomodoro");
  });

  // Persistent mini-timer controls.
  $("mini-timer-open")?.addEventListener("click", () => UI.switchTab("timer"));
  $("mini-timer-toggle")?.addEventListener("click", () => Timer.toggle());

  // Keep the mini-timer's show/hide in sync as the user navigates views.
  window.addEventListener("hashchange", () => Timer.updateUI());
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
    emptyLi.className = "todo-item";
    emptyLi.style.justifyContent = "center";
    emptyLi.style.opacity = "0.6";
    emptyLi.style.cursor = "default";
    emptyLi.textContent = "No tasks yet — add one above!";
    list.appendChild(emptyLi);
  }

  if (select) select.innerHTML = '<option value="None">None</option>';

  tasks.forEach((t) => {
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

    // Delete
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      li.style.opacity = "0";
      li.style.transform = "translateX(20px)";
      const ok = await Tasks.delete(t.id);
      if (!ok) {
        li.style.opacity = "";
        li.style.transform = "";
        UI.showPopup("Failed to delete task.", "Error");
      } else {
        setTimeout(loadTasks, 250);
      }
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
    const text = input?.value.trim();
    if (!text) return;
    input.value = "";
    await Tasks.add(text);
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
    if (!text) return;
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
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${MONTH_NAMES[m]} ${d}, ${y}`);

    const dayNum = document.createElement("span");
    dayNum.className = "day-number";
    dayNum.textContent = d;
    cell.appendChild(dayNum);

    const examsForDate = cachedExams.filter((e) => e.exam_date === dateStr);
    const maxExamsToShow = 2;

    examsForDate.slice(0, maxExamsToShow).forEach((exam) => {
      const bar = document.createElement("div");
      bar.className = `exam-bar diff-${(exam.difficulty || "Medium").toLowerCase()} status-${(exam.status || "Scheduled").toLowerCase()}`;
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

    const openNewExam = () => openExamModal(null, dateStr);
    cell.addEventListener("click", openNewExam);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openNewExam();
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
  const modal = $("exam-modal");
  modal?.classList.remove("hidden");

  if (exam) {
    // Editing an existing exam — show status and the delete affordance.
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
    // Creating — keep it minimal. Status defaults to "Scheduled" and stays hidden.
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

  // Auto-focus the name field
  requestAnimationFrame(() => $("exam-name")?.focus());
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
    openExamModal(null, new Date().toISOString().slice(0, 10));
  });

  $("btn-cancel-exam")?.addEventListener("click", () => {
    $("exam-modal")?.classList.add("hidden");
  });

  // Close modal on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("exam-modal")?.classList.add("hidden");
      $("popup-overlay")?.classList.add("hidden");
    }
  });

  $("exam-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
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
      $("exam-modal")?.classList.add("hidden");
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
      $("exam-modal")?.classList.add("hidden");
      loadCalendar();
    }
  });
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */

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
      li.innerHTML = "<span class='opacity-70'>No sessions yet — start a focus block to see it here.</span>";
      list.appendChild(li);
    } else {
      // Only render the most recent handful; the full history stays in storage.
      sessions.slice(0, 8).forEach((log) => {
        const li = document.createElement("li");
        li.className = "log-item";

        const left = document.createElement("span");
        left.innerHTML = `<strong class="text-primary">${esc(String(log.minutes))}m Focus</strong>${
          log.task !== "General Study" ? ` on ${esc(log.task)}` : ""
        }`;

        const right = document.createElement("span");
        right.className = "opacity-70";
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
    totalDisplay.innerHTML = `${(totalMins / 60).toFixed(1)} <span>hours total</span>`;
  }

  const todayDisplay = $("dash-today-focus");
  if (todayDisplay) {
    todayDisplay.textContent = todayMins >= 60
      ? `${(todayMins / 60).toFixed(1)}h`
      : `${todayMins}m`;
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
      <p class="dash-empty">No exams scheduled. You're all clear — or add one to start planning.</p>
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

  const pending = tasks.filter((t) => !t.is_done).slice(0, 6);
  list.innerHTML = "";

  if (pending.length === 0) {
    const li = document.createElement("li");
    li.className = "dash-empty";
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
   AI BINDINGS
   ========================================================================= */

function bindAI() {
  $("nav-ai-trigger")?.addEventListener("click", (e) => {
    // Prevent the #ai hash from routing (there is no view-ai section,
    // which would hide the current view and fall back to the dashboard)
    e.preventDefault();
    $("turbo-chat")?.classList.remove("hidden");
  });

  $("turbo-toggle")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.remove("hidden");
  });

  $("btn-ai-close")?.addEventListener("click", () => {
    $("turbo-chat")?.classList.add("hidden");
  });

  $("btn-ai-fullscreen")?.addEventListener("click", () => {
    const m = $("turbo-chat");
    if (!m) return;
    m.classList.toggle("fullscreen");
    m.classList.toggle("minimized");
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
      $("turbo-chat")?.classList.remove("hidden");
      input.value = btn.dataset.chatPrompt;
      if (btn.dataset.chatSend) {
        $("btn-send-chat")?.click();
      } else {
        input.focus();
      }
    });
  });
}

/* =========================================================================
   WORKSPACE INIT
   ========================================================================= */

function initWorkspace() {
  loadTasks();
  loadCalendar();
  // Timer.init() is already called by bindTimer() during boot — no second init.
  AI.initDragDrop();
  startClock();
  window.addEventListener("sessionLogged", renderDashboard);
  // When the AI assistant creates tasks, refresh the Task Manager list and the
  // dashboard's compact task widget (loadTasks() re-renders both).
  window.addEventListener("tasksUpdated", loadTasks);
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

  update();
  setInterval(update, 30000); // 30s is enough for HH:MM display
}
