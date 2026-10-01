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

/* A keyed list of records in localStorage: list, upsert, remove, clear.
 *
 * Three modules had each hand-rolled this — Feynman sessions, the Debugger's
 * saved traces, Exam Detective's radar history — at roughly seventy lines
 * apiece, with the same list/find/upsert/filter shape, the same try/catch
 * around every operation and the same `typeof window` guard, differing only in
 * which console.warn they logged and whether they capped the list at all.
 *
 * Storage keys are unchanged by this: they name data already sitting in
 * students' browsers.
 *
 * `limit` caps the list newest-first. The Debugger capped at 50 and the other
 * two were unbounded, which is a slow leak on the one that stores whole
 * teaching transcripts. */
export function collection<T>(
  key: string,
  idOf: (item: T) => string,
  options: { limit?: number } = {},
) {
  function list(): T[] {
    const parsed = get<T[]>(key, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  return {
    list,

    find(id: string): T | null {
      return list().find((item) => idOf(item) === id) ?? null;
    },

    /** Insert or replace by id. A new record goes to the front, an existing
     *  one keeps its position, so saving mid-session does not reshuffle a
     *  list the student is looking at. */
    save(item: T): void {
      const items = list();
      const at = items.findIndex((existing) => idOf(existing) === idOf(item));
      if (at >= 0) {
        items[at] = item;
      } else {
        items.unshift(item);
      }
      set(key, options.limit ? items.slice(0, options.limit) : items);
    },

    remove(id: string): void {
      set(
        key,
        list().filter((item) => idOf(item) !== id),
      );
    },

    clear(): void {
      remove(key);
    },
  };
}
