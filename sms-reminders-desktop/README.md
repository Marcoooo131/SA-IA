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

L'application est en **envoi réel** (pas de simulation, pas de compte chez un fournisseur). Tant
qu'aucun téléphone n'est relié, un bandeau rouge l'indique et les SMS restent en attente (« Bloqué ») :
ils partent dès que le téléphone est relié, s'ils sont encore dans leur fenêtre de validité.

## Mettre en service l'envoi réel : les téléphones de l'entreprise (une seule fois)

Un PC ne peut pas envoyer de SMS lui-même : un SMS part toujours d'une carte SIM. Ici, ce sont **les
téléphones de l'entreprise qui envoient les SMS depuis leur propre SIM** : le client reçoit le SMS du
vrai numéro (06 44 64 59 42 pour Movers, 07 57 59 92 89 pour Takeovers) et peut y répondre. Aucun
compte, aucun abonnement, aucun intermédiaire.

Sur **chaque téléphone Android** (celui qui contient la SIM du numéro) :

1. Installer l'application gratuite et open source **SMS Gate** (« SMS Gateway for Android »,
   sms-gate.app — Google Play ou le fichier APK du site).
2. L'ouvrir, autoriser l'envoi de SMS, activer **« Serveur local »** (*Local server*) puis **Démarrer**.
   L'application affiche une **adresse** (ex. `192.168.1.23:8080`), un **identifiant** et un **mot de passe**.
3. Laisser le téléphone allumé, branché, connecté au **même Wi-Fi que le PC**, et désactiver
   l'optimisation de batterie pour SMS Gate (sinon Android peut la mettre en veille).

Dans Relances SMS, *Paramètres → Téléphones d'envoi* :

4. Pour Movers (et Takeovers), recopier l'adresse, l'identifiant et le mot de passe affichés par le
   téléphone ; cocher la case de validation ; **Enregistrer les téléphones**. Les mots de passe sont
   rangés dans le coffre de Windows.
5. **Envoyer un SMS de test** vers votre mobile et vérifier qu'il arrive bien du bon numéro.

Un seul téléphone peut servir aux deux services (même adresse dans les deux cadres) ; les SMS
partiront alors tous de son numéro.

> Limites : le téléphone doit être joignable depuis le PC. Certains Wi-Fi d'entreprise isolent les
> appareils entre eux : si le test indique « Téléphone injoignable », essayer le partage de connexion
> du téléphone (le PC s'y connecte) ou demander à la DSI d'autoriser la connexion. Les SMS envoyés
> sont décomptés du forfait de la SIM.

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
| Téléphones d'envoi : adresses et identifiants (non secrets) | `%APPDATA%\RelancesSMS\config.env` (modèle : `config.example.env`) |
| Mots de passe des téléphones | Gestionnaire d'identification Windows, entrée « RelancesSMS » |

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
