# Tutoriel : mettre MARKETPLACE 3X en ligne

Durée : environ 15 minutes. Résultat : une adresse publique (`https://….vercel.app`) avec les comptes de démonstration.

La base Supabase **`marketplace-3x`** (organisation « Agenda Movers », région Paris) est déjà créée : tables et données de démonstration installées.

---

## Étape 1 — Sécuriser la base (2 min, obligatoire)

Supabase publie automatiquement les tables via son API publique. L'application ne s'en sert pas : on la ferme.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → projet **marketplace-3x** → **SQL Editor** → **New query**.
2. Coller puis **Run** :

```sql
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
drop extension if exists http;
select count(*) filter (where rowsecurity) as rls_on, count(*) as total
from pg_tables where schemaname = 'public';
```

3. Vérifier que `rls_on` = `total` (51).

## Étape 2 — Récupérer trois informations dans Supabase (3 min)

| Information | Où la trouver | Sert à |
|---|---|---|
| **Chaîne de connexion** | Bouton **Connect** (en haut) → onglet **ORMs** ou **Connection string** → **Transaction pooler** (port **6543**). Remplacer `[YOUR-PASSWORD]` par le mot de passe de la base (oublié ? **Project Settings → Database → Reset database password**). | `DATABASE_URL` |
| **URL du projet** | `https://upoozcaluoofbebdpzyd.supabase.co` | `SUPABASE_URL` |
| **Clé secrète** | **Project Settings → API Keys** → clé `service_role` (ou *secret key*). ⚠️ Ne jamais la publier ni la mettre dans du code. | `SUPABASE_SERVICE_ROLE_KEY` |

À la fin de la chaîne de connexion, ajouter : `?pgbouncer=true&connection_limit=1`

Exemple (format) :
```
postgresql://postgres.upoozcaluoofbebdpzyd:MOT_DE_PASSE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

## Étape 3 — Créer le site sur Vercel (5 min)

1. [vercel.com](https://vercel.com) → se connecter **avec GitHub**.
2. **Add New… → Project** → importer le dépôt **`sa-ia`** (si absent : *Adjust GitHub App Permissions* et autoriser le dépôt).
3. Avant de cliquer sur Deploy :
   - **Root Directory** → *Edit* → choisir **`marketplace-3x`**.
   - **Framework Preset** : Next.js (détecté automatiquement).
   - **Environment Variables** : ajouter les variables ci-dessous.

| Nom | Valeur |
|---|---|
| `DATABASE_URL` | la chaîne de connexion de l'étape 2 |
| `APP_URL` | `https://marketplace-3x.vercel.app` (à corriger à l'étape 4 si Vercel donne une autre adresse) |
| `APP_SECRET` | une longue suite aléatoire (40 caractères ou plus) |
| `CRON_SECRET` | une autre suite aléatoire |
| `PAYMENT_PROVIDER` | `demo` |
| `ALLOW_DEMO_PAYMENTS` | `true` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | `https://upoozcaluoofbebdpzyd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé secrète de l'étape 2 |

   Astuce pour une suite aléatoire : [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32).

4. **Choisir la bonne branche** : le code est sur la branche `claude/marketplace-3x-platform-gykw2e`.
   - Soit vous fusionnez cette branche dans `main` sur GitHub (recommandé : ouvrez la Pull Request et cliquez *Merge*), puis Deploy.
   - Soit, après un premier déploiement : **Settings → Git → Production Branch** = `claude/marketplace-3x-platform-gykw2e`, puis **Deployments → Redeploy**.
5. Cliquer **Deploy** et attendre 2-3 minutes.

## Étape 4 — Finaliser (1 min)

1. Copier l'adresse affichée par Vercel (ex. `https://sa-ia-xxxx.vercel.app`).
2. **Settings → Environment Variables** → modifier `APP_URL` avec cette adresse exacte → **Deployments → … → Redeploy**.
3. Ouvrir l'adresse : c'est en ligne. 🎉

## Comptes de démonstration (mot de passe : `demo-m3x-2026`)

| E-mail | Profil |
|---|---|
| `admin@demo.m3x` | Administrateur |
| `camille@demo.m3x` | Particulière (ventes confiées à Sofiane) |
| `lucas@demo.m3x` | Acheteur — code promo `BIENVENUE10` |
| `sofiane@demo.m3x` | Indépendant vérifié |
| `technopro@demo.m3x` | Fournisseur |
| `noah@demo.m3x` | Indépendant en attente de vérification |

Les paiements passent par le **bac à sable** : bouton « Simuler un paiement accepté », aucun argent réel.

## Scénario de démonstration conseillé (10 min)

1. **Lucas** : rechercher « aspirateur », ouvrir la fiche avec `?ref=COMSOFIANE` à la fin de l'adresse, acheter, payer (bac à sable).
2. **TechnoPro** : Commandes → expédier avec un numéro de suivi.
3. **Lucas** : confirmer la réception, laisser un avis.
4. **Sofiane** : tableau de bord → la commission apparaît « Validée ».
5. **Admin** : Finances → « Lancer les validations », versements, export DAC7 ; Paramètres → modifier un taux et voir la simulation.

## En cas de problème

| Symptôme | Solution |
|---|---|
| Build Vercel en erreur « Root Directory » | Vérifier `marketplace-3x` comme dossier racine |
| Page blanche / erreur 500 à l'ouverture | `DATABASE_URL` incorrecte : mot de passe, port 6543, suffixe `?pgbouncer=true&connection_limit=1` |
| « Identifiants incorrects » avec les comptes démo | La base n'est pas celle de Supabase `marketplace-3x` |
| Photo refusée à la création d'annonce | `STORAGE_DRIVER`, `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` manquant |
| « Le bac à sable de paiement est interdit en production » | Ajouter `ALLOW_DEMO_PAYMENTS=true` |
| Logs | Vercel → projet → **Logs** |

## Pour aller plus loin

- **Vrais paiements de test** : créer un compte Stripe, activer Connect, puis `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET` (webhook vers `https://VOTRE-ADRESSE/api/webhooks/stripe`) — voir le README.
- **E-mails réels** : `SMTP_URL` (Brevo, Resend, Mailjet…) et `EMAIL_FROM`.
- **Nom de domaine** : Vercel → Settings → Domains.
- **Tâche planifiée** : `vercel.json` lance chaque nuit la validation des commissions (offre gratuite Vercel : 1 fois par jour).
- **Avant un vrai lancement** : relire `docs/COMPLIANCE.md` et `docs/FINANCE.md` avec un juriste.
