/* Carries "you were signed out because the session expired" across the
 * redirect to /login, which otherwise lands the student on a blank sign-in
 * form with no idea why (and, before this, two raw "JWT expired" toasts).
 * sessionStorage: per tab, gone when the tab closes, never sent anywhere. */

const KEY = "learnora:session_expired";

export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage disabled — the student just doesn't get the explanation */
  }
}

/** True once per expiry: reading it clears it. */
export function consumeSessionExpired(): boolean {
  try {
    const was = sessionStorage.getItem(KEY) === "1";
    sessionStorage.removeItem(KEY);
    return was;
  } catch {
    return false;
  }
}

/** Whether the flag is set, without clearing it. */
export function peekSessionExpired(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
