-- Chemin de recherche figé pour les fonctions (recommandation de sécurité Supabase).
ALTER FUNCTION current_tenant() SET search_path = pg_catalog;
ALTER FUNCTION current_app_user() SET search_path = pg_catalog;
ALTER FUNCTION current_public_slug() SET search_path = pg_catalog;
ALTER FUNCTION flow_version_immutable() SET search_path = pg_catalog;
