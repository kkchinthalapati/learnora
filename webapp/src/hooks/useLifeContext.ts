import { useCallback, useSyncExternalStore } from "react";
import {
  LIFE_CONTEXT_CHANGED_EVENT,
  loadLifeContext,
  saveLifeContext,
  type LifeContext,
} from "../lib/lifeContext";

/* One shared reading of the student's week.
 *
 * Two surfaces care about this — the dashboard timeline and the "My week"
 * editor — and they have to agree the instant one of them writes. A provider
 * would do it, but life context is not fetched, cached or invalidated the way
 * every entity in `api/` is, so a query hook would be the wrong shape and a
 * provider would be a whole context for one object read from localStorage.
 *
 * `useSyncExternalStore` over a module-level cache is the honest version: one
 * snapshot, one subscription, and React handles the tearing. The cache also
 * matters for correctness rather than speed — `getSnapshot` must return the
 * same reference until something actually changes, and `loadLifeContext()`
 * builds a fresh object every call, which would loop forever. */

let cached: LifeContext | null = null;

function getSnapshot(): LifeContext {
  if (!cached) cached = loadLifeContext();
  return cached;
}

/* The server has no localStorage and no week to report; the defaults would be
 * a lie either way, so SSR/prerender gets the same object the client starts
 * from and the first client read replaces it. */
function getServerSnapshot(): LifeContext {
  return getSnapshot();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LIFE_CONTEXT_CHANGED_EVENT, onChange);
  /* `storage` covers the other-tab case, which the custom event cannot: a
     student editing their timetable in one tab should not leave a stale
     timeline in another. */
  const onStorage = () => {
    cached = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIFE_CONTEXT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export interface LifeContextApi {
  context: LifeContext;
  /** Persist and notify every mounted surface. */
  save: (next: LifeContext) => void;
  /** Patch a few fields without rebuilding the whole object at the call site. */
  update: (patch: Partial<LifeContext>) => void;
}

export function useLifeContext(): LifeContextApi {
  const context = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const save = useCallback((next: LifeContext) => {
    cached = next;
    saveLifeContext(next);
    window.dispatchEvent(new Event(LIFE_CONTEXT_CHANGED_EVENT));
  }, []);

  const update = useCallback(
    (patch: Partial<LifeContext>) => {
      save({ ...getSnapshot(), ...patch });
    },
    [save],
  );

  return { context, save, update };
}

/** Test seam: drops the module cache so a fresh render re-reads storage. */
export function resetLifeContextCache(): void {
  cached = null;
}
