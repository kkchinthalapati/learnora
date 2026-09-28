-- QA pass 2026-09-28: storage cleanup, upload limits, session integrity, and
-- three trigger functions left on the public RPC surface.
--
-- 1. `materials` bucket had SELECT and INSERT policies but no DELETE policy.
--    Storage answers an RLS-denied remove() with `{ data: [], error: null }`,
--    so every "delete material" / "delete folder" in the app reported success
--    while the file stayed in the bucket (5 of 13 objects in production had no
--    `materials` row pointing at them). Owners can now delete their own files,
--    scoped by the same `<uid>/` prefix the other two buckets use.
--
-- 2. The same bucket had no size or type limit, so the 10 MB cap in
--    webapp/src/api/studyPackage.ts (MAX_UPLOAD_BYTES) was advisory: a direct
--    API call could store anything, any size. The allowlist mirrors the
--    `accept=` list in MaterialPanel / NotesAiSidebar (.pdf .doc .docx .txt
--    and audio/video). `application/octet-stream` stays allowed because some
--    browsers report .doc/.m4a with no specific type; what this shuts out is
--    HTML, SVG, scripts and executables.
--
-- 3. `study_sessions.minutes` only had `>= 1`. A hand-built insert of a
--    100,000-minute session went straight onto the friends leaderboard
--    (friend_weekly_minutes sums this column). 1440 matches the client's
--    MAX_SYNC_MINUTES in webapp/src/api/studyRoom.ts — no session is longer
--    than a day. Production max at time of writing: 2.
--    A trigger (not a CHECK — `now()` is not immutable) also rejects sessions
--    that start more than an hour in the future, which would otherwise count
--    towards a week that has not happened yet.
--
-- 4. `ensure_unfiled_notebook`, `guard_profile_billing_columns` and
--    `guard_profile_billing_insert` are SECURITY DEFINER trigger functions
--    that were still EXECUTE-able by anon/authenticated as RPCs (linter
--    0028/0029). Same reasoning and same fix as
--    20260907010000_revoke_exec_on_touch_trigger_functions.sql; triggers are
--    unaffected because they do not check the invoker's EXECUTE privilege.

-- 1 ─────────────────────────────────────────────────────────────────────────
drop policy if exists "materials_delete_own" on storage.objects;
create policy "materials_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- 2 ─────────────────────────────────────────────────────────────────────────
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'audio/*',
    'video/mp4',
    'video/ogg',
    'application/ogg',
    'application/octet-stream'
  ]
where id = 'materials';

-- 3 ─────────────────────────────────────────────────────────────────────────
alter table public.study_sessions
  drop constraint if exists study_sessions_minutes_max;
alter table public.study_sessions
  add constraint study_sessions_minutes_max check (minutes <= 1440);

create or replace function public.guard_study_session_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '1 hour' then
    raise exception 'study session cannot start in the future'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_study_session_start() from public;
revoke all on function public.guard_study_session_start() from anon;
revoke all on function public.guard_study_session_start() from authenticated;

drop trigger if exists study_sessions_guard_start on public.study_sessions;
create trigger study_sessions_guard_start
  before insert or update of started_at on public.study_sessions
  for each row execute function public.guard_study_session_start();

-- 4 ─────────────────────────────────────────────────────────────────────────
revoke all on function public.ensure_unfiled_notebook() from public;
revoke all on function public.ensure_unfiled_notebook() from anon;
revoke all on function public.ensure_unfiled_notebook() from authenticated;

revoke all on function public.guard_profile_billing_columns() from public;
revoke all on function public.guard_profile_billing_columns() from anon;
revoke all on function public.guard_profile_billing_columns() from authenticated;

revoke all on function public.guard_profile_billing_insert() from public;
revoke all on function public.guard_profile_billing_insert() from anon;
revoke all on function public.guard_profile_billing_insert() from authenticated;
