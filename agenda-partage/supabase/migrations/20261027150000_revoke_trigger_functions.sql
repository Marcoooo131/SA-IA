-- Les fonctions de déclencheurs ne sont pas des API : on retire le droit de les appeler
-- (avertissement « SECURITY DEFINER executable » du conseiller de sécurité Supabase).
-- Les fonctions d'autorisation (is_admin, can_*…) restent exécutables : les règles RLS les appellent.
revoke execute on function
  public.handle_new_user(),
  public.sync_profile_email(),
  public.guard_profile_update(),
  public.profiles_after_change(),
  public.appointments_before_write(),
  public.appointments_after_write(),
  public.comments_before_write(),
  public.comments_after_insert(),
  public.attachments_before_insert(),
  public.attachments_after_write(),
  public.categories_after_change(),
  public.settings_before_update(),
  public.settings_after_change()
from public, anon, authenticated;
