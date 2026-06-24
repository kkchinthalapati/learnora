import { supabase } from "./supabase.js";
import { UI } from "./ui.js";

export const Auth = {
  async login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      UI.showPopup(error.message, "Login Failed");
      return false;
    }
    return true;
  },

  async signup(name, email, password, dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    if (
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() < birthDate.getDate())
    )
      age--;

    if (age < 13) {
      UI.showPopup("You must be at least 13 years old.", "Age Restriction");
      return false;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, dob: dob },
        emailRedirectTo:
          "https://study-planner-delta-six.vercel.app/verify.html",
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error || !user) throw new Error("Ghost session");
        return user;
      }
    } catch (err) {
      await supabase.auth.signOut();
      localStorage.clear();
    }
    return null;
  },
};

export const Tasks = {
  async fetch() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("id", { ascending: true });
    return data || [];
  },
  async add(text) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("tasks")
      .insert([{ text, is_done: false, user_id: user.id }]);
    if (error) UI.showPopup(error.message, "Error Adding Task");
  },
  async toggle(id, currentStatus) {
    await supabase
      .from("tasks")
      .update({ is_done: !currentStatus })
      .eq("id", id);
  },
  async delete(id) {
    await supabase.from("tasks").delete().eq("id", id);
  },
};

export const Exams = {
  async fetch() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", user.id);
    return data || [];
  },
  async save(payload, id = null) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    payload.user_id = user.id;
    let res = id
      ? await supabase.from("exams").update(payload).eq("id", id)
      : await supabase.from("exams").insert([payload]);
    if (res.error) {
      UI.showPopup(res.error.message, "Database Error");
      return false;
    }
    return true;
  },
  async delete(id) {
    await supabase.from("exams").delete().eq("id", id);
  },
};

export const DataAdmin = {
  async exportCSV() {
    try {
      const tasks = await Tasks.fetch();
      const exams = await Exams.fetch();
      let csv = "data:text/csv;charset=utf-8,Type,Name,Status,Date\n";
      tasks.forEach(
        (t) => (csv += `Task,"${t.text}",${t.is_done ? "Done" : "Pending"},\n`),
      );
      exams.forEach(
        (e) => (csv += `Exam,"${e.exam_name}",${e.status},${e.exam_date}\n`),
      );

      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csv));
      link.setAttribute("download", "Learnora_Export.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      UI.showPopup("Export failed.", "Error");
    }
  },
  async wipe() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    try {
      await supabase.from("tasks").delete().eq("user_id", user.id);
      await supabase.from("exams").delete().eq("user_id", user.id);
      localStorage.clear();
      UI.showPopup("All data wiped.", "Success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      UI.showPopup("Wipe failed.", "Error");
    }
  },
};
