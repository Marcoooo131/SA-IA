# Assistant Movers — réinstallation (Moving Out)

Application Python **locale**, sans IA, pour traiter un dossier Movers « le client emmène son alarme »
dans le CRM Sector Alarm. L'agent saisit le **numéro client** et la **nouvelle adresse**. L'assistant crée le
case, récupère et complète le Work Order, aide à réserver le technicien, envoie le **SMS** et l'**email** de
confirmation, puis affiche un compte rendu. Les étapes reprennent le [guide Movers débutant](../guide-movers-debutant/).

> **État actuel : à lire avant toute utilisation**
>
> | Élément | État |
> |---|---|
> | Parcours complet, arrêts de sécurité, interface rouge et noire, journal | **Opérationnels**, testés sur un **CRM fictif** (18 tests) |
> | Connexion au CRM (session Edge de l'agent, API Web officielle) | Reprise de [`movers-dispatch`](../movers-dispatch/README.md), **jamais testée face au vrai CRM** |
> | Noms techniques du CRM (champs Movers du case, table Work Order, table SMS, produits) | **Non renseignés** : à relever avec `decouvrir`. Toute écriture reste bloquée en attendant |
> | Création du WO après « Completed Move Out Info » | Si le CRM ne le crée pas tout seul, l'assistant ouvre le case dans Edge et demande de cliquer **Finish** |
> | Booking | Méthode **assistée** : l'assistant prépare la période et ouvre la fiche du WO, **l'agent clique « Get appointments »** et choisit le créneau, l'assistant relit la réservation. La récupération directe des créneaux sera branchée une fois l'action CRM relevée (`decouvrir --observer-booking`) |
> | SMS | **Envoyé par l'assistant** après validation de l'agent, via l'activité SMS du CRM (table à relever). Contrôle de doublon avant envoi |
> | Email | Modèle CRM « Récapitulatif concernant votre déménagement », file **Movers** en expéditeur, actions standard `InstantiateTemplate` et `SendEmail` |
> | Validation IT (usage automatisé de la session CRM) | **À obtenir**, comme pour movers-dispatch |

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
| `windows\4-lancer.bat` | assistant sur le vrai CRM |

Comptes de démo : `10000001` cas normal · `10000002` case Movers déjà ouvert · `10000003` aucun créneau (No Cap)
· `10000004` WO non créé (Finish) · `10000005` SMS déjà présent (doublon).

### Mise en service sur le vrai CRM

1. `3-decouvrir.bat` : reporter dans `assistant.toml` les noms affichés dans `decouverte.txt` (adresse du CRM,
   champs Movers du case et leurs valeurs, table Work Order, table SMS, produits). Le rapport ne contient que des
   noms de tables et de champs.
2. Facultatif : `3-decouvrir.bat --observer-booking 120`, puis cliquer soi-même « Get appointments » sur un WO de
   test. Le rapport liste les appels faits par le CRM (méthode + adresse, sans contenu) pour brancher la
   récupération directe des créneaux.
3. `4-lancer.bat`, sur un **dossier de test** d'abord.

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
| `parcours.py` | enchaînement, aperçus, arrêts |
| `crm.py` / `transport.py` | API Web du CRM avec la session Edge de l'agent |
| `decouverte.py` | relevé des noms techniques |
| `fake.py` | CRM fictif (démo, tests) |
| `journal.py` | journal en mémoire, téléphones et emails masqués |
| `web/` | interface locale rouge et noire |

Tests : `python -m pytest`.
