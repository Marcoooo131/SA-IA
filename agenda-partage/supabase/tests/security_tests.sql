-- Tests de sécurité de la base : rôles, confidentialité, RLS, déclencheurs.
-- Exécutés par scripts/test-db.sh après supabase_shim.sql et les migrations.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.users (name text primary key, id uuid not null);
grant select on tests.users to anon, authenticated, service_role;

create function tests.uid(p_name text) returns uuid language sql stable as $$
  select id from tests.users where name = p_name;
$$;

create function tests.as_user(p_name text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_name), 'role', 'authenticated')::text, false);
$$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'ÉCHEC : %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.throws(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (%)', p_msg, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC : % — aucune erreur levée', p_msg;
end $$;

create function tests.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
set client_min_messages = notice;

-- ---------------------------------------------------------------- comptes
insert into auth.users (email, raw_user_meta_data) values ('admin@ex.fr', '{"full_name":"Admin Équipe"}');
insert into auth.users (email, raw_user_meta_data) values ('alice@ex.fr', '{"full_name":"Alice","role":"admin"}');
insert into auth.users (email, raw_user_meta_data) values ('bob@ex.fr', '{"full_name":"Bob"}');
insert into auth.users (email, raw_user_meta_data) values ('carol@ex.fr', '{"full_name":"Carol"}');
insert into auth.users (email, raw_user_meta_data) values ('dave@ex.fr', '{"full_name":"Dave"}');
insert into tests.users select split_part(email, '@', 1), id from auth.users;

select tests.ok((select role from public.profiles where id = tests.uid('admin')) = 'admin',
  'le premier compte créé devient administrateur');
select tests.ok((select role from public.profiles where id = tests.uid('alice')) = 'collaborator',
  'le rôle fourni dans les métadonnées d''inscription est ignoré');
select tests.ok((select is_active from public.profiles where id = tests.uid('admin'))
                and not (select is_active from public.profiles where id = tests.uid('alice')),
  'les comptes suivants sont en attente de validation par l''administrateur');

select tests.as_user('alice');
set role authenticated;
select tests.ok((select count(*) from public.profiles) = 1, 'compte en attente : ne voit que son propre profil');
select tests.throws($$select * from public.agenda_between(now(), now() + interval '1 day')$$, 'compte en attente : agenda refusé');
reset role;

-- ---------------------------------------------------------------- accès anonyme
set role anon;
select tests.throws('select count(*) from public.appointments', 'anonyme : aucun accès aux rendez-vous');
select tests.throws('select count(*) from public.profiles', 'anonyme : aucun accès aux profils');
select tests.throws($$select * from public.agenda_between(now(), now() + interval '1 day')$$, 'anonyme : RPC agenda refusée');
reset role;

-- ---------------------------------------------------------------- administration
select tests.as_user('admin');
set role authenticated;
select tests.ok(tests.affected($$update public.profiles set is_active = true where id in (tests.uid('alice'), tests.uid('bob'), tests.uid('carol'))$$) = 3,
  'admin : valide les comptes en attente');
select tests.throws($$update public.profiles set role = 'admin' where id = tests.uid('alice')$$,
  'un seul administrateur : impossible d''en nommer un second');
select tests.ok(tests.affected($$update public.profiles set can_edit_all = true where id = tests.uid('carol')$$) = 1,
  'admin : accorde le droit de modifier tous les rendez-vous');
select tests.ok(tests.affected($$update public.profiles set is_active = false where id = tests.uid('dave')$$) = 1,
  'admin : désactive un compte');
select tests.throws($$update public.profiles set role = 'collaborator' where id = tests.uid('admin')$$,
  'admin : impossible de retirer le dernier administrateur');
select tests.ok(tests.affected($$insert into public.categories (name) values ('Test catégorie')$$) = 1,
  'admin : crée une catégorie');
reset role;

-- ---------------------------------------------------------------- profils
select tests.as_user('bob');
set role authenticated;
select tests.throws($$update public.profiles set role = 'admin' where id = tests.uid('bob')$$,
  'collaborateur : ne peut pas se promouvoir administrateur');
select tests.throws($$update public.profiles set can_edit_all = true where id = tests.uid('bob')$$,
  'collaborateur : ne peut pas s''accorder des droits');
select tests.ok(tests.affected($$update public.profiles set full_name = 'Bob Martin' where id = tests.uid('bob')$$) = 1,
  'collaborateur : modifie son propre nom');
select tests.ok(tests.affected($$update public.profiles set full_name = 'Piraté' where id = tests.uid('alice')$$) = 0,
  'collaborateur : ne modifie pas le profil d''un autre');
select tests.throws($$update public.profiles set email = 'x@ex.fr' where id = tests.uid('bob')$$,
  'collaborateur : l''e-mail du profil n''est pas modifiable');
select tests.throws($$insert into public.categories (name) values ('Pirate')$$,
  'collaborateur : ne crée pas de catégorie');
select tests.ok(tests.affected($$update public.app_settings set organization_name = 'Pirate'$$) = 0,
  'collaborateur : ne modifie pas les paramètres');
reset role;

-- ---------------------------------------------------------------- rendez-vous publics
select tests.as_user('alice');
set role authenticated;
insert into public.appointments (id, title, starts_at, ends_at, responsible_id, client_name, created_by)
values ('00000000-0000-0000-0000-00000000a001', '  Visite client Dupont ', '2030-01-10 09:00+00', '2030-01-10 10:00+00',
        tests.uid('alice'), 'M. Dupont', tests.uid('bob'));
reset role;

select tests.ok((select created_by from public.appointments where id = '00000000-0000-0000-0000-00000000a001') = tests.uid('alice'),
  'le créateur est imposé par le serveur (usurpation ignorée)');
select tests.ok((select title from public.appointments where id = '00000000-0000-0000-0000-00000000a001') = 'Visite client Dupont',
  'le titre est nettoyé');
select tests.ok((select count(*) from public.appointment_history where appointment_id = '00000000-0000-0000-0000-00000000a001' and action = 'created') = 1,
  'historique : création enregistrée');
select tests.ok((select version from public.sync_state where scope = 'appointments') >= 1,
  'signal temps réel incrémenté');

select tests.as_user('bob');
set role authenticated;
select tests.ok((select count(*) from public.appointments where id = '00000000-0000-0000-0000-00000000a001') = 1,
  'collaborateur : voit les rendez-vous partagés');
select tests.ok(tests.affected($$update public.appointments set title = 'Modifié par Bob' where id = '00000000-0000-0000-0000-00000000a001'$$) = 0,
  'collaborateur : ne modifie pas le rendez-vous d''un autre sans autorisation');
select tests.ok(tests.affected($$delete from public.appointments where id = '00000000-0000-0000-0000-00000000a001'$$) = 0,
  'collaborateur : ne supprime pas');
select tests.throws($$insert into public.appointments (title, starts_at, ends_at) values ('Mauvais', '2030-01-10 10:00+00', '2030-01-10 09:00+00')$$,
  'validation : la fin doit suivre le début');
select tests.throws($$insert into public.appointments (title, starts_at, ends_at, links) values ('Lien', '2030-01-10 10:00+00', '2030-01-10 11:00+00', '[{"url":"javascript:alert(1)"}]')$$,
  'validation : lien non http(s) refusé');
select tests.ok(tests.affected($$insert into public.appointment_comments (appointment_id, body) values ('00000000-0000-0000-0000-00000000a001', 'Penser au badge')$$) = 1,
  'collaborateur : commente un rendez-vous partagé');
reset role;

select tests.as_user('carol');
set role authenticated;
select tests.ok(tests.affected($$update public.appointments set status = 'confirme', created_by = tests.uid('carol') where id = '00000000-0000-0000-0000-00000000a001'$$) = 1,
  'collaborateur autorisé : modifie le rendez-vous d''un autre');
reset role;

select tests.ok((select created_by from public.appointments where id = '00000000-0000-0000-0000-00000000a001') = tests.uid('alice'),
  'le créateur ne peut pas être réécrit');
select tests.ok((select changes ? 'status' and not changes ? 'created_by' from public.appointment_history
                 where appointment_id = '00000000-0000-0000-0000-00000000a001' and action = 'updated'
                 order by id desc limit 1),
  'historique : seul le champ réellement modifié est tracé');
select tests.ok((select count(*) from public.notifications where user_id = tests.uid('alice') and kind = 'updated') = 1,
  'notification : le responsable est prévenu d''une modification');
select tests.ok((select count(*) from public.notifications where user_id = tests.uid('alice') and kind = 'comment') = 1,
  'notification : le responsable est prévenu d''un commentaire');

-- ---------------------------------------------------------------- rendez-vous privés
select tests.as_user('alice');
set role authenticated;
insert into public.appointments (id, title, starts_at, ends_at, responsible_id, client_name, is_private, notes)
values ('00000000-0000-0000-0000-00000000a002', 'Entretien confidentiel', '2030-01-11 14:00+00', '2030-01-11 15:00+00',
        tests.uid('alice'), 'Client secret', true, 'Informations sensibles');
insert into public.appointment_comments (appointment_id, body) values ('00000000-0000-0000-0000-00000000a002', 'Note privée');
reset role;

select tests.as_user('bob');
set role authenticated;
select tests.ok((select count(*) from public.appointments where id = '00000000-0000-0000-0000-00000000a002') = 0,
  'privé : invisible dans la table pour un autre collaborateur');
select tests.ok((select title = 'Occupé' and client_name is null and notes is null and masked and not can_edit
                 from public.agenda_between('2030-01-11', '2030-01-12') where id = '00000000-0000-0000-0000-00000000a002'),
  'privé : apparaît seulement comme créneau « Occupé » dans l''agenda');
select tests.ok((select count(*) from public.search_appointments('confidentiel')) = 0,
  'privé : introuvable par la recherche');
select tests.ok((select count(*) from public.search_appointments('Client secret')) = 0,
  'privé : client introuvable par la recherche');
select tests.ok((select count(*) from public.appointment_history where appointment_id = '00000000-0000-0000-0000-00000000a002') = 0,
  'privé : historique invisible');
select tests.ok((select count(*) from public.appointment_comments where appointment_id = '00000000-0000-0000-0000-00000000a002') = 0,
  'privé : commentaires invisibles');
select tests.throws($$insert into public.appointment_comments (appointment_id, body) values ('00000000-0000-0000-0000-00000000a002', 'intrus')$$,
  'privé : impossible de commenter');
select tests.ok((select masked and title = 'Créneau occupé'
                 from public.find_conflicts(tests.uid('alice'), '2030-01-11 14:30+00', '2030-01-11 16:00+00')),
  'chevauchement détecté sans révéler le contenu privé');
select tests.ok((select count(*) from public.find_conflicts(tests.uid('alice'), '2030-01-11 15:00+00', '2030-01-11 16:00+00')) = 0,
  'pas de chevauchement pour un créneau qui commence à la fin du précédent');
select tests.ok((select count(*) from public.notifications where user_id = tests.uid('alice')) = 0,
  'notifications : chacun ne voit que les siennes');
select tests.throws($$insert into public.notifications (user_id, kind, title) values (tests.uid('bob'), 'assigned', 'faux')$$,
  'notifications : aucune insertion directe');
select tests.throws($$insert into public.appointment_history (appointment_id, appointment_title, action) values (gen_random_uuid(), 'faux', 'created')$$,
  'historique : aucune écriture directe');
select tests.throws($$select public.bump_sync('appointments')$$,
  'fonction interne non appelable');
reset role;

select tests.as_user('carol');
set role authenticated;
select tests.ok(tests.affected($$update public.appointments set title = 'x' where id = '00000000-0000-0000-0000-00000000a002'$$) = 0,
  'privé : même un collaborateur autorisé à tout modifier ne touche pas un rendez-vous privé d''un autre');
reset role;

select tests.as_user('admin');
set role authenticated;
select tests.ok((select client_name = 'Client secret' and not masked
                 from public.agenda_between('2030-01-11', '2030-01-12') where id = '00000000-0000-0000-0000-00000000a002'),
  'admin : voit le contenu des rendez-vous privés');
reset role;

-- La confidentialité s'applique aussi à l'historique passé
select tests.as_user('alice');
set role authenticated;
update public.appointments set is_private = true where id = '00000000-0000-0000-0000-00000000a001';
reset role;
select tests.as_user('bob');
set role authenticated;
select tests.ok((select count(*) from public.appointment_history where appointment_id = '00000000-0000-0000-0000-00000000a001') = 0,
  'passage en privé : l''historique antérieur devient confidentiel');
reset role;

-- ---------------------------------------------------------------- pièces jointes (Storage)
select tests.as_user('bob');
set role authenticated;
insert into public.appointments (id, title, starts_at, ends_at, responsible_id)
values ('00000000-0000-0000-0000-00000000b001', 'RDV Bob', '2030-02-01 09:00+00', '2030-02-01 10:00+00', tests.uid('bob'));
select tests.ok(tests.affected($$insert into storage.objects (bucket_id, name) values ('attachments', '00000000-0000-0000-0000-00000000b001/devis.pdf')$$) = 1,
  'pièce jointe : dépôt dans un rendez-vous visible');
select tests.ok(tests.affected($$insert into public.appointment_attachments (appointment_id, storage_path, file_name, size_bytes) values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001/devis.pdf', 'devis.pdf', 1200)$$) = 1,
  'pièce jointe : enregistrement des métadonnées');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('attachments', '00000000-0000-0000-0000-00000000a002/vol.pdf')$$,
  'pièce jointe : dépôt refusé dans un rendez-vous privé d''un autre');
select tests.throws($$insert into public.appointment_attachments (appointment_id, storage_path, file_name, size_bytes) values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002/x.pdf', 'x.pdf', 1)$$,
  'pièce jointe : chemin hors du dossier du rendez-vous refusé');
reset role;

select tests.ok((select count(*) from public.appointment_history where appointment_id = '00000000-0000-0000-0000-00000000b001' and action = 'attachment') = 1,
  'historique : ajout de pièce jointe tracé');

-- ---------------------------------------------------------------- suppression
select tests.as_user('bob');
set role authenticated;
select tests.ok(tests.affected($$delete from public.appointments where id = '00000000-0000-0000-0000-00000000b001'$$) = 0,
  'suppression : interdite par défaut aux collaborateurs');
reset role;

select tests.as_user('admin');
set role authenticated;
update public.app_settings set collaborators_can_delete = true;
reset role;

select tests.as_user('bob');
set role authenticated;
select tests.ok(tests.affected($$delete from public.appointments where id = '00000000-0000-0000-0000-00000000b001'$$) = 1,
  'suppression : autorisée au créateur quand l''admin l''active');
select tests.ok((select count(*) from public.appointment_history where appointment_id = '00000000-0000-0000-0000-00000000b001' and action = 'deleted') = 1,
  'historique : suppression conservée');
reset role;

-- ---------------------------------------------------------------- compte désactivé
select tests.as_user('dave');
set role authenticated;
select tests.ok((select count(*) from public.appointments) = 0, 'compte désactivé : ne voit plus aucun rendez-vous');
select tests.ok((select count(*) from public.profiles) = 1, 'compte désactivé : ne voit que son propre profil');
select tests.throws($$select * from public.agenda_between('2030-01-01', '2030-02-01')$$, 'compte désactivé : agenda refusé');
select tests.throws($$insert into public.appointments (title, starts_at, ends_at) values ('x', '2030-01-10 09:00+00', '2030-01-10 10:00+00')$$,
  'compte désactivé : création refusée');
reset role;

-- ---------------------------------------------------------------- compte de service (fonction admin-users)
set role service_role;
do $$ begin perform set_config('request.jwt.claims', '{"role":"service_role"}', false); end $$;
select tests.ok(tests.affected($$update public.profiles set is_active = true where id = tests.uid('dave')$$) = 1,
  'compte de service : active un compte (fonction d''administration)');
select tests.throws($$update public.profiles set role = 'admin' where id = tests.uid('dave')$$,
  'compte de service : ne peut pas créer un second administrateur non plus');
reset role;


-- ---------------------------------------------------------------- intégrations (Outlook, Dispatch)
select tests.as_user('bob');
set role authenticated;
create temp table if not exists t_tok (who text, token text);
grant all on t_tok to authenticated;
insert into t_tok select 'bob1', public.calendar_feed_token();
insert into t_tok select 'bob2', public.calendar_feed_token();
insert into t_tok select 'bob3', public.calendar_feed_token(true);
select tests.ok((select token from t_tok where who = 'bob1') = (select token from t_tok where who = 'bob2')
                and length((select token from t_tok where who = 'bob1')) = 64,
  'Outlook : lien d''abonnement stable (64 caractères aléatoires)');
select tests.ok((select token from t_tok where who = 'bob3') <> (select token from t_tok where who = 'bob1'),
  'Outlook : le lien peut être régénéré (l''ancien cesse de fonctionner)');
select tests.throws($$select public.rotate_integration_token('dispatch')$$,
  'Dispatch : un collaborateur ne peut pas générer le jeton de l''agent');
reset role;

select tests.as_user('carol');
set role authenticated;
select public.calendar_feed_token();
select tests.ok((select count(*) from public.calendar_feeds) = 1,
  'Outlook : chacun ne voit que son propre lien');
reset role;

select tests.as_user('admin');
set role authenticated;
select tests.ok(length(public.rotate_integration_token('dispatch')) = 64, 'Dispatch : l''administrateur génère le jeton');
select tests.ok(public.integration_token_info('dispatch') is not null, 'Dispatch : date du jeton visible par l''admin');
select tests.throws($$select * from public.integration_tokens$$, 'Dispatch : l''empreinte du jeton est illisible depuis le navigateur');
insert into public.appointments (title, starts_at, ends_at, external_ref)
values ('Tâche CRM', '2030-03-01 09:00+00', '2030-03-01 09:15+00', 'crm-task:abc');
select tests.throws($$insert into public.appointments (title, starts_at, ends_at, external_ref) values ('Doublon', '2030-03-01 09:00+00', '2030-03-01 09:15+00', 'crm-task:abc')$$,
  'Dispatch : une même tâche CRM ne crée jamais deux rendez-vous');
reset role;

\echo 'Tous les tests de sécurité de la base sont passés.'
