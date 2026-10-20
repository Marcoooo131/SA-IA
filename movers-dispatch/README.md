# Dispatch Movers Emails — agent Dynamics 365

Agent qui parcourt la file **Movers Emails** de Dynamics 365, retrouve le **Case** du compte client
indiqué dans le champ **Regarding** du mail, lit l'**Owner** de ce Case et renseigne le même collaborateur
dans le champ **Worked By** du Queue Item. Seuls Kader, Estefania, Marc-Antoine et Chloé peuvent être affectés.

> **État actuel : à lire avant toute utilisation**
>
> | Élément | État |
> |---|---|
> | Règles de décision, modes Simulation / Supervisé / Automatique, arrêt immédiat, journal, tableau de bord | **Opérationnels**, testés sur des données **fictives** (48 tests) |
> | Connexion « navigateur » (session Dynamics 365 de l'utilisateur) | Testée dans un vrai Chromium face à un **serveur imitant le Web API**, jamais face au vrai CRM |
> | Connexion « msal » (application Entra ID) | Écrite, **non testée** : il faut une application enregistrée et approuvée par l'IT |
> | Vidéo de la procédure | **Absente du dépôt** : la correspondance avec l'écran réel reste à confirmer (§ 2) |
> | Identifiants des 4 collaborateurs, file ou vue Movers Emails | **Non renseignés** : à relever avec `discover`. Toute écriture reste bloquée en attendant |
> | Règle « Case pertinent pour Movers » | **Non définie par le métier.** Aujourd'hui : Case actif dont l'Owner est un des 4 collaborateurs ; tout cas ambigu part en validation humaine |
> | Mode Automatique | **Désactivé** par la configuration (`automatic_allowed = false`) |

## 1. Processus compris

Procédure manuelle, telle que décrite dans la demande :

1. Tableau de bord *Churn - Defence Main activities* → sous-tableau *Queue Item - Movers Emails* → double-clic sur un mail.
2. Fiche du mail → champ **Regarding** → fiche du compte client → sous-tableau **Cases**.
3. Choix du Case pertinent → lecture de son **Owner** (un des 4 collaborateurs).
4. Retour au mail → *Save and Close* (le mail n'est pas modifié : ce clic sert à fermer la fiche).
5. Sur l'élément de la file : menu « … » → **Queue Item Detail** → champ **Worked By**.
6. Choix du collaborateur dans la liste de **Worked By** → *Save and Close* → second *Save and Close* pour fermer le parcours.

Seule l'étape 6 modifie le CRM : elle écrit **Worked By** sur le **Queue Item**. Les autres étapes sont des lectures.

## 2. Informations techniques réellement accessibles

- **Aucune vidéo dans le dépôt**, ni accès au CRM depuis cet environnement de développement. Je n'ai donc
  relevé ni sélecteur d'écran, ni identifiant d'utilisateur, ni nom de file réel. Aucun n'est inventé dans
  le code : chaque valeur propre à Sector Alarm se trouve dans la configuration, relevée avec `discover`.
- Ce que Dynamics 365 documente publiquement, et que l'agent **vérifie lui-même** au démarrage dans les
  métadonnées de votre environnement (`preflight`) :

| Écran de la procédure | Table / colonne Dataverse (standard Microsoft) |
|---|---|
| Élément de la file Movers Emails | `queueitem` (clé unique `queueitemid`, file `queueid`, objet `objectid`) |
| Champ **Worked By** du Queue Item Detail | `queueitem.workerid`, lookup vers `systemuser`, écrit par `workerid_systemuser@odata.bind` |
| Mail | `email` (`activityid`, `subject`) |
| Champ **Regarding** | `email.regardingobjectid`, qui doit pointer vers un `account` |
| Sous-tableau **Cases** du compte | `incident` filtré sur `customerid` = le compte (`ticketnumber`, `statecode`, `ownerid`) |
| Owner du Case → collaborateur | `incident.ownerid` → `systemuser` (`firstname`, `fullname`, `isdisabled`) |

- Le sous-tableau *Queue Item - Movers Emails* peut être une **file** ou une **vue**. `discover` liste les
  deux, et la configuration accepte l'une ou l'autre (`queue_name`, `saved_view_id`, `user_view_id`).
- Le champ **Worked By** est distinct de l'Owner du Queue Item, de l'Owner du mail et de l'Owner du Case.
  L'agent n'écrit **que** `workerid` et ne touche à aucun Owner.

## 3. Méthode d'intégration retenue

On respecte l'ordre de préférence demandé :

1. **API officielle : Dataverse Web API**, le mécanisme sur lequel s'appuie l'interface Dynamics 365.
   Elle évite les clics, les coordonnées et les délais fixes, et elle s'applique **avec les droits de
   l'utilisateur connecté**. Deux façons d'ouvrir la session, sans mot de passe transmis à l'agent :
   - `browser` (recommandé pour démarrer) : une fenêtre Edge/Chromium s'ouvre et vous vous connectez à
     Dynamics 365 comme d'habitude (MFA comprise). L'agent appelle ensuite le Web API **depuis cette page**,
     avec la session de cette page. Rien à enregistrer côté Entra ID, mais **à faire valider par l'IT**.
   - `msal` : jeton délégué Microsoft Entra ID via une application enregistrée et approuvée par l'IT
     (permission `user_impersonation` de Dynamics CRM). C'est la voie la plus « officielle » pour un usage durable.
2. **Rejouer les clics** dans l'interface (Playwright) n'est **pas** implémenté. Le Web API couvre toutes
   les étapes, et des sélecteurs d'écran ne peuvent pas être vérifiés sans la vidéo ni le CRM. Si l'IT refuse
   les deux connexions ci-dessus, cette voie reste possible avec la même logique de décision : il faudrait
   alors relever les sélecteurs (`data-id`, libellés accessibles) sur l'écran réel.

Correspondance avec la procédure filmée : les *Save and Close* du mail ne modifient rien, donc l'agent ne
fait **aucune écriture sur le mail**. Les deux *Save and Close* du Queue Item Detail correspondent à
**une seule** écriture de `workerid`, faite avec l'ETag lu juste avant. L'agent relit ensuite la valeur
pour confirmer l'enregistrement.

### Déroulé contrôlé, par élément

1. Relire le Queue Item (identité, Worked By actuel, ETag).
2. Lire le mail, puis son Regarding : il doit s'agir d'un **compte** (jamais une recherche par nom).
3. Lire les Cases du compte et ne garder que les **pertinents** : actifs, et conformes aux règles `[cases]`.
4. Ne garder que les Cases dont l'Owner est un `systemuser` dont l'**identifiant** figure dans la
   configuration. Le prénom ne sert que de contrôle croisé, jamais à identifier quelqu'un.
5. Décider (`rules.py`) :

| Situation | Résultat |
|---|---|
| Un seul Case pertinent appartenant à un des 4, collaborateur actif, Worked By vide | **affectable** |
| Worked By déjà égal au bon collaborateur | ignoré (déjà traité) |
| Worked By déjà renseigné avec quelqu'un d'autre | validation humaine (**jamais écrasé**) |
| Plusieurs Cases pertinents, Owners différents | validation humaine |
| Plusieurs Cases pertinents, même Owner | validation humaine (ou affectation si `multiple_same_owner = "assign"`) |
| Aucun Case pertinent / Owner hors des 4 (autre personne, équipe) | validation humaine, aucune affectation |
| Mail sans Regarding / Regarding qui n'est pas un compte | validation humaine |
| Collaborateur inactif | validation humaine |
| Prénom CRM ≠ prénom configuré pour cet identifiant | erreur de configuration |

6. Selon le mode : proposer, attendre la validation, ou écrire **une fois** puis relire.

### Modes

| Mode | Écritures | Activation |
|---|---|---|
| **Simulation** (défaut) | aucune : le connecteur lui-même refuse toute écriture | par défaut |
| **Supervisé** | une par validation humaine. Avant d'écrire, l'agent relit tout : si la situation a changé, il n'écrit pas | choix dans le tableau de bord |
| **Automatique** | cas non ambigus uniquement | `automatic_allowed = true` dans la configuration **et** saisie de `AUTOMATIQUE` à chaque lancement (ou `--confirm-automatic`) |

**Arrêt immédiat** (bouton rouge) : plus aucune écriture après le clic. Une requête déjà partie va à son
terme et sa valeur est relue.

### Échecs

| Cas | Comportement |
|---|---|
| Session expirée (HTTP 401) | arrêt du traitement, rien n'est écrit |
| Page ou API qui ne répond pas (lecture) | élément en erreur, traitement des suivants (aucune écriture en jeu) |
| Enregistrement refusé (403, droits…) | élément en erreur, **arrêt du traitement** |
| Modification simultanée (ETag ≠, HTTP 412) | élément en erreur, **arrêt du traitement**, rien n'est écrasé |
| Enregistrement sans réponse | **pas de second envoi** : relecture, puis « affecté » si la valeur est bien là, sinon erreur et arrêt |
| Valeur relue ≠ valeur écrite | erreur et arrêt |
| Métadonnées non conformes (Worked By non modifiable, propriété de navigation absente…) | aucune écriture possible (Simulation reste disponible) |

## 4. Risques et limites

- **Règle du « Case pertinent pour Movers » inconnue.** Tant que le métier ne l'a pas fixée (type de Case,
  sujet, file…), l'agent retient tout Case actif et renvoie les cas ambigus en validation humaine. À
  préciser dans `[cases].rules`, avant d'autoriser le mode Automatique.
- **Correspondance avec l'écran non vérifiée.** Sans la vidéo, il reste à confirmer que *Worked By* est
  bien la colonne standard `workerid`. `discover` affiche son libellé réel et refuse d'écrire si elle n'est
  pas modifiable. Il faut aussi confirmer que le sous-tableau Cases de la fiche client correspond bien aux
  Cases dont le compte est le *customer*.
- **Connexion `browser`** : elle utilise la session de l'utilisateur, sans contourner aucun contrôle. Elle
  reste un usage automatisé de cette session, que la politique de l'entreprise doit autoriser.
- **Droits** : l'agent a exactement les droits de l'utilisateur connecté. Si celui-ci ne peut pas modifier
  Worked By, l'agent ne le pourra pas non plus (erreur 403 journalisée).
- **Données personnelles** : le journal conserve des identifiants, le sujet tronqué à 80 caractères, le nom
  du compte, le n° de Case et les prénoms et noms des collaborateurs. Il ne garde ni corps de mail, ni
  adresse, ni téléphone. Le fichier `movers_dispatch.db` reste sur le poste : il faut en définir la durée
  de conservation.

## 5. Plan de développement

| Étape | État |
|---|---|
| 1. Logique de décision et tests des 10 scénarios demandés (données fictives) | fait |
| 2. Connecteur Dataverse : lectures, écriture unique avec ETag, contrôles des métadonnées | fait (testé face à un faux serveur) |
| 3. Session utilisateur : navigateur (testé dans Chromium) et MSAL | fait |
| 4. Modes, arrêt immédiat, journal, tableau de bord responsive | fait |
| 5. **Vous** : `discover` sur le vrai CRM, report des identifiants dans la configuration, confirmation du libellé Worked By et de la file ou vue | à faire |
| 6. **Vous + métier** : règle du Case Movers dans `[cases].rules` | à faire |
| 7. Simulation sur la vraie file, puis comparaison des propositions avec vos affectations manuelles | à faire |
| 8. Mode Supervisé sur quelques mails réels, avec contrôle dans Dynamics 365 | à faire |
| 9. Si tout concorde : `automatic_allowed = true` | à décider |

## Installation et utilisation

Prérequis : Python 3.11+ (Windows ou Linux).

```bash
cd movers-dispatch
python -m venv .venv && .venv\Scripts\activate        # Linux : source .venv/bin/activate
pip install -e ".[browser]"                            # ou ".[msal]" ; ajouter ",dev" pour les tests
python -m playwright install msedge                    # connexion navigateur avec Edge (ou laisser vide : chromium)

# Essai sans CRM, sur des données FICTIVES :
movers-dispatch serve --demo

# Sur le vrai CRM :
copy config\dispatch.example.toml dispatch.toml        # puis renseigner environment_url
movers-dispatch discover -c dispatch.toml              # lecture seule : contrôles, files, vues, utilisateurs
# → reporter queue_name (ou la vue) et les 4 systemuser_id dans dispatch.toml
movers-dispatch run -c dispatch.toml                   # Simulation
movers-dispatch serve -c dispatch.toml                 # tableau de bord : lien affiché dans la console
```

| Commande | Rôle |
|---|---|
| `discover -c …` | lecture seule : connexion, métadonnées de Worked By, files et vues « Movers », utilisateurs par prénom |
| `login -c …` | ouvre la session Dynamics 365 |
| `run -c … [--mode simulation\|supervise\|automatique] [--confirm-automatic]` | un passage sur la file. En Supervisé, validation question par question |
| `serve -c … [--port 8765]` | tableau de bord local (127.0.0.1), lien à usage unique affiché au lancement |
| `journal -c … [--events]` | export CSV de l'état des éléments ou de l'historique détaillé |
| `python -m pytest` | tests (`MD_TEST_BROWSER=<chemin de chrome>` pour lancer aussi le test dans un vrai navigateur) |

Le tableau de bord affiche les compteurs demandés (détectés, traités, affectations, ignorés, à valider,
erreurs), une ligne par mail (élément, sujet tronqué, compte, Case, Owner, Worked By proposé, statut,
motif) et l'historique de chaque élément.

### Journal (`movers_dispatch.db`, SQLite)

- `items` : état courant de chaque Queue Item (clé `queueitemid`), Case retenu, Owner, Worked By
  proposé ou écrit, statut et motif.
- `events` : historique horodaté et non modifiable : lecture de la file, évaluation (avec les Cases vus),
  écriture, relecture, échecs, validations humaines (avec leur auteur), arrêts.
- `runs` : chaque passage, avec son mode et son résultat.

## Structure

```
movers_dispatch/
  rules.py        décision pure (aucun accès réseau) — le cœur métier
  engine.py       séquence contrôlée, modes, arrêt, écriture unique + relecture
  dataverse.py    lectures / écriture Web API, contrôles de métadonnées, erreurs
  transports.py   session utilisateur : navigateur (Playwright) ou MSAL
  journal.py      SQLite : états, historique, passages
  fake.py         CRM en mémoire, données FICTIVES (tests et démo)
  web/            tableau de bord local
config/dispatch.example.toml
```
