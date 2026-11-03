-- BODYTRACK : schéma initial.
-- Chaque table appartient à un utilisateur (user_id) et est protégée par Row Level Security :
-- un utilisateur ne peut lire et écrire QUE ses propres lignes.
-- Les identifiants sont générés côté client (UUID) pour permettre la saisie hors connexion ;
-- server_updated_at, géré par la base, sert à la synchronisation différée.
-- « users » correspond à auth.users (Supabase Auth).

create extension if not exists pgcrypto;

create or replace function public.bt_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '',
  sex text not null check (sex in ('male','female')),
  birth_date date not null,
  height_cm double precision not null check (height_cm between 100 and 250),
  start_weight_kg double precision not null check (start_weight_kg between 25 and 400),
  target_weight_kg double precision not null check (target_weight_kg between 25 and 400),
  activity_level text not null,
  training_days_per_week integer not null default 3 check (training_days_per_week between 0 and 14),
  goal text not null check (goal in ('bulk','maintain','cut')),
  physique_goal text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
  , unique (user_id)
);
create index if not exists profiles_sync_idx on public.profiles (user_id, server_updated_at);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles for each row execute function public.bt_touch();
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles_delete_own" on public.profiles for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;
create table if not exists public.nutrition_goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from date not null,
  goal text not null check (goal in ('bulk','maintain','cut')),
  calorie_adjustment double precision not null default 0,
  maintenance_kcal double precision not null,
  calories double precision not null check (calories between 800 and 8000),
  protein_g double precision not null,
  carbs_g double precision not null,
  fat_g double precision not null,
  mode text not null default 'auto',
  protein_per_kg double precision not null,
  fat_per_kg double precision not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists nutrition_goals_sync_idx on public.nutrition_goals (user_id, server_updated_at);
drop trigger if exists nutrition_goals_touch on public.nutrition_goals;
create trigger nutrition_goals_touch before insert or update on public.nutrition_goals for each row execute function public.bt_touch();
alter table public.nutrition_goals enable row level security;
drop policy if exists "nutrition_goals_select_own" on public.nutrition_goals;
drop policy if exists "nutrition_goals_insert_own" on public.nutrition_goals;
drop policy if exists "nutrition_goals_update_own" on public.nutrition_goals;
drop policy if exists "nutrition_goals_delete_own" on public.nutrition_goals;
create policy "nutrition_goals_select_own" on public.nutrition_goals for select to authenticated using (user_id = (select auth.uid()));
create policy "nutrition_goals_insert_own" on public.nutrition_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "nutrition_goals_update_own" on public.nutrition_goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nutrition_goals_delete_own" on public.nutrition_goals for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.nutrition_goals from anon;
grant select, insert, update, delete on public.nutrition_goals to authenticated;
create table if not exists public.exercise_library (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  primary_muscle text not null,
  secondary_muscles jsonb not null default '[]'::jsonb,
  type text not null,
  equipment text not null,
  description text not null default '',
  instructions jsonb not null default '[]'::jsonb,
  default_rest_sec integer not null default 90,
  load_increment_kg double precision not null default 2.5,
  is_custom boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists exercise_library_sync_idx on public.exercise_library (user_id, server_updated_at);
drop trigger if exists exercise_library_touch on public.exercise_library;
create trigger exercise_library_touch before insert or update on public.exercise_library for each row execute function public.bt_touch();
alter table public.exercise_library enable row level security;
drop policy if exists "exercise_library_select_own" on public.exercise_library;
drop policy if exists "exercise_library_insert_own" on public.exercise_library;
drop policy if exists "exercise_library_update_own" on public.exercise_library;
drop policy if exists "exercise_library_delete_own" on public.exercise_library;
create policy "exercise_library_select_own" on public.exercise_library for select to authenticated using (user_id = (select auth.uid()));
create policy "exercise_library_insert_own" on public.exercise_library for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exercise_library_update_own" on public.exercise_library for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "exercise_library_delete_own" on public.exercise_library for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.exercise_library from anon;
grant select, insert, update, delete on public.exercise_library to authenticated;
create table if not exists public.workout_programs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  days jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists workout_programs_sync_idx on public.workout_programs (user_id, server_updated_at);
drop trigger if exists workout_programs_touch on public.workout_programs;
create trigger workout_programs_touch before insert or update on public.workout_programs for each row execute function public.bt_touch();
alter table public.workout_programs enable row level security;
drop policy if exists "workout_programs_select_own" on public.workout_programs;
drop policy if exists "workout_programs_insert_own" on public.workout_programs;
drop policy if exists "workout_programs_update_own" on public.workout_programs;
drop policy if exists "workout_programs_delete_own" on public.workout_programs;
create policy "workout_programs_select_own" on public.workout_programs for select to authenticated using (user_id = (select auth.uid()));
create policy "workout_programs_insert_own" on public.workout_programs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "workout_programs_update_own" on public.workout_programs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_programs_delete_own" on public.workout_programs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workout_programs from anon;
grant select, insert, update, delete on public.workout_programs to authenticated;
create table if not exists public.workout_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  program_id uuid,
  program_day_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active','done')),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists workout_sessions_sync_idx on public.workout_sessions (user_id, server_updated_at);
drop trigger if exists workout_sessions_touch on public.workout_sessions;
create trigger workout_sessions_touch before insert or update on public.workout_sessions for each row execute function public.bt_touch();
alter table public.workout_sessions enable row level security;
drop policy if exists "workout_sessions_select_own" on public.workout_sessions;
drop policy if exists "workout_sessions_insert_own" on public.workout_sessions;
drop policy if exists "workout_sessions_update_own" on public.workout_sessions;
drop policy if exists "workout_sessions_delete_own" on public.workout_sessions;
create policy "workout_sessions_select_own" on public.workout_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "workout_sessions_insert_own" on public.workout_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "workout_sessions_update_own" on public.workout_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_sessions_delete_own" on public.workout_sessions for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workout_sessions from anon;
grant select, insert, update, delete on public.workout_sessions to authenticated;
create table if not exists public.workout_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  exercise_id text not null,
  position integer not null default 0,
  note text not null default '',
  rest_sec integer not null default 90,
  rep_min integer,
  rep_max integer,
  target_sets integer,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists workout_exercises_sync_idx on public.workout_exercises (user_id, server_updated_at);
drop trigger if exists workout_exercises_touch on public.workout_exercises;
create trigger workout_exercises_touch before insert or update on public.workout_exercises for each row execute function public.bt_touch();
alter table public.workout_exercises enable row level security;
drop policy if exists "workout_exercises_select_own" on public.workout_exercises;
drop policy if exists "workout_exercises_insert_own" on public.workout_exercises;
drop policy if exists "workout_exercises_update_own" on public.workout_exercises;
drop policy if exists "workout_exercises_delete_own" on public.workout_exercises;
create policy "workout_exercises_select_own" on public.workout_exercises for select to authenticated using (user_id = (select auth.uid()));
create policy "workout_exercises_insert_own" on public.workout_exercises for insert to authenticated with check (user_id = (select auth.uid()));
create policy "workout_exercises_update_own" on public.workout_exercises for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_exercises_delete_own" on public.workout_exercises for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workout_exercises from anon;
grant select, insert, update, delete on public.workout_exercises to authenticated;
create table if not exists public.workout_sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  workout_exercise_id uuid not null,
  exercise_id text not null,
  position integer not null default 0,
  weight_kg double precision check (weight_kg is null or weight_kg between 0 and 1000),
  reps integer check (reps is null or reps between 0 and 1000),
  done boolean not null default false,
  is_warmup boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists workout_sets_sync_idx on public.workout_sets (user_id, server_updated_at);
drop trigger if exists workout_sets_touch on public.workout_sets;
create trigger workout_sets_touch before insert or update on public.workout_sets for each row execute function public.bt_touch();
alter table public.workout_sets enable row level security;
drop policy if exists "workout_sets_select_own" on public.workout_sets;
drop policy if exists "workout_sets_insert_own" on public.workout_sets;
drop policy if exists "workout_sets_update_own" on public.workout_sets;
drop policy if exists "workout_sets_delete_own" on public.workout_sets;
create policy "workout_sets_select_own" on public.workout_sets for select to authenticated using (user_id = (select auth.uid()));
create policy "workout_sets_insert_own" on public.workout_sets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "workout_sets_update_own" on public.workout_sets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_sets_delete_own" on public.workout_sets for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workout_sets from anon;
grant select, insert, update, delete on public.workout_sets to authenticated;
create table if not exists public.food_library (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  brand text not null default '',
  unit text not null default 'g' check (unit in ('g','ml')),
  kcal_100 double precision not null check (kcal_100 >= 0),
  protein_100 double precision not null check (protein_100 >= 0),
  carbs_100 double precision not null check (carbs_100 >= 0),
  fat_100 double precision not null check (fat_100 >= 0),
  serving_size double precision,
  serving_label text not null default '',
  category text not null default '',
  source text not null default 'custom',
  barcode text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists food_library_sync_idx on public.food_library (user_id, server_updated_at);
drop trigger if exists food_library_touch on public.food_library;
create trigger food_library_touch before insert or update on public.food_library for each row execute function public.bt_touch();
alter table public.food_library enable row level security;
drop policy if exists "food_library_select_own" on public.food_library;
drop policy if exists "food_library_insert_own" on public.food_library;
drop policy if exists "food_library_update_own" on public.food_library;
drop policy if exists "food_library_delete_own" on public.food_library;
create policy "food_library_select_own" on public.food_library for select to authenticated using (user_id = (select auth.uid()));
create policy "food_library_insert_own" on public.food_library for insert to authenticated with check (user_id = (select auth.uid()));
create policy "food_library_update_own" on public.food_library for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "food_library_delete_own" on public.food_library for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.food_library from anon;
grant select, insert, update, delete on public.food_library to authenticated;
create table if not exists public.meals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date,
  meal_type text not null check (meal_type in ('breakfast','lunch','snack','dinner')),
  is_favorite boolean not null default false,
  favorite_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists meals_sync_idx on public.meals (user_id, server_updated_at);
drop trigger if exists meals_touch on public.meals;
create trigger meals_touch before insert or update on public.meals for each row execute function public.bt_touch();
alter table public.meals enable row level security;
drop policy if exists "meals_select_own" on public.meals;
drop policy if exists "meals_insert_own" on public.meals;
drop policy if exists "meals_update_own" on public.meals;
drop policy if exists "meals_delete_own" on public.meals;
create policy "meals_select_own" on public.meals for select to authenticated using (user_id = (select auth.uid()));
create policy "meals_insert_own" on public.meals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meals_update_own" on public.meals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meals_delete_own" on public.meals for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.meals from anon;
grant select, insert, update, delete on public.meals to authenticated;
create table if not exists public.meal_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null,
  food_id text,
  name text not null,
  quantity double precision not null check (quantity >= 0),
  unit text not null default 'g',
  kcal_100 double precision not null,
  protein_100 double precision not null,
  carbs_100 double precision not null,
  fat_100 double precision not null,
  position integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists meal_items_sync_idx on public.meal_items (user_id, server_updated_at);
drop trigger if exists meal_items_touch on public.meal_items;
create trigger meal_items_touch before insert or update on public.meal_items for each row execute function public.bt_touch();
alter table public.meal_items enable row level security;
drop policy if exists "meal_items_select_own" on public.meal_items;
drop policy if exists "meal_items_insert_own" on public.meal_items;
drop policy if exists "meal_items_update_own" on public.meal_items;
drop policy if exists "meal_items_delete_own" on public.meal_items;
create policy "meal_items_select_own" on public.meal_items for select to authenticated using (user_id = (select auth.uid()));
create policy "meal_items_insert_own" on public.meal_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "meal_items_update_own" on public.meal_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_items_delete_own" on public.meal_items for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.meal_items from anon;
grant select, insert, update, delete on public.meal_items to authenticated;
create table if not exists public.weight_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight_kg double precision not null check (weight_kg between 25 and 400),
  note text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists weight_logs_sync_idx on public.weight_logs (user_id, server_updated_at);
drop trigger if exists weight_logs_touch on public.weight_logs;
create trigger weight_logs_touch before insert or update on public.weight_logs for each row execute function public.bt_touch();
alter table public.weight_logs enable row level security;
drop policy if exists "weight_logs_select_own" on public.weight_logs;
drop policy if exists "weight_logs_insert_own" on public.weight_logs;
drop policy if exists "weight_logs_update_own" on public.weight_logs;
drop policy if exists "weight_logs_delete_own" on public.weight_logs;
create policy "weight_logs_select_own" on public.weight_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "weight_logs_insert_own" on public.weight_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "weight_logs_update_own" on public.weight_logs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "weight_logs_delete_own" on public.weight_logs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.weight_logs from anon;
grant select, insert, update, delete on public.weight_logs to authenticated;
create table if not exists public.body_measurements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  chest_cm double precision,
  waist_cm double precision,
  arm_cm double precision,
  thigh_cm double precision,
  hips_cm double precision,
  calf_cm double precision,
  note text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists body_measurements_sync_idx on public.body_measurements (user_id, server_updated_at);
drop trigger if exists body_measurements_touch on public.body_measurements;
create trigger body_measurements_touch before insert or update on public.body_measurements for each row execute function public.bt_touch();
alter table public.body_measurements enable row level security;
drop policy if exists "body_measurements_select_own" on public.body_measurements;
drop policy if exists "body_measurements_insert_own" on public.body_measurements;
drop policy if exists "body_measurements_update_own" on public.body_measurements;
drop policy if exists "body_measurements_delete_own" on public.body_measurements;
create policy "body_measurements_select_own" on public.body_measurements for select to authenticated using (user_id = (select auth.uid()));
create policy "body_measurements_insert_own" on public.body_measurements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "body_measurements_update_own" on public.body_measurements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "body_measurements_delete_own" on public.body_measurements for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.body_measurements from anon;
grant select, insert, update, delete on public.body_measurements to authenticated;
create table if not exists public.progress_photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  pose text not null check (pose in ('front','side','back')),
  storage_path text,
  note text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists progress_photos_sync_idx on public.progress_photos (user_id, server_updated_at);
drop trigger if exists progress_photos_touch on public.progress_photos;
create trigger progress_photos_touch before insert or update on public.progress_photos for each row execute function public.bt_touch();
alter table public.progress_photos enable row level security;
drop policy if exists "progress_photos_select_own" on public.progress_photos;
drop policy if exists "progress_photos_insert_own" on public.progress_photos;
drop policy if exists "progress_photos_update_own" on public.progress_photos;
drop policy if exists "progress_photos_delete_own" on public.progress_photos;
create policy "progress_photos_select_own" on public.progress_photos for select to authenticated using (user_id = (select auth.uid()));
create policy "progress_photos_insert_own" on public.progress_photos for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progress_photos_update_own" on public.progress_photos for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "progress_photos_delete_own" on public.progress_photos for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.progress_photos from anon;
grant select, insert, update, delete on public.progress_photos to authenticated;
create table if not exists public.journal_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  energy integer check (energy between 1 and 5),
  sleep_quality integer check (sleep_quality between 1 and 5),
  sleep_hours double precision,
  motivation integer check (motivation between 1 and 5),
  difficulties text not null default '',
  text text not null default '',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists journal_entries_sync_idx on public.journal_entries (user_id, server_updated_at);
drop trigger if exists journal_entries_touch on public.journal_entries;
create trigger journal_entries_touch before insert or update on public.journal_entries for each row execute function public.bt_touch();
alter table public.journal_entries enable row level security;
drop policy if exists "journal_entries_select_own" on public.journal_entries;
drop policy if exists "journal_entries_insert_own" on public.journal_entries;
drop policy if exists "journal_entries_update_own" on public.journal_entries;
drop policy if exists "journal_entries_delete_own" on public.journal_entries;
create policy "journal_entries_select_own" on public.journal_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "journal_entries_insert_own" on public.journal_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "journal_entries_update_own" on public.journal_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "journal_entries_delete_own" on public.journal_entries for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;
create table if not exists public.user_goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  exercise_id text,
  metric text not null default '',
  reference_weight_kg double precision,
  start_value double precision not null default 0,
  target_value double precision not null,
  deadline date,
  created_at timestamptz not null default now(),
  achieved_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists user_goals_sync_idx on public.user_goals (user_id, server_updated_at);
drop trigger if exists user_goals_touch on public.user_goals;
create trigger user_goals_touch before insert or update on public.user_goals for each row execute function public.bt_touch();
alter table public.user_goals enable row level security;
drop policy if exists "user_goals_select_own" on public.user_goals;
drop policy if exists "user_goals_insert_own" on public.user_goals;
drop policy if exists "user_goals_update_own" on public.user_goals;
drop policy if exists "user_goals_delete_own" on public.user_goals;
create policy "user_goals_select_own" on public.user_goals for select to authenticated using (user_id = (select auth.uid()));
create policy "user_goals_insert_own" on public.user_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_goals_update_own" on public.user_goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_goals_delete_own" on public.user_goals for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_goals from anon;
grant select, insert, update, delete on public.user_goals to authenticated;
create table if not exists public.achievements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists achievements_sync_idx on public.achievements (user_id, server_updated_at);
drop trigger if exists achievements_touch on public.achievements;
create trigger achievements_touch before insert or update on public.achievements for each row execute function public.bt_touch();
alter table public.achievements enable row level security;
drop policy if exists "achievements_select_own" on public.achievements;
drop policy if exists "achievements_insert_own" on public.achievements;
drop policy if exists "achievements_update_own" on public.achievements;
drop policy if exists "achievements_delete_own" on public.achievements;
create policy "achievements_select_own" on public.achievements for select to authenticated using (user_id = (select auth.uid()));
create policy "achievements_insert_own" on public.achievements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "achievements_update_own" on public.achievements for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "achievements_delete_own" on public.achievements for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.achievements from anon;
grant select, insert, update, delete on public.achievements to authenticated;
create table if not exists public.weekly_reports (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
create index if not exists weekly_reports_sync_idx on public.weekly_reports (user_id, server_updated_at);
drop trigger if exists weekly_reports_touch on public.weekly_reports;
create trigger weekly_reports_touch before insert or update on public.weekly_reports for each row execute function public.bt_touch();
alter table public.weekly_reports enable row level security;
drop policy if exists "weekly_reports_select_own" on public.weekly_reports;
drop policy if exists "weekly_reports_insert_own" on public.weekly_reports;
drop policy if exists "weekly_reports_update_own" on public.weekly_reports;
drop policy if exists "weekly_reports_delete_own" on public.weekly_reports;
create policy "weekly_reports_select_own" on public.weekly_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "weekly_reports_insert_own" on public.weekly_reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy "weekly_reports_update_own" on public.weekly_reports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "weekly_reports_delete_own" on public.weekly_reports for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.weekly_reports from anon;
grant select, insert, update, delete on public.weekly_reports to authenticated;
-- Index métier
create index if not exists workout_sets_exercise_idx on public.workout_sets (user_id, exercise_id);
create index if not exists workout_sets_session_idx on public.workout_sets (session_id);
create index if not exists meal_items_meal_idx on public.meal_items (meal_id);
create index if not exists meals_date_idx on public.meals (user_id, date);
create index if not exists weight_logs_date_idx on public.weight_logs (user_id, date);

-- Records personnels : vue calculée à partir des séries (jamais de doublon à maintenir).
-- security_invoker : la vue applique les règles RLS de l'utilisateur qui l'interroge.
create or replace view public.personal_records with (security_invoker = true) as
select s.user_id,
       s.exercise_id,
       max(s.weight_kg) as best_weight_kg,
       max(case when s.reps = 1 then s.weight_kg else s.weight_kg * (1 + s.reps / 30.0) end) as best_e1rm_kg,
       max(s.weight_kg * s.reps) as best_set_volume,
       max(s.reps) as max_reps,
       count(distinct s.session_id) as sessions
from public.workout_sets s
join public.workout_sessions w on w.id = s.session_id and w.status = 'done' and w.deleted_at is null
where s.deleted_at is null and s.done and not s.is_warmup and s.reps > 0
group by s.user_id, s.exercise_id;
revoke all on public.personal_records from anon;
grant select on public.personal_records to authenticated;

-- Suppression du compte par l'utilisateur lui-même (les lignes suivent par cascade)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Photos de progression : bucket PRIVÉ, un dossier par utilisateur (<user_id>/<photo>.jpg)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "photos_select_own" on storage.objects;
drop policy if exists "photos_insert_own" on storage.objects;
drop policy if exists "photos_update_own" on storage.objects;
drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
