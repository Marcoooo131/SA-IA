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
create table if not exists public.exercise_library (
  id text not null check (length(id) between 1 and 200),
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
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
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
create table if not exists public.food_library (
  id text not null check (length(id) between 1 and 200),
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
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
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
create table if not exists public.achievements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  unlocked_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()
);
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

-- Pour chaque table : index de synchronisation, déclencheur server_updated_at, RLS et droits
do $$
declare t text;
begin
  foreach t in array array['profiles', 'nutrition_goals', 'exercise_library', 'workout_programs', 'workout_sessions', 'workout_exercises', 'workout_sets', 'food_library', 'meals', 'meal_items', 'weight_logs', 'body_measurements', 'progress_photos', 'journal_entries', 'user_goals', 'achievements', 'weekly_reports'] loop
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_sync_idx', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.bt_touch()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

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
