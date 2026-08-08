import { useCallback, useEffect, useRef } from "react";
import { Storage } from "../lib/storage";

export interface UseQuizDraftOptions {
  /** Whether autosave is active. Turn off once the quiz/exam is finished —
   *  that's also the signal to call `clear()` instead of relying on this. */
  enabled: boolean;
  /** Debounce window before a changed value is written to localStorage. */
  debounceMs?: number;
  /** Warn on tab close/refresh while there's unsaved progress worth keeping.
   *  Left to the caller to compute (e.g. `!finished && answers.length > 0`)
   *  rather than inferred from `enabled` alone. */
  warnOnUnload?: boolean;
}

export interface UseQuizDraftResult<T> {
  /** Read whatever draft is currently stored, if any. Does not subscribe —
   *  call once, typically to decide whether to offer a resume prompt. */
  load: () => T | null;
  /** Cancel any pending autosave and remove the stored draft. */
  clear: () => void;
}

const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Debounced localStorage autosave for an in-progress quiz/exam attempt.
 *
 * A student's answers/position (and, for a timed exam, an absolute end
 * timestamp) live in plain component state today — a refresh, crash, or
 * dropped connection loses the run with no way back. This persists `value`
 * to `localStorage` a short debounce after it changes, and flushes
 * immediately on unmount so a draft mid-debounce isn't lost to a fast
 * navigation away.
 *
 * Modeled on useDeferredDelete's unmount-flush pattern: the latest value
 * lives in a ref so the unmount effect (empty deps, so it only runs once)
 * can always read a fresh value without re-subscribing on every change.
 *
 * Deliberately does not read the draft itself on mount — that's a one-time
 * decision the caller makes (resume vs. start over), not something this
 * hook should silently apply. Callers can also fold `beforeunload` into
 * this rather than writing a second `useEffect` — the two nearly always
 * travel together (worth saving vs worth warning about).
 */
export function useQuizDraft<T>(
  key: string,
  value: T,
  options: UseQuizDraftOptions,
): UseQuizDraftResult<T> {
  const { enabled, debounceMs = DEFAULT_DEBOUNCE_MS, warnOnUnload = false } =
    options;

  const valueRef = useRef(value);
  valueRef.current = value;
  const keyRef = useRef(key);
  keyRef.current = key;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* True whenever there's a debounced write that hasn't landed yet. Tracked
     separately from `timerRef` (rather than inferring "pending" from it)
     because the per-value effect's cleanup below clears `timerRef` on every
     value change *and* on unmount — if the unmount-flush effect checked
     `timerRef` instead, it would race the sibling effect's own cleanup:
     React doesn't guarantee which of two effects in the same component
     cleans up first on unmount, so whichever runs first would already have
     nulled it out. `dirtyRef` is only ever cleared once the write actually
     lands, so it survives that race. */
  const dirtyRef = useRef(false);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* Schedule (or reschedule) the debounced write whenever the value changes,
     while enabled. Switching `enabled` off (the quiz just finished) cancels
     whatever was pending via this same effect's cleanup — no separate write
     happens for that transition, since the caller is expected to `clear()`
     instead. */
  useEffect(() => {
    if (!enabled) return;
    dirtyRef.current = true;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dirtyRef.current = false;
      Storage.set(keyRef.current, valueRef.current);
    }, debounceMs);
    return cancelPending;
  }, [key, value, enabled, debounceMs, cancelPending]);

  /* Flush on unmount rather than drop — a save still pending when the
     student navigates away should still land, same reasoning as
     useDeferredDelete's flush-on-unmount. Keyed off `dirtyRef`, not
     `timerRef`, for the race described above. */
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        Storage.set(keyRef.current, valueRef.current);
      }
    };
    // Deliberately mount/unmount-only: reads whatever key/value was current
    // at the moment of unmount via the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!warnOnUnload) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Custom message text is ignored by every modern browser — only
      // preventDefault + returnValue actually trigger the native prompt.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [warnOnUnload]);

  const load = useCallback((): T | null => Storage.get<T>(key), [key]);

  const clear = useCallback(() => {
    cancelPending();
    dirtyRef.current = false;
    Storage.remove(key);
  }, [cancelPending, key]);

  return { load, clear };
}
