# Venio — prise de rendez-vous qualifiés (version pilote 0.1)

Plateforme SaaS multi-entreprise : chaque entreprise dispose d'une page publique où ses clients décrivent
leur besoin (parcours conversationnel, une question par écran), choisissent un créneau réellement libre
et reçoivent une confirmation. L'entreprise reçoit un dossier structuré.

Conception et stratégie : [`../plateforme-rdv/`](../plateforme-rdv/README.md).

## État réel des fonctionnalités

| Fonctionnalité | État |
|---|---|
| Inscription, connexion, sessions (cookie HttpOnly), plusieurs espaces par utilisateur | ✅ Opérationnel, testé |
| Isolation des entreprises : RLS PostgreSQL (rôle applicatif sans BYPASSRLS) + contrôles API | ✅ Testé (API et SQL direct) |
| Modèles métier : rénovation, déménagement, générique (adaptable à toute activité) | ✅ |
| Parcours conditionnel (choix, multi-choix, oui/non, texte, nombre, curseur, date, photos), validation serveur, reprise après fermeture, retour arrière, modification depuis le récapitulatif | ✅ |
| Prestation choisie selon les réponses (ex. « je me renseigne » → appel au lieu d'une visite) | ✅ |
| Créneaux : horaires par collaborateur, pauses, jours fériés FR, délai minimum, horizon, battement (trajet), absences, changement d'heure | ✅ Testé |
| Anti-double réservation : blocage temporaire 10 min + contrainte d'exclusion PostgreSQL | ✅ Testé (15 réservations simultanées → 1 seule réussit) |
| Zone d'intervention par codes postaux, adresse et téléphone exigés pour les visites sur place | ✅ |
| Photos/PDF : 10 Mo max, ré-encodage des images (suppression EXIF/GPS), accès réservé à l'entreprise | ✅ Stockage disque local (S3 à brancher pour la production multi-serveurs) |
| Confirmation, lien de gestion signé (report, annulation, délai configurable), fichier agenda .ics | ✅ |
| Espace entreprise : tableau de bord, demandes, dossier complet, notes, statuts, agenda semaine, terminé/absent/annulé, report | ✅ |
| Paramètres : page publique, couleurs, points forts, horaires, prestations, absences | ✅ |
| Parcours : édition des textes, icônes et caractère obligatoire, brouillon, publication versionnée (les demandes en cours restent sur leur version) | ✅ — l'ajout de questions/conditions dans l'interface n'est **pas encore** disponible (modification par nous en attendant) |
| Statistiques : entonnoir par question, conversion, abandons, absences, avec avertissement de faible volume | ✅ |
| Emails (confirmation, rappel J-1, report, annulation, alertes entreprise) via file de tâches + worker | ✅ Fournisseur `log` par défaut : **rien n'est envoyé**, le statut affiché est « Non envoyé (mode test) ». Envoi réel avec `VENIO_EMAIL_PROVIDER=smtp` (non testé contre un vrai serveur SMTP) |
| SMS | ❌ Pas encore : le consentement est recueilli, l'envoi viendra avec le choix du fournisseur |
| Abonnements Stripe, quotas appliqués, back-office interne | ❌ Prochaine étape (offres et quotas déjà en base ; essai Pro de 14 jours créé à l'inscription, non bloquant) |
| Synchronisation Google / Outlook, messagerie client, invitations de collaborateurs | ❌ À venir |

## Lancer en local

Prérequis : Python 3.12+, Node 22, PostgreSQL 16.

```bash
# Base de données (rôle applicatif "venio" non propriétaire)
createdb venio
psql -d venio -c "CREATE ROLE venio LOGIN PASSWORD 'venio'"

# API
cd backend
python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
VENIO_DATABASE_ADMIN_URL=postgresql+asyncpg://postgres@localhost:5432/venio VENIO_APP_DB_ROLE=venio python -m venio.migrate
VENIO_DATABASE_URL=postgresql+asyncpg://venio:venio@localhost:5432/venio uvicorn venio.main:app --port 8000
# Worker d'envoi (autre terminal, même variables)
python -m venio.worker

# Interface
cd ../web && npm install && npm run dev        # http://localhost:3000
```

Documentation de l'API : http://localhost:8000/api/docs

Avec Docker : `docker compose up --build` dans ce dossier (base, migrations, API, worker, interface sur le port 3000).
Les fichiers Docker sont vérifiés par l'intégration continue ; ils n'ont pas pu être construits dans l'environnement de développement.

## Tests

```bash
cd backend
source <(scripts/test-db.sh)   # démarre un PostgreSQL 16 jetable et exporte VENIO_TEST_ADMIN_URL
pytest -q                      # 29 tests : moteur de parcours, créneaux, parcours complet, isolation, concurrence
cd ../web && npm run typecheck && npm run build
node ../e2e/smoke.js /tmp/venio-shots   # scénario navigateur complet (serveurs démarrés)
```

## Variables d'environnement (API)

| Variable | Rôle |
|---|---|
| `VENIO_DATABASE_URL` | Connexion du rôle applicatif (membre de `venio_app`, sans BYPASSRLS) |
| `VENIO_DATABASE_ADMIN_URL` / `VENIO_APP_DB_ROLE` | Migrations (rôle propriétaire) et rôle à rattacher à `venio_app` |
| `VENIO_ENVIRONMENT` | `production` impose une clé secrète forte et des cookies sécurisés |
| `VENIO_SECRET_KEY` | Signature des liens de gestion de rendez-vous (32 caractères minimum en production) |
| `VENIO_PUBLIC_BASE_URL` | URL publique de l'interface (liens dans les emails) |
| `VENIO_COOKIE_SECURE` | `true` derrière HTTPS |
| `VENIO_EMAIL_PROVIDER` | `log` (aucun envoi) ou `smtp` + `VENIO_SMTP_HOST/PORT/USER/PASSWORD`, `VENIO_EMAIL_FROM` |
| `VENIO_STORAGE_DIR` | Dossier des fichiers déposés |

## Architecture

```
backend/venio/
  migrations/0001_init.sql   schéma, RLS, offres
  flows/                     schéma des parcours, moteur (conditions, chemin, validation), modèles métier
  scheduling/                calcul des créneaux, jours fériés
  modules/identity.py        inscription, connexion, sessions
  modules/provisioning.py    création d'un espace à partir d'un modèle
  modules/public.py          page publique, parcours, créneaux, réservation, lien de gestion
  modules/business.py        tableau de bord, rendez-vous, dossiers, fichiers, envois
  modules/settings_api.py    page publique, prestations, horaires, absences, parcours
  modules/notifications.py   messages, file de tâches, worker
web/src/
  app/r/[slug]               page publique + parcours de réservation (mobile d'abord)
  app/r/[slug]/rdv/[token]   gestion du rendez-vous par le client
  app/app/*                  espace entreprise
```
