-- Learnora feature upgrade: new tables for study analytics/streaks, AI weekly plans, and AI quizzes.
-- Run this in the Supabase Dashboard -> SQL Editor for your project.

-- =========================================================
-- study_sessions (Area 1: analytics & streaks)
-- =========================================================
create table if not exists study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task text,
  folder_id uuid references folders(id) on delete set null,
  minutes int not null check (minutes >= 1),
  timer_type text,
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists study_sessions_user_started_idx on study_sessions (user_id, started_at desc);
create index if not exists study_sessions_user_folder_idx on study_sessions (user_id, folder_id);

alter table study_sessions enable row level security;

create policy "study_sessions_select_own" on study_sessions
  for select using (auth.uid() = user_id);
create policy "study_sessions_insert_own" on study_sessions
  for insert with check (auth.uid() = user_id);
create policy "study_sessions_delete_own" on study_sessions
  for delete using (auth.uid() = user_id);

-- =========================================================
-- weekly_plans (Area 3a: AI weekly study plans)
-- =========================================================
create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  plan_json jsonb not null,
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table weekly_plans enable row level security;

create policy "weekly_plans_select_own" on weekly_plans
  for select using (auth.uid() = user_id);
create policy "weekly_plans_upsert_own" on weekly_plans
  for insert with check (auth.uid() = user_id);
create policy "weekly_plans_update_own" on weekly_plans
  for update using (auth.uid() = user_id);
create policy "weekly_plans_delete_own" on weekly_plans
  for delete using (auth.uid() = user_id);

-- =========================================================
-- quizzes + quiz_attempts (Area 3b: AI quiz generator)
-- =========================================================
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references materials(id) on delete set null,
  folder_id uuid references folders(id) on delete set null,
  title text not null,
  questions_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table quizzes enable row level security;

create policy "quizzes_select_own" on quizzes
  for select using (auth.uid() = user_id);
create policy "quizzes_insert_own" on quizzes
  for insert with check (auth.uid() = user_id);
create policy "quizzes_delete_own" on quizzes
  for delete using (auth.uid() = user_id);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  score int not null,
  total int not null,
  answers_json jsonb not null,
  weak_topics text[],
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_created_idx on quiz_attempts (user_id, created_at desc);

alter table quiz_attempts enable row level security;

create policy "quiz_attempts_select_own" on quiz_attempts
  for select using (auth.uid() = user_id);
create policy "quiz_attempts_insert_own" on quiz_attempts
  for insert with check (auth.uid() = user_id);
create policy "quiz_attempts_delete_own" on quiz_attempts
  for delete using (auth.uid() = user_id);
