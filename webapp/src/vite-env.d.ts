/// <reference types="vite/client" />

/* Typed build-time configuration.
 *
 * The app had no env-var surface before this — Supabase's URL and publishable
 * key are hardcoded in lib/supabase.ts on purpose (both are public, and RLS is
 * the real boundary). A Sentry DSN is the first value that legitimately
 * differs per deployment, so this is where that surface starts. */
interface ImportMetaEnv {
  /** Sentry ingest DSN. Unset in development and in tests, which is what
   *  keeps error reporting inert there — see lib/monitoring.ts. Set it in the
   *  Vercel project's environment variables to turn reporting on. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
