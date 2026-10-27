-- =====================================================================================
-- Agenda partagé — schéma initial (Supabase / PostgreSQL)
--
-- Tout ce qui protège les données est appliqué ICI, dans la base :
--   * Row Level Security (RLS) sur chaque table : un navigateur ne voit et ne modifie que
--     ce que son rôle autorise, même s'il contourne l'interface ;
--   * déclencheurs (triggers) qui imposent l'auteur, les dates de modification,
--     l'historique et les notifications internes (impossible à falsifier côté client) ;
--   * rendez-vous « privés » : seuls l'administrateur, le créateur et le responsable en voient
--     le contenu ; les autres collègues voient seulement un créneau « Occupé ».
--
-- Exécution : `supabase db push` (CLI) ou copier-coller dans Supabase > SQL Editor.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Types
-- -------------------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'collaborator');

create type public.appointment_status as enum (
  'a_confirmer', 'confirme', 'en_cours', 'termine', 'annule', 'reporte'
);

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '' check (char_length(full_name) <= 120),
  role          public.app_role not null default 'collaborator',
  -- Autorisation accordée par un administrateur : modifier aussi les rendez-vous des autres
  can_edit_all  boolean not null default false,
  is_active     boolean not null default true,
  color         text not null default '#E30613' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  phone         text check (char_length(phone) <= 40),
  -- Fuseau horaire personnel (NULL = fuseau de l'équipe défini dans app_settings)
  timezone      text check (char_length(timezone) <= 64),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(trim(name)) between 1 and 60),
  color       text not null default '#E30613' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Paramètres globaux (une seule ligne)
create table public.app_settings (
  id                        boolean primary key default true check (id),
  organization_name         text not null default 'Agenda d''équipe'
                              check (char_length(trim(organization_name)) between 1 and 80),
  timezone                  text not null default 'Europe/Paris' check (char_length(timezone) <= 64),
  day_start                 time not null default '07:00',
  day_end                   time not null default '20:00',
  default_duration_minutes  integer not null default 60 check (default_duration_minutes between 5 and 1440),
  collaborators_can_delete  boolean not null default false,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null,
  check (day_end > day_start)
);

-- Les liens sont un tableau JSON [{ "label": "...", "url": "https://..." }]
create function public.valid_links(p_links jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_links) = 'array'
     and jsonb_array_length(p_links) <= 20
     and not exists (
       select 1
       from jsonb_array_elements(p_links) as l(item)
       where jsonb_typeof(l.item) <> 'object'
          or coalesce(l.item ->> 'url', '') !~* '^https?://[^\s]+$'
          or char_length(l.item ->> 'url') > 2000
          or char_length(coalesce(l.item ->> 'label', '')) > 200
     );
$$;

create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(trim(title)) between 1 and 200),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  all_day         boolean not null default false,
  client_name     text check (char_length(client_name) <= 200),
  responsible_id  uuid references public.profiles (id) on delete set null,
  category_id     uuid references public.categories (id) on delete set null,
  location        text check (char_length(location) <= 300),
  description     text check (char_length(description) <= 5000),
  notes           text check (char_length(notes) <= 5000),
  status          public.appointment_status not null default 'a_confirmer',
  -- Rendez-vous confidentiel : contenu réservé à l'admin, au créateur et au responsable
  is_private      boolean not null default false,
  links           jsonb not null default '[]'::jsonb check (public.valid_links(links)),
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '62 days')
);

create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_ends_at_idx on public.appointments (ends_at);
create index appointments_responsible_idx on public.appointments (responsible_id, starts_at);

create table public.appointment_comments (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  author_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  -- 'comment' : échange interne ; 'post_note' : compte rendu ajouté après le rendez-vous
  kind            text not null default 'comment' check (kind in ('comment', 'post_note')),
  body            text not null check (char_length(trim(body)) between 1 and 5000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index appointment_comments_appointment_idx on public.appointment_comments (appointment_id, created_at);

create table public.appointment_attachments (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  storage_path    text not null unique,
  file_name       text not null check (char_length(file_name) between 1 and 255),
  size_bytes      bigint not null check (size_bytes between 0 and 10485760),
  mime_type       text,
  uploaded_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  -- Le fichier doit être rangé dans le dossier du rendez-vous auquel il est rattaché
  check (split_part(storage_path, '/', 1) = appointment_id::text)
);

create index appointment_attachments_appointment_idx on public.appointment_attachments (appointment_id);

-- Historique : alimenté uniquement par les déclencheurs (aucune écriture directe possible).
-- Pas de clé étrangère : l'historique d'un rendez-vous supprimé reste consultable.
create table public.appointment_history (
  id                 bigint generated always as identity primary key,
  appointment_id     uuid not null,
  appointment_title  text not null,
  action             text not null check (action in ('created', 'updated', 'deleted', 'comment', 'attachment')),
  changes            jsonb not null default '{}'::jsonb,
  actor_id           uuid references public.profiles (id) on delete set null,
  -- Copie des règles de visibilité du rendez-vous (tenue à jour par déclencheur)
  is_private         boolean not null default false,
  responsible_id     uuid,
  created_by         uuid,
  created_at         timestamptz not null default now()
);

create index appointment_history_appointment_idx on public.appointment_history (appointment_id, created_at desc);
create index appointment_history_created_idx on public.appointment_history (created_at desc);

-- Notifications internes (préparées pour e-mail / SMS / rappels plus tard)
create table public.notifications (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  appointment_id  uuid,
  kind            text not null check (kind in ('assigned', 'updated', 'cancelled', 'comment', 'deleted')),
  title           text not null,
  body            text not null default '',
  actor_id        uuid references public.profiles (id) on delete set null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Signal de synchronisation : une ligne par « domaine », dont la version augmente à chaque
-- modification. Les navigateurs s'y abonnent en temps réel puis rechargent ce qu'ils ont le droit
-- de voir. Ne contient aucune donnée métier, donc rien de confidentiel ne transite par là.
create table public.sync_state (
  scope       text primary key check (scope in ('appointments', 'categories', 'profiles', 'settings')),
  version     bigint not null default 0,
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
-- Fonctions d'autorisation (SECURITY DEFINER : lisent profiles sans boucler sur la RLS)
-- -------------------------------------------------------------------------------------
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'admin'
  );
$$;

create function public.can_view_appointment(p_created_by uuid, p_responsible_id uuid, p_is_private boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user()
     and (
       not p_is_private
       or public.is_admin()
       or p_created_by = (select auth.uid())
       or p_responsible_id = (select auth.uid())
     );
$$;

create function public.can_edit_appointment(p_created_by uuid, p_responsible_id uuid, p_is_private boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (
        public.is_active_user()
        and (
          p_created_by = (select auth.uid())
          or p_responsible_id = (select auth.uid())
          or (
            not p_is_private
            and exists (
              select 1 from public.profiles p
              where p.id = (select auth.uid()) and p.can_edit_all
            )
          )
        )
      );
$$;

create function public.can_delete_appointment(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or (
        public.is_active_user()
        and p_created_by = (select auth.uid())
        and coalesce((select s.collaborators_can_delete from public.app_settings s where s.id), false)
      );
$$;

create function public.is_service_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is null
     and (
       current_user in ('postgres', 'service_role', 'supabase_admin')
       or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     );
$$;

create function public.bump_sync(p_scope text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sync_state set version = version + 1, updated_at = now() where scope = p_scope;
$$;

-- -------------------------------------------------------------------------------------
-- Profils : création automatique à l'inscription / invitation
-- -------------------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_admin boolean;
begin
  select exists (select 1 from public.profiles where role = 'admin') into v_has_admin;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), 120),
    -- Le tout premier compte créé devient administrateur ; ensuite, le rôle n'est JAMAIS lu
    -- dans les métadonnées fournies par l'utilisateur : seul un admin peut le changer.
    case when v_has_admin then 'collaborator'::public.app_role else 'admin'::public.app_role end
  );
  perform public.bump_sync('profiles');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Garde-fous sur les profils : un collaborateur ne peut modifier que son nom, sa couleur,
-- son téléphone et son fuseau ; seul un admin change rôle, statut et autorisations.
create function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Champ non modifiable' using errcode = '42501';
  end if;

  if not public.is_service_context() then
    if new.email is distinct from old.email then
      raise exception 'L''adresse e-mail se modifie depuis le compte de connexion' using errcode = '42501';
    end if;
    if (new.role, new.is_active, new.can_edit_all) is distinct from (old.role, old.is_active, old.can_edit_all)
       and not public.is_admin() then
      raise exception 'Seul un administrateur peut modifier le rôle ou les autorisations' using errcode = '42501';
    end if;
  end if;

  -- Ne jamais laisser l'équipe sans administrateur actif
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if not exists (
      select 1 from public.profiles p
      where p.role = 'admin' and p.is_active and p.id <> old.id
    ) then
      raise exception 'Il doit rester au moins un administrateur actif' using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create function public.profiles_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bump_sync('profiles');
  return null;
end;
$$;

create trigger profiles_after_change
  after update or delete on public.profiles
  for each statement execute function public.profiles_after_change();

-- -------------------------------------------------------------------------------------
-- Rendez-vous : métadonnées imposées par le serveur
-- -------------------------------------------------------------------------------------
create function public.appointments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid());
    end if;
    new.created_at := now();
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  new.updated_at := now();
  new.title := trim(new.title);
  return new;
end;
$$;

create trigger appointments_before_write
  before insert or update on public.appointments
  for each row execute function public.appointments_before_write();

create function public.status_label(p_status public.appointment_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'a_confirmer' then 'À confirmer'
    when 'confirme' then 'Confirmé'
    when 'en_cours' then 'En cours'
    when 'termine' then 'Terminé'
    when 'annule' then 'Annulé'
    when 'reporte' then 'Reporté'
  end;
$$;

create function public.display_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), p.email, 'Quelqu''un')
  from public.profiles p where p.id = p_id;
$$;

create function public.notify_user(
  p_user uuid, p_appointment uuid, p_kind text, p_title text, p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_user and is_active) then
    return;
  end if;
  insert into public.notifications (user_id, appointment_id, kind, title, body, actor_id)
  values (p_user, p_appointment, p_kind, left(p_title, 300), left(coalesce(p_body, ''), 1000), (select auth.uid()));
end;
$$;

-- Historique + notifications + signal temps réel
create function public.appointments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_actor text := coalesce(public.display_name((select auth.uid())), 'Système');
  v_when text;
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_history
      (appointment_id, appointment_title, action, changes, actor_id, is_private, responsible_id, created_by)
    values
      (new.id, new.title, 'created', '{}'::jsonb, (select auth.uid()), new.is_private, new.responsible_id, new.created_by);

    v_when := to_char(new.starts_at at time zone coalesce((select timezone from public.app_settings where id), 'UTC'),
                      'DD/MM/YYYY HH24:MI');
    perform public.notify_user(new.responsible_id, new.id, 'assigned',
      v_actor || ' vous a confié un rendez-vous', new.title || ' — ' || v_when);

  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old) - array['updated_at', 'updated_by', 'created_at', 'created_by'];
    v_new := to_jsonb(new) - array['updated_at', 'updated_by', 'created_at', 'created_by'];
    for v_key in select jsonb_object_keys(v_new) loop
      if v_new -> v_key is distinct from v_old -> v_key then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;

    if v_changes = '{}'::jsonb then
      return null;
    end if;

    insert into public.appointment_history
      (appointment_id, appointment_title, action, changes, actor_id, is_private, responsible_id, created_by)
    values
      (new.id, new.title, 'updated', v_changes, (select auth.uid()), new.is_private, new.responsible_id, new.created_by);

    -- La visibilité de l'historique suit celle du rendez-vous
    if (new.is_private, new.responsible_id) is distinct from (old.is_private, old.responsible_id) then
      update public.appointment_history
         set is_private = new.is_private, responsible_id = new.responsible_id, created_by = new.created_by
       where appointment_id = new.id;
    end if;

    if new.responsible_id is distinct from old.responsible_id then
      perform public.notify_user(new.responsible_id, new.id, 'assigned',
        v_actor || ' vous a confié un rendez-vous', new.title);
    elsif new.status is distinct from old.status and new.status = 'annule' then
      perform public.notify_user(new.responsible_id, new.id, 'cancelled',
        v_actor || ' a annulé un rendez-vous', new.title);
    else
      perform public.notify_user(new.responsible_id, new.id, 'updated',
        v_actor || ' a modifié un rendez-vous', new.title);
    end if;
    if new.created_by is distinct from new.responsible_id then
      perform public.notify_user(new.created_by, new.id, 'updated',
        v_actor || ' a modifié un rendez-vous que vous avez créé', new.title);
    end if;

  else -- DELETE
    insert into public.appointment_history
      (appointment_id, appointment_title, action, changes, actor_id, is_private, responsible_id, created_by)
    values
      (old.id, old.title, 'deleted', '{}'::jsonb, (select auth.uid()), old.is_private, old.responsible_id, old.created_by);
    perform public.notify_user(old.responsible_id, null, 'deleted',
      v_actor || ' a supprimé un rendez-vous', old.title);
  end if;

  perform public.bump_sync('appointments');
  return null;
end;
$$;

create trigger appointments_after_write
  after insert or update or delete on public.appointments
  for each row execute function public.appointments_after_write();

-- Commentaires : auteur imposé, historique, notifications
create function public.comments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce((select auth.uid()), new.author_id);
    new.created_at := now();
  else
    new.appointment_id := old.appointment_id;
    new.author_id := old.author_id;
    new.kind := old.kind;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger comments_before_write
  before insert or update on public.appointment_comments
  for each row execute function public.comments_before_write();

create function public.comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_actor text := coalesce(public.display_name((select auth.uid())), 'Quelqu''un');
  v_label text := case when new.kind = 'post_note' then 'compte rendu' else 'commentaire' end;
begin
  select * into v_appt from public.appointments where id = new.appointment_id;
  insert into public.appointment_history
    (appointment_id, appointment_title, action, changes, actor_id, is_private, responsible_id, created_by)
  values
    (v_appt.id, v_appt.title, 'comment', jsonb_build_object('kind', new.kind, 'excerpt', left(new.body, 140)),
     (select auth.uid()), v_appt.is_private, v_appt.responsible_id, v_appt.created_by);

  perform public.notify_user(v_appt.responsible_id, v_appt.id, 'comment',
    v_actor || ' a ajouté un ' || v_label, v_appt.title || ' : ' || left(new.body, 140));
  if v_appt.created_by is distinct from v_appt.responsible_id then
    perform public.notify_user(v_appt.created_by, v_appt.id, 'comment',
      v_actor || ' a ajouté un ' || v_label, v_appt.title || ' : ' || left(new.body, 140));
  end if;
  return null;
end;
$$;

create trigger comments_after_insert
  after insert on public.appointment_comments
  for each row execute function public.comments_after_insert();

create function public.attachments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.uploaded_by := coalesce((select auth.uid()), new.uploaded_by);
  new.created_at := now();
  return new;
end;
$$;

create trigger attachments_before_insert
  before insert on public.appointment_attachments
  for each row execute function public.attachments_before_insert();

create function public.attachments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointment_attachments%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_appt public.appointments%rowtype;
begin
  select * into v_appt from public.appointments where id = v_row.appointment_id;
  if not found then
    return null; -- rendez-vous en cours de suppression
  end if;
  insert into public.appointment_history
    (appointment_id, appointment_title, action, changes, actor_id, is_private, responsible_id, created_by)
  values
    (v_appt.id, v_appt.title, 'attachment',
     jsonb_build_object('file_name', v_row.file_name, 'operation', lower(tg_op)),
     (select auth.uid()), v_appt.is_private, v_appt.responsible_id, v_appt.created_by);
  return null;
end;
$$;

create trigger attachments_after_write
  after insert or delete on public.appointment_attachments
  for each row execute function public.attachments_after_write();

create function public.categories_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bump_sync('categories');
  return null;
end;
$$;

create trigger categories_after_change
  after insert or update or delete on public.categories
  for each statement execute function public.categories_after_change();

create function public.settings_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := true;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger settings_before_update
  before update on public.app_settings
  for each row execute function public.settings_before_update();

create function public.settings_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bump_sync('settings');
  return null;
end;
$$;

create trigger settings_after_change
  after update on public.app_settings
  for each statement execute function public.settings_after_change();

-- -------------------------------------------------------------------------------------
-- Fonctions appelées par l'application (RPC)
-- -------------------------------------------------------------------------------------

-- Agenda d'une période. Les rendez-vous privés que l'utilisateur n'a pas le droit de voir
-- sont renvoyés « masqués » : seul le créneau (début, fin, responsable) reste visible, afin
-- que l'équipe sache que la personne est occupée sans rien apprendre d'autre.
create function public.agenda_between(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  client_name text,
  responsible_id uuid,
  category_id uuid,
  location text,
  description text,
  notes text,
  status public.appointment_status,
  is_private boolean,
  links jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  masked boolean,
  can_edit boolean,
  can_delete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;

  return query
  select
    a.id,
    case when v.visible then a.title else 'Occupé' end,
    a.starts_at,
    a.ends_at,
    a.all_day,
    case when v.visible then a.client_name end,
    a.responsible_id,
    case when v.visible then a.category_id end,
    case when v.visible then a.location end,
    case when v.visible then a.description end,
    case when v.visible then a.notes end,
    case when v.visible then a.status else 'confirme'::public.appointment_status end,
    a.is_private,
    case when v.visible then a.links else '[]'::jsonb end,
    case when v.visible then a.created_by end,
    case when v.visible then a.updated_by end,
    case when v.visible then a.created_at end,
    case when v.visible then a.updated_at end,
    not v.visible,
    v.visible and public.can_edit_appointment(a.created_by, a.responsible_id, a.is_private),
    v.visible and public.can_delete_appointment(a.created_by)
  from public.appointments a
  cross join lateral (
    select public.can_view_appointment(a.created_by, a.responsible_id, a.is_private) as visible
  ) v
  where a.starts_at < p_to
    and a.ends_at > p_from
    -- un créneau masqué annulé ou reporté ne bloque personne : inutile de l'afficher
    and (v.visible or a.status not in ('annule', 'reporte'))
  order by a.starts_at, a.id;
end;
$$;

-- Chevauchements pour un collaborateur sur un créneau (avertissement dans le formulaire)
create function public.find_conflicts(
  p_responsible_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_id uuid default null
)
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz, masked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
  select
    a.id,
    case when v.visible then a.title else 'Créneau occupé' end,
    a.starts_at,
    a.ends_at,
    not v.visible
  from public.appointments a
  cross join lateral (
    select public.can_view_appointment(a.created_by, a.responsible_id, a.is_private) as visible
  ) v
  where a.responsible_id = p_responsible_id
    and a.status not in ('annule', 'reporte')
    and a.starts_at < p_ends_at
    and a.ends_at > p_starts_at
    and (p_exclude_id is null or a.id <> p_exclude_id)
  order by a.starts_at
  limit 20;
end;
$$;

-- Recherche plein texte simple. SECURITY INVOKER : la RLS s'applique, un rendez-vous privé
-- d'un autre n'apparaît jamais dans les résultats.
create function public.search_appointments(p_query text, p_limit integer default 50)
returns setof public.appointments
language sql
stable
set search_path = ''
as $$
  select a.*
  from public.appointments a
  left join public.profiles p on p.id = a.responsible_id
  left join public.categories c on c.id = a.category_id
  where char_length(trim(p_query)) >= 2
    and (
      a.title ilike '%' || trim(p_query) || '%'
      or a.client_name ilike '%' || trim(p_query) || '%'
      or a.location ilike '%' || trim(p_query) || '%'
      or a.description ilike '%' || trim(p_query) || '%'
      or a.notes ilike '%' || trim(p_query) || '%'
      or p.full_name ilike '%' || trim(p_query) || '%'
      or c.name ilike '%' || trim(p_query) || '%'
    )
  order by abs(extract(epoch from (a.starts_at - now())))
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- -------------------------------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.app_settings enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_comments enable row level security;
alter table public.appointment_attachments enable row level security;
alter table public.appointment_history enable row level security;
alter table public.notifications enable row level security;
alter table public.sync_state enable row level security;

-- Aucun accès anonyme : l'agenda n'est jamais public
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all sequences in schema public from anon;

-- profiles
create policy "profils visibles par l'équipe" on public.profiles
  for select to authenticated using (public.is_active_user() or id = (select auth.uid()));
create policy "profil modifiable par soi-même ou un admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

revoke insert, delete, update on public.profiles from authenticated;
grant update (full_name, color, phone, timezone, role, is_active, can_edit_all) on public.profiles to authenticated;

-- categories
create policy "catégories visibles par l'équipe" on public.categories
  for select to authenticated using (public.is_active_user());
create policy "catégories gérées par les admins (ajout)" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "catégories gérées par les admins (modif)" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "catégories gérées par les admins (suppr)" on public.categories
  for delete to authenticated using (public.is_admin());

-- app_settings
create policy "paramètres visibles par l'équipe" on public.app_settings
  for select to authenticated using (public.is_active_user());
create policy "paramètres modifiés par les admins" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.app_settings from authenticated;

-- appointments
create policy "rendez-vous visibles selon confidentialité" on public.appointments
  for select to authenticated
  using (public.can_view_appointment(created_by, responsible_id, is_private));
create policy "création par tout membre actif" on public.appointments
  for insert to authenticated
  with check (public.is_active_user() and created_by = (select auth.uid()));
create policy "modification selon autorisations" on public.appointments
  for update to authenticated
  using (public.can_edit_appointment(created_by, responsible_id, is_private))
  with check (public.can_edit_appointment(created_by, responsible_id, is_private));
create policy "suppression par admin (ou créateur si autorisé)" on public.appointments
  for delete to authenticated
  using (public.can_delete_appointment(created_by));

-- comments : visibles si le rendez-vous l'est (la sous-requête passe par la RLS de appointments)
create policy "commentaires visibles avec le rendez-vous" on public.appointment_comments
  for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "commentaire ajouté par un membre qui voit le rendez-vous" on public.appointment_comments
  for insert to authenticated
  with check (
    public.is_active_user()
    and author_id = (select auth.uid())
    and exists (select 1 from public.appointments a where a.id = appointment_id)
  );
create policy "commentaire modifié par son auteur" on public.appointment_comments
  for update to authenticated
  using (author_id = (select auth.uid()) and public.is_active_user())
  with check (author_id = (select auth.uid()));
create policy "commentaire supprimé par son auteur ou un admin" on public.appointment_comments
  for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_active_user()) or public.is_admin());
revoke update on public.appointment_comments from authenticated;
grant update (body) on public.appointment_comments to authenticated;

-- attachments
create policy "pièces jointes visibles avec le rendez-vous" on public.appointment_attachments
  for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
create policy "pièce jointe ajoutée par un membre qui voit le rendez-vous" on public.appointment_attachments
  for insert to authenticated
  with check (
    public.is_active_user()
    and uploaded_by = (select auth.uid())
    and exists (select 1 from public.appointments a where a.id = appointment_id)
  );
create policy "pièce jointe supprimée par son auteur ou un admin" on public.appointment_attachments
  for delete to authenticated
  using ((uploaded_by = (select auth.uid()) and public.is_active_user()) or public.is_admin());
revoke update on public.appointment_attachments from authenticated;

-- history : lecture seule, mêmes règles de confidentialité que le rendez-vous
create policy "historique visible selon confidentialité" on public.appointment_history
  for select to authenticated
  using (public.can_view_appointment(created_by, responsible_id, is_private));
revoke insert, update, delete on public.appointment_history from authenticated;

-- notifications : chacun ne voit que les siennes et peut seulement les marquer comme lues
create policy "mes notifications" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "marquer mes notifications comme lues" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "supprimer mes notifications" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- sync_state : lecture seule
create policy "signal de synchronisation" on public.sync_state
  for select to authenticated using (public.is_active_user());
revoke insert, update, delete on public.sync_state from authenticated;

-- Fonctions exposées aux utilisateurs connectés uniquement
grant execute on function public.agenda_between(timestamptz, timestamptz) to authenticated;
grant execute on function public.find_conflicts(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.search_appointments(text, integer) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.can_view_appointment(uuid, uuid, boolean) to authenticated;
grant execute on function public.can_edit_appointment(uuid, uuid, boolean) to authenticated;
grant execute on function public.can_delete_appointment(uuid) to authenticated;
grant execute on function public.valid_links(jsonb) to authenticated;
grant execute on function public.is_service_context() to authenticated, service_role;
grant execute on function public.status_label(public.appointment_status) to authenticated;
-- Les fonctions internes (déclencheurs, notifications, signal) ne sont pas appelables directement
revoke execute on function public.bump_sync(text) from authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text) from authenticated;
revoke execute on function public.display_name(uuid) from authenticated;

-- -------------------------------------------------------------------------------------
-- Pièces jointes : stockage privé (Supabase Storage), 10 Mo par fichier
-- Chemin d'un fichier : <id du rendez-vous>/<uuid>-<nom>
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

create policy "agenda : lire les pièces jointes visibles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.appointments a
      where a.id::text = (storage.foldername(name))[1]
    )
  );
create policy "agenda : déposer une pièce jointe" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_active_user()
    and exists (
      select 1 from public.appointments a
      where a.id::text = (storage.foldername(name))[1]
    )
  );
create policy "agenda : supprimer une pièce jointe" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      public.is_admin()
      or (owner_id = (select auth.uid())::text and public.is_active_user())
    )
  );

-- -------------------------------------------------------------------------------------
-- Temps réel (Supabase Realtime) — la RLS est appliquée à chaque abonné
-- -------------------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.sync_state,
  public.appointment_comments,
  public.appointment_attachments,
  public.appointment_history,
  public.notifications;

-- -------------------------------------------------------------------------------------
-- Données de configuration initiales (modifiables par un admin dans l'application)
-- -------------------------------------------------------------------------------------
insert into public.app_settings (id) values (true);

insert into public.sync_state (scope) values ('appointments'), ('categories'), ('profiles'), ('settings');

insert into public.categories (name, color, position) values
  ('Rendez-vous client', '#E30613', 1),
  ('Réunion interne',    '#6B7280', 2),
  ('Intervention',       '#B8000A', 3),
  ('Appel',              '#F97316', 4),
  ('Formation',          '#2563EB', 5),
  ('Autre',              '#111111', 6);
