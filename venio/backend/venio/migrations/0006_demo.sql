-- Démonstration interactive (05 §B.3) : chaque visiteur reçoit un espace de démonstration jetable.
-- Données fictives, aucun envoi réel (emails et SMS bloqués côté serveur pour ces espaces), suppression automatique.

ALTER TABLE tenant ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX tenant_demo_created ON tenant (created_at) WHERE is_demo;

-- Suppression des espaces de démonstration expirés. Exécutée avec les droits du propriétaire (le rôle applicatif
-- n'a pas le droit de supprimer une entreprise), et limitée par construction aux espaces marqués is_demo.
-- La table tenant force la RLS, même pour son propriétaire : seule une entreprise de démonstration,
-- désignée explicitement dans le contexte de la transaction, peut être supprimée.
CREATE POLICY tenant_demo_purge ON tenant FOR DELETE USING (is_demo AND id = current_tenant());

CREATE OR REPLACE FUNCTION purge_demo_tenants(max_age interval DEFAULT interval '2 hours') RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE n integer := 0; t uuid; done integer;
BEGIN
  FOR t IN SELECT id FROM tenant WHERE is_demo AND created_at < now() - max_age LOOP
    PERFORM set_config('app.tenant_id', t::text, true);
    DELETE FROM job WHERE tenant_id = t;
    DELETE FROM user_session WHERE tenant_id = t;
    DELETE FROM tenant WHERE id = t AND is_demo;
    GET DIAGNOSTICS done = ROW_COUNT;
    n := n + done;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
  -- Comptes de démonstration devenus orphelins (adresse réservée, jamais utilisée par un vrai compte).
  DELETE FROM app_user u WHERE u.email LIKE '%@demo.venio.invalid'
    AND NOT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = u.id);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION purge_demo_tenants(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_demo_tenants(interval) TO venio_app;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION purge_demo_tenants(interval) FROM %I', r);
    END IF;
  END LOOP;
END $$;
