-- =========================================================
-- Supabase Auth Trigger Setup: Automatically handle new users
-- =========================================================
-- This script creates a function and trigger on auth.users so that whenever
-- a user signs up (via Email, OAuth, etc.), a corresponding profile/user entry
-- can be created or updated automatically.

-- 1. Create a function to process new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Example: Insert into a user_profiles table or update metadata
  -- Modify column names according to your public profiles table schema if present.
  /*
  insert into public.profiles (id, email, full_name, avatar_url, updated_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  */
  return new;
end;
$$;

-- 2. Drop existing trigger if present and recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Row Level Security policy hint for auth triggers
-- Note: Security Definer functions bypass RLS during auth events.
