# Phone Call Agent — prototype

Agent qui génère automatiquement le compte rendu (« Phone Call ») d'un appel Sector Alarm à partir
de l'enregistrement Twilio : détection de la fin d'enregistrement → téléchargement authentifié →
transcription française → rédaction par IA avec justifications → contrôle qualité → validation
par le conseiller → écriture dans le CRM **si une interface officielle est autorisée**, sinon copie
manuelle.

> ⚠️ **Prototype.** Testé uniquement sur des données **synthétiques**. Aucune intégration CRM
> n'existe : le connecteur est désactivé et l'interface propose la copie manuelle. Ne traiter
> aucun enregistrement réel avant les validations listées dans `docs/CHECKLIST_PRODUCTION.md`.

## Démarrage rapide

```bash
cd phonecall-agent
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
python -m pytest                              # tests automatisés
python -m phonecall_agent.cli demo --serve    # démo de bout en bout + interface (http://127.0.0.1:8000)
```

## Documents

| Document | Contenu |
|---|---|
| [AUDIT.md](AUDIT.md) | existant, dépendances, documentation Twilio, inconnues, risques, décisions, plan |
| [ARCHITECTURE.md](ARCHITECTURE.md) | diagrammes de flux et d'états, composants, idempotence, règles qualité, sécurité |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | installation, configuration Twilio, déploiement, dimensionnement |
| [docs/DEPANNAGE.md](docs/DEPANNAGE.md) | procédure de dépannage |
| [docs/COUTS.md](docs/COUTS.md) | estimation des coûts par appel |
| [docs/CHECKLIST_PRODUCTION.md](docs/CHECKLIST_PRODUCTION.md) | checklist de mise en production |
| [docs/EVALUATION.md](docs/EVALUATION.md) | jeu d'évaluation des comptes rendus par les experts métier |
| [.env.example](.env.example) | variables d'environnement (sans secret) |
| [config/business.example.yaml](config/business.example.yaml) | configuration métier d'exemple (catégories, format, qualité, conservation) |

## Organisation du code

```
phonecall_agent/
  config.py            paramètres (env) + configuration métier (YAML)
  twilio/              webhook (signature, parsing) et client des enregistrements
  transcription/       interface fournisseur, simulé, faster-whisper (optionnel)
  generation/          schéma structuré, prompt versionné, Claude, simulé
  quality/             validateur à règles explicites
  crm/                 interface CRM, connecteur désactivé, CRM simulé (tests)
  pipeline.py          machine à états du traitement d'un appel
  crm_service.py       écriture CRM idempotente et vérifiée
  intake.py            réception idempotente des événements
  jobs.py              file RQ / exécution inline
  retention.py         conservation, purge, suppression
  metrics.py           indicateurs
  web/                 FastAPI : webhook, interface de validation, rôles, métriques
  demo_data/           transcriptions et réponses IA synthétiques
tests/                 tests unitaires et d'intégration
deploy/                docker-compose de référence
```
