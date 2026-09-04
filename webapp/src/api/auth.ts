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

/* `dob` is the "YYYY-MM-DD" an <input type="date"> produces.
 *
 * Deliberately not `new Date(dob)`: that form is parsed as UTC midnight,
 * while the `today` it gets compared against is local. West of Greenwich the
 * two disagree by a calendar day — `new Date("2013-08-30")` reads back as
 * August 29th in UTC-7 — which makes the birthday land a day early and lets
 * someone through the age gate the day before they actually turn 13. Reading
 * the three fields out of the string keeps both sides on the same calendar. */
function calculateAge(dob: string): number {
  const [year, month, day] = dob.split("-").map(Number);
  if (!year || !month || !day) return NaN;

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
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

/* Sets the new password and evicts every other session. Shared by both
 * password-change entry points below; the difference between them is what
 * they require *before* reaching here, not what they do once identity is
 * settled. */
async function applyPasswordChange(newPassword: string): Promise<void> {
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
    consentGiven: boolean,
  ): Promise<SignupOutcome> {
    if (!dob) throw new Error("Please enter your date of birth.");
    const age = calculateAge(dob);
    /* An unparseable date has to be rejected explicitly: `NaN < 13` is
     * false, so a comparison on its own would wave it straight through. */
    if (Number.isNaN(age)) {
      throw new Error("Please enter a valid date of birth.");
    }
    if (age < MIN_SIGNUP_AGE) {
      throw new Error(`You must be at least ${MIN_SIGNUP_AGE} years old.`);
    }
    /* The UI already blocks submission with the checkbox unchecked (see
     * SignupView) — this is the server-facing half of that same rule, so a
     * request built by hand (or a future caller) can't skip the checkbox by
     * skipping the form. */
    if (!consentGiven) {
      throw new Error(
        "You must agree to share your study data with our AI providers to create an account.",
      );
    }

    /* `consent_given` rides in the same user-metadata bag as `full_name` and
     * `dob`. The `sync_profile_from_auth_user` trigger (see the migration
     * alongside this file) copies it into `public.profiles` on insert, so
     * there is no separate write to make here — one signup call is the whole
     * flow, same as name and date of birth already were. */
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, dob, consent_given: consentGiven },
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

  /* Change the password when the caller has *already* proved who they are —
   * today that is only the recovery flow, where they arrived holding a
   * single-use token Supabase emailed to the address on the account.
   *
   * Every other entry point must go through `changePasswordWithCurrent`
   * below. `updateUser({ password })` authenticates with nothing but the
   * access token in this tab, so on its own it turns "borrowed an unlocked
   * browser" (or any leaked token) into a full account takeover: the
   * attacker sets a password the owner does not know, and the
   * `signOut({ scope: "others" })` below then evicts the owner from their
   * own sessions. */
  async changePassword(newPassword: string): Promise<void> {
    await applyPasswordChange(newPassword);
  },

  /** Change the password from Settings, re-authenticating with the current
   *  one first.
   *
   *  Supabase has no "verify this password" endpoint, so the check is a real
   *  `signInWithPassword` against the signed-in user's own email: it succeeds
   *  only for the right password, and the session it mints replaces this
   *  tab's with an equivalent one for the same user. A wrong password leaves
   *  the existing session untouched and the account's password unchanged. */
  async changePasswordWithCurrent(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!currentPassword) {
      throw new Error("Please enter your current password.");
    }

    /* Read the email from the server-verified user rather than from a cached
     * session object, so a stale local session can't aim the re-auth at some
     * other address. */
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      throw new Error("Your session has expired. Please log in again.");
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauthError) {
      const msg = reauthError.message?.toLowerCase() || "";
      /* Supabase rate-limits repeated password attempts. Passing that through
       * verbatim matters here — "wrong password" would be actively wrong and
       * send the user round the loop again. */
      if (
        reauthError.status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("too many")
      ) {
        throw new Error(
          "Too many attempts. Please wait a minute and try again.",
        );
      }
      throw new Error("Your current password is incorrect.");
    }

    await applyPasswordChange(newPassword);
  },

  /** Sign out all other sessions (not the current one). */
  async signOutOthers(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw new Error(friendlyAuthError(error));
  },

  /** Delete the account — requires an edge function since the client SDK
   * cannot delete users (admin-only operation). */
  /* `password` re-authenticates the person at the keyboard. The session token
     proves the account; it does not prove that whoever is holding the laptop
     is its owner, and this action is irreversible. The edge function decides
     whether a password is required — an OAuth-only account has none — so it
     is optional here rather than enforced client-side. */
  async deleteAccount(password?: string): Promise<void> {
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
      body: JSON.stringify({ password: password ?? "" }),
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
