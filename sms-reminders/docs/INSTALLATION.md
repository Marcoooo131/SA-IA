# Installation et lancement

## 1. Poste de développement

```bash
cd sms-reminders
python -m venv .venv && source .venv/bin/activate      # Windows : .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
```

Dans `.env` :
- `SMR_SESSION_SECRET` : `python -c "import secrets; print(secrets.token_urlsafe(48))"` ;
- `SMR_UI_USERS` : une entrée `login:rôle:hash` par compte, séparées par `;`. Le hash s'obtient
  avec `python -m sms_reminders.cli hash-password` (12 caractères minimum). Rôles :
  `advisor` (conseiller), `supervisor` (responsable), `admin`.

  ```
  SMR_UI_USERS=marie:advisor:scrypt$16384$8$...;paul:supervisor:scrypt$...;admin:admin:scrypt$...
  ```

Puis :

```bash
python -m sms_reminders.cli init-db
python -m sms_reminders.cli serve        # http://127.0.0.1:8000
python -m sms_reminders.cli worker       # dans un second terminal
```

Données de démonstration (fictives, mode simulation uniquement) :
`python -m sms_reminders.cli demo --with-example-templates`. Les templates d'exemple commencent
par « [EXEMPLE A REMPLACER] ».

Tests : `python -m pytest` (SQLite). Sur PostgreSQL :
`SMR_TEST_DATABASE_URL=postgresql+psycopg://user:pwd@host:5432/base_de_test python -m pytest`
(la base est vidée par les tests).

## 2. Serveur (Docker Compose, PostgreSQL)

```bash
cd sms-reminders
cp .env.example .env        # renseigner SMR_ENVIRONMENT=production, SMR_SESSION_SECRET, SMR_UI_USERS,
                            # SMR_COOKIE_SECURE=true, SMR_PUBLIC_BASE_URL, fournisseur SMS…
export POSTGRES_PASSWORD=…  # depuis le gestionnaire de secrets
docker compose -f deploy/docker-compose.yml up -d --build
```

Services : `web` (interface, port 8000 limité à la machine — placer un proxy HTTPS devant),
`worker` (moteur de planification, redémarré automatiquement), `postgres`.

Hors `dev`/`test`, l'application refuse de démarrer si : secret de session absent, cookies non
sécurisés, base SQLite, identifiants du fournisseur manquants ou vérification de signature
désactivée.

Sans Docker : installer le paquet (`pip install .`), puis lancer `serve` et `worker` comme
services système (systemd, superviseur Windows…) avec redémarrage automatique. Le worker peut
aussi être déclenché par un planificateur externe avec `worker --once` toutes les minutes.

## 3. Exploitation

- **Santé** : `GET /healthz` (processus), `GET /readyz` (base de données + fournisseur actif).
- **Journaux** : identifiants techniques uniquement (n° de tâche, n° de rendez-vous) ; un filtre
  masque tout numéro de téléphone qui y apparaîtrait. Les journaux d'accès HTTP détaillés
  (qui contiendraient les recherches) sont désactivés.
- **Sauvegardes** : sauvegarde quotidienne PostgreSQL chiffrée, durée alignée sur la politique de
  conservation.
- **Heure système** : le serveur doit être synchronisé (NTP) ; tous les calculs sont faits en UTC.
- **Mise à jour** : arrêter le worker, déployer, relancer ; les tâches interrompues sont reprises
  au démarrage sans doublon.
