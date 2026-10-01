-- Availability follows the account. Imported calendars remain on the device.
alter table public.profiles
  add column if not exists life_context jsonb,
  add column if not exists life_context_updated_at timestamptz;

create index if not exists learning_events_deck_id_idx on public.learning_events(deck_id);
create index if not exists learning_events_folder_id_idx on public.learning_events(folder_id);
