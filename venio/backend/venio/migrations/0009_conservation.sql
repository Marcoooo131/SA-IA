-- Durées de conservation (politique de confidentialité, version du 24/11/2026), appliquées automatiquement chaque
-- jour par le worker. Fonction exécutée avec les droits du propriétaire : le rôle applicatif n'a pas le droit de
-- supprimer en dehors de l'entreprise courante, et la fonction ne fait que des suppressions bornées par l'âge.
-- Renvoie les clés des fichiers à effacer du stockage (le worker s'en charge).
CREATE OR REPLACE FUNCTION purge_retention() RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE stale uuid[];
BEGIN
  -- Prospects sans aucune activité depuis 3 ans (demande, rendez-vous) : suppression complète.
  SELECT coalesce(array_agg(c.id), '{}') INTO stale FROM contact c
  WHERE c.created_at < now() - interval '3 years'
    AND NOT EXISTS (SELECT 1 FROM case_file cf WHERE cf.contact_id = c.id AND cf.created_at > now() - interval '3 years')
    AND NOT EXISTS (SELECT 1 FROM case_file cf JOIN booking b ON b.case_file_id = cf.id
                    WHERE cf.contact_id = c.id AND b.starts_at > now() - interval '3 years');
  RETURN QUERY
    SELECT f.storage_key FROM file_object f
    WHERE f.case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale))
       OR f.intake_session_id IN (SELECT id FROM intake_session WHERE case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale)));
  DELETE FROM file_object f WHERE f.case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale))
     OR f.intake_session_id IN (SELECT id FROM intake_session WHERE case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale)));
  DELETE FROM booking WHERE case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale));
  DELETE FROM intake_session WHERE case_file_id IN (SELECT id FROM case_file WHERE contact_id = ANY (stale));
  DELETE FROM contact WHERE id = ANY (stale);

  -- Parcours abandonnés sans demande ni rendez-vous : 12 mois.
  RETURN QUERY SELECT f.storage_key FROM file_object f JOIN intake_session s ON s.id = f.intake_session_id
    WHERE s.case_file_id IS NULL AND s.started_at < now() - interval '12 months';
  DELETE FROM file_object f USING intake_session s
    WHERE s.id = f.intake_session_id AND s.case_file_id IS NULL AND s.started_at < now() - interval '12 months';
  DELETE FROM intake_session s WHERE s.case_file_id IS NULL AND s.started_at < now() - interval '12 months'
    AND NOT EXISTS (SELECT 1 FROM booking b WHERE b.intake_session_id = s.id);

  -- Journaux d'appels et de SMS : 12 mois ; événements bruts des opérateurs : 30 jours ; journal d'audit : 1 an.
  DELETE FROM call WHERE created_at < now() - interval '12 months';
  DELETE FROM telephony_event_raw WHERE received_at < now() - interval '30 days';
  DELETE FROM notification WHERE created_at < now() - interval '12 months' AND status <> 'scheduled';
  DELETE FROM audit_log WHERE created_at < now() - interval '1 year';
  DELETE FROM analytics_event WHERE occurred_at < now() - interval '3 years';

  -- Sessions et jetons expirés (aucune utilité une fois périmés).
  DELETE FROM user_session WHERE expires_at < now();
  DELETE FROM account_token WHERE expires_at < now() - interval '7 days';
END $$;
REVOKE ALL ON FUNCTION purge_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_retention() TO venio_app;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION purge_retention() FROM %I', r);
    END IF;
  END LOOP;
END $$;
