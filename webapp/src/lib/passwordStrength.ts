/* Port of the settings password-strength meter (js/main.js:1053-1086).
 *
 * Lifted out of the component so the scoring is testable on its own — the
 * vanilla computed it inline in an input listener, which is why it was never
 * covered. Behaviour is unchanged, including the quirk that a password under
 * 8 characters is always "Too Weak" no matter how many character classes it
 * uses. */

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
