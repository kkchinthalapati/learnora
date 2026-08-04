# Push Notifications — Deploy Guide

What this feature is: a real Web Push subscription (delivered by the
browser's push service even when no Learnora tab is open), on top of the
PWA installability added alongside it. It replaces nothing — the existing
in-tab `Notification` calls in `webapp/src/lib/notifications.ts` and
`NotificationsTab`'s "Browser Notifications" card are untouched — this adds
a second, independent "Push Notifications" card below it.

**Everything in this repo is written and tested. Nothing is deployed.**
Same posture as `FRIENDS_FEATURE.md`/`SUPABASE_SETUP.md`: migrations and
edge functions are applied by a human running the Supabase CLI, not by CI.
The four steps below are what's left.

## What was built

- `supabase/migrations/20260804000000_add_push_notifications.sql` —
  `push_subscriptions` (one row per browser/device, owner-only RLS) and
  `push_notification_log` (dedupe log for the scheduled job, no client
  access at all).
- `webapp/public/manifest.webmanifest` + `webapp/public/sw.js` — PWA
  installability (home-screen install, a tiny offline app-shell cache) and
  the `push`/`notificationclick` handlers. Registered from `main.tsx`.
- `webapp/src/lib/push.ts`, `webapp/src/lib/serviceWorker.ts`,
  `webapp/src/api/push.ts`, `webapp/src/hooks/usePush.ts` — the client-side
  subscribe/unsubscribe flow.
- `NotificationsTab.tsx`'s new "Push Notifications" card — enable/disable
  button plus two per-device toggles (exam reminders, flashcard-due
  reminders), each backed by a column on that device's subscription row.
- `supabase/functions/send-push-reminders/index.ts` — the scheduled job.
  Two reminder kinds today: **exam_soon** (a non-completed exam today or
  tomorrow) and **flashcards_due** (any card due for review). Both are
  deduped to once per user per day via `push_notification_log`.

## 1. Generate a VAPID keypair

One-time, from any machine with Node:

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. The public key is safe to ship in the
client bundle (that is the whole point of VAPID); the private key is not —
it only ever goes into the edge function's secrets, never into `webapp/`.

## 2. Configure the frontend build

Add the public key as a Vite env var so the client can pass it to
`pushManager.subscribe()`. Locally, create `webapp/.env.local`:

```
VITE_VAPID_PUBLIC_KEY=<the public key from step 1>
```

In Vercel, add `VITE_VAPID_PUBLIC_KEY` as a project environment variable
(Production + Preview) with the same value. Without it, the "Push
Notifications" card renders but stays disabled with "Push isn't configured
on this deployment yet." — it fails closed, not with a broken button.

## 3. Apply the migration and deploy the function

```bash
supabase db push
supabase functions deploy send-push-reminders
```

Then set the function's secrets (the private key never leaves this step):

```bash
supabase secrets set VAPID_PUBLIC_KEY=<public key from step 1>
supabase secrets set VAPID_PRIVATE_KEY=<private key from step 1>
supabase secrets set VAPID_SUBJECT=mailto:<a real contact address>
supabase secrets set CRON_SECRET=<a random string you generate yourself>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set by
hand — Supabase injects both into every edge function automatically.

## 4. Put it on a schedule

The function does nothing on its own until something calls it — it has no
internal timer. `CRON_SECRET` from step 3 is what stops that call from being
public: the function returns 401 to any request whose `x-cron-secret`
header doesn't match. Two ways to schedule it, pick one:

**Supabase Dashboard (simplest):** Edge Functions → `send-push-reminders` →
Cron. Set a daily schedule (e.g. `0 13 * * *`) and add the `x-cron-secret`
header under the trigger's request config.

**`pg_cron` + `pg_net`, if you'd rather keep the schedule in a migration:**

```sql
select cron.schedule(
  'send-push-reminders-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-push-reminders',
    headers := jsonb_build_object('x-cron-secret', '<the CRON_SECRET value>'),
    body := '{}'::jsonb
  );
  $$
);
```

Either way, once a day is enough — the job itself dedupes to one push per
user per kind per day, so running it more often just costs invocations
without sending anything extra.

## Known limitations (deliberately not solved here)

- **No stored per-user timezone**, so "exam tomorrow" and the daily cron
  time are both computed in UTC. A user far from UTC can see a reminder up
  to a day early/late, or have their "once a day" send land at an odd local
  hour. Fixing this means adding a timezone column somewhere (the friends
  leaderboard takes one as an RPC argument today, but nothing persists it)
  — a bigger, separate change, not bundled into this one.
- **iOS Safari** requires the PWA to be added to the home screen before push
  works at all, even though `serviceWorker`/`PushManager` both report as
  present. There's no way to feature-detect that gap from JS; the "Enable
  Push Notifications" button will just fail silently-ish (an error surfaces
  in the card, but "add to home screen first" isn't spelled out).
- **Multiple devices per user** are already supported by the schema (each
  browser/device gets its own subscription row), but there's no UI to see
  or manage "push is on for these 3 devices" as a list — only the current
  device's own state.
