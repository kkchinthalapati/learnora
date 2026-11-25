/* The student's cookie choice, kept in a first-party cookie.
 *
 * What needs no permission, because the app can't work without it: the
 * sign-in session and preferences (Supabase auth and settings in local
 * storage) and this cookie itself. What waits for "Accept all": crash
 * reports to Sentry (lib/monitoring.ts), the one place data leaves for a
 * third party without the student doing something to cause it.
 *
 * Kept as a cookie rather than in local storage so the static pages on the
 * same site (landing, privacy) can read the same answer later, and so it is
 * visible to the student in their browser's cookie list under its own name. */

export type CookieConsent = "all" | "essential";

export const CONSENT_COOKIE = "learnora_cookie_consent";
/** Asked again after this long, as consent shouldn't last forever. */
const MAX_AGE_SECS = 180 * 24 * 60 * 60;
/** Fired on window when the choice changes or the banner is reopened. */
export const CONSENT_EVENT = "learnora:cookie-consent";

export function readCookieConsent(
  cookie: string = document.cookie,
): CookieConsent | null {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CONSENT_COOKIE) continue;
    const value = decodeURIComponent(rest.join("="));
    return value === "all" || value === "essential" ? value : null;
  }
  return null;
}

export function writeCookieConsent(choice: CookieConsent): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${MAX_AGE_SECS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

/** Clears the choice so the banner asks again (Privacy page "Change"). */
export function reopenCookieChoice(): void {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }));
}
