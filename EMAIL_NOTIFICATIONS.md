# Email Notifications — Deploy Guide

What this feature is: scheduled email reminders for exams coming up soon and
flashcards due for review — the channel that reaches a student who has never
subscribed to push (see `PUSH_NOTIFICATIONS.md`), since every account has an
email address from signup with no separate opt-in gesture beyond a settings
toggle.

**Everything in this repo is written and tested. Nothing is deployed.** Same
posture as `PUSH_NOTIFICATIONS.md`/`FRIENDS_FEATURE.md`/`SUPABASE_SETUP.md`:
migrations and edge functions are applied by a human running the Supabase
CLI (or the Supabase dashboard), not by CI. `send-push-reminders` itself is
in the same not-yet-deployed state — check with
`supabase functions list` before assuming either one is live on a given
project.

## What was built

- `supabase/migrations/20260905070000_add_email_notifications.sql` —
  `email_notification_prefs` (one row per user, owner-only RLS) and
  `email_notification_log` (dedupe log for the scheduled job, no client
  access at all — identical shape to `push_notification_log`).
- `webapp/src/api/emailNotifications.ts`, `webapp/src/hooks/useEmailNotifications.ts`
  — the client-side read/toggle.
- `NotificationsTab.tsx`'s new "Email Notifications" card — two toggles
  (exam reminders, flashcard-due reminders), each backed by a column on
  `email_notification_prefs`.
- `supabase/functions/send-email-reminders/index.ts` — the scheduled job.
  Same two reminder kinds as push (**exam_soon**, **flashcards_due**), each
  deduped to once per user per day via `email_notification_log`. Sends
  through [Resend](https://resend.com) via a plain `fetch` call — no SDK
  dependency, so swapping providers later means changing one function
  (`sendEmail()`) and nothing else.

## 1. Create a Resend account and API key

Sign up at resend.com, verify a sending domain (or use their shared test
domain while developing), and create an API key from the dashboard. This is
the one step with no equivalent in the push-notification guide — Resend (or
whichever provider you use) needs a real account, unlike VAPID keys which
you generate yourself.

## 2. Apply the migration and deploy the function

```bash
supabase db push
supabase functions deploy send-email-reminders
```

Then set the function's secrets:

```bash
supabase secrets set RESEND_API_KEY=<the API key from step 1>
supabase secrets set EMAIL_FROM="Learnora <notifications@yourdomain.com>"
supabase secrets set CRON_SECRET=<a random string you generate yourself>
```

`CRON_SECRET` can be the same value used for `send-push-reminders`, or a
different one — the function only checks it against its own secret, so
either works. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to
be set by hand — Supabase injects both into every edge function
automatically.

## 3. Put it on a schedule

Same two options as `send-push-reminders`, and the same reasoning: the
function does nothing until something calls it, and `CRON_SECRET` is what
stops that call from being public.

**Supabase Dashboard (simplest):** Edge Functions → `send-email-reminders` →
Cron. Set a daily schedule (e.g. `0 13 * * *`) and add the `x-cron-secret`
header under the trigger's request config.

**`pg_cron` + `pg_net`:**

```sql
select cron.schedule(
  'send-email-reminders-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-email-reminders',
    headers := jsonb_build_object('x-cron-secret', '<the CRON_SECRET value>'),
    body := '{}'::jsonb
  );
  $$
);
```

Once a day is enough — the job dedupes to one email per user per kind per
day, so running it more often just costs invocations without sending
anything extra.

## Known limitations (deliberately not solved here)

- **No stored per-user timezone**, identical to `send-push-reminders`: "exam
  tomorrow" and the daily cron time are both computed in UTC.
- **No unsubscribe link in the email body.** The toggle in Settings >
  Notifications is the only way off, which is enough for a transactional
  reminder (not a marketing email) under most providers' terms, but check
  Resend's policy before sending at real volume — a one-click unsubscribe
  footer is a small addition to `sendEmail()`'s `html` if you need one.
- **`notify_weekly_digest`** exists as a column (for a future weekly summary
  email) but nothing writes to it from the UI or reads it from the
  scheduled job yet — it is schema-only until that feature is built.
- **A user with no `email_notification_prefs` row gets nothing**, even if
  they'd want reminders — the row is created on first visit to the
  Notifications tab (`useEmailNotifications`'s query upserts a default row
  if none exists), not at signup. An account that never opens Settings >
  Notifications stays un-emailed until it does.
