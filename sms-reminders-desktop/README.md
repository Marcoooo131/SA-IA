# Relances SMS — application de bureau Windows

Version **poste de travail** de l'outil [Relances SMS Movers & Takeovers](../sms-reminders/README.md) :
un seul fichier `RelancesSMS.exe` qui contient l'interface, la base de données et le moteur de
relance. Aucune installation de Python, de serveur ou de base de données n'est nécessaire.

> ⚠️ **À lire avant usage**
> - Les relances ne partent **que tant que l'application est ouverte et l'ordinateur allumé**. Une
>   relance dont l'heure passe pendant que l'application est fermée **n'est pas envoyée en retard**
>   (elle passe en « Expiré »). Pour des relances fiables 24 h/24, utiliser la
>   [version serveur](../sms-reminders/docs/INSTALLATION.md).
> - **Envoi réel** : dès que le fournisseur SMS est enregistré dans *Paramètres → Fournisseur SMS*
>   (une seule fois), l'application envoie de vrais SMS à chaque lancement. Avant cela, elle est en
>   simulation (aucun SMS réel). Voir « Mettre en service l'envoi réel » ci-dessous.
> - Exécutable **non signé** : Windows SmartScreen peut afficher un avertissement
>   (*Informations complémentaires → Exécuter quand même*). Pour un déploiement, le faire signer
>   par la DSI.
> - Testé automatiquement sous Windows dans GitHub Actions (construction et auto-test du `.exe`) ;
>   pas encore essayé sur un poste de l'entreprise.

## Télécharger

- **Dernière version** : page *Releases* du dépôt → « Relances SMS — application Windows » →
  `RelancesSMS-windows.zip`.
- Ou : onglet *Actions* → workflow **Relances SMS Desktop** → dernière exécution réussie →
  artefact `RelancesSMS-windows-unsigned` (compte GitHub requis, conservé 30 jours).

## Utiliser

1. Décompresser `RelancesSMS-windows.zip` (par exemple dans `Documents\RelancesSMS`).
2. Lancer `RelancesSMS.exe`. La fenêtre s'ouvre directement sur le tableau de bord, connectée avec
   votre session Windows (rôle administrateur — poste unique).
3. *Importation des clients* : importer `rendez-vous-exemple.xlsx` (fourni dans le dossier) ou
   votre fichier.
4. *Paramètres et templates* : numéros d'expédition, textes des six templates, politique de relance.
5. Laisser l'application ouverte : les relances programmées partent à leur heure.
   Fermer la fenêtre (ou « Quitter l'application ») arrête le moteur de relance.

La fenêtre est une fenêtre **Microsoft Edge en mode application** (sans barre d'adresse), avec un
profil séparé ; sans Edge, l'interface s'ouvre dans le navigateur par défaut (`RelancesSMS.exe --browser`
pour le forcer). Aucun composant .NET n'est utilisé (la version précédente plantait avec
« Failed to resolve Python.Runtime.Loader.Initialize » quand Windows bloquait ses DLL dans le zip téléchargé).

Pour arrêter l'application : fermer la fenêtre, ou **Quitter l'application** en haut à droite.
En cas de problème au démarrage, un message s'affiche et le détail est écrit dans
`%LOCALAPPDATA%\RelancesSMS\erreur-demarrage.txt`.

## Configuration Sector Alarm incluse

Au premier lancement, l'application est préremplie (modifiable ensuite dans *Paramètres*) :

| Élément | Valeur |
|---|---|
| Expéditeur Movers | 06 44 64 59 42 |
| Expéditeur Takeovers | 07 57 59 92 89 |
| SMS à 48 h (Movers et Takeovers) | « Bonjour, confirmation du rdv d'installation de votre alarme prévu le {{date_rendez_vous}}. Vous recevrez un appel la veille si vous maintenez le rendez-vous sélectionné. Absence facturée 100 €. Rdv modifiable jusqu'à 17h la veille au 0644645942. » (2 SMS) |
| 1er et 2e SMS à 24 h (Movers et Takeovers) | « Bonjour, nous avons rendez-vous pour la remise de votre système de télésurveillance le {{date_rendez_vous}}. Je vous remercie de bien vouloir nous rappeler au 0644645942. Sans confirmation de votre part nous annulerons votre rendez-vous. Cordialement, Sector Alarm. » (2 SMS) |

L'application est en **envoi réel** (pas de simulation). Tant que les identifiants du fournisseur ne
sont pas saisis, un bandeau rouge l'indique et les SMS restent en attente (« Bloqué ») : aucun SMS
n'est simulé ni perdu, ils partent dès la saisie s'ils sont encore dans leur fenêtre de validité.

## Mettre en service l'envoi réel (une seule fois)

Dans *Paramètres et templates* (la liste « État de la configuration » indique ce qui manque) :

1. **Fournisseur SMS** : choisir *Twilio — envoi réel*, saisir l'*Account SID* et l'*Auth Token*
   fournis par l'administrateur du compte Twilio, puis **Enregistrer**. L'Auth Token est rangé dans
   le coffre de Windows (Gestionnaire d'identification), jamais dans un fichier.
2. **Numéros d'expédition** Movers et Takeovers.
3. **Envoyer un SMS de test** vers votre mobile et vérifier sa réception.
4. **Templates** : activer les six textes.
5. **Conformité** : cocher la validation (juridique / DPO).

Ensuite, à chaque lancement de `RelancesSMS.exe`, les relances arrivées à échéance partent en réel.
Pour revenir en simulation : *Fournisseur SMS → Simulation*.

> L'adaptateur Twilio a été testé contre un serveur simulé, pas encore avec un vrai compte : le SMS de
> test de l'étape 3 est la première vérification réelle. Un autre fournisseur (OVH, Brevo,
> SMSFactor…) peut être ajouté sur demande.

## SMS expirés : la fenêtre « Envoyer ce SMS maintenant ? »

Quand une relance n'a pas pu partir à son heure (application fermée, ordinateur éteint, coupure), elle
n'est jamais envoyée en retard toute seule. À l'ouverture de l'application, puis toutes les 30
secondes, une fenêtre s'affiche pour chaque rendez-vous **non confirmé** dont un SMS a expiré :

- **Envoyer maintenant** : le SMS part immédiatement, après revérification de toutes les règles
  (confirmation, liste d'opposition, template, numéro d'expédition…) ;
- **Ne pas envoyer** : le SMS n'est jamais renvoyé ; la décision est inscrite dans l'historique ;
- **Plus tard** : la fenêtre revient dans 10 minutes.

Une seule question par client : si plusieurs SMS du même rendez-vous ont expiré, seul le plus récent
est proposé. Aucune question si le rendez-vous est confirmé, annulé, suspendu, ou commence dans moins
d'une heure, ni si un SMS plus récent du même rendez-vous est déjà parti.

## Où sont les données

| Élément | Emplacement |
|---|---|
| Base de données (rendez-vous, SMS, historique) | `%LOCALAPPDATA%\RelancesSMS\relances.db` |
| Journal technique (sans données clients) | `%LOCALAPPDATA%\RelancesSMS\relances.log` |
| Fournisseur et compte (non secret) | `%APPDATA%\RelancesSMS\config.env` (modèle : `config.example.env`) |
| Auth Token du fournisseur | Gestionnaire d'identification Windows, entrée « RelancesSMS » |

Désinstaller : supprimer le dossier décompressé, puis ces deux dossiers pour effacer les données.

## Sécurité

- Le serveur interne n'écoute que sur `127.0.0.1` (port aléatoire) : il n'est pas joignable depuis
  le réseau.
- L'accès se fait par un jeton aléatoire généré à chaque lancement et transmis à la fenêtre ; le
  fichier de configuration ne peut pas le remplacer, ni changer l'environnement de sécurité.
- Les données restent sur le poste : activer le chiffrement du disque (BitLocker) et protéger
  `config.env` s'il contient l'identifiant secret du fournisseur SMS.

## Vérifier une installation

`outils-test\RelancesSMS-Test.exe --selftest` démarre l'application sans fenêtre, vérifie les pages
et le moteur de relance, affiche `selftest ok` et s'arrête.

## Développement

```bash
cd sms-reminders-desktop
pip install -e "../sms-reminders[dev]" -e ".[dev]"
python -m sms_desktop --browser        # lance l'application (données : ~/.local/share/relances-sms)
python -m pytest
```

Construction du `.exe` (Windows, Python 3.12) : `.\packaging\build_windows.ps1` → `dist\RelancesSMS\`.

```
sms_desktop/app.py       lanceur : configuration, serveur local, moteur de relance, fenêtre
packaging/               construction PyInstaller (RelancesSMS.exe, RelancesSMS-Test.exe)
config.example.env       configuration facultative (fournisseur SMS…)
```
