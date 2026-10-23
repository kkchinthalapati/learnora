import type { User } from "@supabase/supabase-js";

/* Google and Apple sign-up give Learnora a name and email, but not a date of
 * birth, and an account made that way has no AI-consent answer. Both are needed
 * before the account can use the app: the date of birth for the 13+ rule,
 * and the consent answer because a missing one reads as "allowed" (see
 * aiConsent.ts), which must not happen to a brand-new account.
 *
 * Only Google- and Apple-created accounts are checked. Email sign-ups
 * collected both at the form, and older accounts predate the rule and are left
 * alone. */

export function needsAccountDetails(user: User | null): boolean {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  if (provider !== "google" && provider !== "apple") return false;
  const meta = user.user_metadata ?? {};
  const hasDob = typeof meta.dob === "string" && meta.dob.length > 0;
  const hasConsent = typeof meta.consent_given === "boolean";
  return !hasDob || !hasConsent;
}

/** Where the finish-account step lives. */
export const FINISH_ACCOUNT_PATH = "/finish-account";
