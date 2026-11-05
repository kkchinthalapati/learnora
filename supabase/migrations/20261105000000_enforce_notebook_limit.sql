-- The notebook allowance, enforced where the rows are written.
--
-- The paywall and the plan pages have said "Notebooks, in total: 3" on the
-- free plan and 10 on Plus since the plans were introduced
-- (QUOTAS.notebooks in webapp/src/lib/entitlements.ts), but nothing checked
-- it: a free account could create any number. The notebooks hub now stops at
-- the limit and offers the upgrade; this is the half a hand-built request
-- cannot skip.
--
-- Only a student's own notebooks count. The internal rows the Library keeps
-- (system_key is not null: one per subject, plus "Unfiled sources") are
-- never refused and never counted. Existing notebooks are untouched: an
-- account already past the limit keeps everything and just cannot add more
-- until it is under it. On 2026-11-05 no free account had more than one.
--
-- The plan is read the same way learnora-ai's getUserPlan reads it: active,
-- trialing and past_due count as paid; anything else is the free plan.
--
-- Revert:
--   drop trigger if exists notebooks_enforce_limit on public.notebooks;
--   drop function if exists public.enforce_notebook_limit();

create or replace function public.enforce_notebook_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan text;
  allowance integer;
  owned integer;
begin
  if new.system_key is not null then
    return new;
  end if;

  select case
           when p.plan_status in ('active', 'trialing', 'past_due') and p.plan in ('plus', 'pro')
             then p.plan
           else 'free'
         end
    into account_plan
    from public.profiles p
   where p.id = new.user_id;

  allowance := case coalesce(account_plan, 'free')
                 when 'pro' then null   -- no limit
                 when 'plus' then 10
                 else 3
               end;
  if allowance is null then
    return new;
  end if;

  -- One insert at a time per account, so two tabs cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtext('notebook_limit:' || new.user_id::text));

  select count(*) into owned
    from public.notebooks
   where user_id = new.user_id
     and system_key is null;

  if owned >= allowance then
    raise exception 'Your plan keeps % notebooks. Delete one to start another, or upgrade for more.', allowance
      using errcode = 'P0001', hint = 'notebook_limit';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_notebook_limit() from public;

drop trigger if exists notebooks_enforce_limit on public.notebooks;
create trigger notebooks_enforce_limit
  before insert on public.notebooks
  for each row execute function public.enforce_notebook_limit();
