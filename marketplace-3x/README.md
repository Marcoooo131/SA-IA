# MARKETPLACE 3X

Marketplace collaborative **particuliers · commerciaux indépendants · entreprises fournisseurs** :
acheter, vendre, confier ses ventes à un indépendant, commercialiser les produits des autres et
générer des commissions, sur une seule plateforme.

> Environnement de démonstration : données **fictives** (`isDemo`), paiements par **bac à sable**
> (aucun argent réel) tant que `PAYMENT_PROVIDER=demo`. Pour de vrais paiements de test :
> Stripe Connect en mode test (`sk_test_…`).

## Démarrer en local

Prérequis : Node.js 22, PostgreSQL 14+.

```bash
cd marketplace-3x
cp .env.example .env            # renseigner DATABASE_URL
npm install
npx prisma migrate deploy       # crée le schéma
npm run db:seed                 # comptes et données de démonstration
npm run dev                     # http://localhost:3000
```

### Comptes de démonstration (mot de passe : `demo-m3x-2026`)

| Compte | Profil | À tester |
|---|---|---|
| `camille@demo.m3x` | Particulière (Rennes) | annonces, collaboration avec Sofiane, validation des prix, revenus |
| `lucas@demo.m3x` | Particulier acheteur | achats, suivi, avis, alertes, code `BIENVENUE10` |
| `ines@demo.m3x` | Particulière (Lyon) | demande d'accompagnement, proposition de Julie à examiner |
| `sofiane@demo.m3x` | Indépendant vérifié | tableau de bord, prospection, ventes déléguées, catalogue, liens, commissions |
| `julie@demo.m3x` | Indépendante vérifiée | lien commercial sur le plaid Maison & Co |
| `noah@demo.m3x` | Indépendant **non vérifié** | accès restreint tant que l'admin n'a pas vérifié |
| `technopro@demo.m3x` | Fournisseur | catalogue, import CSV, commandes à expédier, réseau commercial |
| `maisonco@demo.m3x` | Fournisseur | variantes et stocks |
| `admin@demo.m3x` | Administrateur | dashboard, vérifications, modération, litiges, versements, paramètres |

Lien commercial à essayer : ouvrir un produit TechnoPro avec `?ref=COMSOFIANE`.

## Tests

```bash
npm run test:unit         # moteur de commissions, machine à états (sans base)
npm run test:integration  # flux financiers, permissions, authentification — base marketplace3x_test
npm run test:e2e          # parcours complet dans Chromium (application lancée, données de démo)
```

Les tests d'intégration utilisent une base dédiée (`TEST_DATABASE_URL`, par défaut
`postgresql://postgres:postgres@localhost:5432/marketplace3x_test`) migrée automatiquement.
Couverture : 4 cas de répartition, invariants (balayage), idempotence des webhooks, survente
concurrente, échec de paiement, cycle complet jusqu'au versement, double versement concurrent,
remboursements, annulation vendeur, litiges (gel / dégel / remboursement), taux figés, bornes,
anti auto-attribution, attribution expirée, codes promo, droits sur annonces, offres, propositions de
prix, commandes, paramètres, suspension, messagerie, inscription / connexion / réinitialisation.

## Paiements Stripe (mode test)

```
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…   # stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Événements à activer : `checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_succeeded|failed`, `charge.refunded`, `account.updated`.
Carte de test : `4242 4242 4242 4242`.

## Déploiement (Vercel)

1. Base PostgreSQL hébergée (Neon, Supabase, RDS…) → `DATABASE_URL`.
2. Variables : `APP_URL`, `APP_SECRET`, `PAYMENT_PROVIDER`, clés Stripe, `CRON_SECRET`, `SMTP_URL`, `EMAIL_FROM`.
3. Commande de build : `npm run build` ; migrations : `npm run db:deploy` (étape de release).
4. `vercel.json` planifie `/api/cron/finance` chaque nuit (offre gratuite Vercel ; passer à l'heure sur un plan payant).
5. **Stockage des images** : brancher S3 / R2 / Vercel Blob (`src/server/storage`) — le disque Vercel est éphémère.
6. Environnement de démonstration en ligne : `ALLOW_DEMO_PAYMENTS=true` + `PAYMENT_PROVIDER=demo`.

## Personnaliser l'identité

- Nom, slogan, coordonnées : `src/config/brand.ts`
- Couleurs (marque, chaque espace), rayon des cartes : variables CSS en tête de `src/app/globals.css`
- Logo : `src/components/ui/Logo.tsx` et `public/icon.svg`
- Barèmes, délais, bornes de commission : interface `/admin/parametres` (jamais dans le code)

## Documentation

- [Architecture, rôles, arborescence, choix techniques](docs/ARCHITECTURE.md)
- [Règles financières, moteur de commissions, paiements](docs/FINANCE.md)
- [Conformité : implémenté / à valider par un juriste](docs/COMPLIANCE.md)
- [Plan de développement et suite](docs/ROADMAP.md)
- **[Tutoriel de mise en ligne (Supabase + Vercel)](docs/TUTORIEL-LANCEMENT.md)**

## Sécurité des dépendances

`npm audit` signale encore des alertes sur des outils de **build** (PostCSS embarqué par Next 15,
`deepmerge-ts` du CLI Prisma) : elles n'exposent pas l'application à l'exécution (pas de CSS ni de
configuration fournis par des tiers) et se résolvent par la montée de version Next 16 / Prisma 7,
prévue dans la feuille de route.
