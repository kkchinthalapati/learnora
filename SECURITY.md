# Learnora Security Policy & Hardening Documentation

This file documents the security controls, hardening measures, environment variables, and security fixes applied to the Learnora project.

---

## 1. Summary of Security Fixes & Improvements

### Environment Configuration & De-hardcoding
- **Supabase Client Overrides:** The Supabase client initialization in `webapp/src/lib/supabase.ts`, `js/supabase.js`, and `reset-password.js` has been updated to check for environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) as a first priority before falling back to default configuration.
- **Vite Prefix Support:** Updated `webapp/vite.config.ts` with `envPrefix` to explicitly allow loading variables prefixed with `NEXT_PUBLIC_` within the Vite bundling environment.
- **Vercel Security Headers:** Enhanced the `Permissions-Policy` HTTP header in `vercel.json` to define `microphone=(self)`. This safely enables microphone access on our origin for the built-in browser SpeechRecognition voice assistant input features, while still restricting camera and geolocation permissions.

### Row Level Security (RLS) & Access Controls
All database tables used by Learnora enforce Row Level Security (RLS):
- **User profiles:** Handled safely via trigger functions.
- **Study sessions & analytics:** Enforced with `(select auth.uid()) = user_id` range-checked policies.
- **Weekly study plans:** Restricted to `(select auth.uid()) = user_id` for SELECT, INSERT, UPDATE, and DELETE.
- **AI Quizzes & Quiz attempts:** Restricted to the authenticated user.
- **Friendships & Shared leaderboard:** Enforced with custom SELECT RLS policies and `SECURITY DEFINER` Postgres functions that strictly validate caller JWT identities (`auth.uid()`) and friendship statuses. No direct client-side insertions are permitted on friendships.
- **Web push notifications subscription:** Enforced with `(select auth.uid()) = user_id` client policies.
- **AI rate limiting logs:** Logged per-user to restrict spam/abuses on LLM API keys.

---

## 2. Required Environment Variables

To run the application securely in production (e.g., on Vercel) or locally, the following environment variables should be configured:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The URL of your Supabase project instance. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon / publishable key of your Supabase project. |
| `CRON_SECRET` | Secret key used to authorize scheduled/triggered cron push reminders. |
| `VAPID_PUBLIC_KEY` | VAPID public key for web push notifications. |
| `VAPID_PRIVATE_KEY` | VAPID private key for web push notifications. |
| `VAPID_SUBJECT` | Contact URI/email used for web push identification. |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key used in backend/edge functions (never exposed to client). |

Refer to `.env.example` at the repository root for template usage.

---

## 3. Database Migration & Deployment

These migration files are already included in the `supabase/migrations/` folder of this repository. No new migrations are required as the database schema has already been fully hardened and secured with RLS out-of-the-box.

If configuring a new database instance for Learnora, ensure you apply the existing migrations in order:

1. **Backend Hardening:** Execute `supabase/migrations/20260727000000_backend_hardening.sql` to optimize policies using stable subquery lookups and disable public EXECUTE privileges on deprecated handles.
2. **Friends Feature Schema:** Deploy `supabase/migrations/20260803000000_add_friends_feature.sql` for the secure, friendship-based cross-user data sharing controls.
3. **Push Notifications Schema:** Deploy `supabase/migrations/20260804000000_add_push_notifications.sql` for web push subscriptions and notification log schema.
4. **AI Rate Limiting Schema:** Deploy `supabase/migrations/20260810000000_add_ai_rate_limiting.sql` to limit per-user AI function usage.
