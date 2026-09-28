import { LOCAL_SESSIONS_KEY, type LocalSession } from "./localSessions";

/* One browser, two students — a shared family laptop, a school library PC.
 *
 * Most of what the app parks in localStorage is the signed-in student's own
 * work: the "pick up where you left off" snapshot, half-finished quiz runs,
 * pasted material drafts, Debugger traces, Feynman transcripts, the offline
 * write queue. None of it was keyed by user, so the next student to sign in on
 * the same browser was shown the previous one's "Resume" card and drafts, and
 * the offline queue would try to replay the previous student's writes.
 *
 * The browser remembers whose data it holds. When a *different* account signs
 * in, everything user-owned is cleared first. The same student signing back in
 * keeps it all — an unsynced offline queue must survive a sign-out and back in.
 *
 * Kept: the owner marker itself and sidebar layout (a device preference).
 * Appearance is cleared separately by `clearAppearance()`. Guest focus sessions
 * logged while signed out are kept so `migrateGuestSessions` can still credit
 * them to whoever signs in next; the previous student's own sessions go. */

export const STORAGE_OWNER_KEY = "learnora_storage_owner";

const DEVICE_KEYS = new Set([
  STORAGE_OWNER_KEY,
  "learnora_sidebar_collapsed_sections",
]);

/* Pre-"learnora_" keys still written by the port of the vanilla app. */
const LEGACY_USER_KEYS = ["fav_times", "onboarding_dismissed"];

function isUserKey(key: string): boolean {
  if (DEVICE_KEYS.has(key)) return false;
  return key.startsWith("learnora") || LEGACY_USER_KEYS.includes(key);
}

function clearFrom(store: Storage): void {
  const doomed: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && isUserKey(key)) doomed.push(key);
  }
  for (const key of doomed) store.removeItem(key);
}

function keepOnlyGuestSessions(): void {
  const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
  if (!raw) return;
  let sessions: unknown;
  try {
    sessions = JSON.parse(raw);
  } catch {
    localStorage.removeItem(LOCAL_SESSIONS_KEY);
    return;
  }
  if (!Array.isArray(sessions)) {
    localStorage.removeItem(LOCAL_SESSIONS_KEY);
    return;
  }
  const guest = (sessions as LocalSession[]).filter(
    (s) => s && (s as { guest?: boolean }).guest === true,
  );
  if (guest.length) {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(guest));
  } else {
    localStorage.removeItem(LOCAL_SESSIONS_KEY);
  }
}

/** Removes every user-owned key from local and session storage. */
export function clearUserLocalData(): void {
  try {
    clearFrom(localStorage);
    keepOnlyGuestSessions();
  } catch {
    /* Storage disabled or throwing (Safari private mode) — nothing to leak. */
  }
  try {
    clearFrom(sessionStorage);
  } catch {
    /* as above */
  }
}

/**
 * Records `userId` as the owner of this browser's stored data, clearing the
 * previous owner's data first when it was someone else. Returns true when a
 * clear happened. A browser with no recorded owner (data written before this
 * existed) is claimed without clearing — there is no way to know whose it is,
 * and wiping it would throw away the likely-same student's unsynced work.
 */
export function claimLocalStorageFor(userId: string): boolean {
  let owner: string | null;
  try {
    owner = localStorage.getItem(STORAGE_OWNER_KEY);
  } catch {
    return false;
  }
  const switched = owner !== null && owner !== userId;
  if (switched) clearUserLocalData();
  try {
    localStorage.setItem(STORAGE_OWNER_KEY, userId);
  } catch {
    /* quota — the next sign-in will try again */
  }
  return switched;
}
