-- =============================================================================
-- Schéma de travail (Phase 1 — conception). PostgreSQL 16.
-- Objectif : valider le modèle de données, l'isolation multi-tenant (RLS) et
-- l'anti-double réservation AVANT d'écrire l'application. Sera converti en
-- migrations Alembic en Phase 3.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Rôle applicatif : ni propriétaire des tables, ni BYPASSRLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Tenant courant, positionné par l'API au début de chaque transaction :
--   SET LOCAL app.tenant_id = '…';
-- Renvoie NULL si absent → les politiques RLS ne laissent passer aucune ligne.
CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- -----------------------------------------------------------------------------
-- Plateforme (hors RLS tenant : gérées par l'API plateforme / back-office)
-- -----------------------------------------------------------------------------
CREATE TABLE plan (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,            -- starter | pro | business
  name             text NOT NULL,
  monthly_cents    integer NOT NULL CHECK (monthly_cents >= 0),
  yearly_cents     integer NOT NULL CHECK (yearly_cents >= 0),
  stripe_price_monthly text,
  stripe_price_yearly  text,
  is_public        boolean NOT NULL DEFAULT true,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_entitlement (
  plan_id  uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  key      text NOT NULL,                           -- feature.sms, limit.members…
  value    jsonb NOT NULL,                          -- true / 5 / null (= illimité)
  PRIMARY KEY (plan_id, key)
);

CREATE TABLE app_user (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext UNIQUE NOT NULL,
  full_name      text,
  password_hash  text,                              -- Argon2id ; NULL si lien magique / OAuth
  totp_secret_enc bytea,                            -- chiffré applicativement
  is_platform_staff boolean NOT NULL DEFAULT false, -- notre équipe (accès back-office)
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE tenant (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          citext UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]{3,60}$'),
  name          text NOT NULL,
  vertical      text NOT NULL,                      -- renovation, demenagement…
  timezone      text NOT NULL DEFAULT 'Europe/Paris',
  locale        text NOT NULL DEFAULT 'fr-FR',
  branding      jsonb NOT NULL DEFAULT '{}',        -- logo, couleurs, police
  custom_domain citext UNIQUE,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','read_only','suspended','pending_deletion')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE membership (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE subscription (
  tenant_id            uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
  plan_id              uuid NOT NULL REFERENCES plan(id),
  billing_interval     text NOT NULL CHECK (billing_interval IN ('month','year')),
  status               text NOT NULL CHECK (status IN
                         ('trialing','active','past_due','unpaid','canceled','incomplete')),
  stripe_customer_id   text UNIQUE,
  stripe_subscription_id text UNIQUE,
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_entitlement_override (
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  key       text NOT NULL,
  value     jsonb NOT NULL,
  reason    text NOT NULL,
  expires_at timestamptz,
  PRIMARY KEY (tenant_id, key)
);

-- Idempotence des webhooks Stripe : un événement n'est appliqué qu'une fois.
CREATE TABLE stripe_event (
  id           text PRIMARY KEY,                    -- evt_…
  type         text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Tables métier (toutes : tenant_id NOT NULL + RLS)
-- -----------------------------------------------------------------------------
CREATE TABLE usage_counter (
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  key       text NOT NULL,                          -- bookings, sms, storage_mb
  period    date NOT NULL,                          -- 1er jour du mois
  value     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, key, period)
);

CREATE TABLE location (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name      text NOT NULL,
  address   text,
  lat       double precision,
  lng       double precision
);

CREATE TABLE service_area (                         -- zone d'intervention
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  location_id uuid REFERENCES location(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('radius_km','postal_codes')),
  config    jsonb NOT NULL                          -- {"km":30} | {"codes":["75","92"]}
);

CREATE TABLE resource (                              -- collaborateur, équipe, salle
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  location_id uuid REFERENCES location(id) ON DELETE SET NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id)
);

CREATE TABLE availability_rule (                     -- horaires récurrents
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  time NOT NULL,
  end_time    time NOT NULL CHECK (end_time > start_time),
  valid_from  date,
  valid_to    date
);

CREATE TABLE time_off (                              -- congés, absences, blocages manuels
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES resource(id) ON DELETE CASCADE, -- NULL = toute l'entreprise
  time_range  tstzrange NOT NULL,
  reason      text
);

CREATE TABLE service (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  meeting_type     text NOT NULL CHECK (meeting_type IN ('on_site','at_location','video','phone')),
  duration_min     integer NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  buffer_before_min integer NOT NULL DEFAULT 0,
  buffer_after_min integer NOT NULL DEFAULT 0,
  min_notice_min   integer NOT NULL DEFAULT 120,     -- délai minimum
  max_horizon_days integer NOT NULL DEFAULT 60,      -- délai maximum
  price_display    text,                             -- texte saisi par l'entreprise, jamais inventé
  is_active        boolean NOT NULL DEFAULT true
);

CREATE TABLE service_resource (
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, resource_id)
);

-- Parcours : définition JSON versionnée et immuable une fois publiée.
CREATE TABLE flow (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name        text NOT NULL,
  template_code text,                               -- modèle métier d'origine
  published_version_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE flow_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_id     uuid NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  definition  jsonb NOT NULL,                       -- étapes, questions, conditions (schéma Pydantic)
  published_at timestamptz,                         -- non NULL ⇒ immuable (trigger en Phase 3)
  created_by  uuid REFERENCES app_user(id),
  UNIQUE (flow_id, version)
);
ALTER TABLE flow ADD CONSTRAINT flow_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES flow_version(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE contact (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  first_name  text,
  last_name   text,
  email       citext,
  phone_e164  text,
  address     jsonb,                                -- normalisée + géocodée
  preferred_channel text CHECK (preferred_channel IN ('email','sms','phone')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX contact_tenant_email ON contact (tenant_id, email);

CREATE TABLE case_file (                             -- dossier : point central de la relation
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  service_id    uuid REFERENCES service(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'new',        -- statuts personnalisables (référentiel par tenant en Phase 4)
  assigned_to   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  summary       text,                               -- résumé (IA ou manuel), toujours à côté des réponses brutes
  extracted     jsonb NOT NULL DEFAULT '{}',        -- surface, budget, délai… normalisés
  completeness  smallint CHECK (completeness BETWEEN 0 AND 100),
  source        jsonb NOT NULL DEFAULT '{}',        -- canal, UTM, appareil
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE intake_session (                        -- parcours en cours / terminé
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_version_id uuid NOT NULL REFERENCES flow_version(id),
  case_file_id    uuid REFERENCES case_file(id) ON DELETE SET NULL,
  resume_token_hash bytea UNIQUE NOT NULL,          -- seul le hash est stocké
  answers         jsonb NOT NULL DEFAULT '{}',
  current_step    text,
  status          text NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','completed','abandoned','expired')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE TABLE booking (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  case_file_id  uuid REFERENCES case_file(id) ON DELETE SET NULL,
  service_id    uuid NOT NULL REFERENCES service(id),
  resource_id   uuid NOT NULL REFERENCES resource(id),
  time_range    tstzrange NOT NULL,                 -- inclut les tampons avant/après
  status        text NOT NULL CHECK (status IN
                  ('held','confirmed','cancelled','completed','no_show','rescheduled')),
  hold_expires_at timestamptz,
  manage_token_hash bytea UNIQUE,                   -- lien de gestion client
  idempotency_key text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  -- Anti-double réservation garanti par la base, même sous forte concurrence.
  CONSTRAINT booking_no_overlap EXCLUDE USING gist
    (resource_id WITH =, time_range WITH &&)
    WHERE (status IN ('held','confirmed'))
);

CREATE TABLE booking_event (                         -- historique des modifications
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  booking_id  uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  actor       text NOT NULL,                        -- user:<id> | client | system
  action      text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  case_file_id uuid NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_object (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  case_file_id uuid REFERENCES case_file(id) ON DELETE CASCADE,
  storage_key text NOT NULL,                        -- jamais d'URL publique permanente
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  annotations jsonb,                                -- zones entourées sur la photo
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  case_file_id uuid NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  client_token_hash bytea UNIQUE NOT NULL,
  channel      text NOT NULL DEFAULT 'web'          -- web | whatsapp (plus tard)
);

CREATE TABLE message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  sender          text NOT NULL CHECK (sender IN ('client','staff','system')),
  sender_user_id  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  body            text,
  file_ids        uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);

CREATE TABLE consent (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  purpose     text NOT NULL CHECK (purpose IN ('transactional','marketing','review_request')),
  granted     boolean NOT NULL,
  proof       jsonb NOT NULL,                       -- texte affiché, horodatage, IP tronquée
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES booking(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES contact(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email','sms','internal')),
  template_key text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'scheduled' CHECK (status IN
                 ('scheduled','sending','sent','delivered','failed','cancelled','skipped_no_consent')),
  provider     text,
  provider_msg_id text,
  cost_micros  bigint,                              -- coût réel remonté par le fournisseur
  attempts     smallint NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_due ON notification (scheduled_for) WHERE status = 'scheduled';

CREATE TABLE automation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name       text NOT NULL,
  trigger    text NOT NULL,                         -- booking.confirmed, booking.completed…
  offset_min integer NOT NULL,                      -- négatif = avant le RDV
  action     jsonb NOT NULL,                        -- {"channel":"sms","template":"reminder_j1"}
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE calendar_connection (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id  uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('google','microsoft')),
  tokens_enc   bytea NOT NULL,                      -- chiffré (clé hors base)
  sync_state   jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE external_busy (                         -- occupations importées
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  time_range  tstzrange NOT NULL,
  source_id   text NOT NULL,
  PRIMARY KEY (resource_id, source_id)
);

CREATE TABLE analytics_event (                       -- partitionnement mensuel en Phase 3
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_version_id uuid,
  session_id  uuid,                                 -- intake_session, sans donnée personnelle
  type        text NOT NULL,                        -- page_view, flow_start, step_view, step_answer, abandon, booking
  step_key    text,
  props       jsonb NOT NULL DEFAULT '{}',          -- appareil, canal, durée
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_event_funnel ON analytics_event (tenant_id, flow_version_id, type, occurred_at);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid REFERENCES tenant(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_kind  text NOT NULL,                        -- user | staff | system | client
  action      text NOT NULL,
  target      text,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_access_grant (                  -- accès support consenti, limité, journalisé
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES app_user(id),
  granted_by  uuid NOT NULL REFERENCES app_user(id),
  reason      text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- RLS : une seule politique uniforme sur toutes les tables portant tenant_id.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usage_counter','location','service_area','resource','availability_rule','time_off',
    'service','service_resource','flow','flow_version','contact','case_file','intake_session',
    'booking','booking_event','note','file_object','conversation','message','consent',
    'notification','automation','calendar_connection','external_busy','analytics_event',
    'audit_log','support_access_grant','membership','subscription','tenant_entitlement_override'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_tenant())
         WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rw', t);
  END LOOP;
END $$;

-- La table tenant elle-même : un tenant ne voit que sa propre ligne.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenant USING (id = current_tenant());
GRANT SELECT, UPDATE ON tenant TO app_rw;
GRANT SELECT ON plan, plan_entitlement TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rw;
-- app_user, stripe_event, création de tenant : gérés par un rôle "platform" distinct (Phase 3).
