/* The pre-launch "coming soon" gate's one check (js/main.js:61-63) — see
 * `components/InviteGate.tsx` for the full context. Its own module, not
 * exported alongside the component, so that file stays components-only for
 * fast refresh (same reason `useAuthStatus` sits apart from `AuthShell`). */

export const INVITE_ACCESS_KEY = "learnora_invite_access";
export const COMING_SOON_PATH = "/coming-soon.html";

export function hasInviteAccess(): boolean {
  try {
    return Boolean(localStorage.getItem(INVITE_ACCESS_KEY));
  } catch {
    /* Storage can throw in a locked-down environment (Safari private mode
       quota, browser policy) — same "fail closed to the wall" outcome as
       just not having the key. */
    return false;
  }
}
