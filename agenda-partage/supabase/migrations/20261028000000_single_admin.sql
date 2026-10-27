-- =====================================================================================
-- Un seul administrateur, et aucun accès sans son accord
--
--   * l'équipe a exactement UN administrateur (le premier compte créé) : impossible d'en
--     nommer un second, même depuis l'application ;
--   * tout autre compte créé est « en attente » (inactif) : il ne voit rien tant que
--     l'administrateur ne l'a pas activé. Même si l'inscription libre était laissée ouverte
--     par erreur, un inconnu n'accéderait donc jamais à l'agenda.
-- =====================================================================================

create unique index profiles_single_admin on public.profiles ((true)) where role = 'admin';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_admin boolean;
begin
  select exists (select 1 from public.profiles where role = 'admin') into v_has_admin;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), 120),
    case when v_has_admin then 'collaborator'::public.app_role else 'admin'::public.app_role end,
    -- Le premier compte (l'administrateur) est actif ; les suivants attendent sa validation
    not v_has_admin
  );
  perform public.bump_sync('profiles');
  return new;
end;
$$;
