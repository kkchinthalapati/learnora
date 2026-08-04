-- profiles table and the handle_new_user trigger/function are confirmed
-- dead: handle_new_user() is a no-op stub (its body is just "return new;",
-- it never wrote to profiles), no app code anywhere reads/writes
-- public.profiles, and a data audit before this migration confirmed every
-- one of its 16 rows has its full_name already mirrored exactly in
-- auth.users.raw_user_meta_data, while profiles.dob was always null (the
-- real dob for every user lives only in auth.users metadata already).
-- Nothing else in the schema (no other function, view, or trigger)
-- references any of these three objects.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles;
