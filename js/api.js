import { supabase } from "./supabase.js";
import { UI, $ } from "./ui.js";

/* =========================================================================
   CONSTANTS
   ========================================================================= */

const VERIFY_REDIRECT = "https://study-planner-delta-six.vercel.app/verify.html";
const MIN_SIGNUP_AGE = 13;

/* =========================================================================
   HELPERS
   ========================================================================= */

/** Cache the current user to avoid redundant getUser() calls */
let _cachedUser = null;

async function getCurrentUser() {
  if (_cachedUser) return _cachedUser;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) { _cachedUser = null; return null; }
    _cachedUser = user;
    return user;
  } catch {
    _cachedUser = null;
    return null;
  }
}

/** Invalidate user cache on auth state changes */
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedUser = session?.user ?? null;
});

function calculateAge(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/** Friendly error messages for Supabase error codes */
function friendlyAuthError(error) {
  const msg = error?.message?.toLowerCase() || "";
  const code = error?.code || error?.status;

  if (code === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many requests. Please wait a minute and try again.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email before logging in. Check your inbox.";
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (msg.includes("signup is disabled")) {
    return "New signups are temporarily disabled. Please try again later.";
  }
  if (msg.includes("password") && msg.includes("characters")) {
    return "Password must be at least 6 characters long.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your internet connection.";
  }
  return error?.message || "An unexpected error occurred. Please try again.";
}

/* =========================================================================
   AUTH — Login, Signup, Logout, Session
   ========================================================================= */

export const Auth = {
  async login(email, password, silent = false) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (!silent) {
          UI.showPopup(friendlyAuthError(error), "Login Failed");
        }
        return false;
      }
      return true;
    } catch (e) {
      if (!silent) {
        UI.showPopup(friendlyAuthError(e), "Login Failed");
      }
      return false;
    }
  },

  async signup(name, email, password, dob) {
    // Validate age
    if (!dob) {
      UI.showPopup("Please enter your date of birth.", "Missing Field");
      return false;
    }
    if (calculateAge(dob) < MIN_SIGNUP_AGE) {
      UI.showPopup(`You must be at least ${MIN_SIGNUP_AGE} years old.`, "Age Restriction");
      return false;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, dob },
          emailRedirectTo: VERIFY_REDIRECT,
        },
      });

      if (error) {
        UI.showPopup(friendlyAuthError(error), "Signup Failed");
        return false;
      }

      // Supabase returns a user with a fake session if email confirmation
      // is disabled, or no session if confirmation is required.
      // Also: if user already exists, Supabase may return data.user with
      // an empty identities array (obfuscated duplicate).
      if (data?.user && data.user.identities?.length === 0) {
        UI.showPopup(
          "An account with this email already exists. Try logging in instead.",
          "Account Exists",
        );
        return false;
      }

      if (!data.session) {
        UI.showPopup(
          "Account created! Check your email for the confirmation link. (Check spam too!)",
          "Verify Your Email ✉️",
        );
        return "verification-sent";
      }

      // Auto-confirmed signup — proceed directly
      return true;
    } catch (e) {
      UI.showPopup(friendlyAuthError(e), "Signup Failed");
      return false;
    }
  },

  async logout() {
    try {
      _cachedUser = null;
      await supabase.auth.signOut();
    } catch {
      // Force clear even if signOut API fails
      _cachedUser = null;
    }
    window.location.reload();
  },

  async getSession() {
    try {
      // Use getSession() first — it reads from the local cache, no network call
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return null;

      // Session exists — use the embedded user to avoid extra getUser() call
      // Only call getUser() if session.user is missing (shouldn't happen)
      if (session.user) {
        _cachedUser = session.user;
        return session.user;
      }

      // Fallback: fetch user from server
      const user = await getCurrentUser();
      if (!user) {
        // Session is stale — sign out silently
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        return null;
      }
      return user;
    } catch {
      return null;
    }
  },
};

/* =========================================================================
   FOLDERS — Workspace grouping for materials
   ========================================================================= */

export const Folders = {
  async fetch() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("folders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[Folders.fetch]", error.message);
      return [];
    }
    return data || [];
  },

  async add(name, color = "#4A90E2") {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("folders")
      .insert([{ name, color, user_id: user.id }])
      .select()
      .single();
    if (error) {
      UI.showPopup(error.message, "Error Creating Folder");
      return null;
    }
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) {
      console.error("[Folders.delete]", error.message);
      return false;
    }
    return true;
  }
};

/* =========================================================================
   MATERIALS — Uploaded documents, audio, videos
   ========================================================================= */

export const Materials = {
  async fetch(folderId = null) {
    const user = await getCurrentUser();
    if (!user) return [];
    let query = supabase.from("materials").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    
    if (folderId) query = query.eq("folder_id", folderId);
    
    const { data, error } = await query;
    if (error) {
      console.error("[Materials.fetch]", error.message);
      return [];
    }
    return data || [];
  },

  async uploadFile(file, folderId, type, customTitle) {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not logged in");

    // 1. Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('materials')
      .upload(filePath, file);

    if (uploadError) {
      console.error("[Materials.upload]", uploadError.message);
      throw new Error(uploadError.message);
    }

    // 2. Insert DB record
    const { data, error: dbError } = await supabase
      .from("materials")
      .insert([{
        user_id: user.id,
        folder_id: folderId,
        title: customTitle || file.name,
        type: type,
        storage_path: filePath
      }])
      .select()
      .single();

    if (dbError) {
      console.error("[Materials.db]", dbError.message);
      throw new Error(dbError.message);
    }

    return data;
  },

  async addLink(url, folderId, customTitle) {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not logged in");

    const defaultTitle = url.includes("youtube.com") || url.includes("youtu.be") ? "YouTube Link" : "Web Link";

    const { data, error } = await supabase
      .from("materials")
      .insert([{
        user_id: user.id,
        folder_id: folderId,
        title: customTitle || defaultTitle,
        type: url.includes("youtube.com") || url.includes("youtu.be") ? "youtube" : "text",
        raw_content: url
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async getSignedUrl(storagePath) {
    const { data, error } = await supabase.storage
      .from('materials')
      .createSignedUrl(storagePath, 3600); // 1 hour expiration

    if (error) {
      console.error("[Materials.getSignedUrl]", error.message);
      return null;
    }
    return data.signedUrl;
  }
};

/* =========================================================================
   NOTES & FLASHCARDS (Phase 3)
   ========================================================================= */

export const Notes = {
  async fetchByMaterial(materialId) {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[Notes.fetch]", error.message);
      return [];
    }
    return data || [];
  },

  async add(materialId, markdownContent) {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("notes")
      .insert([{ user_id: user.id, material_id: materialId, markdown_content: markdownContent }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
};

export const Decks = {
  async fetch(folderId) {
    const { data, error } = await supabase
      .from("flashcard_decks")
      .select("*")
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  },

  async add(folderId, title) {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("flashcard_decks")
      .insert([{ user_id: user.id, folder_id: folderId, title }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
};

export const Flashcards = {
  async fetchByDeck(deckId) {
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("deck_id", deckId);
    if (error) return [];
    return data || [];
  },

  async addBatch(deckId, cardsArray) {
    const user = await getCurrentUser();
    if (!user) return null;
    const inserts = cardsArray.map(c => ({
      user_id: user.id,
      deck_id: deckId,
      front: c.front,
      back: c.back
    }));
    const { data, error } = await supabase.from("flashcards").insert(inserts).select();
    if (error) throw new Error(error.message);
    return data;
  },
  
  async updateReview(cardId, nextReviewDate, interval, ease) {
    const { error } = await supabase
      .from("flashcards")
      .update({
        next_review_date: nextReviewDate,
        srs_interval: interval,
        ease_factor: ease
      })
      .eq("id", cardId);
    if (error) throw new Error(error.message);
    return true;
  }
};

/* =========================================================================
   TASKS — CRUD for the tasks table
   ========================================================================= */

export const Tasks = {
  async fetch() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("id", { ascending: true });
    if (error) {
      console.error("[Tasks.fetch]", error.message);
      return [];
    }
    return data || [];
  },

  async add(text) {
    const user = await getCurrentUser();
    if (!user) return false;
    const { error } = await supabase
      .from("tasks")
      .insert([{ text, is_done: false, user_id: user.id }]);
    if (error) {
      UI.showPopup(error.message, "Error Adding Task");
      return false;
    }
    return true;
  },

  async toggle(id, currentStatus) {
    const { error } = await supabase
      .from("tasks")
      .update({ is_done: !currentStatus })
      .eq("id", id);
    if (error) {
      console.error("[Tasks.toggle]", error.message);
      return false;
    }
    return true;
  },

  async delete(id) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      console.error("[Tasks.delete]", error.message);
      return false;
    }
    return true;
  },

  async updateText(id, newText) {
    const { error } = await supabase
      .from("tasks")
      .update({ text: newText })
      .eq("id", id);
    if (error) {
      console.error("[Tasks.updateText]", error.message);
      return false;
    }
    return true;
  },
};

/* =========================================================================
   EXAMS — CRUD for the exams table
   ========================================================================= */

export const Exams = {
  async fetch() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", user.id)
      .order("exam_date", { ascending: true });
    if (error) {
      console.error("[Exams.fetch]", error.message);
      return [];
    }
    return data || [];
  },

  async save(payload, id = null) {
    const user = await getCurrentUser();
    if (!user) return false;
    payload.user_id = user.id;

    const res = id
      ? await supabase.from("exams").update(payload).eq("id", id)
      : await supabase.from("exams").insert([payload]);

    if (res.error) {
      UI.showPopup(res.error.message, "Database Error");
      return false;
    }
    return true;
  },

  async delete(id) {
    const { error } = await supabase.from("exams").delete().eq("id", id);
    if (error) console.error("[Exams.delete]", error.message);
  },
};

/* =========================================================================
   DATA ADMIN — Export & Wipe
   ========================================================================= */

function escapeCSVField(field) {
  const str = String(field ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const DataAdmin = {
  async exportCSV() {
    try {
      const [tasks, exams] = await Promise.all([Tasks.fetch(), Exams.fetch()]);
      let sessions = [];
      try {
        const raw = localStorage.getItem("sessions");
        sessions = raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.error("Failed to parse sessions for export", err);
      }

      const rows = [["Type", "Name", "Status", "Date"]];
      tasks.forEach((t) =>
        rows.push(["Task", t.text, t.is_done ? "Done" : "Pending", ""]),
      );
      exams.forEach((e) =>
        rows.push(["Exam", e.exam_name, e.status, e.exam_date]),
      );
      sessions.forEach((s) =>
        rows.push(["Focus Session", `${s.minutes}m Focus on ${s.task || "General Study"}`, "Completed", s.timestamp]),
      );

      const csv = rows.map((r) => r.map(escapeCSVField).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `Learnora_Export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[DataAdmin.exportCSV]", e);
      UI.showPopup("Export failed. Please try again.", "Error");
    }
  },

  async wipe() {
    const user = await getCurrentUser();
    if (!user) return;
    try {
      await Promise.all([
        supabase.from("tasks").delete().eq("user_id", user.id),
        supabase.from("exams").delete().eq("user_id", user.id),
      ]);
      // Only wipe study-session data, never auth tokens or theme prefs
      localStorage.removeItem("sessions");
      localStorage.removeItem("fav_times");
      UI.showPopup("All data wiped.", "Success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error("[DataAdmin.wipe]", e);
      UI.showPopup("Wipe failed.", "Error");
    }
  },
};
