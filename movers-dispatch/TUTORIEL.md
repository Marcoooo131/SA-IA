# Tuto : l'agent Dispatch Movers, pas à pas (Windows)

Pas besoin de savoir programmer. On **double-clique** des fichiers et on modifie **un** fichier texte avec
le Bloc-notes.

> **Rassurant :** tant que vous ne validez rien vous-même, l'agent **ne modifie rien** dans le CRM.
> Son mode de départ est la **Simulation** : il lit et il propose, c'est tout.

**Sommaire**

- **A. Installation (une seule fois, environ 30 minutes)** : étapes 1 à 6
- **B. Chaque jour** : étapes 7 à 10
- **C. Les deux semaines de supervision, puis le mode Automatique** : étape 11
- **D. Installer une nouvelle version** : étape 12
- **En cas de souci**

---

# A. Installation (une seule fois)

## Étape 1 : installer Python

1. Allez sur **https://www.python.org/downloads/** et cliquez sur le bouton jaune *Download Python 3.x*.
2. Ouvrez le fichier téléchargé.
3. ⚠️ **Avant de cliquer sur « Install Now », cochez la case « Add python.exe to PATH »**, en bas de la fenêtre.
4. Cliquez sur **Install Now** et attendez la fin.

> Si votre PC professionnel refuse l'installation (droits administrateur), demandez au support
> informatique d'installer **Python 3.12** avec l'option « Add to PATH ».

## Étape 2 : récupérer l'agent (hors OneDrive)

1. Ouvrez **https://github.com/Marcoooo131/SA-IA**, cliquez sur le bouton vert **Code**, puis sur
   **Download ZIP**.
2. ⚠️ **Ne l'extrayez pas dans Documents ni sur le Bureau** : chez vous, ces dossiers sont dans OneDrive,
   qui ralentit ou bloque l'installation. Faites plutôt ceci :
   - dans la barre d'adresse de l'Explorateur, tapez `%USERPROFILE%`, puis appuyez sur Entrée ;
   - créez-y un dossier **`SA-IA`** ;
   - faites un clic droit sur `SA-IA-main.zip` (dans *Téléchargements*), choisissez **Extraire tout…** et
     indiquez ce dossier.
3. Ouvrez `SA-IA-main\movers-dispatch\windows`. Vous y trouvez six fichiers :

| Fichier | À quoi il sert |
|---|---|
| `1-installer.bat` | installe l'agent |
| `2-demo.bat` | essai sur de **fausses** données, sans toucher au CRM |
| `3-decouvrir.bat` | lit le CRM (sans rien modifier) pour trouver les informations à recopier dans la configuration |
| `4-lancer.bat` | lance l'agent sur le vrai CRM : **c'est celui de tous les jours** |
| `5-exporter-corrections.bat` | exporte vos corrections dans un fichier Excel (étape 11) |
| `6-rappels.bat` | active les rappels, crée le dossier « Rappels » dans OneDrive et y écrit le fichier, ou dit ce qui bloque (étape 13) |

> Le dossier `movers-dispatch-ancienne-version` est une copie de secours de l'ancienne version (sans le
> bouton Corriger). Vous n'en avez normalement pas besoin.

## Étape 3 : installer l'agent

Double-cliquez sur **`1-installer.bat`**. Une fenêtre noire s'ouvre et l'installation prend quelques
minutes. Attendez le message **« Installation terminée »**, puis appuyez sur une touche.

> Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**,
> puis sur **Exécuter quand même**.

## Étape 4 : essayer sans risque (données fictives)

Double-cliquez sur **`2-demo.bat`**. Le tableau de bord s'ouvre dans votre navigateur, avec des mails, des
tâches, des formulaires HubSpot et une lettre scannée, **tous inventés**.

1. Laissez **Simulation** coché et cliquez sur **Lancer le traitement** : chaque ligne indique ce que
   l'agent ferait.
2. Cochez **Supervisé** et relancez : les boutons **Valider**, **Corriger**, **Attribuer à…**, **Voir la
   pièce jointe** et **N° de compte** apparaissent. Essayez-les librement, rien ne part dans le CRM.
3. Pour arrêter, fermez la fenêtre noire.

## Étape 5 : remplir la configuration (`dispatch.toml`)

Dans le dossier `movers-dispatch`, ouvrez **`dispatch.toml`** avec le **Bloc-notes** : clic droit, puis
**Ouvrir avec**, puis **Bloc-notes**. Ce fichier a été créé à l'étape 3.

**a) L'adresse du CRM.** Ouvrez le CRM dans Edge et regardez la barre d'adresse, par exemple
`https://serveur.exemple.net/SectorAlarmFR/main.aspx#219231512`. Gardez tout **jusqu'à `/SectorAlarmFR`**
et recopiez-le ainsi :

```toml
environment_url = "https://serveur.exemple.net/SectorAlarmFR"
```

**b) Les rotations.** Il y a **une rotation par nom de tâche** : « Prio - Movers - Déménagement »,
« Movers - Résiliation », « Movers - Résiliation exception » et « Movers - Takeovers ». Elles sont déjà
définies (sections `[[rotations]]`). Dans la section `[rotation]`, mettez les collègues dans l'ordre de
passage voulu pour chacune, avec leur clé en minuscules : `chloe`, `kader`, `estefania`, `marc-antoine`.

```toml
resiliation_exception = ["chloe", "kader", "estefania", "marc-antoine"]
resiliation = ["chloe", "kader", "estefania", "marc-antoine"]
prio_demenagement = ["chloe", "kader", "estefania", "marc-antoine"]
takeover = ["chloe", "kader", "estefania", "marc-antoine"]
```

> Si votre `dispatch.toml` vient d'une ancienne version, copiez ces sections (`[[rotations]]` et
> `[rotation]`) depuis `config\dispatch.example.toml`, à la place des anciennes `[categories]` et `[rotation]`.
> Sans elles, les 4 rotations existent quand même et suivent l'ordre de vos `[[collaborators]]`.

Enregistrez (**Ctrl + S**). Règle d'or : **chaque valeur entre guillemets droits** `"…"`.

## Étape 6 : relier l'agent au CRM (`3-decouvrir.bat`)

Double-cliquez sur **`3-decouvrir.bat`**.

1. Une fenêtre **Edge** s'ouvre sur le CRM. Connectez-vous comme d'habitude. L'agent **attend** que vous
   soyez connecté (5 minutes maximum) et ne lit rien avant.
2. Revenez à la fenêtre noire. Le résultat s'affiche et est aussi enregistré dans **`decouverte.txt`**,
   dans le dossier `movers-dispatch`.

Voici ce qu'il faut en faire, rubrique par rubrique (les exemples sont inventés) :

**« Utilisateurs Dynamics 365 par prénom »** : recopiez dans `dispatch.toml`, en bas, le
`systemuser_id` de chacun des quatre collègues.

```
  Kader : 1 résultat(s)
    systemuser_id = "1a2b3c4d-0000-0000-0000-000000000001"   Kader Nom  <DOMAINE\kader.nom>  actif
```
```toml
[[collaborators]]
key = "kader"
first_name = "Kader"
systemuser_id = "1a2b3c4d-0000-0000-0000-000000000001"
```

Si plusieurs personnes ont le même prénom, prenez celle dont le **nom complet** est le bon et qui est
**actif**.

**« Colonnes « téléphone » du compte »** : elles servent à retrouver un client par son numéro de
téléphone. Recopiez leurs noms dans la section `[client]`, par exemple
`champs_telephone = ["telephone1", "telephone2", "new_mobilephone"]`, ou envoyez-moi cette partie.

**« Colonnes de « contract » / « task » qui pointent vers un compte »** : rien à faire en général,
l'agent lit tout seul le champ **Account** des tâches. Si une tâche part quand même en validation humaine
avec « pointe vers « contract » », envoyez-moi cette partie.

Enregistrez, puis **relancez `3-decouvrir.bat`**. Au premier passage, les lignes
« ! … systemuserid non renseigné » sont normales. Quand tout est bon, *Contrôles préalables* affiche
**OK**. Toute autre ligne qui commence par **`!`** est à régler : voir **En cas de souci**.

---

# B. Chaque jour

## Étape 7 : lancer l'agent le matin

1. Double-cliquez sur **`4-lancer.bat`**, puis connectez-vous dans la fenêtre Edge si on vous le demande.
   Le tableau de bord s'ouvre tout seul. **Laissez la fenêtre Edge et la fenêtre noire ouvertes** tant
   que vous travaillez.
2. En haut, dans **Rotation 1 pour 1**, **cochez les collègues absents** du jour : ils seront sautés.
   Pensez à les décocher à leur retour. Les compteurs indiquent, pour chacune des 4 rotations, combien
   d'éléments elle a donnés aujourd'hui (sans Case d'un des quatre) et à qui, pour vérifier que chacun
   en reçoit autant.
3. Choisissez le mode :
   - **Simulation** les premiers jours : rien n'est écrit, vous comparez avec ce que vous auriez fait ;
   - **Supervisé** ensuite : vous validez chaque affectation.
4. Cliquez sur **Lancer le traitement**. L'agent lit les vues **« Queue Item - Movers - Emails »** et
   **« Queue Item - Movers tasks »**.

Le gros bouton rouge **Arrêt immédiat** stoppe tout : plus aucune écriture après le clic.

## Étape 8 : lire le tableau

| Colonne | Ce qu'elle dit |
|---|---|
| **Catégorie** | la rotation de l'élément (son nom de tâche, ex. « Movers - Takeovers »), avec « (rotation) » si la personne a été choisie par la rotation |
| **Compte** | le client. **« à rattacher »** = le Regarding était vide et l'agent a retrouvé ce client (il indique comment) |
| **Case / Owner** | le Case retenu et son Owner, quand c'est l'Owner qui décide |
| **Worked By** | le collègue proposé |
| **Statut** | **À valider**, **Validation humaine** (l'agent n'est pas sûr), **Affecté** (écrit et vérifié), **Erreur** |
| **Motif** | pourquoi l'agent propose cela, ou pourquoi il préfère vous laisser décider |

Comment l'agent choisit le collègue :

1. **Il trouve le client** : par le Regarding ; pour une **tâche**, par son champ **Account** (comme vous
   le faites) ; sinon par l'adresse de l'expéditeur, le « Numéro de client » écrit dans le mail, le champ
   « Email » du formulaire HubSpot ou un téléphone. Il ne retient le
   client que si **un seul compte** correspond.
2. **Il regarde les Cases « Mover / MOVERS » du client.** Si l'un appartient à Kader, Estefania,
   Marc-Antoine ou Chloé, c'est cette personne. Entre deux Cases de personnes différentes, l'**actif ou
   annulé** passe avant le **résolu**.
3. **Sinon, la rotation 1 pour 1 du nom de la tâche** décide : « Prio - Movers - Déménagement »,
   « Movers - Résiliation », « Movers - Résiliation exception » ou « Movers - Takeovers ». Chacune
   tourne de son côté. Les **mails** et les **anciennes tâches** (« Moving - CS », chatbot…) sont rangés
   d'après les mots de la demande (pour une tâche, sa description) :
   - « déménagement », HubSpot « Moving Home » → **Prio - Movers - Déménagement**, attribué tout seul ;
   - « résiliation », « désactivation », « décès »… (ou une ancienne tâche sans mot reconnu) → l'agent
     **vous demande de choisir** : la ligne passe en « Validation humaine » et vous prenez, dans
     **Attribuer à…**, **Suivant en Movers - Résiliation** ou **Suivant en Movers - Résiliation exception**.

Les éléments **déjà correctement renseignés** ne sont pas affichés : ils sont seulement comptés dans la
case « ignorés ».

## Étape 9 : que faire sur chaque ligne

| Situation | Ce que vous faites |
|---|---|
| **À valider**, la proposition est bonne | **Valider Kader** (ou **Valider client + Kader** si un client est à rattacher). L'agent écrit, puis relit pour vérifier |
| **À valider**, mauvais collègue | choisissez le bon dans **Corriger : le bon collègue est…**, cliquez sur **Corriger**, puis écrivez en quelques mots **pourquoi** |
| **À valider**, l'élément ne revient à aucun des quatre | **Refuser** |
| **« à rattacher »**, mais ce n'est pas le bon client | tapez le bon **N° de compte** (Account Number) dans la petite case, puis **Corriger le client** |
| **Validation humaine**, client introuvable | tapez le **N° de compte**, puis **Rattacher le client**. L'agent affiche le nom du compte : vérifiez avant OK |
| **Validation humaine**, client connu mais personne désignée | dans **Attribuer à…**, choisissez un collègue, ou **Suivant en …** (l'une des 4 rotations) pour la respecter, puis **Attribuer** |
| **Validation humaine**, Worked By déjà rempli par quelqu'un d'autre | rien : l'agent ne remplace jamais un Worked By ni un Regarding déjà rempli |

Pour voir tout ce qui s'est passé sur un élément, cliquez sur **Historique**.

## Étape 10 : les courriers scannés (« Voir document joint »)

Ces mails viennent du scanner du courrier, avec une **lettre manuscrite** en pièce jointe. L'agent ne
lit pas l'écriture à la main : un chiffre mal lu pourrait désigner un autre client.

1. Sur la ligne, cliquez sur **Voir la pièce jointe** : le scan s'ouvre dans un nouvel onglet.
2. Lisez le **n° client** écrit sur la lettre, tapez-le dans la case **N° de compte**, puis cliquez sur
   **Rattacher le client**.
3. L'agent affiche **le nom du compte** qui correspond à ce numéro. **Vérifiez que c'est bien le nom de la
   lettre**, puis cliquez sur OK. Sinon, cliquez sur Annuler et relisez le numéro.
4. Dans **Attribuer à…**, choisissez **Suivant en …** avec la rotation qui correspond à la lettre (par
   exemple **Suivant en Movers - Résiliation**), puis **Attribuer**.

---

# C. Les deux semaines de supervision, puis le mode Automatique

## Étape 11 : corriger l'agent pour le rendre fiable

**À savoir :** l'agent n'apprend pas tout seul. Il suit des règles écrites. C'est voulu : il ne peut pas
changer de comportement sans qu'on le sache. **Vos corrections servent à réécrire ses règles.**

**Chaque jour**, travaillez en **Supervisé** (étape 9). Quand vous corrigez, le **« pourquoi »** est le
plus important : par exemple « le Case Mover résolu était le bon », « même adresse que son conjoint ».
N'y mettez pas de données client (nom, téléphone…).

En bas du tableau de bord, le **Bilan de la supervision** indique :

- combien de propositions sont **validées telles quelles**, **corrigées**, **refusées** ou **attribuées à la
  main**, et le **taux d'accord** ;
- la **série** : le nombre de propositions validées d'affilée sans correction (elle repart à 0 à chaque
  correction ou refus) ;
- la liste des corrections, avec ce que l'agent avait vu.

**Une fois par semaine**, ou dès qu'une même erreur revient :

1. Double-cliquez sur **`5-exporter-corrections.bat`** : il crée `corrections.csv` (s'ouvre avec Excel)
   dans le dossier `movers-dispatch`.
2. Envoyez-moi ce fichier. Je transforme les erreurs qui reviennent en nouvelles règles.
3. Installez la nouvelle version (étape 12).

**Quand passer en Automatique ?** Quand le bilan affiche en vert **« 100 propositions validées d'affilée
sans correction »** et que votre responsable est d'accord. Il faut alors :

- mettre `automatic_allowed = true` dans `dispatch.toml` (section `[agent]`) ;
- cocher **Automatique** et taper `AUTOMATIQUE` à chaque lancement.

Même en Automatique, l'agent ne traite **que** les cas sûrs. Les **rattachements de client** restent à
valider par vous, sauf si vous mettez `automatique = true` dans la section `[client]`.

---

# D. Installer une nouvelle version

## Étape 12 : mettre à jour sans rien perdre

1. Fermez la fenêtre noire de l'agent.
2. Supprimez l'ancien dossier `SA-IA-main`.
3. Retéléchargez et extrayez le ZIP comme à l'étape 2.
4. Double-cliquez sur **`4-lancer.bat`**. C'est tout.

À chaque lancement, `4-lancer.bat` **sauvegarde** `dispatch.toml` (votre configuration) et
`movers_dispatch.db` (votre journal) dans `%USERPROFILE%\Movers-Dispatch-sauvegarde`, hors du dossier de l'agent.
Dans un dossier tout neuf, il les **remet tout seul**, installe les composants et active les rappels de
l'équipe.
Votre journal est mis à jour automatiquement, sans rien perdre.

---

## Étape 13 : partager les rappels avec l'équipe (facultatif)

L'agent peut ajouter l'horaire écrit dans chaque tâche qu'il attribue (« Horaire de Rappel : 14h30 - 28/10 »)
à un fichier de rappels trié, rangé dans le dossier « Rappels » de OneDrive, partagé à l'équipe. Chaque agent ouvre ce fichier avec la
page **https://marcoooo131.github.io/SA-IA/rappels/**, coche son prénom et reçoit une notification
15 minutes avant chaque rappel. Marche à suivre : [tutoriel des rappels](../rappels-equipe/TUTORIEL.md)
(automatique : `4-lancer.bat` active les rappels et crée le dossier `Rappels` dans OneDrive).

---

## En cas de souci

| Message | Que faire |
|---|---|
| « Python est introuvable » | Refaire l'étape 1 en cochant bien **Add python.exe to PATH**, puis redémarrer le PC. |
| « Lancez d'abord 1-installer.bat » | Faire l'étape 3. |
| La fenêtre noire se ferme tout de suite | Vérifier que le `.bat` est bien dans `movers-dispatch\windows`, puis relancer `1-installer.bat`. |
| L'installation est très lente ou échoue | Le dossier est probablement dans OneDrive : refaire l'étape 2 hors OneDrive. |
| « Session Dynamics 365 non ouverte » ou « Connexion au CRM non faite dans le délai » | Relancer et se connecter dans la fenêtre Edge dans les 5 minutes. La fenêtre Edge doit rester ouverte tant que l'agent tourne. |
| « faute de frappe » dans `dispatch.toml` | Le message donne la ligne : chaque valeur doit être entre guillemets droits `"…"`, sans espace en début de ligne. |
| `! Mettre connection.api_version = "v9.0"` (ou autre) | Recopier cette valeur dans `dispatch.toml` à la ligne `api_version = …`, puis relancer `3-decouvrir.bat`. |
| `! systemuserid non renseigné` | Un des quatre `systemuser_id` est vide ou incomplet (étape 6). |
| « Prénom CRM … différent du prénom configuré » | Le `systemuser_id` recopié n'est pas celui de la bonne personne (étape 6). |
| `! Le champ Worked By … n'est pas modifiable` | Votre compte n'a pas ce droit : en parler à l'administrateur du CRM. |
| « Recherche du client désactivée : la colonne account.… n'existe pas » | Corriger `champs_telephone` ou `champs_email` dans `[client]` d'après `3-decouvrir.bat` (étape 6). Le reste de l'agent continue de fonctionner. |
| « Regarding … pointe vers « contract » » | M'envoyer la partie « Colonnes de « contract » » de `decouverte.txt` (étape 6). |
| « Le numéro … correspond à 0 compte(s) actif(s) » | Le n° tapé n'existe pas (souvent un chiffre mal lu sur une lettre) : relire la pièce jointe. |
| « rotation.… : collaborateur(s) inconnu(s) » | Dans `[rotation]`, utiliser les clés `chloe`, `kader`, `estefania`, `marc-antoine`. |
| « Le port 8765 est déjà pris » ou erreur 10048 | Une autre fenêtre de l'agent est encore ouverte. L'agent prend alors tout seul le port suivant (8766…) et ouvre le bon lien ; pour éviter deux agents en même temps, fermer l'ancienne fenêtre noire (ou terminer « Python » dans le Gestionnaire des tâches). |

> **Bon à savoir :** l'agent utilise **votre** session du CRM, avec vos droits, et ne voit jamais votre
> mot de passe. Il ne garde pas le contenu des mails ni des pièces jointes. Avant de l'utiliser au
> quotidien, faites valider cet usage par votre responsable ou le service informatique.
