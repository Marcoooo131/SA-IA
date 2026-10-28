# Tuto : la version Azure de l'agent (lecture des lettres)

Ce dossier, `movers-dispatch-azure`, contient **la même version** que `movers-dispatch` (même tableau,
mêmes règles, même rotation), **plus** la lecture des courriers scannés par **Azure AI Document
Intelligence** (Microsoft). L'agent lit la lettre, même manuscrite, et cherche le client avec le n° client
ou le téléphone qu'il a lu. **Vous validez toujours le client proposé.**

> **Une seule version à la fois.** Utilisez soit `movers-dispatch`, soit `movers-dispatch-azure`, jamais
> les deux le même jour : chaque dossier a son propre journal et sa propre position de rotation.

---

## 0. Avant de commencer : l'accord de l'entreprise (obligatoire)

Les lettres des clients seront envoyées à Azure. Avant d'activer la lecture, demandez par écrit à
**l'informatique** et au **DPO** :

1. leur **accord** pour envoyer les courriers scannés du service Movers à *Azure AI Document Intelligence* ;
2. la création d'une ressource **Azure AI Document Intelligence** sur le compte Azure **de l'entreprise**,
   en **région Europe** (par exemple *France Central* ou *West Europe*) ;
3. de vous donner **deux informations** de cette ressource (page « Clés et point de terminaison ») :
   - **le point de terminaison (endpoint)**, qui ressemble à `https://xxxx.cognitiveservices.azure.com/`
   - **une clé** (une longue suite de lettres et de chiffres)

N'utilisez **jamais** un compte Azure personnel ni une carte bancaire personnelle.

Sans cet accord, vous pouvez quand même installer ce dossier : tant que la lecture n'est pas activée,
il fonctionne exactement comme `movers-dispatch`.

---

## 1. Récupérer le dossier

1. Téléchargez le ZIP de la branche **main** du projet (bouton **Code → Download ZIP**), comme d'habitude.
2. Extrayez-le **hors OneDrive**, par exemple dans `C:\Users\VOTRE-NOM\SA-IA`.
3. Ouvrez le dossier **`movers-dispatch-azure`**.

## 2. Installer (une seule fois)

1. Ouvrez le dossier `windows` et double-cliquez sur **`1-installer.bat`**.
2. Attendez la fin : « Installation terminée ».

## 3. Reprendre vos réglages de l'ancien dossier

Pour ne rien perdre, copiez ces fichiers **depuis `movers-dispatch` vers `movers-dispatch-azure`** (Copier,
puis Coller, et choisir **Remplacer**) :

| Fichier ou dossier | À quoi il sert |
|---|---|
| `dispatch.toml` | Votre configuration : adresse du CRM, les 4 collègues, les rotations |
| `movers_dispatch.db` | Le journal, la position de chaque rotation, les absents et l'historique de supervision |
| `.browser-profile` (dossier) | La connexion Edge déjà faite. Facultatif : sans lui, vous vous reconnectez une fois |

> Fermez d'abord **toutes les fenêtres noires** de l'agent, sinon la copie du journal peut échouer.

## 4. Essayer sur des données fictives

Double-cliquez sur **`windows\2-demo.bat`**. Le tableau de démonstration s'ouvre.

1. Cliquez sur **Lancer le traitement**.
2. Repérez la ligne **« Voir document joint (démo 16) »** : la colonne Compte affiche
   « à rattacher Client Démo N — via n° client lu dans la pièce jointe (j'ai lu : n° 10090016) ».
3. Cliquez sur **Lire la lettre (Azure)** : une fenêtre affiche ce qui a été lu et le compte trouvé, et le
   n° est prérempli dans la case.

En démo, aucune lettre n'est envoyée à Azure : un faux lecteur lit la lettre fictive à sa place.

Fermez la fenêtre noire pour arrêter la démo.

## 5. Mettre la clé Azure dans Windows (une seule fois)

La clé n'est **jamais** écrite dans `dispatch.toml`. Elle est rangée dans une variable de votre compte
Windows :

1. Menu **Démarrer** → tapez **variables d'environnement**.
2. Cliquez sur **Modifier les variables d'environnement pour votre compte**.
3. Dans la partie du haut (« Variables utilisateur »), cliquez sur **Nouvelle…**
   - **Nom de la variable** : `MD_AZURE_DI_KEY`
   - **Valeur de la variable** : la clé donnée par l'informatique (collez-la sans espace avant ni après)
4. Cliquez sur **OK**, puis à nouveau sur **OK**.
5. Fermez **toutes** les fenêtres noires de l'agent (Windows ne transmet la variable qu'aux fenêtres
   ouvertes après).

Ne donnez la clé à personne et ne l'envoyez pas par mail ou dans une discussion.

## 6. Activer la lecture dans `dispatch.toml`

1. Clic droit sur `dispatch.toml` → **Ouvrir avec** → **Bloc-notes**.
2. Tout en bas du fichier, ajoutez ces trois lignes, en mettant l'adresse donnée par l'informatique :

   ```toml
   [lecture]
   active = true
   endpoint = "https://NOM-DONNÉ-PAR-L-INFORMATIQUE.cognitiveservices.azure.com"
   ```

   - Guillemets droits `"` obligatoires.
   - Pas de `/` à la fin, ce n'est pas grave s'il y en a un.
   - Si une section `[lecture]` existe déjà dans le fichier, modifiez-la au lieu d'en ajouter une
     deuxième.
3. **Fichier → Enregistrer**, puis fermez le Bloc-notes.

## 7. Lancer l'agent

Double-cliquez sur **`windows\4-lancer.bat`**, connectez-vous dans Edge comme d'habitude : le tableau
de bord s'ouvre.

- **Aucun bandeau sur la lecture** : tout est prêt.
- **Bandeau « Lecture des lettres désactivée… »** : voir « En cas de souci » plus bas. Le reste de l'agent
  fonctionne normalement.

## 8. Au quotidien

Lancez le traitement (en **Supervisé** pendant les premières semaines). Pour chaque mail dont le client
n'est pas retrouvé et qui a une lettre en pièce jointe, l'agent la fait lire par Azure.

**Cas 1 : l'agent a trouvé le client.**
La colonne Compte affiche par exemple :
« à rattacher **Client X (10075432)** — via n° client lu dans la pièce jointe (j'ai lu : n° 10075432) ».

1. Cliquez sur **Voir la pièce jointe** : la lettre s'ouvre dans un onglet.
2. Vérifiez que **le n° et le nom** de la lettre correspondent au compte proposé.
3. C'est bon :
   - ligne **À valider** → cliquez sur **Valider** ;
   - ligne **Validation humaine** (pas de Case Movers) → dans **Attribuer à…**, choisissez **Suivant
     en …** (la rotation qui correspond à la lettre), puis **Attribuer** : l'agent remplit le Regarding
     avec ce client, puis le Worked By.
4. C'est faux : tapez le bon n° dans la case, cliquez sur **Corriger le client**, puis vérifiez le nom
   affiché avant de faire OK.

**Cas 2 : l'agent n'a pas trouvé de client.**
Le motif dit ce qu'il a lu, par exemple :
« J'ai lu dans la pièce jointe : n° 10086599 — aucun compte actif ne correspond… ».
Ouvrez la lettre, tapez le bon n°, puis cliquez sur **Rattacher le client**, comme avant.

**Le bouton « Lire la lettre (Azure) »** relit la lettre à la demande. Il affiche :
- chaque n° lu et le compte qui y correspond (ou « aucun compte actif ») ;
- le téléphone lu, masqué (06••••0135) ;
- le client proposé, avec son n° prérempli dans la case.

**Rien n'est écrit dans le CRM** tant que vous n'avez pas cliqué sur **Rattacher le client**, **Valider**
ou **Attribuer**.

**Ce que l'agent garde :** uniquement le n° client, le téléphone et l'adresse e-mail trouvés, pour la
session en cours. Le texte de la lettre n'est jamais enregistré. Une même lettre n'est envoyée qu'une
fois à Azure par session.

**Même en mode Automatique**, un client trouvé dans une lettre attend toujours votre validation : un
chiffre mal lu peut désigner un autre vrai client.

## 9. Désactiver la lecture

Dans `dispatch.toml`, remplacez `active = true` par `active = false` dans la section `[lecture]`, puis
relancez l'agent. Il refonctionne comme avant : « Voir la pièce jointe », puis vous tapez le n° vous-même.

---

## En cas de souci

| Ce que vous voyez | Que faire |
|---|---|
| « Lecture des lettres désactivée : la variable Windows MD_AZURE_DI_KEY (clé Azure) est vide » | Refaire l'étape 5, fermer **toutes** les fenêtres noires, puis relancer `4-lancer.bat`. |
| « [lecture] endpoint : adresse https… » au lancement | L'adresse de l'étape 6 est vide ou ne commence pas par `https://`. La corriger. |
| « Azure a répondu HTTP 401 (clé refusée…) » | La clé est fausse ou a été renouvelée. Redemander la clé à l'informatique, puis refaire l'étape 5. |
| « Azure a répondu HTTP 404 » | L'adresse (endpoint) est fausse. La vérifier avec l'informatique. |
| « Azure injoignable » | Le réseau de l'entreprise bloque Azure, ou l'adresse est fausse. Contacter l'informatique. |
| « Lecture Azure trop longue » | Azure est lent : relancer plus tard ou cliquer sur « Lire la lettre (Azure) ». |
| « Pièce jointe dans un format non lu » | Ce n'est ni un PDF ni une image : l'ouvrir dans le CRM et taper le n° vous-même. |
| Pas de bouton « Lire la lettre (Azure) » | La lecture n'est pas active (étape 6) ou le mail n'a pas de pièce jointe. |
| « Le port 8765 est déjà pris » | Une autre fenêtre de l'agent est ouverte. L'agent prend le port suivant tout seul ; fermez quand même l'ancienne fenêtre. |
| Tout le reste (connexion au CRM, rotation, corrections…) | Voir `TUTORIEL.md`, identique pour ce dossier. |
