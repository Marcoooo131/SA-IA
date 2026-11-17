-- Venio — schéma initial (PostgreSQL 16).
-- Exécuté par le rôle propriétaire (migrations). L'application se connecte avec un rôle
-- membre de "venio_app" : ni propriétaire des tables, ni BYPASSRLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venio_app') THEN
    CREATE ROLE venio_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Contexte de requête positionné par l'API (SET LOCAL via set_config(..., true)).
CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION current_app_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION current_public_slug() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.public_slug', true), '') $$;

-- ---------------------------------------------------------------- Plateforme (sans RLS)
CREATE TABLE plan (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  monthly_cents integer NOT NULL CHECK (monthly_cents >= 0),
  yearly_cents  integer NOT NULL CHECK (yearly_cents >= 0),
  stripe_price_monthly text,
  stripe_price_yearly  text,
  is_public     boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_entitlement (
  plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  key     text NOT NULL,
  value   jsonb NOT NULL,
  PRIMARY KEY (plan_id, key)
);

CREATE TABLE app_user (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE NOT NULL,
  full_name         text NOT NULL,
  password_hash     text,
  is_platform_staff boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_login_at     timestamptz
);

CREATE TABLE user_session (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX user_session_user ON user_session (user_id);

-- File de tâches : uniquement des identifiants, aucune donnée personnelle.
CREATE TABLE job (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  kind        text NOT NULL,
  ref_id      uuid,
  run_at      timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','cancelled')),
  attempts    smallint NOT NULL DEFAULT 0,
  last_error  text,
  locked_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_due ON job (run_at) WHERE status = 'pending';

-- ---------------------------------------------------------------- Entreprises
CREATE TABLE tenant (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             citext UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,58})[a-z0-9]$'),
  name             text NOT NULL,
  vertical         text NOT NULL,
  timezone         text NOT NULL DEFAULT 'Europe/Paris',
  locale           text NOT NULL DEFAULT 'fr-FR',
  holidays_country text DEFAULT 'FR',
  branding         jsonb NOT NULL DEFAULT '{}',
  public_profile   jsonb NOT NULL DEFAULT '{}',
  settings         jsonb NOT NULL DEFAULT '{}',
  notification_email citext,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','read_only','suspended','pending_deletion')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE membership (
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE subscription (
  tenant_id              uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
  plan_id                uuid NOT NULL REFERENCES plan(id),
  billing_interval       text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year')),
  status                 text NOT NULL CHECK (status IN ('trialing','active','past_due','unpaid','canceled','incomplete')),
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text UNIQUE,
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_counter (
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  key       text NOT NULL,
  period    date NOT NULL,
  value     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, key, period)
);

-- ---------------------------------------------------------------- Catalogue & disponibilités
CREATE TABLE resource (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE availability_rule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  time NOT NULL,
  end_time    time NOT NULL CHECK (end_time > start_time)
);
CREATE INDEX availability_rule_resource ON availability_rule (resource_id);

CREATE TABLE time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES resource(id) ON DELETE CASCADE,
  time_range  tstzrange NOT NULL,
  reason      text
);

CREATE TABLE service (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  key               text NOT NULL,
  name              text NOT NULL,
  description       text,
  meeting_type      text NOT NULL CHECK (meeting_type IN ('on_site','at_location','video','phone')),
  duration_min      integer NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  buffer_before_min integer NOT NULL DEFAULT 0 CHECK (buffer_before_min BETWEEN 0 AND 240),
  buffer_after_min  integer NOT NULL DEFAULT 0 CHECK (buffer_after_min BETWEEN 0 AND 240),
  slot_interval_min integer NOT NULL DEFAULT 30 CHECK (slot_interval_min BETWEEN 5 AND 240),
  min_notice_min    integer NOT NULL DEFAULT 120 CHECK (min_notice_min >= 0),
  max_horizon_days  integer NOT NULL DEFAULT 60 CHECK (max_horizon_days BETWEEN 1 AND 365),
  price_display     text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE service_resource (
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, resource_id)
);

-- ---------------------------------------------------------------- Parcours
CREATE TABLE flow (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  template_code        text,
  is_default           boolean NOT NULL DEFAULT false,
  published_version_id uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX flow_one_default ON flow (tenant_id) WHERE is_default;

CREATE TABLE flow_version (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_id      uuid NOT NULL REFERENCES flow(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  definition   jsonb NOT NULL,
  published_at timestamptz,
  created_by   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);
ALTER TABLE flow ADD CONSTRAINT flow_published_version_fk
  FOREIGN KEY (published_version_id) REFERENCES flow_version(id) DEFERRABLE INITIALLY DEFERRED;

-- Une version publiée est immuable : les parcours commencés ne sont jamais perturbés.
CREATE OR REPLACE FUNCTION flow_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND NEW.definition IS DISTINCT FROM OLD.definition THEN
    RAISE EXCEPTION 'published flow_version % is immutable', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flow_version_immutable BEFORE UPDATE ON flow_version
  FOR EACH ROW EXECUTE FUNCTION flow_version_immutable();

-- ---------------------------------------------------------------- Clients, dossiers, réservations
CREATE TABLE contact (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  first_name        text NOT NULL,
  last_name         text,
  email             citext,
  phone             text,
  address           jsonb,
  preferred_channel text CHECK (preferred_channel IN ('email','sms','phone')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX contact_tenant_email ON contact (tenant_id, email);

CREATE TABLE case_file (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  service_id   uuid REFERENCES service(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'new'
               CHECK (status IN ('new','to_process','waiting','confirmed','to_recontact','postponed','cancelled','done','no_show')),
  assigned_to  uuid REFERENCES app_user(id) ON DELETE SET NULL,
  summary      text,
  answers      jsonb NOT NULL DEFAULT '[]',
  completeness smallint CHECK (completeness BETWEEN 0 AND 100),
  source       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_file_tenant_created ON case_file (tenant_id, created_at DESC);

CREATE TABLE intake_session (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_version_id   uuid NOT NULL REFERENCES flow_version(id),
  case_file_id      uuid REFERENCES case_file(id) ON DELETE SET NULL,
  resume_token_hash bytea UNIQUE NOT NULL,
  answers           jsonb NOT NULL DEFAULT '{}',
  current_step      text,
  source            jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','completed','abandoned','expired')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE TABLE file_object (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  intake_session_id uuid REFERENCES intake_session(id) ON DELETE SET NULL,
  case_file_id      uuid REFERENCES case_file(id) ON DELETE CASCADE,
  storage_key       text NOT NULL,
  original_name     text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  intake_session_id uuid REFERENCES intake_session(id) ON DELETE SET NULL,
  case_file_id      uuid REFERENCES case_file(id) ON DELETE SET NULL,
  service_id        uuid NOT NULL REFERENCES service(id),
  resource_id       uuid NOT NULL REFERENCES resource(id),
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  time_range        tstzrange NOT NULL,          -- rendez-vous + tampons : c'est ce qui bloque l'agenda
  status            text NOT NULL CHECK (status IN
                      ('held','expired','confirmed','cancelled','completed','no_show')),
  hold_expires_at   timestamptz,
  location          jsonb,
  cancelled_by      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CONSTRAINT booking_no_overlap EXCLUDE USING gist
    (resource_id WITH =, time_range WITH &&) WHERE (status IN ('held','confirmed'))
);
CREATE INDEX booking_tenant_start ON booking (tenant_id, starts_at);

CREATE TABLE booking_event (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  actor      text NOT NULL,
  action     text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  case_file_id uuid NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  purpose    text NOT NULL CHECK (purpose IN ('transactional','marketing','review_request')),
  granted    boolean NOT NULL,
  proof      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  booking_id      uuid REFERENCES booking(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contact(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('email','sms')),
  template_key    text NOT NULL,
  to_address      text NOT NULL,
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN
                    ('scheduled','sending','sent','logged','failed','cancelled','skipped')),
  provider        text,
  provider_msg_id text,
  cost_micros     bigint,
  attempts        smallint NOT NULL DEFAULT 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics_event (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  flow_version_id uuid,
  session_id      uuid,
  type            text NOT NULL CHECK (type IN ('page_view','flow_start','step_view','step_answer','slots_view','hold','booking')),
  step_key        text,
  props           jsonb NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_event_funnel ON analytics_event (tenant_id, type, occurred_at);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_kind    text NOT NULL,
  action        text NOT NULL,
  target        text,
  data          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription','usage_counter','resource','availability_rule','time_off','service',
    'service_resource','flow','flow_version','contact','case_file','intake_session','booking',
    'booking_event','note','file_object','consent','notification','analytics_event','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO venio_app', t);
  END LOOP;
END $$;

-- membership : visible par l'entreprise courante ou par l'utilisateur lui-même (choix d'espace à la connexion).
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON membership FOR SELECT
  USING (tenant_id = current_tenant() OR user_id = current_app_user());
CREATE POLICY membership_write ON membership FOR INSERT WITH CHECK (tenant_id = current_tenant());
CREATE POLICY membership_update ON membership FOR UPDATE USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());
CREATE POLICY membership_delete ON membership FOR DELETE USING (tenant_id = current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON membership TO venio_app;

-- tenant : sa propre ligne, ou la page publique demandée par slug, ou les espaces de l'utilisateur connecté.
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON tenant FOR SELECT USING (
  id = current_tenant()
  OR slug = current_public_slug()
  OR id IN (SELECT m.tenant_id FROM membership m WHERE m.user_id = current_app_user()));
CREATE POLICY tenant_insert ON tenant FOR INSERT WITH CHECK (id = current_tenant());
CREATE POLICY tenant_update ON tenant FOR UPDATE USING (id = current_tenant()) WITH CHECK (id = current_tenant());
GRANT SELECT, INSERT, UPDATE ON tenant TO venio_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_user, user_session, job TO venio_app;
GRANT SELECT ON plan, plan_entitlement TO venio_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO venio_app;

-- ---------------------------------------------------------------- Offres (modifiables sans code)
WITH p AS (
  INSERT INTO plan (code, name, monthly_cents, yearly_cents) VALUES
    ('starter', 'Starter', 2900, 28800),
    ('pro', 'Pro', 6900, 68400),
    ('business', 'Business', 14900, 148800)
  RETURNING id, code)
INSERT INTO plan_entitlement (plan_id, key, value)
SELECT p.id, e.key, e.value::jsonb FROM p JOIN (VALUES
  ('starter','limit.members','1'), ('starter','limit.bookings_per_month','100'), ('starter','limit.flows','2'),
  ('starter','limit.sms_per_month','0'), ('starter','feature.messaging','false'),
  ('pro','limit.members','5'), ('pro','limit.bookings_per_month','null'), ('pro','limit.flows','null'),
  ('pro','limit.sms_per_month','100'), ('pro','feature.messaging','true'),
  ('business','limit.members','15'), ('business','limit.bookings_per_month','null'), ('business','limit.flows','null'),
  ('business','limit.sms_per_month','400'), ('business','feature.messaging','true')
) AS e(code, key, value) ON e.code = p.code;
