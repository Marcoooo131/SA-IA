# 16 — Les 14 scénarios critiques (étape 8.1) — état au 24/11/2026

> Chaque scénario est relié aux tests automatiques qui le vérifient (`venio/backend/tests`, 125 tests, tous au vert au
> 24/11/2026) et, quand il le faut, à un test manuel en conditions réelles. **Automatisé** = vérifié à chaque
> modification du code. **Réel** = à faire à la main avec de vrais comptes, de vrais téléphones ou de vrais paiements.

| # | Scénario | Tests automatiques | En conditions réelles | État |
|---|---|---|---|---|
| 1 | Une entreprise crée son compte | `test_login_logout_and_errors`, `test_signup_sends_verification…`, `test_terms_acceptance_is_recorded` | Inscription sur le site en ligne + réception de l'email de vérification | Automatisé ✅ · Réel : **email à vérifier par vous** |
| 2 | Une entreprise souscrit un abonnement | `test_checkout_keeps_trial…`, `test_webhook_activates_subscription_idempotently`, `test_catalog_created_automatically_once` | Paiement Stripe **mode test** avec la carte 4242 4242 4242 4242 | Automatisé ✅ · Réel : **non fait** (sans objet pour des pilotes gratuits) |
| 3 | Un prospect appelle sans obtenir de réponse | `test_missed_call_to_booking_full_journey`, `test_webhook_signature_idempotency_and_out_of_order`, `test_simultaneous_calls_same_number_send_one_sms` | Renvoi d'appel depuis une vraie ligne | Automatisé ✅ (simulateur) · Réel : **bloqué par le choix de l'opérateur (étape 3.5)** |
| 4 | Envoi automatique d'un SMS | `test_not_sent_reasons`, `test_each_rule`, `test_real_line_uses_brevo_sms_when_explicitly_enabled`, `test_sms_never_sent_when_paid_sending_disabled` | 5 SMS × 5 opérateurs | Automatisé ✅ · Réel : **bloqué (étape 3.5)** |
| 5 | Réservation d'un rendez-vous | `test_full_public_journey`, `test_simultaneous_holds_single_winner`, `test_overlapping_slots_with_buffers_never_double_book` | Réservation réelle faite le 18/11/2026 | ✅ |
| 6 | Envoi des confirmations | `test_full_public_journey` (modèles de messages), emails Brevo | Email de confirmation reçu en production le 18/11/2026 | ✅ |
| 7 | Rappels automatiques | `test_full_public_journey` (rappel J-1 programmé), worker | Rappel J-1 reçu | Automatisé ✅ · Réel : **à observer pendant le pilote** |
| 8 | Annulation | `test_full_public_journey` (annulation par le client via le lien signé), `test_business_can_reschedule_and_mark_no_show` | Annulation par le client depuis l'email | Automatisé ✅ · Réel : à faire |
| 9 | Changement de rendez-vous | `test_full_public_journey` (report par le client), `test_business_can_reschedule_and_mark_no_show` (report par l'entreprise) | Report par le client depuis l'email | Automatisé ✅ · Réel : à faire |
| 10 | Paiement refusé | `test_past_due_grace_then_public_bookings_suspended`, `test_access_states` | Carte de test refusée (4000 0000 0000 0341) | Automatisé ✅ · Réel : non fait (pas de paiement pendant les pilotes) |
| 11 | Abonnement résilié | `test_webhook_activates_subscription_idempotently` (résiliation), `test_trial_expired_without_subscription` | Résiliation depuis le portail Stripe de test | Automatisé ✅ · Réel : non fait |
| 12 | Dépassement de quota | `test_quota_exhausted`, `test_sms_pack_credited_once_and_used_after_monthly_allowance` | — | ✅ |
| 13 | Tentative d'accès aux données d'une autre entreprise | `test_api_isolation_between_tenants`, `test_database_rls`, `test_every_tenant_table_has_rls`, `test_every_tenant_table_is_isolated`, `test_isolation_between_companies`, `test_delete_contact_erases_everything` (suppression croisée refusée) | Test d'intrusion (palier 2) | Automatisé ✅ |
| 14 | Panne d'un fournisseur externe | `test_sms_does_not_fall_back_to_email_when_enabled` (SMS en échec), `account_mail` (email en échec sans erreur pour l'utilisateur), sauvegarde/restauration (`test_snapshot_then_full_restore`) | Exercice de restauration (document 12) | Partiel : pas de test de coupure de la base ni de l'hébergeur |

## Ce qu'il reste à faire en conditions réelles avant les pilotes

1. **Vous** : faire « Mot de passe oublié » avec votre adresse et confirmer la réception (scénario 1).
2. **Vous** : une réservation complète sur votre téléphone, puis annulation et report depuis l'email (8, 9).
3. **Pendant le pilote** : vérifier qu'un rappel J-1 arrive bien (7).
4. **Après le choix de l'opérateur** : scénarios 3 et 4 sur 5 opérateurs mobiles.
