# Tuto : SAINT GRAAL, l'agent de pose des LID, pas à pas (Windows)

Pas besoin de savoir programmer : on **double-clique** des fichiers et on modifie **un** fichier texte avec
le Bloc-notes.

> **Rassurant :** SAINT GRAAL démarre toujours en **Mode test**. Il lit, cherche, calcule et compare,
> mais **n'écrit rien**, ni dans le CRM ni dans l'Excel. En mode **Supervisé**, rien n'est enregistré
> sans votre clic sur **Valider**.

> **À savoir avant de commencer :** les repères du vrai CRM (noms des champs, barre de recherche,
> bouton *Save & Close*) doivent être calés une fois sur votre écran. C'est l'**étape 6** : vous lancez
> `3-decouvrir.bat` et vous m'envoyez le fichier `decouverte.txt`. Tant que ce n'est pas fait, ou tant
> que la règle de la calculette n'est pas renseignée (étape 8), les dossiers restent **EN ATTENTE**. Ce
> n'est pas une panne, c'est la sécurité : rien d'incertain n'est enregistré.

**Sommaire**

- **A. Installation (une seule fois, environ 30 minutes)** : étapes 1 à 8
- **B. Chaque jour** : étapes 9 à 12
- **C. Passer en mode Autonome** : étape 13
- **D. Installer une nouvelle version** : étape 14
- **En cas de souci**

---

# A. Installation (une seule fois)

## Étape 1 : installer Node.js

1. Allez sur **https://nodejs.org** et cliquez sur le bouton **LTS** (version conseillée).
2. Ouvrez le fichier téléchargé, puis cliquez sur **Next** jusqu'à **Install** en gardant les options
   proposées.
3. **Redémarrez le PC** à la fin.

> Si votre PC professionnel refuse l'installation (droits administrateur), demandez au support
> informatique d'installer **Node.js LTS (version 20 ou plus)**.

Le navigateur utilisé est **Microsoft Edge**, déjà installé sur votre PC : rien d'autre à installer.

## Étape 2 : récupérer l'agent (hors OneDrive)

1. Ouvrez **https://github.com/Marcoooo131/SA-IA**, cliquez sur le bouton vert **Code**, puis sur
   **Download ZIP**.
2. ⚠️ **Ne l'extrayez pas dans Documents ni sur le Bureau** : ces dossiers sont dans OneDrive, qui
   ralentit ou bloque l'installation. Faites plutôt ceci :
   - dans la barre d'adresse de l'Explorateur, tapez `%USERPROFILE%`, puis appuyez sur Entrée ;
   - créez-y un dossier **`SA-IA`** (si vous l'avez déjà pour l'agent Dispatch, utilisez le même) ;
   - faites un clic droit sur `SA-IA-main.zip` (dans *Téléchargements*), choisissez **Extraire tout…** et
     indiquez ce dossier.
3. Ouvrez `SA-IA-main\saint-graal\windows`. Vous y trouvez quatre fichiers :

| Fichier | À quoi il sert |
|---|---|
| `1-installer.bat` | installe l'agent |
| `2-demo.bat` | essai sur un **faux** CRM et un **faux** Excel, sans toucher au vrai CRM |
| `3-decouvrir.bat` | lit le vrai CRM, **sans rien modifier**, pour vérifier que l'agent retrouve bien les champs |
| `4-lancer.bat` | lance SAINT GRAAL sur le vrai CRM : **c'est celui de tous les jours** |

> ⚠️ Gardez le dossier `calculette-nid`, à côté de `saint-graal` : SAINT GRAAL utilise cette calculette
> pour chaque calcul.

## Étape 3 : installer l'agent

Double-cliquez sur **`1-installer.bat`**. Une fenêtre noire s'ouvre et l'installation prend quelques
minutes. Attendez le message **« Installation terminée »**, puis appuyez sur une touche.

> Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**,
> puis sur **Exécuter quand même**.

## Étape 4 : essayer sans risque (données fictives)

Double-cliquez sur **`2-demo.bat`**. L'interface SAINT GRAAL s'ouvre dans votre navigateur, avec un bandeau
rouge **DÉMONSTRATION**. Une fenêtre Edge s'ouvre aussi : c'est un **CRM de test**, avec 7 contrats
**inventés**.

1. Cliquez sur **Vérifier les connexions** : CRM, Excel et Calculette passent au vert.
2. Laissez **Mode test** et cliquez sur **▶ LANCER**. Regardez la fenêtre Edge : SAINT GRAAL tape le
   numéro dans la recherche, ouvre le contrat, utilise la calculette, puis repart **sans rien modifier**.
   Le **Journal d'activité** raconte chaque étape.
3. Choisissez **Supervisé** et relancez. Pour chaque contrat, une fenêtre **Validation avant Save & Close**
   s'ouvre, avec l'ancienne et la nouvelle date, le Case Reason, le détail de la calculette et une
   capture. Essayez **Valider** et **Refuser**.
4. Ouvrez l'onglet **Tableau de bord** : seules les poses validées sont comptées.
5. Pour arrêter, fermez la fenêtre noire.

Les dossiers volontairement piégés de la démo passent **EN ATTENTE** : contrat introuvable, motif absent
du CRM, *Last LID population date* déjà remplie, contrat d'une autre personne ignoré. C'est le
comportement attendu.

## Étape 5 : remplir les réglages (`reglages.json`)

Dans le dossier `saint-graal`, ouvrez **`reglages.json`** avec le **Bloc-notes** : clic droit, puis
**Ouvrir avec**, puis **Bloc-notes**. Ce fichier a été créé à l'étape 3.

**a) L'adresse du CRM.** Ouvrez le CRM dans Edge et regardez la barre d'adresse, par exemple
`https://serveur.exemple.net/SectorAlarmFR/main.aspx#219231512`. Gardez tout **jusqu'à `/SectorAlarmFR/`**,
comme pour l'agent Dispatch.

**b) Votre nom**, tel qu'il doit apparaître dans la colonne « Utilisateur ayant effectué la pose ».

```json
{
  "crm": {
    "url": "https://serveur.exemple.net/SectorAlarmFR/",
    "nomUtilisateur": "Prénom Nom"
  },
  "calculette": {
    "mode": null,
    "colonneDateReference": null
  },
  "modes": {
    "autonomeAutorise": false
  }
}
```

Ne touchez pas encore à `calculette` (étape 8) ni à `modes` (étape 13). Enregistrez (**Ctrl + S**).

Règles d'or : **chaque texte entre guillemets droits** `"…"`, une **virgule** entre deux lignes, et
**pas de virgule** juste avant `}`. En cas de faute, SAINT GRAAL vous indique la ligne au lancement.

## Étape 6 : vérifier que l'agent retrouve le CRM (`3-decouvrir.bat`)

Double-cliquez sur **`3-decouvrir.bat`**. Rien n'est modifié dans le CRM : l'outil **regarde** seulement.

1. Une fenêtre **Edge** s'ouvre sur le CRM. Connectez-vous comme d'habitude, puis revenez à la fenêtre
   noire et appuyez sur **Entrée**. Cette connexion est gardée pour la suite.
2. La fenêtre noire vous demande d'**ouvrir un contrat**. Ouvrez-en un dans Edge, faites défiler jusqu'à
   **Termination Information**, **ne modifiez rien**, puis appuyez sur **Entrée**.
3. Elle vous demande enfin un **numéro de contrat** pour tester la recherche, par exemple
   `C-SFR-00214829`. Tapez-le, puis appuyez sur **Entrée**.

Le résultat s'affiche et est enregistré dans **`decouverte.txt`**, dans le dossier `saint-graal`.

| Ligne | Signification |
|---|---|
| `OK – …` | l'agent retrouve cet élément, comme vous le voyez à l'écran |
| `! introuvable – contrat.caseReason …` | le libellé du champ est différent sur votre CRM (par exemple en français : « Motif ») |
| `! trouvé 2 fois – …` | deux éléments portent ce nom : il faut préciser lequel |
| `Valeurs proposées par caseReason` | la liste des Case Reason de votre CRM, à comparer avec la colonne Case Reason de l'Excel |

👉 **Envoyez-moi `decouverte.txt`**. Je recale les repères d'après votre écran et je vous envoie une
nouvelle version (étape 14). Quand tout est bon, relancez `3-decouvrir.bat` : la dernière ligne affiche
**« TOUT EST OK »**.

> Avant de l'envoyer, ouvrez `decouverte.txt` avec le Bloc-notes. Il contient les **valeurs** du contrat
> ouvert à l'étape 2 (dates, motif) : effacez-les si vous le souhaitez. Le reste ne contient que des noms
> de champs et de boutons.

## Étape 7 : choisir le fichier Excel et le faire analyser

1. Double-cliquez sur **`4-lancer.bat`**. L'interface s'ouvre dans votre navigateur.
2. Dans l'Explorateur, faites un clic droit sur **`LID posées par MO-TO - Chloé2.xlsx`**, puis choisissez
   **Copier en tant que chemin d'accès** (raccourci **Ctrl + Maj + C**).
3. Collez ce chemin dans la case blanche de l'interface (**Ctrl + V**) et cliquez sur
   **Utiliser ce fichier**. Il est retenu pour les fois suivantes.
4. Ouvrez l'onglet **Analyse de l'Excel**, puis cliquez sur **Analyser le fichier**. C'est en lecture
   seule. Vous voyez :
   - les onglets trouvés (*Contract Advanced Find View*, *Feuil1*, *Feuil2*, *hiddenSheet*) ;
   - les **colonnes essentielles** : un ❌ signale une colonne introuvable ;
   - le **nombre de dossiers** par collaborateur, d'après *Modified By* ;
   - les **Case Reason** présents ;
   - **toutes les colonnes** du fichier, dont vous aurez besoin à l'étape 8.

> **Envoyez-moi une capture de cet écran** : il ne contient pas de données client, et il me permet de
> vérifier que chaque Case Reason de l'Excel existe bien dans la liste du CRM (étape 6).

SAINT GRAAL **ne modifie jamais** vos onglets. Il ajoute seulement deux onglets à la fin du fichier :
**SUIVI SAINT GRAAL** et **TABLEAU DE BORD SAINT GRAAL**. Avant chaque écriture, il fait une copie de
sauvegarde dans `%USERPROFILE%\Saint-Graal-donnees\sauvegardes`.

## Étape 8 : la règle de la calculette

Pour chaque contrat, SAINT GRAAL saisit dans la calculette :

- un **onglet** : *Installation* ou *Résiliation* ;
- une **date** : la date d'installation ou de résiliation ;
- le **jour de la NID**, qu'il prend tout seul dans la colonne *Next Invoice Date*.

Il faut donc lui dire quel onglet et quelle colonne de date utiliser. Ouvrez `reglages.json` et
remplissez la partie `calculette`. Le nom de colonne doit être **recopié exactement** depuis la liste
« Toutes les colonnes » de l'étape 7.

```json
  "calculette": {
    "mode": "Résiliation",
    "colonneDateReference": "Nom exact de la colonne de date"
  },
```

> Si vous avez un doute sur la bonne colonne, ne devinez pas : envoyez-moi la liste des colonnes avec
> la date que vous saisissez à la main dans la calculette. Tant que ces deux valeurs sont `null`, les
> dossiers restent EN ATTENTE avec le motif `REGLE_NON_CONFIRMEE`. **Aucune date n'est inventée.**

---

# B. Chaque jour

## Étape 9 : lancer SAINT GRAAL

1. **Fermez le fichier Excel** s'il est ouvert. SAINT GRAAL peut le lire, mais il ne peut pas l'écrire
   pendant qu'Excel l'utilise. Dans ce cas, il garde les lignes de suivi de côté (rien n'est perdu) et les
   écrit dès que le fichier est libre, au plus tard au lancement suivant.
2. Double-cliquez sur **`4-lancer.bat`** et connectez-vous dans la fenêtre Edge si on vous le demande.
   **Laissez la fenêtre Edge et la fenêtre noire ouvertes** pendant le traitement.
3. Cliquez sur **Vérifier les connexions** : les trois pastilles (CRM, Excel, Calculette) doivent être
   **vertes**.
4. Choisissez le mode, puis cliquez sur **▶ LANCER**.

| Bouton | Effet |
|---|---|
| **❚❚ PAUSE** / **▶ REPRENDRE** | met en pause à la prochaine étape sûre, puis reprend là où il en était |
| **■ ARRÊTER** | plus aucune nouvelle opération. Avant *Save & Close*, le contrat est abandonné **sans rien enregistrer**. Après, l'enregistrement va jusqu'au bout et il est vérifié |

Relancer plus tard suffit pour reprendre : les contrats déjà posés sont **sautés**, ceux EN ATTENTE ou en
ERREUR sont **retentés**.

## Étape 10 : les premiers jours, en Mode test

Le **Mode test** ne modifie rien. À la fin, il crée un fichier **`rapport-test-….csv`** (s'ouvre avec
Excel) dans `%USERPROFILE%\Saint-Graal-donnees\data`, avec, pour chaque contrat, **la date que SAINT GRAAL
poserait** et le Case Reason qu'il choisirait.

👉 **Comparez avec ce que vous auriez posé à la main.** Au moindre écart, envoyez-moi la ligne du rapport
et la bonne valeur.

## Étape 11 : ensuite, en mode Supervisé

SAINT GRAAL remplit **Last Income Date** et **Case Reason** dans le contrat, puis **s'arrête** et affiche la
fenêtre **Validation avant Save & Close**. Vérifiez :

1. le **numéro de contrat** ;
2. la **nouvelle Last Income Date** (en rouge) et le **détail de la calculette** ;
3. le **Case Reason**, qui doit être identique à celui de l'Excel ;
4. la **capture** du contrat, en bas de la fenêtre.

Ensuite :

- **✓ Valider et enregistrer** : SAINT GRAAL clique sur *Save & Close*, rouvre le contrat, relit les valeurs
  et ne compte la pose (**POSÉE**) que si elles sont bien enregistrées ;
- **✕ Refuser** : rien n'est enregistré. Le dossier passe EN ATTENTE avec le motif `REFUS_UTILISATEUR`.
  Notez pourquoi vous avez refusé et dites-le-moi.

## Étape 12 : lire le suivi

Le suivi se lit dans l'onglet **Tableau de bord** de l'interface et dans l'onglet **SUIVI SAINT GRAAL** de
l'Excel. La colonne *Commentaire / Erreur* donne le motif entre crochets.

| Statut | Ce que ça veut dire | Ce que vous faites |
|---|---|---|
| **POSÉE** | enregistrée **et vérifiée** dans le CRM | rien |
| **DÉJÀ CONFORME** | le CRM avait déjà la bonne date et le bon motif : rien n'a été modifié | rien |
| **SIMULÉE (TEST)** | Mode test : résultat attendu, rien n'a été écrit | comparer avec votre calcul |
| **IGNORÉE – DÉJÀ TRAITÉ** | contrat déjà posé par SAINT GRAAL : pas de seconde pose | rien |
| **EN ATTENTE** | SAINT GRAAL préfère vous laisser décider | voir le motif ci-dessous |
| **ERREUR** | problème technique, rien d'incertain n'a été enregistré | voir **En cas de souci** |

| Motif EN ATTENTE | Ce que vous faites |
|---|---|
| `CONTRAT_INTROUVABLE` | le numéro de l'Excel ne donne aucun résultat dans la recherche : vérifier le numéro |
| `CONTRAT_AMBIGU` | plusieurs résultats pour ce numéro : traiter à la main |
| `NUMERO_INCORRECT` | la fiche ouverte n'a pas exactement le même numéro : traiter à la main |
| `CASE_REASON_INTROUVABLE` | le motif de l'Excel n'existe pas tel quel dans la liste du CRM. SAINT GRAAL **ne choisit jamais un motif « proche »** : traitez à la main, ou dites-moi à quel motif CRM il correspond |
| `LID_DIFFERENTE` | une Last Income Date différente est déjà dans le CRM : SAINT GRAAL ne l'écrase pas, c'est à vous de voir |
| `LAST_LID_POPULATION` | la colonne *Last LID population date* est déjà remplie : vérifier si le dossier est déjà traité |
| `NID_INCOHERENTE` | la Next Invoice Date du CRM et celle de l'Excel sont différentes : vérifier laquelle est juste |
| `INFOS_INCOMPLETES` | une case nécessaire est vide dans l'Excel (date, NID, Case Reason) : la compléter |
| `MAUVAISE_CATEGORIE` | la Case Category du contrat ne correspond pas à celle attendue : SAINT GRAAL n'y touche pas |
| `REGLE_NON_CONFIRMEE` | étape 8 non faite |
| `REFUS_UTILISATEUR` / `INTERROMPU` | vous avez refusé ou arrêté : sera retenté au prochain lancement |

Pour chaque dossier en attente ou en erreur, une **capture d'écran** est enregistrée dans
`%USERPROFILE%\Saint-Graal-donnees\captures\<date>`.

---

# C. Passer en mode Autonome

## Étape 13 : quand et comment

Le mode **Autonome** pose les LID sans fenêtre de validation. Il est **verrouillé** au départ : la case est
grisée et l'interface dit pourquoi. Deux conditions doivent être remplies :

1. **Les repères du CRM sont validés** : `3-decouvrir.bat` affiche « TOUT EST OK », et je vous ai envoyé
   la version où ils sont marqués comme validés.
2. **Vous l'autorisez**, après une période de Supervisé sans correction et avec l'accord de votre
   responsable. Dans `reglages.json`, mettez :

```json
  "modes": {
    "autonomeAutorise": true
  }
```

Au lancement en Autonome, SAINT GRAAL demande une confirmation. Même dans ce mode, tous les contrôles
restent actifs : un cas douteux passe EN ATTENTE au lieu d'être posé, et une erreur à risque **arrête la
session**.

---

# D. Installer une nouvelle version

## Étape 14 : mettre à jour sans rien perdre

1. Cliquez sur **■ ARRÊTER**, attendez **Arrêté**, puis fermez la fenêtre noire.
2. Supprimez l'ancien dossier `SA-IA-main`.
3. Retéléchargez et extrayez le ZIP comme à l'étape 2.
4. Double-cliquez sur **`4-lancer.bat`**. C'est tout.

À chaque lancement, `4-lancer.bat` sauvegarde `reglages.json` dans `%USERPROFILE%\Saint-Graal-donnees`.
Dans un dossier tout neuf, il le **remet tout seul** et installe les composants. Le journal, les captures,
les sauvegardes Excel et votre connexion Edge sont déjà rangés dans ce dossier, hors de l'agent :
**rien n'est perdu**.

---

## En cas de souci

| Message | Que faire |
|---|---|
| « Node.js est introuvable » | Refaire l'étape 1, puis redémarrer le PC. |
| « Lancez d'abord 1-installer.bat » | Faire l'étape 3. |
| La fenêtre noire se ferme tout de suite | Vérifier que le `.bat` est bien dans `saint-graal\windows`, puis relancer `1-installer.bat`. |
| L'installation est très lente ou échoue | Le dossier est probablement dans OneDrive : refaire l'étape 2 hors OneDrive. |
| « Faute de frappe dans reglages.json vers la ligne … » | Ouvrir `reglages.json` : guillemets droits `"…"`, virgule entre deux lignes, pas de virgule avant `}`. |
| Pastille **CRM** rouge : « Connexion requise » | Se connecter dans la fenêtre Edge, puis cliquer à nouveau sur **Vérifier les connexions**. |
| Pastille **CRM** rouge : « URL du CRM non configurée » | Faire l'étape 5 a). |
| Pastille **Calculette** rouge | Le dossier `calculette-nid` doit être à côté de `saint-graal` (étape 2). |
| Pastille **Excel** rouge : « verrouillé » | Fermer le fichier dans Excel (vérifier aussi qu'un collègue ne l'a pas ouvert). |
| « ⚠ … ligne(s) de suivi en attente d'écriture » | Le fichier Excel est ouvert : le fermer. Les lignes seront écrites automatiquement. |
| `[CHAMP_INTROUVABLE]` ou `[CHAMP_AMBIGU]` (la session s'arrête) | Le CRM a changé d'écran : relancer `3-decouvrir.bat` et m'envoyer `decouverte.txt`. |
| `[ENREGISTREMENT_IMPOSSIBLE]` | Le CRM a refusé *Save & Close* (le message du CRM est recopié). Ouvrir le contrat à la main et regarder. |
| `[VERIFICATION_APRES_ENREGISTREMENT]` (la session s'arrête) | Les valeurs relues ne sont pas celles posées : **ouvrir ce contrat à la main** et corriger si besoin, puis me prévenir. |
| `[DATE_REFUSEE]` | Le CRM n'affiche pas la date au bon format : m'envoyer la capture du dossier. |
| `[EXCEL_INTEGRITE]` (la session s'arrête) | SAINT GRAAL a refusé d'écrire, car l'écriture aurait modifié vos onglets. Votre fichier est intact. Me prévenir. |
| « Le port 4777 est déjà pris » | Une autre fenêtre SAINT GRAAL est ouverte : SAINT GRAAL prend tout seul le port suivant. Pour éviter deux agents en même temps, fermer l'ancienne fenêtre noire. |

> **Bon à savoir :** SAINT GRAAL utilise **votre** session du CRM, avec vos droits, et ne voit jamais votre
> mot de passe. Les modifications apparaissent donc à votre nom dans *Modified By*. Le collaborateur
> (Kader, Chloé, Estef, Marc Antoine) ne sert qu'aux statistiques. Avant de l'utiliser au quotidien,
> faites valider cet usage par votre responsable ou le service informatique.
