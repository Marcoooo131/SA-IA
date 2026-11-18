-- Abonnements Stripe (module C, voir plateforme-rdv/05-extension-acquisition.md §C).

-- Journal des événements Stripe reçus : un événement n'est traité qu'une fois (Stripe peut le renvoyer).
-- Table plateforme : lue avant de savoir à quelle entreprise l'événement se rapporte ; aucune donnée personnelle.
CREATE TABLE stripe_event (
  id           text PRIMARY KEY,              -- evt_…
  type         text NOT NULL,
  tenant_id    uuid REFERENCES tenant(id) ON DELETE SET NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error        text
);
ALTER TABLE stripe_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_app ON stripe_event TO venio_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON stripe_event TO venio_app;

-- Suivi des impayés (délai de grâce) et du prix Stripe en cours.
ALTER TABLE subscription ADD COLUMN past_due_since timestamptz;
ALTER TABLE subscription ADD COLUMN stripe_price_id text;

-- Packs de crédits SMS achetés (historique) ; le solde disponible est dans usage_counter
-- (clé 'sms_credits_extra', période fixe 2000-01-01 : ces crédits n'expirent pas).
CREATE TABLE sms_credit_grant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  credits     integer NOT NULL CHECK (credits > 0),
  source      text NOT NULL,                  -- 'stripe_pack', 'geste_commercial'…
  stripe_ref  text UNIQUE,                    -- session Checkout : un paiement ne crédite qu'une fois
  amount_cents integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sms_credit_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_credit_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sms_credit_grant USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_credit_grant TO venio_app;

-- Part d'un SMS prélevée sur les crédits achetés (le reste vient du forfait mensuel), pour la rendre si rien ne part.
ALTER TABLE notification ADD COLUMN extra_segments smallint;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON stripe_event, sms_credit_grant FROM %I', r);
    END IF;
  END LOOP;
END $$;
