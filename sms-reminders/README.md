# Relances SMS — Movers & Takeovers

Outil interne de relance automatique par SMS des rendez-vous clients des services **Movers** et
**Takeovers** : import des rendez-vous, programmation des SMS à J-2 (48 h) et J-1 (24 h, puis
second SMS 3 h plus tard), suivi des confirmations, historique complet, tableau de bord.

> **État actuel — à lire avant toute utilisation**
>
> | Élément | État |
> |---|---|
> | Application web, import CSV/Excel, moteur de planification, confirmations, historique | **Opérationnels** (testés : 92 tests sur SQLite et PostgreSQL) |
> | Envoi de SMS | **Mode simulation par défaut** : aucun SMS réel ne part. Les messages simulés sont marqués « Simulé — non envoyé » et ne sont jamais comptés comme envoyés |
> | Adaptateur Twilio | Implémenté et testé **contre un serveur simulé uniquement** — jamais contre un vrai compte. Aucun fournisseur n'a été communiqué |
> | Numéros d'expédition Movers / Takeovers | **Non configurés** (à saisir dans *Paramètres*) — envois bloqués en attendant |
> | Six templates SMS | **Non configurés** (« Template non configuré ») — envois bloqués en attendant |
> | Validation de conformité (juridique / DPO) | **Non enregistrée** — tout envoi réel est bloqué en attendant |
> | Connexion CRM | **Aucune**. Un point d'intégration est prévu (`sms_reminders/crm`), sans route ni identifiant inventé |
>
> Liste complète : [docs/CHECKLIST_PRODUCTION.md](docs/CHECKLIST_PRODUCTION.md).

> **Version Windows prête à lancer** (un seul `.exe`, sans serveur) :
> [../sms-reminders-desktop/](../sms-reminders-desktop/README.md).

## Démarrage rapide (poste de développement)

Prérequis : Python 3.11+.

```bash
cd sms-reminders
python -m venv .venv && source .venv/bin/activate      # Windows : .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
python -m sms_reminders.cli hash-password               # puis renseigner SMR_UI_USERS et SMR_SESSION_SECRET dans .env
python -m sms_reminders.cli init-db
python -m sms_reminders.cli demo --with-example-templates   # facultatif : données FICTIVES + templates d'exemple

# deux processus :
python -m sms_reminders.cli serve      # interface : http://127.0.0.1:8000
python -m sms_reminders.cli worker     # moteur de planification persistant
```

Le **worker** est le moteur d'envoi : il tourne côté serveur, indépendamment des navigateurs
(fermer l'application ou éteindre son ordinateur n'a aucun effet sur les relances).

| Commande | Rôle |
|---|---|
| `serve [--host --port]` | interface web |
| `worker [--once]` | moteur de planification (boucle, ou un seul passage pour un cron) |
| `init-db` | crée les tables et les paramètres par défaut |
| `hash-password` | hache un mot de passe pour `SMR_UI_USERS` |
| `purge` | purge de conservation (aussi exécutée toutes les heures par le worker) |
| `schema` | affiche le schéma SQL PostgreSQL (copie : [docs/schema.sql](docs/schema.sql)) |
| `demo [--with-example-templates]` | données fictives (dev + simulation uniquement) |
| `python -m pytest` | tests automatisés |

## Fonctionnement en bref

- **Rendez-vous** : numéro client interne (identifiant CRM, jamais confondu avec le téléphone),
  nom et prénom, mobile, date et heure (Europe/Paris), service, statut de confirmation.
- **Relances** : SMS à T-48 h, 1er SMS à T-24 h, 2e SMS à T-24 h + 3 h. Durées exactes calculées
  en UTC (changements d'heure gérés). Chaque étape est une tâche distincte, unique par rendez-vous
  et par plan, re-vérifiée juste avant l'envoi (confirmation, annulation, suspension, opposition,
  numéro, service, expéditeur, template, fenêtre de validité).
- **Case « Rendez-vous confirmé »** : annule les SMS non envoyés, enregistre qui et quand.
  C'est une confirmation **interne de l'équipe**, affichée comme telle. La décocher ne réactive
  rien : la reprise des étapes encore pertinentes doit être validée explicitement.
- **Jamais de SMS en retard** : chaque SMS a une fenêtre de validité (par défaut 60 min). Après
  une panne, il passe en « Expiré » au lieu de partir tard. Un rendez-vous importé après
  l'échéance d'une relance ne déclenche pas d'envoi rétroactif.
- **Jamais de doublon** : clé d'unicité par étape, réservation atomique des tâches, et un
  envoi interrompu au mauvais moment devient « À vérifier » au lieu d'être renvoyé.

## Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture, cycle de vie d'un SMS, garanties, schéma de base de données |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | installation, lancement, comptes, déploiement Docker / PostgreSQL |
| [docs/FOURNISSEUR_SMS.md](docs/FOURNISSEUR_SMS.md) | configurer le fournisseur SMS et les numéros d'expédition |
| [docs/TEMPLATES.md](docs/TEMPLATES.md) | ajouter et activer les six templates |
| [docs/IMPORT.md](docs/IMPORT.md) | format des fichiers d'import, doublons, exemples |
| [docs/CONFORMITE.md](docs/CONFORMITE.md) | sécurité, RGPD, règles applicables aux SMS — points à valider |
| [docs/CHECKLIST_PRODUCTION.md](docs/CHECKLIST_PRODUCTION.md) | ce qui reste à fournir / décider avant la mise en production |
| [examples/](examples/) | fichiers d'import d'exemple (CSV et Excel, données fictives) |
