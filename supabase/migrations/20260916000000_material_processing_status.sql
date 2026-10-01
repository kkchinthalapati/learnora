-- Processing state lives on the row, not in localStorage: a material uploaded
-- on a phone must show the same status on a laptop. `pending` is the upload
-- default; the client moves it to done / partial / failed / skipped as the
-- study-package pipeline finishes. Nullable-free so the UI never has to guess.

alter table public.materials
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_error text,
  add column if not exists processing_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.materials'::regclass
      and conname = 'materials_processing_status_check'
  ) then
    alter table public.materials
      add constraint materials_processing_status_check
      check (processing_status in ('pending', 'done', 'partial', 'failed', 'skipped'));
  end if;
end $$;

-- Rows that already have notes were processed before this column existed.
update public.materials m
   set processing_status = 'done'
 where processing_status = 'pending'
   and exists (select 1 from public.notes n where n.material_id = m.id);
