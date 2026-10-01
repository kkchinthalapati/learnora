-- Email notification preferences, and a dedupe log for the scheduled job.
--
-- Same problem push notifications solved, for the channel that actually
-- reaches someone who hasn't installed the PWA: push
-- (20260804000000_add_push_notifications.sql) requires a subscribed device,
-- which is zero students until one opts in per-browser. Email needs no
-- client-side opt-in beyond a toggle — everyone already has the address on
-- their account.
--
-- One row per user, not per device: unlike push, "this address gets emailed"
-- has no meaningful per-device distinction. Same three columns (`exams`,
-- `flashcards_due`, plus a `weekly_digest` push doesn't have) and the same
-- dedupe-log shape as push_notification_log, for the same reason — a cron
-- rerun or shorter interval must not resend today's email twice.

create table if not exists public.email_notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notify_exams boolean not null default true,
  notify_flashcards_due boolean not null default true,
  notify_weekly_digest boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.email_notification_prefs enable row level security;

drop policy if exists "email_notification_prefs_select_own" on public.email_notification_prefs;
create policy "email_notification_prefs_select_own" on public.email_notification_prefs
  for select using ((select auth.uid()) = user_id);

drop policy if exists "email_notification_prefs_insert_own" on public.email_notification_prefs;
create policy "email_notification_prefs_insert_own" on public.email_notification_prefs
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "email_notification_prefs_update_own" on public.email_notification_prefs;
create policy "email_notification_prefs_update_own" on public.email_notification_prefs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- No delete policy: turning every toggle off is "update", not "remove the
-- row" — the row's existence isn't itself a signal of anything, so there is
-- nothing a delete would accomplish that update doesn't already.

-- =========================================================================
-- Dedupe log for the scheduled job. Identical shape and reasoning to
-- push_notification_log: written only by the edge function's service role,
-- so RLS enabled with zero policies is deliberate — it denies every client
-- role outright rather than needing a policy that then has to be reasoned
-- about.
-- =========================================================================
create table if not exists public.email_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('exam_soon', 'flashcards_due', 'weekly_digest')),
  sent_date date not null,
  created_at timestamptz not null default now(),
  constraint email_notification_log_unique unique (user_id, kind, sent_date)
);

alter table public.email_notification_log enable row level security;
