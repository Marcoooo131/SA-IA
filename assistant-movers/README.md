# Assistant Movers — réinstallation (Moving Out)

Application Python **locale**, sans IA, pour traiter un dossier Movers « le client emmène son alarme »
dans le CRM Sector Alarm. L'agent saisit le **numéro client** et la **nouvelle adresse**. L'assistant crée le
case, récupère et complète le Work Order, aide à réserver le technicien, envoie le **SMS** et l'**email** de
confirmation, puis affiche un compte rendu. Les étapes reprennent le [guide Movers débutant](../guide-movers-debutant/).

> **État actuel : à lire avant toute utilisation**
>
> | Élément | État |
> |---|---|
> | Modes **Test** (lecture réelle, aucune écriture, affiche ce qui aurait été écrit) et **Supervisé** (chaque écriture validée par l'agent) | **Opérationnels** |
> | Parcours complet, arrêts de sécurité, interface rouge et noire, journal | **Opérationnels**, testés sur un **CRM fictif** (32 tests) |
> | Connexion au CRM (session Edge de l'agent, API Web officielle) | Reprise de [`movers-dispatch`](../movers-dispatch/README.md), **jamais testée face au vrai CRM** |
> | Noms techniques du CRM (champs Movers du case, table Work Order, table SMS, produits) | **Non renseignés** : à relever avec `decouvrir`. Toute écriture reste bloquée en attendant |
> | Création du WO après « Completed Move Out Info » | Si le CRM ne le crée pas tout seul, l'assistant ouvre le case dans Edge et demande de cliquer **Finish** |
> | Booking | Méthode **assistée** : l'assistant prépare la période et ouvre la fiche du WO, **l'agent clique « Get appointments »** et choisit le créneau, l'assistant relit la réservation. La récupération directe des créneaux sera branchée une fois l'action CRM relevée (`decouvrir --observer-booking`) |
> | SMS | **Envoyé par l'assistant** après validation de l'agent, via l'activité SMS du CRM (table à relever). Contrôle de doublon avant envoi |
> | Email | Modèle CRM « Récapitulatif concernant votre déménagement », file **Movers** en expéditeur, actions standard `InstantiateTemplate` et `SendEmail` |
> | Validation IT (usage automatisé de la session CRM) | **À obtenir**, comme pour movers-dispatch |

**👉 Mise en route pas à pas, dont la partie découverte : [TUTORIEL.md](TUTORIEL.md).**

## Modes

| | Test (par défaut) | Supervisé |
|---|---|---|
| Lectures (compte, installations, contrats) | réelles | réelles |
| Case, WO, SMS, email | **rien n'est écrit** : le corps exact de chaque écriture est affiché, avec un résultat fictif | écrits **après le clic de l'agent** |
| Rendez-vous | créneaux fictifs | l'agent réserve dans le CRM, l'assistant relit |
| Configuration incomplète | fonctionne et nomme le champ manquant | bloqué |

Le changement de mode se fait dans l'en-tête, entre deux dossiers.

## Règles de fonctionnement

- **100 % local** : serveur sur `127.0.0.1`, aucune IA, aucun service externe. Mêmes composants que
  movers-dispatch (FastAPI, Uvicorn, Playwright avec l'**Edge déjà installé**) : rien de nouveau à faire valider.
- **Aucun mot de passe** : l'agent se connecte lui-même au CRM dans la fenêtre Edge ; l'assistant a exactement ses droits.
- **Rien n'est conservé** : dossier, journal et profil du navigateur sont effacés à la fermeture.
- **Chaque écriture part d'un clic de l'agent**, après un aperçu de ce qui sera écrit.
- **Arrêt au moindre doute** : avertissement du CRM (case ou WO déjà ouvert, mobile ou email absent), erreur,
  valeur relue différente, SMS déjà présent pour cette date, champ d'email encore surligné. L'assistant affiche
  le message et la consigne, et n'essaie jamais de refaire une écriture tout seul.
- Le **choix du pack** reste à l'agent.

## Démarrage (Windows)

| Fichier | Rôle |
|---|---|
| `windows\1-installer.bat` | installe les composants (une fois) et crée `assistant.toml` |
| `windows\2-demo.bat` | démo sur un CRM fictif (comptes 10000001 à 10000005) |
| `windows\3-decouvrir.bat` | relève les noms techniques du CRM dans `decouverte.txt` (lecture seule) |
| `windows\4-lancer.bat` | assistant sur le vrai CRM (démarre en mode Test) |
| `windows\5-verifier.bat` | contrôle chaque nom de `assistant.toml` dans le CRM (`verification.txt`) |

Comptes de démo : `10000001` cas normal · `10000002` case Movers déjà ouvert · `10000003` aucun créneau (No Cap)
· `10000004` WO non créé (Finish) · `10000005` SMS déjà présent (doublon).

### Mise en service sur le vrai CRM (détail dans le [tuto](TUTORIEL.md))

1. `3-decouvrir.bat` → `decouverte.txt` (noms de tables et de champs uniquement) → recopier dans `assistant.toml`.
2. `5-verifier.bat` jusqu'à « tout est bon ».
3. `4-lancer.bat` en mode **Test** sur 5 dossiers réels, en comparant « Ce qui aurait été écrit » avec la saisie manuelle.
4. Mode **Supervisé**, premier dossier sur un compte de test.
5. Facultatif : `3-decouvrir.bat --observer-booking 120` pour brancher la récupération directe des créneaux.

## Structure (un fichier par fonctionnalité)

| Fichier | Étapes du guide |
|---|---|
| `compte.py` | 1-3 numéro client → compte, installation, contrat, avertissements |
| `adresse.py` | 4 nouvelle adresse contrôlée |
| `case_movers.py` | 5-6 case « Movers – Déménagement », Moving Out, Completed → WO |
| `work_order.py` | 7-8 description (modèle du guide), template Mover M, produits |
| `booking.py` | 9-11 période, créneaux, réservation, message No Cap |
| `sms.py` | 12 SMS avec la date et la tranche relues dans le WO |
| `email_confirmation.py` | 13 email depuis le modèle CRM, champs surlignés remplis |
| `rapport.py` | 14 compte rendu |
| `parcours.py` | enchaînement, modes, aperçus, arrêts |
| `simulation.py` | mode Test : écritures construites mais jamais envoyées |
| `crm.py` / `transport.py` | API Web du CRM avec la session Edge de l'agent |
| `decouverte.py` | découverte et vérification des noms techniques |
| `fake.py` | CRM fictif (démo, tests) |
| `journal.py` | journal en mémoire, téléphones et emails masqués |
| `web/` | interface locale rouge et noire |

Tests : `python -m pytest`.
