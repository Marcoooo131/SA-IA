# 07 — Préparation du lancement commercial (étape 8)

> Statut au 18/11/2026 : **préparé, non lancé.** Le produit fonctionne en ligne en mode test (aucun envoi payant, Stripe en mode test). Le lancement payant demande des décisions et des validations extérieures listées ci-dessous. Rien de cette liste ne peut être coché par le code seul.

Légende : ✅ fait · 🟡 prêt côté produit, action de votre part · ⛔ bloquant, pas commencé

## 1. Produit

| | Point | État |
|---|---|---|
| ✅ | Réservation en ligne de bout en bout, emails réels (Brevo) | Vérifié en production |
| ✅ | Vitrine (accueil, fonctionnalités, secteurs, tarifs, démo, ressources, FAQ, pages légales), sitemap, robots | En ligne |
| ✅ | Démonstration interactive isolée, aucun envoi possible, purge automatique sous 2 h | En ligne, testée |
| ✅ | Accessibilité : 0 violation axe (WCAG 2.1 AA) sur la vitrine, la démo et l'espace entreprise | Vérifié |
| 🟡 | Paiement Stripe **en mode test** vérifié de bout en bout (carte `4242 4242 4242 4242`) | À faire par vous : un paiement test depuis Abonnement |
| ⛔ | Fournisseur de téléphonie choisi et branché (étape 3) | Décision attendue |
| ⛔ | Pilotes terminés avec le critère atteint (06-pilotes) | Dépend de l'étape 3 |

## 2. Juridique et entreprise

| | Point | État |
|---|---|---|
| ⛔ | Structure juridique créée (SIREN, adresse, TVA intracommunautaire) | Nécessaire pour les mentions légales, les CGV et Stripe en mode réel |
| 🟡 | Mentions légales, CGU, CGV, politique de confidentialité, accord de sous-traitance | Brouillons en ligne avec les champs **[À compléter]** surlignés et `noindex` : à faire relire par un avocat |
| ⛔ | Validation par un avocat du SMS de rappel après appel manqué (05 §A.9) | Bloque l'envoi réel de SMS |
| 🟡 | Registre des traitements RGPD, liste des sous-traitants (Render, Netlify, Supabase, Brevo, Stripe, fournisseur SMS) | Liste prête dans la politique de confidentialité ; registre à tenir |
| ⛔ | Régime de TVA et facturation (franchise en base ou TVA 20 %) | Change l'affichage des prix (HT/TTC) et la configuration Stripe Tax |

## 3. Sécurité et exploitation

| | Point | État |
|---|---|---|
| ✅ | Isolation des entreprises par RLS PostgreSQL, testée en API et en SQL direct | Fait |
| ✅ | Webhooks signés et idempotents (Stripe, téléphonie), limites de débit sur l'inscription, la connexion et la démo | Fait |
| ⛔ | Test d'intrusion externe (ou au minimum audit par un tiers) | À commander avant d'ouvrir le paiement réel |
| 🟡 | Sauvegardes : l'offre gratuite Supabase ne garde pas de sauvegardes restaurables à un instant donné | Passer à une offre payante ou exporter chaque nuit avant d'avoir des clients payants |
| 🟡 | Hébergement API : l'offre gratuite Render se met en veille (premier chargement lent malgré le maintien en éveil) | Offre payante (~7 $/mois) au lancement |
| 🟡 | Supervision des erreurs et alerte en cas de panne | À brancher (ex. Sentry gratuit + alerte de disponibilité) |
| 🟡 | Nom de domaine propre (au lieu de `venio-rdv.netlify.app`) et domaine d'envoi des emails authentifié (SPF, DKIM, DMARC) | À acheter ; variable `NEXT_PUBLIC_SITE_URL` à mettre à jour |

## 4. Passage de Stripe en mode réel (dans cet ordre, avec votre accord explicite)

1. Activer le compte Stripe (identité, IBAN, structure juridique).
2. Régler la TVA (Stripe Tax ou prix TTC fixes) et les mentions sur les factures.
3. Mettre sur Render la clé `sk_live_…`, le secret du webhook réel et `VENIO_STRIPE_LIVE_ENABLED=true` (sans ce dernier, l'API refuse de démarrer avec une clé réelle).
4. Le catalogue (offres et packs) se crée tout seul au premier démarrage.
5. Faire un premier paiement réel sur votre propre carte, puis le rembourser.

## 5. Commercial

| | Point | État |
|---|---|---|
| 🟡 | Tarifs affichés 29 / 69 / 149 € par mois, essai 14 jours | À confirmer après les pilotes |
| ⛔ | Témoignages et chiffres réels | Uniquement issus des pilotes, avec accord écrit ; **aucun chiffre inventé sur la vitrine** |
| 🟡 | Guides (3 publiés), plan de contenus et prospection | Voir 04-business-plan §19 |

## 6. Feu vert

Le lancement payant est possible quand toutes les lignes ⛔ sont passées à ✅ et que les lignes 🟡 « sauvegardes », « paiement test » et « mentions légales relues » sont faites.
