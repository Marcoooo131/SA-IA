-- 1. Comptes : vérification de l'adresse email et jetons à usage unique (mot de passe oublié, vérification).
--    Comme user_session, ces tables sont au niveau du compte, pas d'une entreprise : pas de tenant_id ni de RLS
--    d'entreprise. Seul le hash du jeton est stocké ; le jeton lui-même ne transite que dans l'email.
ALTER TABLE app_user ADD COLUMN email_verified_at timestamptz;
-- Preuve de l'acceptation des CGV, CGU et du contrat de sous-traitance : date et version acceptées à l'inscription.
ALTER TABLE app_user ADD COLUMN terms_accepted_at timestamptz, ADD COLUMN terms_version text;

CREATE TABLE account_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('password_reset', 'email_verify')),
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_token_user ON account_token (user_id, kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON account_token TO venio_app;

-- 2. Offre unique (décision du 24/11/2026) : 39 € HT / mois ou 390 € HT / an, 100 crédits SMS inclus.
--    Une nouvelle offre plutôt qu'une modification de « pro » : un prix Stripe ne change pas de montant, et les
--    anciens abonnements de test gardent leur offre d'origine.
WITH p AS (
  INSERT INTO plan (code, name, monthly_cents, yearly_cents) VALUES ('unique', 'Offre unique', 3900, 39000)
  RETURNING id)
INSERT INTO plan_entitlement (plan_id, key, value)
SELECT p.id, e.key, e.value::jsonb FROM p, (VALUES
  ('feature.missed_calls', 'true'), ('limit.phone_lines', '1'), ('limit.sms_credits_per_month', '100'),
  ('limit.members', '1'), ('limit.bookings_per_month', 'null'), ('limit.flows', 'null')
) AS e(key, value);

UPDATE plan SET is_active = false, is_public = false WHERE code IN ('starter', 'pro', 'business');

-- Les espaces en essai (sans abonnement Stripe) passent sur l'offre unique.
UPDATE subscription SET plan_id = (SELECT id FROM plan WHERE code = 'unique'), updated_at = now()
WHERE stripe_subscription_id IS NULL AND plan_id IN (SELECT id FROM plan WHERE code IN ('starter', 'pro', 'business'));

-- 3. Promesses retirées : la messagerie client n'existe pas, l'ancienne clé de quota SMS n'est plus utilisée,
--    et une seule personne peut aujourd'hui accéder à un espace (pas encore d'invitations).
DELETE FROM plan_entitlement WHERE key IN ('feature.messaging', 'limit.sms_per_month');
UPDATE plan_entitlement SET value = '1'::jsonb WHERE key = 'limit.members';
