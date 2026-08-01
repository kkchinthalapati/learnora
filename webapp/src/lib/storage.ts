/* Port of js/ui.js's `Storage` wrapper (:55-72).
 *
 * Kept byte-compatible with the vanilla app on purpose: both apps run
 * side by side against the same origin, so a theme or settings object
 * written by one has to be readable by the other. That means the same
 * keys, the same JSON encoding, and the same "never throw" contract —
 * a malformed value or a full quota degrades to the fallback rather
 * than taking a render down with it. */

function get<T>(key: string, fallback: T): T;
function get<T>(key: string): T | null;
function get<T>(key: string, fallback: T | null = null): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — silent, same as the vanilla */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Safari private mode can throw here too */
  }
}

export const Storage = { get, set, remove };
