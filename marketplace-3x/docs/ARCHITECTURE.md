# MARKETPLACE 3X — Architecture

## Vue d'ensemble

```
Navigateur ──► Next.js 15 (App Router, React 19, Tailwind 4)
                 │  Pages serveur (RSC) : lecture via les services
                 │  Actions serveur ("use server") : écriture via les services
                 │  Routes API : webhooks Stripe, cron, exports CSV, consentement, RGPD
                 ▼
            src/server/services/*  ← logique métier, contrôle des permissions, validation Zod
                 │
                 ├─ commission/engine.ts  ← moteur de commissions PUR (testé unitairement)
                 ├─ services/finance.ts   ← SEUL module qui écrit les données financières
                 ├─ payments/*            ← abstraction prestataire (Stripe Connect | bac à sable)
                 ├─ storage/*             ← fichiers (local | S3/R2/Blob à brancher)
                 └─ email/*               ← file d'e-mails (EmailOutbox) + SMTP optionnel
                 ▼
            PostgreSQL (Prisma ORM, migrations versionnées)
```

**Choix retenu : monolithe modulaire Next.js.** Une seule application déployable (Vercel), mais une
séparation stricte : les pages et actions n'accèdent jamais directement aux règles métier — elles
appellent les services, qui reçoivent un `Actor` explicite et vérifient eux-mêmes les droits.
Conséquences : les services sont testables sans navigateur (tests d'intégration), et une API REST /
mobile peut être ajoutée plus tard en réutilisant les mêmes services.

## Arborescence

```
marketplace-3x/
├─ prisma/
│  ├─ schema.prisma          modèle de données complet
│  ├─ migrations/            migrations SQL versionnées
│  └─ seed.ts                données de démonstration (fictives, isDemo=true)
├─ src/
│  ├─ app/                   routes (pages, actions, API)
│  │  ├─ (auth)/             connexion, inscription, mot de passe, vérification e-mail
│  │  ├─ espace/             espace particulier
│  │  ├─ pro/                espace indépendant
│  │  ├─ fournisseur/        espace fournisseur
│  │  ├─ admin/              administration
│  │  ├─ produit/ recherche/ independants/ vendeur/ panier/ commande/ paiement/
│  │  ├─ commandes/[id]      suivi de commande (toutes parties)
│  │  ├─ collaborations/[id] contrat de délégation (propriétaire + indépendant)
│  │  ├─ messages/ notifications/ compte/
│  │  ├─ actions/            actions serveur par domaine
│  │  └─ api/                webhooks/stripe, cron/finance, export/[kind], consent, me/export
│  ├─ components/            design system (ui/), layout, produit, graphiques
│  ├─ config/brand.ts        nom, slogan, espaces — identité modifiable
│  ├─ config/legal.ts        trames CGU/CGV/confidentialité (à valider par un juriste)
│  ├─ lib/                   argent, formats, libellés, aides d'actions
│  └─ server/                auth, services, paiements, stockage, e-mail, paramètres
├─ tests/unit                moteur de commissions, machine à états
└─ tests/integration         flux financiers, permissions, authentification (base PostgreSQL réelle)
```

## Rôles et permissions

| Rôle | Attribution | Accès |
|---|---|---|
| `INDIVIDUAL` | tout compte (tout le monde peut acheter) | `/espace` |
| `PROFESSIONAL` | inscription « indépendant » | `/pro` ; prospection, catalogue et liens après **vérification** |
| `SUPPLIER` | inscription « entreprise » | `/fournisseur` ; produits visibles après **vérification** |
| `ADMIN` | attribué par un administrateur | `/admin` |

Les rôles sont stockés dans `UserRole` (un utilisateur peut en cumuler). Contrôles :
`requireRole()` dans les layouts (navigation), puis `assertRole / assertAdmin / canManageProduct /
orderRoleFor` **dans chaque service** (défense en profondeur : une action appelée directement est
contrôlée de la même façon). Un compte suspendu perd ses sessions et ne passe plus `assertActive`.

## Produit et annonce

Le cahier des charges cite `Products` et `Listings`. Pour un article de particulier comme pour une
référence fournisseur, l'annonce publique est 1:1 avec l'article : ils sont fusionnés dans `Product`
(prix, statut, visibilité). La « mise en vente par plusieurs commerciaux » d'un produit fournisseur
est portée par `CatalogSelection` + `AffiliateLink` (une sélection et un lien par indépendant), sans
dupliquer l'annonce — conformément à la demande de ne pas créer de boutique par commercial.

## Correspondance avec les entités demandées

Users/UserRoles/Individual-/Professional-/SupplierProfiles → `User`, `UserRole`, `*Profile` ·
Products/Listings/ProductImages/ProductVariants/Inventory → `Product`, `ProductImage`,
`ProductVariant`, `Inventory` · Favorites → `Favorite` (+ `SavedSearch` pour les alertes) ·
DelegationRequests/CollaborationOffers/CollaborationContracts → idem (+ `PriceProposal`) ·
CommissionRules → `CommissionRule` (règles fournisseur ; taux de délégation figés sur le contrat ;
barèmes plateforme dans `AdminSetting`) · CommissionTransactions → `CommissionTransaction`
(+ `CommissionStatusEvent`, `LedgerEntry`) · AffiliateLinks/AffiliateAttributions → idem ·
Orders/OrderItems/Payments/Payouts/Shipments/Refunds/Disputes/Reviews/Reports/Notifications/
Messages/Conversations → idem · AdminSettings → `AdminSetting` · AuditLogs → `AuditLog` ·
en plus : `Cart`, `PromoCode`, `ReferralReward`, `PayoutAccount`, `WebhookEvent`,
`EmailOutbox`, `ConsentRecord`, `ProductOffer`, sessions et jetons.

## Livraison

`Shipment` porte transporteur, numéro de suivi et statut. Le responsable de l'expédition est calculé :
vendeur (particulier ou fournisseur), ou indépendant si le contrat prévoit qu'il expédie. Points
d'intégration transporteurs (Mondial Relay, Colissimo, Boxtal…) : `markDelivered()` est appelable par
un futur webhook transporteur ; la création d'étiquettes s'ajoute dans `services/orders.ts`.
Retours et colis perdus passent par les litiges (gel des fonds puis décision).

## Stockage des fichiers

Pilote `local` (`public/uploads`) pour le développement. **En production sur Vercel, le disque est
éphémère** : implémenter `StorageDriver` (S3, Cloudflare R2 ou Vercel Blob) dans
`src/server/storage/index.ts`. Le type réel des images est contrôlé par signature binaire ;
l'optimisation (redimensionnement, WebP/AVIF) est assurée par `next/image`.

## Recherche

Recherche SQL (`ILIKE` multi-mots + filtres indexés). Au-delà de ~100 000 annonces : extension
`pg_trgm` ou moteur dédié (Meilisearch / Typesense) derrière `searchProducts()`.

## Montée en charge — points d'attention

- Limitation de débit en mémoire (`checkRateLimit`) : la remplacer par Redis/Upstash en multi-instances.
- Notifications et e-mails synchrones : passer par une file (Inngest, QStash, BullMQ) au-delà du MVP.
- Tâches financières : `/api/cron/finance` (Vercel Cron, horaire — `vercel.json`).
