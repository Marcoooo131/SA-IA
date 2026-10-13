# Installation et déploiement

## 1. Poste de développement (données synthétiques)

Prérequis : Python 3.11+.

```bash
cd phonecall-agent
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
python -m pytest                                   # tests (SQLite)
python -m phonecall_agent.cli demo                 # bout en bout sur 5 scénarios synthétiques
python -m phonecall_agent.cli demo --serve         # idem + interface sur http://127.0.0.1:8000
python -m phonecall_agent.cli demo --serve --with-simulated-crm   # avec le CRM SIMULÉ
```

La démo affiche les comptes `advisor`, `supervisor` et `admin` et un mot de passe aléatoire.
Elle n'utilise ni Twilio, ni IA, ni CRM réels : faux Twilio, transcriptions et réponses IA pré-écrites.

Tests sur PostgreSQL et Redis réels :

```bash
export PCA_TEST_DATABASE_URL=postgresql+psycopg://phonecall:phonecall@localhost:5432/phonecall_test
python -m pytest            # le test RQ est ignoré si Redis (localhost:6379/15) est absent
```

## 2. Configuration

1. Copier `.env.example` en `.env` (ou, en production, injecter les variables depuis le gestionnaire de secrets).
2. Générer les secrets :
   ```bash
   python -m phonecall_agent.cli gen-key                         # PCA_DATA_ENCRYPTION_KEY
   python -c "import secrets; print(secrets.token_urlsafe(48))"  # PCA_SESSION_SECRET
   python -m phonecall_agent.cli hash-password alice advisor     # une entrée de PCA_UI_USERS
   ```
3. Copier `config/business.example.yaml`, le compléter **avec le métier** (catégories, longueur
   maximale du champ CRM, exemples anonymisés validés, durées de conservation validées par le DPO),
   et pointer `PCA_BUSINESS_CONFIG_PATH` dessus. Mettre `validated: true` seulement après validation.

La clé `PCA_DATA_ENCRYPTION_KEY` doit être sauvegardée dans le gestionnaire de secrets : sans
elle, les transcriptions et comptes rendus stockés sont illisibles. Rotation : voir `docs/DEPANNAGE.md`.

## 3. Configuration Twilio (par l'administrateur Twilio, après accord D1/D3)

1. Créer une **clé API restreinte** (`PCA_TWILIO_API_KEY_SID` / `PCA_TWILIO_API_KEY_SECRET`) avec
   uniquement la lecture (et, si D7 est validée, la suppression) des enregistrements.
2. Activer *Enforce HTTP Auth on Media URLs* (accès authentifié aux médias).
3. Activer l'enregistrement **double canal** si possible (D5).
4. Configurer le *Recording Status Callback* sur l'URL publique HTTPS :
   `https://<hôte-public>/twilio/recording-status`, méthode POST, événements `completed absent`.
   L'endroit dépend du mode d'enregistrement (attributs `recordingStatusCallback` de `<Dial>`,
   `<Record>`, `<Start><Recording>`, paramètre de l'API Calls/Recordings, ou réglage Flex) — **à
   confirmer selon T1/T2 (AUDIT.md)**.
5. Renseigner `PCA_PUBLIC_BASE_URL` avec **exactement** le schéma et l'hôte appelés par Twilio
   (la signature est calculée sur l'URL complète).
6. Premier essai **avec un enregistrement synthétique** (appel de test lu par un script, sans client réel).

## 4. Déploiement de référence (Docker Compose)

```bash
cd phonecall-agent
cp .env.example .env           # puis remplir (ou générer depuis le gestionnaire de secrets)
export POSTGRES_PASSWORD=...   # depuis le gestionnaire de secrets
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec api python -m phonecall_agent.cli init-db
```

Processus :

| Service | Commande | Rôle |
|---|---|---|
| `api` | `cli serve` | webhook, interface, `/metrics`, `/healthz`, `/readyz` |
| `worker` (×2) | `cli worker` | téléchargement, transcription, génération, écriture CRM |
| `maintenance` | `cli maintenance --loop` | purge de conservation + relance des appels bloqués |
| `postgres`, `redis` | — | en production, préférer des services managés avec chiffrement et sauvegardes |

Placer devant `api` un reverse proxy qui termine le TLS, transmet `X-Forwarded-*`, limite la
taille des requêtes (le webhook est petit : 64 Ko suffisent) et, si possible, n'expose
`/twilio/*` qu'à Internet et l'interface qu'au réseau interne / VPN.

L'image Docker n'a pas été construite dans l'environnement d'audit (démon Docker indisponible) :
la construire et la tester en recette avant toute mise en production.

Schéma de base : `init_db()` crée les tables (prototype). Avant la production, introduire des
migrations versionnées (Alembic).

## 5. Dimensionnement (50 à 200 appels / jour)

| Ressource | Recommandation |
|---|---|
| API | 1 instance (2 pour la haute disponibilité), 0,5 vCPU / 512 Mo |
| Workers | 2 avec un fournisseur de transcription géré ; avec faster-whisper : 1 machine 8 vCPU (modèle `medium`, int8) ou 1 GPU, à mesurer pendant le pilote |
| PostgreSQL | petite instance managée (2 vCPU / 4 Go), sauvegardes chiffrées quotidiennes |
| Redis | petite instance, persistance AOF |

200 appels/jour représentent moins d'un appel par minute en moyenne : la file absorbe les pics
(fin de journée) ; la latence à surveiller est celle de la transcription.

## 6. Mise à jour

1. Lancer les tests et le jeu d'évaluation métier (`docs/EVALUATION.md`) sur la nouvelle version.
2. Toute modification du prompt doit incrémenter `PROMPT_VERSION` ; chaque compte rendu enregistre
   la version du prompt et de la configuration métier qui l'a produit.
3. Déployer `worker` puis `api` ; les tâches en cours sont reprises grâce aux étapes idempotentes.
