# 02 — Architecture : technique, données, multi-tenant, abonnements

[← Sommaire](README.md)

---

## 8. Architecture technique détaillée

### 8.1 Principes

1. **Un monolithe modulaire**, pas des microservices. Une équipe de 1 à 3 développeurs ne peut pas opérer
   10 services. Les modules sont séparés dans le code (frontières claires, pas d'import croisé de leurs tables),
   ce qui permettra d'en extraire un plus tard si nécessaire.
2. **PostgreSQL est la source de vérité** pour tout ce qui est transactionnel : réservations, files de tâches,
   événements de facturation. Moins de technologies = moins de pannes.
3. **Sécurité côté serveur et en base** (RLS), jamais seulement dans l'interface.
4. **Hébergement en Union européenne** (RGPD, argument commercial auprès des TPE françaises).

### 8.2 Choix technologiques

| Couche | Choix | Pourquoi / alternative écartée |
|---|---|---|
| API | **Python 3.12 + FastAPI**, Pydantic v2, SQLAlchemy 2 (async) + Alembic | Conforme au cahier des charges ; typage fort, OpenAPI auto-généré, écosystème IA/analytique Python. |
| Front | **Next.js (App Router) + TypeScript**, Tailwind + composants Radix/shadcn, TanStack Query | Pages publiques rendues côté serveur (SEO, vitesse mobile), back-office SPA. |
| Contrat front/back | **Client TypeScript généré depuis l'OpenAPI** | Évite la dérive entre deux langages : c'est la condition pour que FastAPI + Next.js reste maintenable. |
| Base | **PostgreSQL 16** + extensions `btree_gist` (anti-double réservation), `pgcrypto`, `citext` | |
| Tâches asynchrones | **File de tâches dans PostgreSQL** (bibliothèque *procrastinate*, ou table `job` + `SELECT … FOR UPDATE SKIP LOCKED`) | Pas de Redis/Celery au MVP : une technologie de moins, transactions atomiques « réservation + rappels planifiés ». |
| Temps réel | **SSE** (Server-Sent Events) + `LISTEN/NOTIFY` | Suffisant pour notifier une nouvelle demande / un message. WebSocket inutile au MVP. |
| Cache / rate limiting | Limitation en mémoire + en base au MVP ; **Redis ajouté** quand > 1 instance API ou besoin mesuré | « Ne pas surdimensionner ». |
| Fichiers | **Stockage objet S3-compatible** (Scaleway / OVH), URLs présignées, antivirus (ClamAV) en tâche, suppression EXIF/GPS des photos | |
| Email | Fournisseur configurable via interface `EmailProvider` (Brevo, Postmark, Scaleway TEM…) | |
| SMS | Interface `SmsProvider` (Brevo, Twilio, OVH…) — reprise du moteur et des tests de `sms-reminders/` | |
| Paiement | **Stripe Billing** + Customer Portal + Stripe Tax | |
| IA | Interface `LlmProvider` ; modèle léger pour résumés (ex. Claude Haiku 5.5), désactivable par entreprise | |
| Auth | Sessions serveur en cookie `HttpOnly` + `SameSite`, mots de passe Argon2id, **lien magique** et Google OAuth, 2FA TOTP (obligatoire pour notre équipe interne) | Alternative : service managé (Clerk, WorkOS). À arbitrer : gain de temps vs dépendance et coût par utilisateur. |
| Observabilité | Sentry (erreurs), logs JSON structurés, métriques OpenTelemetry → Grafana Cloud (offre gratuite au début), uptime externe | |
| Déploiement | **Docker**, CI GitHub Actions, PaaS conteneurs en UE (Scaleway Serverless Containers, Clever Cloud ou Render EU) + **PostgreSQL managé** avec sauvegardes PITR | Kubernetes écarté avant d'avoir des centaines de clients. |
| 3D (plus tard) | React Three Fiber, chargé en *lazy loading* uniquement sur les parcours qui l'activent | Réutilisation possible du moteur 3D de ce dépôt (`src/`). |

### 8.3 Découpage en modules (backend)

```
api/
  core/            config, sécurité, contexte tenant, erreurs, audit, journalisation
  identity/        utilisateurs, sessions, invitations, rôles, 2FA
  tenancy/         entreprises (workspaces), membres, paramètres, marque, domaines
  billing/         plans, droits (entitlements), quotas, Stripe, webhooks
  catalog/         prestations, lieux, zones d'intervention
  flows/           parcours (versions, étapes, questions, conditions), moteur d'évaluation
  intake/          sessions de parcours (brouillons), réponses, fichiers, reprise
  scheduling/      disponibilités, calcul des créneaux, réservations, verrous, synchro calendriers
  crm/             contacts, dossiers, notes, statuts
  messaging/       conversations, messages, pièces jointes
  notifications/   modèles, envois email/SMS, journal, consentements
  automations/     scénarios (déclencheur → délai → action)
  analytics/       événements de parcours, entonnoirs, benchmarks
  ai/              résumés, contrôles de cohérence (optionnel)
  admin/           back-office interne (accès séparé)
```

Chaque module expose un *service* (fonctions Python) ; les autres modules n'accèdent jamais directement à ses tables.
Un module « payant » vérifie son droit via `billing.require_feature(tenant, "sms")`.

### 8.4 Flux critiques

**Réservation sans double réservation**

```
Client choisit un créneau
  → POST /public/{slug}/holds  : crée un "hold" (statut=held, expire dans 10 min)
       INSERT dans booking avec contrainte d'exclusion GiST :
       EXCLUDE (resource_id WITH =, time_range WITH &&) WHERE status IN ('held','confirmed')
       → si conflit : 409 + proposition des 3 créneaux libres suivants
  → client termine le récapitulatif
  → POST /public/{slug}/bookings/{hold}/confirm (clé d'idempotence)
       même transaction : statut=confirmed, création dossier/contact,
       insertion des tâches (email confirmation, rappels J-2/J-1, synchro Google)
  → tâche périodique : libère les holds expirés
```

Pour une capacité > 1 (ex. 2 équipes de visite), la ressource est une *équipe* avec N « places », ou une ligne
de verrou par ressource (`SELECT … FOR UPDATE`) puis comptage. La contrainte d'exclusion couvre le cas courant
(capacité 1 par collaborateur), qui est aussi le plus fréquent dans la cible.

Les créneaux affichés tiennent compte : horaires, pauses, congés, jours fériés (calendrier FR par défaut),
délai minimum, horizon maximum, tampon/trajet, occupations Google/Outlook (synchronisées par webhook + lecture
*free/busy* au moment du hold pour éviter un conflit tardif).

**Webhooks Stripe idempotents**

```
POST /webhooks/stripe
  vérification de signature → INSERT stripe_event(id) ON CONFLICT DO NOTHING
  si déjà présent → 200 immédiat
  sinon → tâche "apply_stripe_event" → mise à jour subscription → recalcul des droits
```

**Notifications**
Chaque envoi = une ligne `notification` (statut, fournisseur, coût, tentative, erreur). Réessais avec back-off,
respect des plages horaires, des consentements et de la liste d'opposition, et décompte du quota SMS.

### 8.5 Environnements, qualité, exploitation

| Sujet | Mise en place |
|---|---|
| Environnements | `local` (docker compose) → `preview` par pull request → `staging` (données synthétiques) → `production` |
| Migrations | Alembic, migrations rétro-compatibles (*expand / contract*), exécutées avant déploiement |
| Sauvegardes | PITR du PostgreSQL managé + export quotidien chiffré vers un autre fournisseur/région ; **test de restauration mensuel** |
| Plan de reprise | Objectifs visés : RPO ≤ 15 min, RTO ≤ 4 h au lancement ; procédure écrite et répétée |
| Monitoring | Alertes : erreurs 5xx, latence calcul de créneaux, file de tâches en retard, échecs SMS/email, webhooks Stripe en échec |
| Sécurité | Dépendances scannées (Dependabot), SAST (Bandit/Semgrep), en-têtes CSP/HSTS, rate limiting, test d'intrusion externe avant lancement payant |
| Tests | Unitaires (moteur de créneaux, moteur de conditions), intégration sur vrai PostgreSQL, **tests d'isolation multi-tenant** systématiques, **tests de concurrence** (100 réservations simultanées sur le même créneau → 1 seule réussit), webhooks Stripe rejoués, E2E Playwright des parcours, charge (k6) sur les pages publiques et le calcul des créneaux |

---

## 9. Schéma de la base de données

Le schéma SQL de travail complet (tables, contraintes, politiques RLS) est dans **[schema.sql](schema.sql)**.
Vue d'ensemble :

```
                         ┌──────────────┐
                         │    plan      │──< plan_entitlement (feature / limite)
                         └──────┬───────┘
                                │
┌────────┐   ┌──────────────────┴───┐    ┌────────────────┐
│app_user│──<│ membership (rôle)    │>──│    tenant      │──1 subscription ──< stripe_event
└────────┘   └──────────────────────┘    └──────┬─────────┘──< usage_counter
                                                │ (toutes les tables métier portent tenant_id + RLS)
      ┌──────────────┬──────────────┬───────────┼─────────────┬──────────────┬──────────────┐
      │              │              │           │             │              │              │
  location      service ──< service_resource  resource    flow ──< flow_version (JSON définition,
  service_area      │                     (collaborateur/    │         publiée, immuable)
                    │                      équipe) ──< availability_rule / time_off
                    │                                   │
                    └────────────┐        ┌─────────────┘
                                 ▼        ▼
 contact ──< intake_session ──> booking (time_range, status, EXCLUDE GiST)
    │          │  (réponses JSON,          │
    │          │   token reprise,          ├──< booking_event (historique)
    │          │   flow_version_id)        │
    └──< case_file (dossier) ──────────────┘
            ├──< note
            ├──< file_object (photos, documents, annotations)
            ├──< conversation ──< message ──< file_object
            └──< notification (email/SMS, statut, coût)

 automation (déclencheur, délai, action) ──< automation_run
 analytics_event (visite, étape vue/répondue, abandon, réservation) — partitionnée par mois
 consent (contact, canal, finalité, preuve) · audit_log (acteur, action, cible)
 calendar_connection (Google/Outlook, jetons chiffrés) ──< external_busy
```

**Choix structurants**
- **Les parcours sont stockés en JSON versionné** (`flow_version.definition`) validé par un schéma Pydantic,
  plutôt qu'en dizaines de tables : publication atomique, versions immuables, une session de parcours reste
  attachée à la version sur laquelle elle a commencé.
- **Les réponses** sont stockées en JSON (`intake_session.answers`) + **champs extraits normalisés** sur le dossier
  (adresse, surface, budget, délai) pour filtrer et analyser.
- **Les données personnelles sensibles** (téléphone, email, adresse) sont chiffrées au niveau applicatif pour les
  jetons et secrets ; pour les coordonnées, chiffrement disque + RLS + accès journalisé (le chiffrement par champ
  empêcherait la recherche ; à décider avec un audit sécurité).
- **Suppression** : suppression logique 30 jours puis purge ; anonymisation des événements analytiques.

---

## 10. Architecture multi-tenant

### 10.1 Modèle retenu : base partagée, schéma partagé, `tenant_id` partout + RLS

| Option | Isolation | Coût / exploitation | Verdict |
|---|---|---|---|
| Une base par client | Maximale | Très élevé (migrations × N) | Non (sauf futur client Enterprise exigeant) |
| Un schéma par client | Forte | Élevé à partir de quelques centaines de clients | Non |
| **Tables partagées + `tenant_id` + RLS** | Forte si bien faite, défense en profondeur | Faible | **Oui** |

### 10.2 Défense en profondeur (trois couches)

1. **Couche HTTP** : le tenant est déterminé par la session (back-office) ou par le *slug*/domaine (pages publiques),
   jamais par un paramètre envoyé par le client. Vérification du rôle par dépendance FastAPI.
2. **Couche applicative** : toute requête passe par un *repository* qui filtre par `tenant_id`.
3. **Couche base de données (RLS)** :
   - l'application se connecte avec un rôle `app_rw` **sans** `BYPASSRLS` et **non propriétaire** des tables ;
   - `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` sur toutes les tables métier ;
   - au début de chaque transaction : `SET LOCAL app.tenant_id = '<uuid>'` ;
   - politique : `USING (tenant_id = current_setting('app.tenant_id')::uuid)` + `WITH CHECK` identique ;
   - si la variable n'est pas positionnée, `current_setting(..., true)` renvoie NULL → **aucune ligne**, échec sûr.
4. **Back-office interne** : rôle base distinct `admin_ro`, accès aux données clients **uniquement** via une procédure
   « accès support » limitée dans le temps, motivée, consentie par le client et journalisée (`support_access_grant`).
   Les indicateurs globaux (MRR, nombre de RDV) sont calculés via des vues agrégées sans données personnelles.

### 10.3 Tests d'isolation (obligatoires en CI)
- Pour chaque endpoint : créer A et B, s'authentifier en A, tenter de lire/modifier/supprimer chaque ressource de B
  par identifiant → 404 attendu.
- Test SQL direct : avec `app.tenant_id = A`, `SELECT count(*)` sur chaque table ne renvoie que des lignes de A ;
  sans variable → 0 ligne ; `INSERT` avec `tenant_id = B` → refusé.
- Test que chaque nouvelle table a RLS activé (requête sur `pg_class.relrowsecurity` en CI).

---

## 11. Fonctionnement des abonnements

### 11.1 Modèle de données

- `plan` (code, nom, prix mensuel/annuel, `stripe_price_id`, actif, visible) — **modifiable dans le back-office sans code**.
- `plan_entitlement` (plan, clé, valeur) : booléens (`feature.sms`, `feature.messaging`, `feature.custom_domain`)
  et limites (`limit.members`, `limit.bookings_per_month`, `limit.sms_per_month`, `limit.storage_mb`, `limit.locations`).
- `tenant_entitlement_override` : dérogations commerciales par client (geste, offre pilote).
- `subscription` : copie locale de l'état Stripe (`trialing`, `active`, `past_due`, `canceled`, `unpaid`…).
- `usage_counter` (tenant, clé, période, valeur) incrémenté transactionnellement.

### 11.2 Cycle de vie

```
Inscription ──► essai 14 jours (sans carte, droits du plan Pro)
   │                │
   │      ajout carte (Stripe Checkout) ──► active (mensuel ou annuel)
   │                │                         │  upgrade : immédiat, prorata
   │                │                         │  downgrade : à l'échéance ; si dépassement de limite
   │                │                         │             → l'entreprise choisit quoi désactiver
   │      fin d'essai sans carte              │
   │                ▼                         ▼
   │      lecture seule 30 j          impayé : past_due → relances Stripe (Smart Retries)
   │      (pages publiques en           + emails J0/J3/J7 ; accès maintenu 14 j
   │       mode « contactez-nous »)       → puis restreint (pas de nouvelles réservations
   │                                          publiques, données toujours exportables)
   ▼
Résiliation : à la fin de la période payée → lecture seule 30 j → export → suppression planifiée
```

**Règle importante :** on ne coupe jamais brutalement une réservation déjà confirmée de leurs clients finaux
(rappels et liens de gestion continuent jusqu'à la fin de la période de grâce). C'est une question de réputation.

### 11.3 Quotas
- Vérification serveur avant action (`billing.check_limit`) + compteur incrémenté dans la même transaction.
- Alertes à 80 % et 100 % ; **SMS au-delà du forfait : packs prépayés** (jamais de dépassement facturé par surprise).
- Les réservations publiques ne sont **pas** bloquées au dépassement de quota « RDV/mois » : on prévient et on propose
  l'offre supérieure (bloquer un client final ferait perdre un chantier à notre client — mauvais pour tout le monde).

### 11.4 Grille d'offres proposée (hypothèses à valider en entretiens)

> **Mise à jour 18/11/2026 :** appels manqués, lignes téléphoniques et crédits SMS (qui remplacent la ligne « SMS inclus »)
> sont définis dans [05 — Offres et limites](05-extension-acquisition.md#offres-et-limites-mises-à-jour).

| | **Starter** | **Pro** | **Business** |
|---|---|---|---|
| Prix HT / mois (mensuel) | 29 € | 69 € | 149 € |
| Prix HT / mois (annuel, 2 mois offerts) | 24 € | 57 € | 124 € |
| Utilisateurs inclus | 1 | 5 | 15 |
| Parcours publiés | 2 | Illimités | Illimités |
| Rendez-vous / mois | 100 | Illimités (usage raisonnable) | Illimités |
| Rappels email | ✓ | ✓ | ✓ |
| SMS inclus / mois | — (packs) | 100 | 400 |
| Messagerie dossier | — | ✓ | ✓ |
| Automatisations | Modèles fixes | Personnalisables | Avancées |
| Synchro Google / Outlook | ✓ | ✓ | ✓ |
| Statistiques | Basiques | Entonnoir + benchmarks métier | + export |
| Personnalisation | Logo, couleurs | + textes, emails, retrait de la marque | + domaine personnalisé |
| Établissements | 1 | 1 | 3 (puis +) |
| API / webhooks | — | — | ✓ |

**Justification :**
- Par entreprise, pas par siège : simple et favorable aux équipes de 2 à 10 personnes.
- Pro à 69 € : un seul chantier supplémentaire par an rembourse plusieurs années d'abonnement pour un artisan
  de rénovation — c'est l'argument de vente, à confirmer par les entretiens (méthode Van Westendorp + test de prix
  sur la page de vente).
- Au-dessus de RDV360 / SimplyBook (≈ 30–60 €) qui visent des besoins plus simples ; comparable au coût cumulé
  Typeform Basic (≈ 28 $) + Calendly Standard (≈ 10 $) + un outil SMS.
- Coût SMS du forfait Pro : 100 × 0,045–0,08 € ≈ 4,5 à 8 € → marge préservée (voir [04-business-plan.md](04-business-plan.md)).
