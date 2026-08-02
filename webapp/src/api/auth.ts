import { supabase, SUPABASE_URL } from "../lib/supabase";

/* Direct port of js/api.js's `Auth` object (:86-348) — minus `getSession` and
 * `logout`, which Step 4 already ported into `AuthProvider`/`useAuth().signOut`
 * as the app's one reactive session source. Everything here is one-shot
 * request/response, so it fits the same throw-on-error convention as the
 * other entity modules (Decision #6) instead of the vanilla's
 * `UI.showPopup` + boolean-return pattern. `signup`'s "check your email"
 * outcome is real branching logic the caller needs, not an error, so it
 * stays a return value. */

const MIN_SIGNUP_AGE = 13;

/* Where Supabase sends someone after they click a link in one of its emails.
 *
 * These used to be `/verify.html` and `/reset-password.html` — the vanilla
 * app's two standalone pages — because there was nowhere else to send them.
 * Both are React routes now, so the links stay inside this app.
 *
 * `import.meta.env.BASE_URL` is the piece that is easy to get wrong: the
 * production build is served under a path prefix, and a redirect to
 * `origin + "/verify"` would land on the vanilla app's 404 rather than this
 * app's route. Vite substitutes the configured `base` at build time, and it
 * always has a trailing slash, hence the leading slash being trimmed here.
 *
 * Both URLs must also be on the Supabase project's redirect allow-list
 * (Authentication → URL Configuration) or Supabase silently falls back to the
 * project's Site URL. That is a dashboard setting, not something this repo can
 * set — see the migration ledger. */
function authRedirect(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}${path.replace(/^\//, "")}`;
}

interface AuthErrorLike {
  message?: string;
  code?: string | number;
  status?: number;
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function friendlyAuthError(error: AuthErrorLike | null | undefined): string {
  const msg = error?.message?.toLowerCase() || "";
  const code = error?.code ?? error?.status;

  if (code === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many requests. Please wait a minute and try again.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email before logging in. Check your inbox.";
  }
  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered")
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (msg.includes("signup is disabled")) {
    return "New signups are temporarily disabled. Please try again later.";
  }
  if (msg.includes("password") && msg.includes("characters")) {
    return "Password must be at least 8 characters long.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your internet connection.";
  }
  return error?.message || "An unexpected error occurred. Please try again.";
}

export type SignupOutcome = "ok" | "verification-sent";

export const authApi = {
  async login(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(friendlyAuthError(error));
  },

  async signup(
    name: string,
    email: string,
    password: string,
    dob: string,
  ): Promise<SignupOutcome> {
    if (!dob) throw new Error("Please enter your date of birth.");
    if (calculateAge(dob) < MIN_SIGNUP_AGE) {
      throw new Error(`You must be at least ${MIN_SIGNUP_AGE} years old.`);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, dob },
        emailRedirectTo: authRedirect("/verify"),
      },
    });
    if (error) throw new Error(friendlyAuthError(error));

    // Supabase returns a user with a fake session if email confirmation is
    // disabled, or no session if confirmation is required. Also: if the user
    // already exists, Supabase may return data.user with an empty identities
    // array (obfuscated duplicate).
    if (data.user && data.user.identities?.length === 0) {
      throw new Error(
        "An account with this email already exists. Try logging in instead.",
      );
    }

    return data.session ? "ok" : "verification-sent";
  },

  async resetPasswordRequest(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect("/reset-password"),
    });
    if (error) throw new Error(friendlyAuthError(error));
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendlyAuthError(error));
  },

  async updateEmail(newEmail: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) throw new Error(friendlyAuthError(error));
  },

  /** Update profile metadata (display name, etc). */
  async updateProfile(data: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) throw new Error(friendlyAuthError(error));
  },

  /** Change password from the settings page, then invalidate other sessions. */
  async changePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("same") || msg.includes("different")) {
        throw new Error(
          "New password must be different from your current password.",
        );
      }
      throw new Error(friendlyAuthError(error));
    }
    try {
      await supabase.auth.signOut({ scope: "others" });
    } catch {
      // Non-critical — the password was still changed.
    }
  },

  /** Sign out all other sessions (not the current one). */
  async signOutOthers(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw new Error(friendlyAuthError(error));
  },

  /** Delete the account — requires an edge function since the client SDK
   * cannot delete users (admin-only operation). */
  async deleteAccount(): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session. Please log in again.");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body.error || "Failed to delete account. Please try again.",
      );
    }
    await supabase.auth.signOut();
  },
};
