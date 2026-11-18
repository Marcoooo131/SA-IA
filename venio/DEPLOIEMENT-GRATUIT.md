# Mise en ligne gratuite de Venio (version pilote)

> **Tutoriel détaillé clic par clic : [TUTORIEL-MISE-EN-LIGNE.md](TUTORIEL-MISE-EN-LIGNE.md).** Ce document-ci est la vue d'ensemble technique.

Coût : **0 €**, sans carte bancaire. Quatre services gratuits :

| Rôle | Service | Offre gratuite (à vérifier sur leurs sites, ces offres évoluent) |
|---|---|---|
| Base de données + fichiers | **Supabase** (projet `venio`, Paris) — ✅ déjà créé et configuré | 500 Mo de base, 1 Go de fichiers |
| API + envoi des emails | **Render** (Francfort) | 750 h/mois, 512 Mo de mémoire ; mise en veille après 15 min sans visite (évitée par un « réveil » automatique) |
| Interface web | **Netlify** | quota mensuel gratuit, usage commercial autorisé |
| Emails | **Brevo** (français) | 300 emails/jour |

Limites à connaître : convient pour quelques dizaines d'entreprises pilotes, pas pour un lancement public.
Au-delà, passer Render en offre payante d'entrée de gamme et Supabase en offre Pro ; vérifier leurs tarifs du moment.

---

## 1. Supabase — déjà fait par Claude, 3 actions de votre part

Le schéma, la sécurité (aucun accès par l'API publique de Supabase), le rôle `venio` de l'application et le
bucket privé `venio-files` sont en place sur le projet **venio** (`ycmtyvcftzmnsezueykf`).

1. **Mot de passe du rôle de l'application** — Tableau de bord Supabase → *SQL Editor* → exécuter
   (choisissez un mot de passe long, sans `@`, `:` ni `/`) :
   ```sql
   ALTER ROLE venio WITH PASSWORD 'votre-mot-de-passe-long';
   ```
   Ce mot de passe ne passe jamais par Claude.
2. **Adresse de connexion** — bouton *Connect* → onglet *Session pooler* : notez l'hôte
   (de la forme `aws-0-eu-west-3.pooler.supabase.com`). L'URL pour Render est :
   ```
   postgresql+asyncpg://venio.ycmtyvcftzmnsezueykf:VOTRE-MOT-DE-PASSE@HÔTE-DU-POOLER:5432/postgres
   ```
   (utilisateur `venio.` + identifiant du projet, port **5432** = mode session, obligatoire).
3. **Clé secrète** — *Project Settings → API Keys* → clé **secret** (`sb_secret_…`), ou à défaut la clé
   `service_role`. Elle sert uniquement à lire et écrire les photos.

## 2. Brevo — emails (10 min)

1. Créer un compte sur brevo.com.
2. *Expéditeurs* : ajouter et valider l'adresse d'envoi (ex. votre adresse professionnelle).
3. *SMTP & API → API keys* : générer une clé API (`xkeysib-…`).

> **Render gratuit bloque le SMTP sortant** (ports 25, 465, 587) : les envois SMTP y échouent avec « timed out ».
> Venio envoie donc par l'API web de Brevo (`VENIO_EMAIL_PROVIDER=brevo`). Le SMTP (`smtp`) reste possible
> sur une offre Render payante ou chez un autre hébergeur.

Les SMS restent bloqués tant que `VENIO_PAID_SENDING_ENABLED` n'est pas à `true` (désactivé par défaut : aucun envoi facturé).

Tant que cette étape n'est pas faite, laissez `VENIO_EMAIL_PROVIDER=log` : rien n'est envoyé et l'interface
affiche « Non envoyé (mode test) ».

## 3. Render — API (10 min)

1. Créer un compte sur render.com **avec GitHub**, et autoriser l'accès au dépôt `SA-IA`.
2. *New → Blueprint* → choisir le dépôt et la branche (`claude/saas-booking-platform-xvbma3`, ou `main` après fusion).
   Render lit le fichier `render.yaml` à la racine du dépôt.
3. Renseigner les valeurs demandées :
   - `VENIO_DATABASE_URL` : l'URL de l'étape 1.2 ;
   - `VENIO_SUPABASE_SERVICE_KEY` : la clé de l'étape 1.3 ;
   - `VENIO_PUBLIC_BASE_URL` : l'adresse Netlify (étape 4 ; mettez provisoirement `https://exemple.netlify.app`) ;
   - `VENIO_BREVO_API_KEY`, `VENIO_EMAIL_FROM` : Brevo (étape 2), puis passer `VENIO_EMAIL_PROVIDER` à `brevo`.
4. Déployer. Vérifier : `https://venio-api-XXXX.onrender.com/api/health` doit répondre `{"status":"ok"}`.

## 4. Netlify — interface (10 min)

1. Créer un compte sur netlify.com **avec GitHub**.
2. *Add new site → Import from Git* → dépôt `SA-IA`, même branche.
   - *Base directory* : `venio/web` (le reste est lu dans `venio/web/netlify.toml`).
   - Variable d'environnement : `VENIO_API_URL` = l'adresse Render de l'étape 3.
3. Déployer, puis reporter l'adresse Netlify dans `VENIO_PUBLIC_BASE_URL` sur Render (liens des emails).

## 5. Réveil automatique de l'API (Claude peut le faire via Supabase)

Pour éviter la mise en veille de Render (premier chargement lent), Supabase appelle l'API toutes les 10 minutes.
Donnez l'adresse Render à Claude, ou exécutez dans le *SQL Editor* :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('venio-keepalive', '*/10 * * * *',
  $$ select net.http_get('https://VOTRE-API.onrender.com/api/health') $$);
```

Le traitement des emails tourne dans l'API (`VENIO_RUN_WORKER=true`) : tant qu'elle est éveillée, les rappels partent à l'heure.

## 6. Vérification finale

1. Ouvrir l'adresse Netlify → *Essai gratuit* → créer votre espace.
2. Ouvrir votre page publique sur un téléphone, faire une réservation test avec une photo.
3. Vérifier la réception de l'email de confirmation et l'apparition de la demande dans l'espace entreprise.

## Mises à jour du schéma

Les migrations (`backend/venio/migrations/`) sont appliquées sur Supabase par Claude via le connecteur Supabase
(ou `VENIO_DATABASE_ADMIN_URL=… python -m venio.migrate` avec la connexion propriétaire).
La version appliquée sur Supabase de `0002_hardening.sql` crée en plus le rôle `venio` et le bucket `venio-files`.
