-- =========================================================
-- Supabase Auth Trigger Setup: Automatically handle new users
-- =========================================================
-- This script creates a function and trigger on auth.users so that whenever
-- a user signs up (via Email, OAuth, etc.), a corresponding profile entry
-- in public.profiles is automatically created or synced.

-- 1. Create or replace the function to process new user registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, updated_at)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

-- 2. Revoke direct execute permissions on the security definer function
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- 3. Idempotently drop and recreate the trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Note: Security Definer functions bypass RLS during auth events.
