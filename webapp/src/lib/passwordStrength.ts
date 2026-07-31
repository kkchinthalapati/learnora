/* Port of the password-strength meter the vanilla app bound in four places:
 * signup, the in-page reset form, reset-password.js's standalone page and the
 * settings tab (js/main.js:502-540, js/main.js:1053-1086,
 * reset-password.js:55-83). All four scored identically, so there is one
 * function here.
 *
 * Lifted out of the component so the scoring is testable on its own — the
 * vanilla computed it inline in an input listener, which is why it was never
 * covered. Behaviour is unchanged, including the quirk that a password under
 * 8 characters is always "Too Weak" no matter how many character classes it
 * uses.
 *
 * Lives in lib/ rather than views/settings/ because the auth views score the
 * same way; it was only ever in the settings folder because settings was the
 * first step that needed it. */

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export interface Strength {
  level: StrengthLevel;
  label: string;
}

export function scorePassword(value: string): Strength {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  if (score <= 1 || value.length < 8) {
    return { level: "weak", label: "Too Weak (Need 8+ chars & mix)" };
  }
  if (score === 2) return { level: "fair", label: "Fair" };
  if (score === 3) return { level: "good", label: "Good" };
  return { level: "strong", label: "Strong" };
}

/* The same two checks were being re-typed at every "set a new password"
 * form — signup, the auth reset-password screen, and the settings security
 * tab — with the wording having already drifted between copies. One
 * function, called before the API request goes out; returns `null` for the
 * component to only add its own UI-layer `kind` on an actual failure.
 * Deliberately returns a plain `{ message }` rather than a UI type like
 * `FeedbackState`: nothing in `lib/` imports from `components/` elsewhere in
 * this codebase, and the caller already has to wrap it in whatever status
 * shape its own screen uses. */
export function validateNewPassword(
  password: string,
  confirmPassword: string,
): { message: string } | null {
  if (password.length < 8) {
    return { message: "Password must be at least 8 characters long." };
  }
  if (password !== confirmPassword) {
    return { message: "Passwords do not match. Please re-enter them." };
  }
  return null;
}
