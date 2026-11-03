-- Tests de sécurité BODYTRACK : chaque utilisateur n'accède qu'à ses propres données.
\set ON_ERROR_STOP 1
\pset tuples_only on
set client_min_messages = notice;

create schema tests;
grant usage on schema tests to anon, authenticated;
create table tests.users (name text primary key, id uuid not null);
grant select on tests.users to anon, authenticated;
create function tests.as_user(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', (select id from tests.users where name = p_name), 'role', 'authenticated')::text, false);
$$;
create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'ÉCHEC : %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
create function tests.throws(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'ok - % (%)', p_msg, sqlerrm; return; end;
  raise exception 'ÉCHEC : % — aucune erreur levée', p_msg;
end $$;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@test'), ('22222222-2222-2222-2222-222222222222', 'b@test');
insert into tests.users values ('alice', '11111111-1111-1111-1111-111111111111'), ('bob', '22222222-2222-2222-2222-222222222222');

-- Alice écrit ses données
set role authenticated;
select tests.as_user('alice');
insert into public.weight_logs (id, date, weight_kg, updated_at) values ('a0000000-0000-0000-0000-000000000001', '2026-11-01', 73.2, now());
insert into public.workout_sessions (id, name, started_at, status, updated_at) values ('a0000000-0000-0000-0000-000000000002', 'Push', now(), 'done', now());
insert into public.workout_sets (id, session_id, workout_exercise_id, exercise_id, weight_kg, reps, done, updated_at)
  values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'ex-bench-press', 80, 10, true, now());
select tests.ok((select user_id from public.weight_logs) = '11111111-1111-1111-1111-111111111111', 'user_id rempli automatiquement avec auth.uid()');
select tests.ok((select round(best_e1rm_kg::numeric, 1) from public.personal_records where exercise_id = 'ex-bench-press') = 106.7, 'vue personal_records : 1RM estimé (Epley)');
select tests.throws($$insert into public.weight_logs (id, user_id, date, weight_kg) values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '2026-11-01', 80)$$, 'impossible d''écrire au nom d''un autre utilisateur');
select tests.throws($$insert into public.weight_logs (id, date, weight_kg) values (gen_random_uuid(), '2026-11-01', 5)$$, 'contrôle des valeurs aberrantes');
insert into storage.objects (bucket_id, name) values ('progress-photos', '11111111-1111-1111-1111-111111111111/p1.jpg');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('progress-photos', '22222222-2222-2222-2222-222222222222/p2.jpg')$$, 'photo hors de son dossier refusée');

-- Bob ne voit rien d'Alice et ne peut rien modifier
select tests.as_user('bob');
select tests.ok((select count(*) from public.weight_logs) = 0, 'Bob ne lit pas les pesées d''Alice');
select tests.ok((select count(*) from public.workout_sets) = 0, 'Bob ne lit pas les séries d''Alice');
select tests.ok((select count(*) from public.personal_records) = 0, 'Bob ne voit pas les records d''Alice');
select tests.ok((select count(*) from storage.objects) = 0, 'Bob ne voit pas les photos d''Alice');
update public.weight_logs set weight_kg = 100;
delete from public.workout_sessions;

-- Anonyme : aucun accès
reset role;
set role anon;
select tests.throws($$select count(*) from public.weight_logs$$, 'anon n''a aucun droit sur les tables');
select tests.throws($$select public.delete_my_account()$$, 'anon ne peut pas appeler delete_my_account');

reset role;
select tests.ok((select weight_kg from public.weight_logs where id = 'a0000000-0000-0000-0000-000000000001') = 73.2, 'les modifications de Bob n''ont rien changé');
select tests.ok((select count(*) from public.workout_sessions) = 1, 'la suppression de Bob n''a rien supprimé');

-- server_updated_at géré par la base (synchronisation différée)
select tests.ok((select server_updated_at is not null from public.weight_logs limit 1), 'server_updated_at renseigné');

-- Suppression de compte : cascade
set role authenticated;
select tests.as_user('alice');
select public.delete_my_account();
reset role;
select tests.ok((select count(*) from public.weight_logs) = 0 and (select count(*) from public.workout_sets) = 0, 'suppression du compte : toutes les données supprimées');
select tests.ok((select count(*) from auth.users where email = 'b@test') = 1, 'le compte de Bob est intact');
\echo 'Tous les tests de sécurité sont passés.'
