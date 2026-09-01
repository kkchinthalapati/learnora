/* Telling an already-open tab that a new version shipped.
 *
 * Learnora is a single-page app: the JavaScript a tab is running was fetched
 * when that tab loaded, and moving between Dashboard, Library and Review never
 * asks the server for anything new. So a tab left open across a study session
 * — which is how students actually use this — keeps running old code
 * indefinitely, however many times the site is deployed successfully.
 *
 * That is not hypothetical. A fix to the review coach shipped and was still
 * missing from an open tab a day later, which read as a broken deploy and cost
 * an afternoon to work out. Nothing in the app checked for a new version, so
 * there was no way for it to have read as anything else.
 *
 * The service worker already knows when a new build exists — the browser
 * re-fetches sw.js and, when the bytes differ, installs it as a *waiting*
 * worker. All that was missing was to notice, and to say so.
 *
 * Note this cannot fix the very first transition: a tab running the old bundle
 * has no copy of this file. The prompt starts working from the deploy *after*
 * this one ships.
 */

/** How often to ask the server whether sw.js has changed. Browsers check on
 *  navigation and roughly daily on their own, neither of which helps a tab
 *  that stays open and never navigates. Fifteen minutes is frequent enough to
 *  catch a deploy within a study session and far too rare to matter as
 *  traffic — it is one conditional request for a file of a few KB. */
const UPDATE_POLL_MS = 15 * 60 * 1000;

/** Set once a reload has been asked for, so a `controllerchange` that arrives
 *  for any other reason cannot put the page into a reload loop. */
let reloading = false;

/** True when a worker is installed and waiting to take over, which only
 *  happens when the current page is already controlled by an older one. A
 *  waiting worker with no controller is a first-ever install, not an update. */
function updateIsWaiting(registration: ServiceWorkerRegistration): boolean {
  return (
    registration.waiting !== null && navigator.serviceWorker.controller !== null
  );
}

/**
 * Calls `onUpdateReady` when a new version is installed and waiting.
 * Returns a cleanup function.
 */
export function watchForAppUpdate(onUpdateReady: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopListeningToVisibility: (() => void) | null = null;

  const announceIfWaiting = (registration: ServiceWorkerRegistration) => {
    if (!stopped && updateIsWaiting(registration)) onUpdateReady();
  };

  navigator.serviceWorker.ready
    .then((registration) => {
      if (stopped) return;

      /* A worker may already have finished installing before this ran — on a
         reload, say, or if the update landed during startup. */
      announceIfWaiting(registration);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") announceIfWaiting(registration);
        });
      });

      const check = () => {
        /* Nothing to gain from checking a background tab, and it keeps a
           pinned tab from polling all day. */
        if (document.visibilityState !== "visible") return;
        void registration.update().catch(() => {
          /* Offline, or the check failed. The next one will do. */
        });
      };

      interval = setInterval(check, UPDATE_POLL_MS);
      /* Coming back to the tab is the moment a student is most likely to be
         about to use it, and the cheapest time to have found out. */
      document.addEventListener("visibilitychange", check);
      stopListeningToVisibility = () =>
        document.removeEventListener("visibilitychange", check);
    })
    .catch(() => {
      /* No service worker (blocked, or an unsupported context). The app works
         exactly as before; it just cannot offer the prompt. */
    });

  return () => {
    stopped = true;
    if (interval !== undefined) clearInterval(interval);
    stopListeningToVisibility?.();
  };
}

/**
 * Activates the waiting worker and reloads onto the new version.
 *
 * The reload waits for `controllerchange` rather than firing immediately:
 * reloading first would just re-serve the old bundle from the still-active
 * worker, and the student would click "Reload" and see nothing change.
 */
export function applyAppUpdate(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  void navigator.serviceWorker.ready
    .then((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      /* Asked to update with nothing waiting — reload anyway rather than
         leaving a button that appears to do nothing. */
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    })
    .catch(() => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });
}

/* Message shapes browsers use when a dynamic `import()` can't be fetched.
 * Every engine words this differently and none of them expose a code, so
 * matching text is the only option available. Kept deliberately broad: a
 * false positive costs a reload the student could have had anyway, while a
 * false negative costs the reload loop this exists to break. */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \S+ failed/i,
  /loading css chunk \S+ failed/i,
  /unable to preload css/i,
];

/**
 * True when an error is a lazy route's chunk failing to load.
 *
 * This is what a deploy looks like from inside an already-open tab: the
 * bundle it is running references hashed chunk filenames that no longer
 * exist on the server, so the first navigation into a lazy route 404s. The
 * generic "Try again" is useless here — re-rendering re-runs the same
 * `import()` against the same missing file, forever. The fix is the update
 * path the service worker already knows about (`applyAppUpdate`).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name}: ${error.message}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}
