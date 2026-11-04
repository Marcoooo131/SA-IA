# Règles financières et moteur de commissions

Principes : montants en **centimes entiers**, taux en **points de base** (2000 = 20 %), calculs
**exclusivement côté serveur**, taux **figés** sur chaque ligne de commande au moment de l'achat,
journal **en ajout seul** (`LedgerEntry`), aucun taux codé en dur dans les interfaces (tout vient de
`AdminSetting` « commerce », éditable dans `/admin/parametres`, chaque changement audité).

## Les quatre cas (`src/server/commission/engine.ts`)

| Cas | Répartition (valeurs par défaut) | Exemple |
|---|---|---|
| P2P — particulier → acheteur | vendeur = prix − (5 % + 0,70 €) ; plateforme = frais | 100 € → 94,30 / 5,70 |
| Délégué — via indépendant | propriétaire = prix − commission ; indépendant = commission − frais ; plateforme = max(10 % de la commission, 2 €) plafonné à la commission | 100 € à 20 % → 80 / 18 / 2 |
| Fournisseur via lien | fournisseur = prix − commission ; indépendant = commission − frais ; plateforme = frais | 150 €, 15 € → 135 / 13 / 2 |
| Fournisseur direct | fournisseur = prix − 8 % ; plateforme = 8 % | 100 € → 92 / 8 |

Invariant testé : la somme des lignes = montant brut, aucune ligne négative.
Frais de port : ligne `SHIPPING` reversée à l'expéditeur. Codes promo : ligne `PROMO_DISCOUNT`
négative à la charge de la plateforme (les vendeurs ne sont pas pénalisés).

## Cycle de vie (`services/finance.ts`)

```
PENDING ──paiement confirmé (webhook)──► VALIDATING ──réception confirmée──► VALIDATED
   │                                        │   (acheteur, ou auto après N j)      │ délai écoulé
   └─► CANCELLED (paiement échoué)          └─► DISPUTED (litige) ◄────────────────┤ (cron)
                                                                                   ▼
                          CANCELLED ◄── remboursement ── AVAILABLE ──versement──► PAID
```

- **Délai de validation** : 2 j entre particuliers, 14 j si vendeur professionnel (rétractation).
- Une commande n'est **jamais** une vente acquise avant `AVAILABLE`.
- Les transitions sont contraintes (`status-machine.ts`) et historisées (`CommissionStatusEvent`).
- Mises à jour conditionnelles (`UPDATE … WHERE status = x`) : aucun double traitement concurrent.

## Paiement — Stripe Connect (« charges et transferts séparés »)

1. `checkout()` réserve le stock atomiquement, crée commandes + lignes `PENDING`, puis une session
   Stripe Checkout (clé d'idempotence, `transfer_group`).
2. Le **webhook** `checkout.session.completed` (signature vérifiée, événement stocké dans
   `WebhookEvent` → idempotence) appelle `confirmPayment()` après contrôle du montant.
3. Versement : `payoutUser()` réserve les lignes `AVAILABLE` (champ `payoutId`) **avant** l'appel
   `transfers.create` (clé d'idempotence) ; en cas d'échec, la réservation est libérée.
4. Bénéficiaires : comptes Connect Express ; la vérification d'identité (KYC) et l'IBAN sont gérés
   par Stripe ; aucun versement sans `payouts_enabled`.
5. Remboursement intégral : `refunds.create` idempotent ; lignes non versées annulées ; lignes déjà
   versées → écriture `CLAWBACK_DUE` (créance à recouvrer, procédure à définir).

**Bac à sable** (`PAYMENT_PROVIDER=demo`) : remplace uniquement la page du prestataire ; il passe par
`confirmPayment()` comme un webhook, marque tout `provider="demo"`, est signalé par un bandeau et
interdit en production (sauf `ALLOW_DEMO_PAYMENTS=true` pour un environnement de démonstration).

## ⚠️ Points à valider avant lancement (non tranchés techniquement)

- **Statut réglementaire** du modèle « charges et transferts séparés » : la plateforme encaisse via
  Stripe pour le compte de tiers → vérifier avec Stripe et un juriste l'exemption « agent
  commercial » DSP2 ou la nécessité d'un statut d'agent PSP / d'un modèle « destination charges ».
- Durée de détention des fonds chez Stripe (délais de validation longs) et limites de Stripe.
- Procédure de recouvrement des commissions versées puis remboursées.
- Qualification juridique et fiscale de la rémunération des indépendants (mandat, commission,
  apport d'affaires) et TVA sur les frais de plateforme / commissions.
- Remboursements partiels (non implémentés : remboursement intégral par commande seulement).
