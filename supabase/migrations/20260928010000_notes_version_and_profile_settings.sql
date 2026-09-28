-- QA pass 2026-09-28: two persistence gaps.
--
-- 1. notes.updated_at — optimistic concurrency for the notes editor.
--    Two tabs (or a laptop and a phone) on the same note were last-writer-
--    wins: the second autosave silently replaced the first. The editor now
--    saves with `.eq("updated_at", <version it loaded>)` and treats zero rows
--    back as a conflict (webapp/src/api/notes.ts). The trigger bumps the
--    version on every update so a client cannot pin it. Existing rows get the
--    migration time as their first version.
--
-- 2. profiles.settings — AI persona, answer length, language, study style and
--    notification switches lived only in the browser's localStorage, so a new
--    device (or a cleared browser) silently reset them. The client syncs the
--    same keys it validates on load (SYNCED_KEYS in
--    webapp/src/context/SettingsProvider.tsx) and ignores anything else in
--    the object, so this column is a bag the owner can already only write
--    their own row of (profiles RLS). The size cap stops it being used as
--    free storage.
--
-- Both client changes degrade to the old behaviour until this is applied:
-- a note row without `updated_at` saves unconditionally, and a missing
-- `settings` column makes profileApi stop asking for the session.

-- 1 ─────────────────────────────────────────────────────────────────────────
alter table public.notes
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_note_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function public.touch_note_updated_at() from public;
revoke all on function public.touch_note_updated_at() from anon;
revoke all on function public.touch_note_updated_at() from authenticated;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_note_updated_at();

-- 2 ─────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists settings jsonb;

alter table public.profiles
  drop constraint if exists profiles_settings_shape;
alter table public.profiles
  add constraint profiles_settings_shape check (
    settings is null
    or (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192)
  );
