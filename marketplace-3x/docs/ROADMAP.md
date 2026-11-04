# Plan de développement — état d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 — Fondations | Architecture, schéma de données + migration, authentification (inscription par profil, connexion, sessions, mot de passe oublié, vérification e-mail), rôles, design system, accueil | ✅ |
| 2 — Marketplace | Catalogue, annonces avec photos, recherche + 10 filtres, fiche produit, favoris, alertes, offres de prix, panier multi-vendeurs, commandes | ✅ |
| 3 — Indépendant | Tableau de bord + graphiques + conseils, prospection avec matching, annuaire, propositions, contrats, ventes déléguées, propositions de prix, profil public | ✅ |
| 4 — Fournisseur | Catalogue, variantes, stocks atomiques, import CSV/Excel, commissions par produit, sélection par les indépendants, liens traçables, réseau | ✅ |
| 5 — Finances | Moteur de commissions, statuts, journal, paiement Stripe Connect + bac à sable, webhooks idempotents, remboursements, versements, KYC prestataire, parrainage, codes promo | ✅ |
| 6 — Administration | Dashboard, utilisateurs, vérifications, droits, modération, signalements, commandes, litiges, finances, exports CSV + DAC7, paramètres, catégories, audit, e-mails | ✅ |
| 7 — Finalisation | Sécurité (en-têtes, contrôles, limitation de débit), tests unitaires / intégration / e2e, responsive, SEO (métadonnées, sitemap, robots), préparation Vercel | ✅ (socle) |

## Décisions prises par défaut (documentées, modifiables)

- Une commande par vendeur, un paiement par panier ; frais de port = le plus élevé des articles d'un même vendeur (un colis).
- Frais P2P prélevés sur le vendeur (5 % + 0,70 €) ; frais plateforme sur commission : 10 %, minimum 2 € (reproduit les exemples du cahier des charges).
- Remises promotionnelles à la charge de la plateforme.
- Attribution « dernier clic », 30 jours, persistante uniquement avec consentement.
- Validation : réception confirmée par l'acheteur ou automatique 3 j après livraison ; disponibilité après 2 j (particulier) ou 14 j (professionnel).
- Tout compte peut acheter (rôle `INDIVIDUAL` ajouté aux pros et fournisseurs).

## Prochaines étapes recommandées

1. **Juridique** (bloquant avant lancement) : voir `docs/COMPLIANCE.md` et la section « points à valider » de `docs/FINANCE.md`.
2. Stockage objet (S3/R2/Blob) et CDN d'images.
3. Intégration transporteurs (étiquettes, suivi automatique : Boxtal, Mondial Relay, Colissimo).
4. Remboursements partiels et retours article par article.
5. File de tâches pour e-mails / notifications ; notifications push (Web Push) — `notify()` est le point d'extension.
6. Recherche plein texte (pg_trgm / Meilisearch) et recommandations par similarité.
7. 2FA administrateurs, CSP stricte, limitation de débit Redis, scoring de fraude.
8. Montée de version Next 16 / Prisma 7.
