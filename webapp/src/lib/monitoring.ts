/* Client error reporting.
 *
 * Until now nothing in the app reported a client error anywhere — the
 * ErrorBoundary logged to `console` and said so in a TODO, which means every
 * crash a student hit in the wild was invisible unless they wrote in about it.
 * This is that pipeline.
 *
 * Three deliberate properties:
 *
 *  1. Inert without a DSN. `VITE_SENTRY_DSN` is unset in development and in
 *     the test environment, and with no DSN `Sentry.init` is never called, so
 *     nothing is loaded, nothing is sent, and no network call is attempted.
 *     A monitoring tool that breaks local development gets removed within the
 *     week, so it must cost nothing when it is not configured.
 *
 *  2. No personal data by default. `sendDefaultPii` stays false, and the
 *     scrubber below drops the two things this app handles that would
 *     otherwise ride along in a URL or a breadcrumb: the Supabase access
 *     token in an auth callback fragment, and the password-recovery token.
 *     Error reports leave the user's browser for a third party, so what
 *     leaves has to be decided deliberately rather than by an SDK default.
 *
 *  3. It never throws. Every entry point is wrapped: a reporting pipeline
 *     that can itself crash the app is strictly worse than no pipeline, and
 *     this one runs inside the error path where a second failure would be
 *     hardest to diagnose.
 *
 * NOTE: the production CSP (vercel.json) must allow the Sentry ingest host in
 * `connect-src`, or every report is blocked by the browser with no visible
 * error. That entry is added alongside this file; a new DSN on a different
 * ingest domain needs the CSP updated to match.
 */

/* Type-only: the SDK itself is loaded dynamically in `initMonitoring`, so
   `@sentry/react` lands in its own chunk that is fetched only by a deployment
   that has a DSN configured. A static import would put ~40 kB of it into the
   bundle every visitor downloads, including in development and in every
   deployment where reporting is off — which "no performance impact" rules
   out. Types are erased at compile time and cost nothing. */
import type * as SentryTypes from "@sentry/react";

/** Query/fragment parameters that must never leave the browser. Both are
 *  bearer credentials that Supabase puts in a URL during auth callbacks. */
const SENSITIVE_URL_PARAMS = [
  "access_token",
  "refresh_token",
  "token",
  "token_hash",
  "code",
];

const REDACTED = "[redacted]";

/** Strip credential-bearing parameters from a URL's query and fragment,
 *  leaving the path intact — the path is what makes a report useful, the
 *  tokens are what make it dangerous. Returns the input unchanged if it is
 *  not parseable, since a best-effort scrub must not throw. */
export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://localhost");
    let touched = false;

    for (const key of SENSITIVE_URL_PARAMS) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, REDACTED);
        touched = true;
      }
    }

    /* Supabase returns auth tokens in the *fragment*, which `searchParams`
       never sees — it is the case that actually matters here. */
    if (parsed.hash.length > 1) {
      const frag = new URLSearchParams(parsed.hash.slice(1));
      let fragTouched = false;
      for (const key of SENSITIVE_URL_PARAMS) {
        if (frag.has(key)) {
          frag.set(key, REDACTED);
          fragTouched = true;
        }
      }
      if (fragTouched) {
        parsed.hash = `#${frag.toString()}`;
        touched = true;
      }
    }

    /* Nothing sensitive found: hand back exactly what came in. Re-serialising
       a URL that needed no change is how a relative path picks up a spurious
       origin or a normalised slash, which then reads as a different route in
       the dashboard than the one the user was actually on. */
    if (!touched) return url;

    return url.startsWith("http")
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/** Sentry's `beforeSend`, exported so the scrubbing is testable without
 *  standing up the SDK. */
export function scrubEvent<T extends SentryTypes.ErrorEvent>(event: T): T {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url);
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.data?.to === "string") {
        crumb.data.to = scrubUrl(crumb.data.to);
      }
      if (typeof crumb.data?.from === "string") {
        crumb.data.from = scrubUrl(crumb.data.from);
      }
    }
  }
  return event;
}

let started = false;
let sentry: typeof SentryTypes | null = null;

/** Errors that arrived while the SDK chunk was still downloading. Loading is
 *  a network round trip, and a crash during startup — exactly the kind worth
 *  catching — can easily land inside it. Bounded, because an app failing in a
 *  loop must not grow this without limit. */
const pending: { error: unknown; context?: Record<string, unknown> }[] = [];
const MAX_PENDING = 20;

/** True only between "a DSN exists and the chunk is loading" and "it
 *  finished, one way or the other". Outside that window there is nothing to
 *  flush to, so an unconfigured deployment buffers nothing at all. */
let pendingIsOpen = false;

/** True once reporting is live. False in development, in tests, in any
 *  deployment where the DSN was not configured, and briefly while the SDK
 *  chunk is still loading. */
export function isMonitoringEnabled(): boolean {
  return started;
}

/**
 * Start error reporting, if a DSN is configured.
 *
 * Resolves `true` once reporting is live. Safe to call more than once; only
 * the first call does anything. Callers need not await it — anything reported
 * in the meantime is buffered and flushed on arrival.
 */
export async function initMonitoring(
  dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN,
): Promise<boolean> {
  if (started || !dsn) return false;
  pendingIsOpen = true;

  try {
    sentry = await import("@sentry/react");
    sentry.init({
      dsn,
      /* Errors only. Performance tracing samples every navigation and fetch,
         which is a real cost on a student's phone for data nobody here has
         asked a question of yet — the requirement is catching bugs. Turn it
         on deliberately, with a sample rate, if that changes. */
      tracesSampleRate: 0,
      sendDefaultPii: false,
      environment: import.meta.env.MODE,
      beforeSend: (event) => scrubEvent(event),
      /* Noise that is not a bug in this app: a stale tab whose chunk has been
         redeployed away (ErrorBoundary already handles that as an update
         prompt), and the browser's own opaque cross-origin script error. */
      ignoreErrors: [
        /Failed to fetch dynamically imported module/i,
        /Importing a module script failed/i,
        "ResizeObserver loop limit exceeded",
        "Script error.",
      ],
    });
    started = true;
    pendingIsOpen = false;

    /* Anything that broke while the chunk was in flight. */
    for (const entry of pending.splice(0)) {
      reportError(entry.error, entry.context);
    }
    return true;
  } catch (err) {
    pendingIsOpen = false;
    /* Never let monitoring break the app it is monitoring. A failed dynamic
       import — offline, blocked, a bad deploy — must degrade to "no
       reporting", never to a crash on startup. */
    pending.length = 0;
    console.warn("[monitoring] Sentry failed to initialise:", err);
    return false;
  }
}

/**
 * Report an error caught by the app itself — an ErrorBoundary, or a rejected
 * promise no one handled. A no-op when monitoring is off, so callers do not
 * need to check.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!started || !sentry) {
    /* Buffer only while a load is actually in flight. With no DSN this stays
       empty, so an unconfigured deployment never accumulates anything. */
    if (pendingIsOpen && pending.length < MAX_PENDING) {
      pending.push({ error, context });
    }
    return;
  }
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch (err) {
    console.warn("[monitoring] Failed to report an error:", err);
  }
}

/**
 * Catch what React cannot.
 *
 * An ErrorBoundary sees render-phase errors only. A rejected promise in an
 * event handler, a failed `void`-ed async call, an error thrown in a timeout —
 * none of them reach it, and those are most of what actually breaks in this
 * app, which is full of `void someAsyncThing()`. Without these two listeners a
 * whole class of bug stays invisible even with Sentry configured.
 *
 * Returns a teardown function, so tests (and hot reload) can detach.
 */
export function installGlobalErrorHandlers(
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, { kind: "unhandledrejection" });
  };
  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, { kind: "uncaught" });
  };

  target.addEventListener("unhandledrejection", onRejection as EventListener);
  target.addEventListener("error", onError as EventListener);

  return () => {
    target.removeEventListener(
      "unhandledrejection",
      onRejection as EventListener,
    );
    target.removeEventListener("error", onError as EventListener);
  };
}
