-- Push notification subscriptions, and a per-day dedupe log for the
-- scheduled reminder job (see PUSH_NOTIFICATIONS.md for the deploy/cron
-- setup — this migration only creates the schema).
--
-- Why this exists: `webapp/src/lib/notifications.ts` can only fire a
-- `Notification` while a Learnora tab is open, which for a student is
-- basically never outside an active study session. A real push subscription
-- (Web Push, delivered by the browser's push service even when no tab is
-- open) is the only way an exam-countdown or due-flashcard nudge actually
-- reaches someone. This table stores what a scheduled edge function needs to
-- send those: one row per browser/device subscription, owner-only RLS same
-- as every other table in this schema — no cross-user access is needed here,
-- unlike the friends feature, so no SECURITY DEFINER RPCs are required.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- Per-subscription toggles rather than a separate preferences table: push
  -- opt-in is inherently per-device (a student might want reminders on their
  -- phone but not a shared lab computer), so scoping the toggle to the
  -- subscription row it lives on is more accurate than a single account-wide
  -- flag, and avoids a second table for two booleans.
  notify_exams boolean not null default true,
  notify_flashcards boolean not null default true,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

-- =========================================================================
-- Dedupe log for the scheduled reminder job.
--
-- The job runs on a cron (e.g. once a day); without this, a rerun or a
-- shorter interval would re-send the same "exam in 2 days" push over and
-- over. `unique (user_id, kind, sent_date)` makes "have I already told this
-- user about this today" a single insert-with-conflict-check instead of a
-- read-then-write race between overlapping runs. Written only by the edge
-- function (service role), so it needs no RLS write policy — same "no
-- client-facing INSERT policy" shape the friends migration used for its
-- SECURITY DEFINER-only tables, just without the RPC layer since nothing
-- here is read by the client either.
-- =========================================================================
create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('exam_soon', 'flashcards_due')),
  sent_date date not null,
  created_at timestamptz not null default now(),
  constraint push_notification_log_unique unique (user_id, kind, sent_date)
);

alter table public.push_notification_log enable row level security;
-- No policies at all: RLS enabled with zero policies denies every command to
-- every non-superuser role, including anon/authenticated. Only the service
-- role (used exclusively by the scheduled edge function) can read or write
-- this table, and the service role bypasses RLS entirely.
