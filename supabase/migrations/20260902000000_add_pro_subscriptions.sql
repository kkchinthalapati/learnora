-- Pro subscription state on profiles, writable only by the Stripe webhook.
--
-- The plan lives on `profiles` rather than in a table of its own because there
-- is exactly one subscription per account and every read of it happens
-- alongside a profile read. A join table would buy nothing and cost a query on
-- the app's hottest path.
--
-- The important part of this migration is not the columns, it is the trigger.
-- `profiles` has an owner-can-manage RLS policy, which is correct for
-- `full_name` and `timezone` and catastrophic for `plan`: any signed-in user
-- could `update profiles set plan = 'pro'` with the anon key and grant
-- themselves everything. RLS is row-level and cannot express "this row, but
-- not these columns", so the column-level guard is a trigger that rejects any
-- change to the billing columns unless the caller is the service role — which
-- only the Stripe webhook function holds.

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists plan_status text not null default 'none',
  add column if not exists plan_renews_at timestamptz,
  add column if not exists plan_cancel_at_period_end boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'pro'));

alter table public.profiles
  drop constraint if exists profiles_plan_status_check;
alter table public.profiles
  add constraint profiles_plan_status_check check (
    plan_status in (
      'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'none'
    )
  );

-- One Stripe customer per account, and one account per Stripe customer. Without
-- this, a webhook replay or a double checkout can quietly attach a second
-- customer to the same person and the next cancellation updates the wrong row.
create unique index if not exists profiles_stripe_customer_id_key
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists profiles_plan_idx
  on public.profiles (plan)
  where plan <> 'free';

-- The column-level guard described above.
--
-- `auth.role()` is 'service_role' only for a client built with the service-role
-- key, which lives exclusively in the Stripe webhook's environment. Everything
-- else — the browser, an edge function using the caller's JWT — is
-- 'authenticated' or 'anon' and is silently held to the old values rather than
-- erroring, so an ordinary profile save that happens to send the whole row
-- still succeeds without smuggling a plan change through it.
create or replace function public.guard_profile_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.plan := old.plan;
  new.plan_status := old.plan_status;
  new.plan_renews_at := old.plan_renews_at;
  new.plan_cancel_at_period_end := old.plan_cancel_at_period_end;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  return new;
end;
$$;

revoke execute on function public.guard_profile_billing_columns() from public;

drop trigger if exists profiles_guard_billing_columns on public.profiles;
create trigger profiles_guard_billing_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_billing_columns();

-- Insert has to be guarded too, or a user whose profile row does not exist yet
-- could create it pre-upgraded. The trigger above only fires on update.
create or replace function public.guard_profile_billing_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.plan := 'free';
  new.plan_status := 'none';
  new.plan_renews_at := null;
  new.plan_cancel_at_period_end := false;
  new.stripe_customer_id := null;
  new.stripe_subscription_id := null;
  return new;
end;
$$;

revoke execute on function public.guard_profile_billing_insert() from public;

drop trigger if exists profiles_guard_billing_insert on public.profiles;
create trigger profiles_guard_billing_insert
  before insert on public.profiles
  for each row
  execute function public.guard_profile_billing_insert();

-- Every Stripe event we have processed, so a redelivery is a no-op.
--
-- Stripe guarantees at-least-once delivery and retries for three days, so a
-- webhook that is not idempotent will eventually double-apply something. RLS is
-- enabled with no policies at all: nothing but the service role can read or
-- write this, the same shape `push_notification_log` uses.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
