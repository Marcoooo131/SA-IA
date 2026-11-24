-- Durcissement issu de l'audit de sécurité du 24/11/2026.
-- Les fonctions de l'extension pg_net (requêtes HTTP sortantes depuis la base) ne doivent pas pouvoir être appelées
-- par les rôles anonymes de Supabase. Elles ne sont pas exposées par l'API publique, mais on retire le droit par
-- précaution. La tâche de maintien en éveil tourne avec le rôle propriétaire et n'est pas concernée.
DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM %I', r);
      END IF;
    END LOOP;
  END IF;
END $$;
