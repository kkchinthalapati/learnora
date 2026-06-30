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

async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

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

/* =========================================================================
   AUTH — Login, Signup, Logout, Session
   ========================================================================= */

export const Auth = {
  async login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      UI.showPopup(error.message, "Login Failed");
      return false;
    }
    return true;
  },

  async signup(name, email, password, dob) {
    if (calculateAge(dob) < MIN_SIGNUP_AGE) {
      UI.showPopup(`You must be at least ${MIN_SIGNUP_AGE} years old.`, "Age Restriction");
      return false;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, dob },
        emailRedirectTo: VERIFY_REDIRECT,
      },
    });

    if (error) {
      UI.showPopup(error.message, "Signup Failed");
      return false;
    }
    if (!data.session) {
      UI.showPopup(
        "Success! Check your email for the confirmation link.",
        "Email Sent",
      );
      return false;
    }
    return true;
  },

  async logout() {
    await supabase.auth.signOut();
    window.location.reload();
  },

  async getSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const user = await getCurrentUser();
      if (!user) {
        await supabase.auth.signOut();
        return null;
      }
      return user;
    } catch {
      // Sign out stale auth state but never wipe user study data
      await supabase.auth.signOut();
      return null;
    }
  },
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
