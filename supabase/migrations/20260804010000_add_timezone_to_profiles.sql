-- Add timezone column to profiles, defaulting to UTC
alter table public.profiles add column if not exists timezone text not null default 'UTC';
