-- GDPR consent for sharing study data with third-party AI providers.
--
-- Sign-up now requires a checkbox: "I agree to share my study data with
-- Learnora's AI providers (Anthropic's Claude and Google's Gemini)". The
-- client can't be trusted to have actually shown or enforced that checkbox
-- (a hand-built request, a future caller, a bug), so the answer needs to
-- live in the database, not just be inferred from "the account exists".
--
-- `consent_given` rides into `auth.users.raw_user_meta_data` alongside
-- `full_name` and `dob` (api/auth.ts's `signup()` already sends both of
-- those the same way), and `sync_profile_from_auth_user()` — added in
-- 20260803000000_add_friends_feature.sql to keep `public.profiles` in step
-- with `auth.users` — is the one place that copies user metadata into a
-- queryable column. Extending it here means signup needs no second write.

alter table public.profiles
  add column if not exists consent_given boolean not null default false;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, consent_given, updated_at)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    coalesce((new.raw_user_meta_data ->> 'consent_given')::boolean, false),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    -- Only overwrite with a non-null value: a user who later clears their
    -- metadata shouldn't blank out a name their friends already see.
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    -- This trigger also fires on ordinary metadata updates (e.g. changing
    -- display name), which don't carry `consent_given` at all. Falling back
    -- to `coalesce(..., false)` the same way full_name/avatar_url do would
    -- silently revoke consent on every unrelated update, since the computed
    -- value is never actually null by the time it reaches `excluded`. The
    -- key-presence check keeps a prior "true" intact unless the metadata
    -- explicitly says otherwise.
    consent_given = case
      when new.raw_user_meta_data ? 'consent_given'
        then (new.raw_user_meta_data ->> 'consent_given')::boolean
      else profiles.consent_given
    end,
    updated_at = now();
  return new;
end;
$$;
