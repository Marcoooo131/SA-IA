-- Récupération des appels manqués (module A, voir plateforme-rdv/05-extension-acquisition.md §A).
-- Indépendant du fournisseur de téléphonie : les événements bruts sont traduits en événements normalisés,
-- puis un appel passe par une machine d'états et un moteur de règles avant tout SMS.

-- ---------------------------------------------------------------- Lignes suivies
CREATE TABLE telephony_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  label           text NOT NULL,
  business_number text,                       -- numéro de l'entreprise (E.164), exclu des envois (anti-boucle)
  mode            text NOT NULL CHECK (mode IN ('forward_no_answer','hosted','pbx','simulator')),
  provider        text NOT NULL,              -- 'simulator', puis 'twilio', 'telnyx', 'aircall'…
  provider_number text,                       -- numéro Venio chez le fournisseur (modes 1 et 2)
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  last_event_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telephony_line_tenant ON telephony_line (tenant_id);

-- Table plateforme (sans donnée personnelle) : retrouve la ligne d'un webhook à partir du jeton secret de son URL,
-- avant de connaître l'entreprise. Même principe que la table job.
CREATE TABLE telephony_endpoint (
  token_hash bytea PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  line_id    uuid NOT NULL UNIQUE REFERENCES telephony_line(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Événements et appels
CREATE TABLE telephony_event_raw (
  id                bigserial PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  line_id           uuid NOT NULL REFERENCES telephony_line(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  provider_event_id text NOT NULL,
  payload           jsonb NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_event_id)   -- un webhook rejoué n'est traité qu'une fois
);

CREATE TABLE call (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  line_id          uuid NOT NULL REFERENCES telephony_line(id) ON DELETE CASCADE,
  provider         text NOT NULL,
  provider_call_id text NOT NULL,
  from_number      text,                      -- E.164, NULL si masqué
  from_raw         text,                      -- valeur reçue (diagnostic)
  to_number        text,
  outcome          text NOT NULL DEFAULT 'pending'
                   CHECK (outcome IN ('pending','answered','transferred','missed','abandoned')),
  started_at       timestamptz NOT NULL,
  answered_at      timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_call_id)
);
CREATE INDEX call_tenant_started ON call (tenant_id, started_at DESC);
CREATE INDEX call_tenant_from ON call (tenant_id, from_number, started_at DESC);

-- Textes des messages pré-rendus (SMS de récupération) : pas de modèle de rendez-vous associé.
ALTER TABLE notification ADD COLUMN body text;
ALTER TABLE notification ADD COLUMN segments smallint;

CREATE TABLE missed_call_recovery (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  call_id         uuid NOT NULL UNIQUE REFERENCES call(id) ON DELETE CASCADE,  -- une seule décision par appel
  from_number     text,
  decision        text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','sent','not_sent')),
  reason          text,                       -- code de la règle qui a décidé (voir telephony/rules.py)
  notification_id uuid REFERENCES notification(id) ON DELETE SET NULL,
  link_code       text UNIQUE,
  credits         smallint,                   -- crédits SMS réservés (segments)
  decided_at      timestamptz,
  clicked_at      timestamptz,
  click_count     integer NOT NULL DEFAULT 0,
  session_id      uuid REFERENCES intake_session(id) ON DELETE SET NULL,
  form_started_at timestamptz,
  booking_id      uuid REFERENCES booking(id) ON DELETE SET NULL,
  booked_at       timestamptz,
  handled_at      timestamptz,                -- « marqué comme traité » par l'entreprise
  handled_by      uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX missed_call_recovery_number ON missed_call_recovery (tenant_id, from_number, decided_at DESC);

-- Table plateforme : un lien court /c/<code> retrouve l'entreprise sans exposer de donnée personnelle.
CREATE TABLE recovery_link (
  code        text PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  recovery_id uuid NOT NULL REFERENCES missed_call_recovery(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Réglages, exclusions, oppositions
CREATE TABLE missed_call_settings (
  tenant_id  uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  config     jsonb NOT NULL DEFAULT '{}',     -- validé côté serveur (modules/missed_calls.py)
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE phone_exclusion (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  number     text NOT NULL,                   -- E.164
  kind       text NOT NULL DEFAULT 'excluded' CHECK (kind IN ('excluded','opt_out')),
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, number)
);

-- ---------------------------------------------------------------- Sécurité
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['telephony_line','telephony_event_raw','call','missed_call_recovery',
                           'missed_call_settings','phone_exclusion'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO venio_app', t);
  END LOOP;
END $$;

ALTER TABLE telephony_endpoint ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON telephony_endpoint TO venio_app USING (true) WITH CHECK (true);
ALTER TABLE recovery_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON recovery_link TO venio_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON telephony_endpoint, recovery_link TO venio_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO venio_app;

-- Même durcissement que 0002 pour les rôles exposés par Supabase (aucun accès).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON telephony_line, telephony_endpoint, telephony_event_raw, call, missed_call_recovery, recovery_link, missed_call_settings, phone_exclusion FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- Droits par offre (05 « Offres et limites »)
INSERT INTO plan_entitlement (plan_id, key, value)
SELECT p.id, e.key, e.value::jsonb FROM plan p JOIN (VALUES
  ('starter','feature.missed_calls','true'), ('starter','limit.phone_lines','1'), ('starter','limit.sms_credits_per_month','50'),
  ('pro','feature.missed_calls','true'), ('pro','limit.phone_lines','1'), ('pro','limit.sms_credits_per_month','200'),
  ('business','feature.missed_calls','true'), ('business','limit.phone_lines','3'), ('business','limit.sms_credits_per_month','600')
) AS e(code, key, value) ON e.code = p.code
ON CONFLICT (plan_id, key) DO UPDATE SET value = EXCLUDED.value;
