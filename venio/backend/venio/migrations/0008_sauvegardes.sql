-- Sauvegardes du palier 0 (gratuit) : un instantané quotidien de toutes les tables, conservé 7 jours, dans un
-- schéma « backup » inaccessible à l'application (rôle venio_app) et non exposé par l'API de Supabase.
-- Protège contre les erreurs logiques (suppression accidentelle, migration ou bogue qui abîme des données).
-- Ne protège PAS contre la perte du projet Supabase lui-même : copie externe au palier 1 (offre payante).
-- Procédure de restauration : plateforme-rdv/12-sauvegardes.md.

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC;

CREATE TABLE backup.snapshot (
  label       text PRIMARY KEY,                -- s20261124_021700_123456
  taken_at    timestamptz NOT NULL DEFAULT now(),
  tables      integer NOT NULL,
  total_rows  bigint NOT NULL
);

-- Tables jamais sauvegardées ni restaurées : le journal des migrations (sinon une restauration ferait « revenir »
-- le schéma en arrière), les sessions et les jetons de connexion (une restauration déconnecte tout le monde).
CREATE OR REPLACE FUNCTION backup.excluded(name text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT name IN ('schema_migration', 'user_session', 'account_token') $$;

CREATE OR REPLACE FUNCTION backup.drop_snapshot(lbl text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'backup' AND c.relkind = 'r' AND c.relname LIKE lbl || '\_\_%' LOOP
    EXECUTE format('DROP TABLE backup.%I', t.relname);
  END LOOP;
  DELETE FROM backup.snapshot WHERE label = lbl;
END $$;

CREATE OR REPLACE FUNCTION backup.take_snapshot(keep_days integer DEFAULT 7) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  lbl text := 's' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD_HH24MISS_US');
  t record; n bigint; total bigint := 0; cnt integer := 0; old record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
           WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT backup.excluded(c.relname) ORDER BY c.oid LOOP
    EXECUTE format('CREATE TABLE backup.%I AS SELECT * FROM public.%I', lbl || '__' || t.relname, t.relname);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n; cnt := cnt + 1;
  END LOOP;
  INSERT INTO backup.snapshot (label, tables, total_rows) VALUES (lbl, cnt, total);
  -- Rotation : au-delà de keep_days, ou 3 jours seulement si la base approche la limite de l'offre gratuite (500 Mo).
  IF pg_database_size(current_database()) > 400 * 1024 * 1024 THEN keep_days := least(keep_days, 3); END IF;
  FOR old IN SELECT label FROM backup.snapshot WHERE taken_at < now() - make_interval(days => keep_days) LOOP
    PERFORM backup.drop_snapshot(old.label);
  END LOOP;
  RETURN lbl;
END $$;

-- Restauration complète d'un instantané, en une seule transaction (tout ou rien). Les colonnes ajoutées depuis
-- l'instantané prennent leur valeur par défaut. Les tables sont réinsérées en plusieurs passes pour respecter les
-- clés étrangères, quel que soit leur ordre.
CREATE OR REPLACE FUNCTION backup.restore_snapshot(lbl text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  tabs text[]; pending text[]; t text; cols text; n bigint; total bigint := 0; progress boolean; seq record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM backup.snapshot WHERE label = lbl) THEN
    RAISE EXCEPTION 'Instantané inconnu : %', lbl;
  END IF;
  SET CONSTRAINTS ALL DEFERRED;
  SELECT array_agg(substr(c.relname, length(lbl) + 3) ORDER BY c.oid) INTO tabs
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'backup' AND c.relkind = 'r' AND c.relname LIKE lbl || '\_\_%';
  -- On vide toutes les tables couvertes par l'instantané (et, par cascade, sessions et jetons).
  EXECUTE (SELECT 'TRUNCATE ' || string_agg(format('public.%I', x), ', ') || ' CASCADE'
           FROM unnest(tabs) x WHERE to_regclass(format('public.%I', x)) IS NOT NULL);
  pending := tabs;
  WHILE array_length(pending, 1) > 0 LOOP
    progress := false;
    FOREACH t IN ARRAY pending LOOP
      IF to_regclass(format('public.%I', t)) IS NULL THEN   -- table supprimée depuis : ignorée
        pending := array_remove(pending, t); progress := true; CONTINUE;
      END IF;
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a
      WHERE a.attrelid = format('backup.%I', lbl || '__' || t)::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND EXISTS (SELECT 1 FROM pg_attribute b WHERE b.attrelid = format('public.%I', t)::regclass
                    AND b.attname = a.attname AND b.attnum > 0 AND NOT b.attisdropped);
      BEGIN
        EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM backup.%I', t, cols, cols, lbl || '__' || t);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n; pending := array_remove(pending, t); progress := true;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;   -- une table dont elle dépend n'est pas encore réinsérée : nouvelle passe
      END;
    END LOOP;
    IF NOT progress THEN RAISE EXCEPTION 'Restauration impossible (dépendances) pour : %', pending; END IF;
  END LOOP;
  -- Compteurs automatiques remis après la plus grande valeur restaurée.
  FOR seq IN SELECT c.relname AS tab, a.attname AS col, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS s
             FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid
             WHERE ns.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0
               AND pg_get_serial_sequence(format('public.%I', c.relname), a.attname) IS NOT NULL LOOP
    EXECUTE format('SELECT setval(%L, coalesce((SELECT max(%I) FROM public.%I), 0) + 1, false)', seq.s, seq.col, seq.tab);
  END LOOP;
  RETURN total;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA backup FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['venio_app', 'anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA backup FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA backup FROM %I', r);
    END IF;
  END LOOP;
  -- Planification quotidienne (2 h 17 UTC) là où pg_cron est disponible (Supabase) ; ailleurs, rien.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('venio-sauvegarde-quotidienne', '17 2 * * *', 'SELECT backup.take_snapshot(7)');
  END IF;
END $$;
