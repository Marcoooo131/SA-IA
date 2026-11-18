-- Durcissement des tables plateforme et compatibilité Supabase.
-- Supabase expose le schéma public via une API REST aux rôles anon/authenticated.
-- Venio n'utilise pas cette API : on retire tous leurs droits, et la RLS est activée partout.

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Tables plateforme : accessibles uniquement au rôle applicatif (jamais à un autre rôle).
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON app_user TO venio_app USING (true) WITH CHECK (true);
ALTER TABLE user_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON user_session TO venio_app USING (true) WITH CHECK (true);
ALTER TABLE job ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON job TO venio_app USING (true) WITH CHECK (true);
ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_read ON plan FOR SELECT TO venio_app USING (true);
ALTER TABLE plan_entitlement ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_read ON plan_entitlement FOR SELECT TO venio_app USING (true);
ALTER TABLE schema_migration ENABLE ROW LEVEL SECURITY;  -- aucun accès hors propriétaire
