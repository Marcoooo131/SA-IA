-- =====================================================================================
-- Intégrations : abonnement Outlook (flux iCalendar) et réservation par l'agent Dispatch Movers
-- =====================================================================================

-- Référence externe d'un rendez-vous créé par une autre application (ex. « crm-task:<id> ») :
-- permet à l'agent Dispatch de mettre à jour le même rendez-vous au lieu d'en créer un second.
alter table public.appointments
  add column external_ref text unique check (char_length(external_ref) <= 200);

-- ------------------------------------------------------------------ Outlook (abonnement iCalendar)
-- Un lien secret par personne : https://<projet>.supabase.co/functions/v1/calendar-feed?t=<jeton>
-- Table séparée de profiles (que toute l'équipe peut lire) : chacun ne voit que SON jeton.
create table public.calendar_feeds (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy "mon lien d'abonnement" on public.calendar_feeds
  for select to authenticated using (user_id = (select auth.uid()) and public.is_active_user());
revoke insert, update, delete on public.calendar_feeds from authenticated;
revoke all on public.calendar_feeds from anon;

-- Renvoie le jeton de l'utilisateur connecté (créé au besoin) ; p_rotate = true en génère un nouveau
-- (l'ancien lien cesse aussitôt de fonctionner).
create function public.calendar_feed_token(p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_active_user() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_rotate then
    delete from public.calendar_feeds where user_id = (select auth.uid());
  end if;
  insert into public.calendar_feeds (user_id) values ((select auth.uid()))
  on conflict (user_id) do nothing;
  select token into v_token from public.calendar_feeds where user_id = (select auth.uid());
  return v_token;
end;
$$;
revoke execute on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- ------------------------------------------------------------------ Agent Dispatch Movers
-- Jeton de connexion de l'agent : seule son empreinte SHA-256 est conservée. L'administrateur le
-- génère dans Administration > Paramètres ; il n'est affiché qu'une fois.
create table public.integration_tokens (
  name        text primary key check (name in ('dispatch')),
  token_hash  text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);
alter table public.integration_tokens enable row level security;
-- Aucune politique : illisible depuis le navigateur, même pour l'admin (l'empreinte ne sert à rien côté client)
revoke all on public.integration_tokens from anon, authenticated;

create function public.rotate_integration_token(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 2 UUID v4 = 244 bits aléatoires ; fonctions natives de PostgreSQL (aucune extension requise)
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = '42501';
  end if;
  insert into public.integration_tokens (name, token_hash, created_by)
  values (p_name, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), (select auth.uid()))
  on conflict (name) do update
    set token_hash = excluded.token_hash, created_at = now(), created_by = excluded.created_by;
  return v_token;
end;
$$;
revoke execute on function public.rotate_integration_token(text) from public, anon;
grant execute on function public.rotate_integration_token(text) to authenticated;

-- L'administrateur voit seulement si un jeton existe et depuis quand
create function public.integration_token_info(p_name text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_admin() then (select created_at from public.integration_tokens where name = p_name) end;
$$;
revoke execute on function public.integration_token_info(text) from public, anon;
grant execute on function public.integration_token_info(text) to authenticated;
