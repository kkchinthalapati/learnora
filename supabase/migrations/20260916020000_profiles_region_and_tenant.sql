-- Region is a field, not an `if`. All nullable: null means "detect on the
-- client" (lib/region.ts). `tenant_id` is the multi-tenant hook — a school or
-- district row can later pin region/framework/grade scale for its students;
-- no UI reads it yet, it exists so nothing paints itself into a corner.

alter table public.profiles
  add column if not exists region text,
  add column if not exists framework_id text,
  add column if not exists grade_scale_id text,
  add column if not exists tenant_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_region_check'
  ) then
    alter table public.profiles
      add constraint profiles_region_check
      check (region is null or region in ('IN','GB','US','EU','AU','CA','INTL'));
  end if;
end $$;

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);
