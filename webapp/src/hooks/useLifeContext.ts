import { profileApi } from "../api/profile";
import { Storage } from "../lib/storage";
import {
  DEFAULT_LIFE_CONTEXT,
  LIFE_CONTEXT_KEY,
  mergeRemoteLifeContext,
  toSyncableLifeContext,
} from "../lib/lifeContext";
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
    if (accountId) {
      Storage.set(`${LIFE_CONTEXT_KEY}:${accountId}`, cached);
      void profileApi
        .updateLifeContext(toSyncableLifeContext(cached), accountId)
        .catch((err) => console.warn("[lifeContext] push failed:", err));
    }
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
  accountId = null;
  generation++;
}

let accountId: string | null = null;
let generation = 0;
/** SettingsProvider owns the auth lifecycle; a generation prevents late hydration after switching accounts. */
export async function hydrateLifeContextFromProfile(
  userId: string | null,
): Promise<void> {
  const token = ++generation;
  const prior = Storage.get<string | null>(LIFE_CONTEXT_KEY + ":owner", null);
  const owner = userId ?? "guest";
  if (prior !== owner && !(prior === null && !userId)) {
    if (prior) Storage.set(LIFE_CONTEXT_KEY + ":" + prior, loadLifeContext());
    const next = Storage.get<LifeContext | null>(
      LIFE_CONTEXT_KEY + ":" + owner,
      null,
    );
    // The first sign-in may adopt a pre-sync local week. Subsequent accounts get their own copy.
    cached =
      next ??
      (prior === null && userId
        ? loadLifeContext()
        : { ...DEFAULT_LIFE_CONTEXT });
    saveLifeContext(cached, false);
    Storage.set(LIFE_CONTEXT_KEY + ":owner", owner);
    window.dispatchEvent(new Event(LIFE_CONTEXT_CHANGED_EVENT));
  }
  accountId = userId;
  if (!userId) return;
  try {
    const { lifeContext: remote } = await profileApi.fetchLifeContext(userId);
    if (token !== generation || accountId !== userId) return;
    const local = loadLifeContext();
    const merged = mergeRemoteLifeContext(local, remote);
    if (merged !== local) {
      cached = merged;
      saveLifeContext(merged, false);
      Storage.set(LIFE_CONTEXT_KEY + ":" + userId, merged);
      window.dispatchEvent(new Event(LIFE_CONTEXT_CHANGED_EVENT));
    } else if (
      local.updatedAt &&
      (!remote ||
        Date.parse(local.updatedAt) > (Date.parse(remote.updatedAt ?? "") || 0))
    ) {
      await profileApi.updateLifeContext(toSyncableLifeContext(local), userId);
    }
  } catch (err) {
    console.warn("[lifeContext] hydrate failed; keeping local week:", err);
  }
}
export function cancelLifeContextHydration(): void {
  generation++;
  accountId = null;
}
