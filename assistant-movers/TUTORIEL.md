# Tuto : l'Assistant Movers, pas à pas (Windows)

Pas besoin de savoir programmer. On **double-clique** des fichiers et on modifie **un** fichier texte
(`assistant.toml`) avec le Bloc-notes.

> **Rassurant :** l'assistant démarre en **mode Test**. Il lit le CRM pour de vrai, mais **n'écrit rien et
> n'envoie rien** : ni case, ni WO, ni SMS, ni email. Il vous montre seulement ce qu'il aurait écrit.

**Sommaire**

- **A. Installation** (une fois) : étapes 1 à 3
- **B. Essayer la démo** : étape 4
- **C. Remplir la configuration avec la découverte** : étapes 5 à 13
- **D. Le mode Test sur de vrais dossiers** : étape 14
- **E. Passer en mode Supervisé** : étape 15
- **F. Brancher le choix des créneaux** (facultatif) : étape 16
- **En cas de souci**

## Les deux modes

| | **Test** | **Supervisé** |
|---|---|---|
| Lit le compte, les installations, les contrats | oui, pour de vrai | oui |
| Crée le case, complète le WO | **non** : affiche ce qu'il aurait écrit | oui, **après votre clic** à chaque étape |
| Rendez-vous | créneaux **fictifs** | vous cliquez « Get appointments » dans le CRM, l'assistant relit |
| SMS, email | **non envoyés** : affichés | envoyés **après votre clic** |
| Si la configuration est incomplète | fonctionne, et dit quel nom manque | **bloqué** |
| À utiliser pour | remplir et contrôler la configuration, se former | les vrais dossiers |

On change de mode avec le bouton **Test / Supervisé** en haut de l'écran, entre deux dossiers.

---

# A. Installation (une seule fois)

## Étape 1 : Python

Python est peut-être déjà installé pour l'agent Dispatch. Sinon, suivez l'étape 1 du
[tuto Dispatch](../movers-dispatch/TUTORIEL.md), ou demandez à l'IT **Python 3.12** avec « Add to PATH ».

## Étape 2 : récupérer l'assistant (hors OneDrive)

Comme pour Dispatch : sur **https://github.com/Marcoooo131/SA-IA**, bouton vert **Code** → **Download ZIP**.
Extrayez-le dans `%USERPROFILE%\SA-IA` (**pas** dans Documents ni sur le Bureau, qui sont dans OneDrive).
Ouvrez ensuite `SA-IA-main\assistant-movers\windows` :

| Fichier | À quoi il sert |
|---|---|
| `1-installer.bat` | installe l'assistant |
| `2-demo.bat` | essai sur un **faux** CRM, sans connexion |
| `3-decouvrir.bat` | lit le CRM (sans rien modifier) et liste les noms à recopier dans la configuration |
| `4-lancer.bat` | lance l'assistant sur le vrai CRM : **c'est celui de tous les jours** |
| `5-verifier.bat` | contrôle chaque nom recopié dans la configuration |

## Étape 3 : installer

Double-cliquez sur **`1-installer.bat`** et attendez **« Installation terminée »**. Un fichier
**`assistant.toml`** est créé dans le dossier `assistant-movers` : c'est la configuration.

> Si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires** →
> **Exécuter quand même**. Si l'installation échoue sur le téléchargement des composants, montrez le message à l'IT.

---

# B. Essayer la démo

## Étape 4 : `2-demo.bat`

Une page s'ouvre dans le navigateur. Le badge **DÉMO · CRM FICTIF** confirme qu'aucun vrai client n'est concerné.

1. En mode **Test**, tapez `10000001`, puis suivez les étapes. Sous chaque étape, le cadre violet
   **« Ce qui aurait été écrit dans le CRM »** se remplit.
2. Cliquez **Nouveau dossier**, passez en **Supervisé** et refaites le parcours.
3. Essayez les cas particuliers : `10000002` (case déjà ouvert), `10000003` (pas de créneau, message No Cap),
   `10000004` (le WO n'arrive pas : il faut « Finish »), `10000005` (SMS déjà présent).

Fermez la fenêtre noire pour arrêter.

---

# C. Remplir la configuration avec la découverte

L'assistant doit connaître les **noms techniques** du CRM Sector Alarm : le nom caché derrière chaque champ que
vous voyez à l'écran. Par exemple, « Moving Out Or Moving In ? » s'appelle peut-être `sa_movingoutorin` en
coulisse. La découverte les trouve pour vous. **Vous ne faites que recopier.**

> Dans ce tuto, les noms comme `new_movingoutorin` sont des **exemples inventés**. Recopiez toujours ceux de
> **votre** fichier `decouverte.txt`.

## Étape 5 : ouvrir `assistant.toml` et connaître 3 règles

Clic droit sur `assistant.toml` → **Ouvrir avec** → **Bloc-notes**.

| Règle | Exemple juste | Exemple faux |
|---|---|---|
| Un **nom** ou un **texte** se met entre guillemets | `new_city = "new_newcity"` | `new_city = new_newcity` |
| Un **nombre** se met **sans** guillemets | `moving_out_or_in_out = 100000001` | `moving_out_or_in_out = "100000001"` |
| Oui / Non s'écrit `true` / `false`, sans guillemets | `oui = true` | `oui = "Yes"` |

Une ligne qui commence par `#` est un commentaire, ignoré. Pour activer une ligne d'exemple, effacez le `#`.
Enregistrez avec **Ctrl+S** après chaque section.

## Étape 6 : l'adresse du CRM

Ouvrez le CRM dans Edge. Dans la barre d'adresse, copiez tout ce qui est **avant** `/main.aspx`, par exemple :
`https://intmscrm.sectoralarm.net/SectorAlarmFR`. Dans `[connexion]` :

```toml
environment_url = "https://intmscrm.sectoralarm.net/SectorAlarmFR"
```

## Étape 7 : lancer la découverte

Double-cliquez sur **`3-decouvrir.bat`**. Une fenêtre Edge s'ouvre : **connectez-vous au CRM** comme
d'habitude. La découverte lit les métadonnées (rien n'est modifié) puis écrit **`decouverte.txt`** dans le
dossier `assistant-movers`. Ce fichier ne contient que des noms de tables et de champs, **aucune donnée client** :
vous pouvez me l'envoyer si vous bloquez.

Notez la ligne **« Version du CRM »** : si elle commence par `9`, mettez `api_version = "v9.0"` dans `[connexion]`.
Si elle commence par `8.2`, laissez `"v8.2"`.

Le fichier est découpé en blocs entre crochets. Voici comment lire chaque sorte de ligne :

| Ligne dans `decouverte.txt` | Ce qu'elle veut dire |
|---|---|
| `« Work Order » → entite = new_workorder, entity_set = new_workorders, …` | une **table** : son nom (`entite`) et son nom d'API (`entity_set`) |
| `new_movingoutorin   Picklist   « Moving Out Or Moving In ? »` | un **champ** : nom technique, type, libellé affiché dans le CRM |
| `valeurs : 100000000=In, 100000001=Out` | les **valeurs** possibles du champ juste au-dessus |
| `new_installationid → new_installation   nav = new_InstallationId` | un **lien** vers une autre table, et son `nav` |
| `compte_attr = new_accountid` | le champ qui relie la table au compte client |

## Étape 8 : le case (`[case.champs]` et `[case.valeurs]`)

Dans `decouverte.txt`, bloc **`[Case (incident) — champs Movers]`**. Pour chaque ligne ci-dessous, trouvez le
champ dont le **libellé** correspond et recopiez son **nom technique** (1re colonne) :

| Dans `assistant.toml` | Libellé à chercher dans `decouverte.txt` |
|---|---|
| `moving_out_or_in` | « Moving Out Or Moving In ? » |
| `moving_out_interested` | « Moving Out interested in Installation » |
| `completed_move_out` | « Completed Move Out Info » |
| `new_street` | « Street 1 (New Address Moving Out) » |
| `new_postcode` | « Postal Code », dans le bloc nouvelle adresse Moving Out |
| `new_city` | « City », dans le bloc nouvelle adresse Moving Out |
| `moving_out_date` | « Moving Out Date » |

Exemple :

```toml
[case.champs]
moving_out_or_in = "new_movingoutorin"
moving_out_interested = "new_movingoutinterested"
completed_move_out = "new_completedmoveout"
```

Puis `[case.valeurs]`, à partir des lignes **`valeurs :`** :

- `moving_out_or_in_out` = le **nombre** devant `Out`, sous « Moving Out Or Moving In ? ».
- `oui` (pour « Completed … ») et `interesse_oui` (pour « … interested ») : si le champ est de type **Boolean**,
  écrivez `true` ; s'il est de type **Picklist**, écrivez le **nombre** devant `Yes`.
- Si « Postal Code » est de type **Lookup** (une fiche, pas un texte), remplissez aussi
  `code_postal = { nav = "…", set = "…", nom_attr = "…" }` dans `[case]` avec la ligne « Postal Code » des liens
  et la table des codes postaux de `[Tables à repérer]`.

```toml
[case.valeurs]
moving_out_or_in_out = 100000001
oui = true
interesse_oui = 100000000
```

**`[case.fixes]` (facultatif) :** les autres champs remplis à la main dans la vidéo, avec toujours la même valeur
(Case Type « Takeover », Mover Type, Case Category « Moving Customer », Case Reason « Moves to new adress »).
Une ligne par champ : nom technique = nombre de la valeur.

```toml
[case.fixes]
casetypecode = 100000003
```

## Étape 9 : installation et contrat (`[case]`)

Bloc **`[Case (incident) — liens]`** : cherchez la ligne qui pointe vers la table des installations, puis celle
des contrats. Ensuite :

- `nav` = ce qui suit `nav =` sur cette ligne ;
- `set` = l'`entity_set` de cette table (bloc **`[Tables à repérer]`**) ;
- `compte_attr` = la ligne `compte_attr =` du bloc **`[Installation … — lien vers le compte]`** ;
- `nom_attr` = le `nom_attr` de cette table (bloc `[Tables à repérer]`).

```toml
installation = { nav = "new_InstallationId", set = "new_installations", compte_attr = "new_accountid", nom_attr = "new_name" }
```

## Étape 10 : le Work Order (`[work_order]`)

1. Bloc **`[Tables à repérer]`**, ligne « Work Order » : recopiez `entite` et `entity_set`.
2. Bloc **`[Work Order (…) — champs]`** :

| Dans `assistant.toml` | Libellé à chercher |
|---|---|
| `numero` | « Activity Number » |
| `type_attr` | « Type of Work Order » ; et `type_installation` = le nombre devant `Installation` |
| `description` | « Description » |
| `booked_start` / `booked_end` | « Booked start date » / « Booked end date », les dates **avec l'heure** affichées en haut à droite du WO après le booking |
| `date_debut_recherche` / `date_fin_recherche` | « Booked Start Date » / « Booked End Date » du bloc *Booking and Product Information* (la période de recherche) |
| `timeband` | « Timeband » ; et `timeband_valeur` = le nombre devant `All/Half day` |

> Si deux champs portent le même libellé et que vous ne savez pas lequel prendre, envoyez-moi `decouverte.txt`.

3. Bloc **`[Work Order (…) — liens]`** :
   - `case_attr` = 1re colonne de la ligne qui pointe vers `incident` ;
   - `compte_attr` = 1re colonne de la ligne qui pointe vers `account` (facultatif) ;
   - `template_nav` = le `nav` de la ligne qui pointe vers la table des templates, et `template_set` = l'`entity_set`
     de cette table.
4. **`template_mover_m_id`** : dans le CRM, ouvrez le template **Mover M**. Dans la barre d'adresse, copiez ce qui
   est entre `id=%7b` et `%7d` (36 caractères avec des tirets).
5. **Produits :** bloc **`[Work Order Product … — liens]`**. `produits_set` = l'`entity_set` de cette table ;
   `produit_wo_nav` = le `nav` de la ligne vers le Work Order ; `produit_nav` = le `nav` de la ligne vers `product`.
6. **Packs proposés à l'agent :** ouvrez chaque produit dans le CRM et copiez son identifiant depuis l'adresse,
   comme au point 4 :

```toml
[[work_order.packs]]
nom = "Pack Sérénité Home SAS"
produit_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[work_order.packs]]
nom = "Maintenance et télésurveillance"
produit_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> Sans `produit_id`, le pack reste proposé, mais l'agent ajoute le produit à la main et coche « Produits vérifiés ».

## Étape 11 : le SMS (`[sms]`)

1. Bloc `[Tables à repérer]`, ligne « SMS » : `entity_set`.
2. Bloc **`[SMS (…) — champs]`** : `texte` = le champ du message, `mobile` = le champ du numéro.
3. Bloc **`[SMS (…) — liens]`** : `regarding_nav` = le `nav` de la ligne `regardingobjectid → incident`.
4. **`[sms.envoi]`** : à remplir **seulement** si, en mode Supervisé, le SMS reste en brouillon. Dans ce cas,
   envoyez-moi une capture de l'activité SMS et je vous dis quoi mettre.

## Étape 12 : l'email (`[email.remplacements]`)

Ces valeurs se relèvent **dans l'assistant**, en mode Test (étape 14) :

1. Allez jusqu'à l'étape **Email** sur un dossier et cliquez **Préparer l'email**.
2. Le cadre jaune **« Encore surligné »** liste les zones surlignées du vrai modèle, par exemple `23/12/2026 · 8h30 · oui`.
3. Pour chacune, ajoutez une ligne avec le **texte exact entre guillemets** = la clé correspondante :

```toml
[email.remplacements]
"23/12/2026" = "date"
"8h30" = "debut"
"12h30" = "fin"
"175" = "duree"
"oui" = "electricite"
"GSM / Wifi" = "reseau"
"Pas de travaux" = "travaux"
```

Clés possibles : `date`, `debut`, `fin` (reprises du WO), `duree`, `electricite`, `reseau`, `travaux`, `materiel`
(saisies par l'agent). Relancez l'assistant : le cadre jaune doit disparaître.

## Étape 13 : vérifier

Double-cliquez sur **`5-verifier.bat`**, connectez-vous dans Edge. Chaque ligne s'affiche avec **`[OK  ]`**,
**`[NON ]`** (à corriger) ou **`[--  ]`** (facultatif et vide). Corrigez chaque `NON` dans la section indiquée,
enregistrez, relancez, jusqu'au message **« tout est bon »**. Le résultat est aussi dans `verification.txt`.

---

# D. Le mode Test sur de vrais dossiers

## Étape 14 : `4-lancer.bat`

Edge s'ouvre : connectez-vous. L'assistant s'ouvre ensuite **en mode Test** (bandeau violet).

1. Traitez **5 dossiers réels** en parallèle de votre méthode habituelle : vous faites le dossier à la main dans
   le CRM, et l'assistant le « fait » en Test.
2. À chaque étape, comparez le cadre **« Ce qui aurait été écrit »** avec ce que vous avez saisi à la main :
   bon compte, bonne installation, bonne adresse, bonnes valeurs Out / Yes, bonne description.
3. Un arrêt du type **« Configuration : case.champs.xxx manquant »** indique exactement la ligne à compléter.

---

# E. Passer en mode Supervisé

## Étape 15 : les conditions

Passez en Supervisé seulement quand :

- [ ] `5-verifier.bat` dit **« tout est bon »** ;
- [ ] 5 dossiers en Test donnent exactement ce que vous auriez saisi à la main ;
- [ ] l'IT a validé l'usage automatisé de la session CRM (comme pour Dispatch) ;
- [ ] le premier dossier Supervisé se fait sur un **compte de test** (ex. « TEST ALICIA PICHARDIE »).

En Supervisé, chaque écriture part **uniquement** quand vous cliquez. Si l'assistant affiche **« Arrêt —
action requise »**, lisez la consigne. Il ne refait jamais une écriture tout seul : en cas de doute, vérifiez
dans le CRM avant de cliquer « Reprendre ».

---

# F. Brancher le choix des créneaux (facultatif)

## Étape 16 : observer « Get appointments »

Aujourd'hui, en Supervisé, c'est vous qui cliquez « Get appointments » dans la fiche ouverte par l'assistant.
Pour que l'assistant affiche lui-même les créneaux :

1. Ouvrez une invite de commandes dans le dossier `assistant-movers\windows` et tapez :
   `3-decouvrir.bat --observer-booking 120`
2. Pendant les 2 minutes : ouvrez un **WO de test** dans la fenêtre Edge et cliquez vous-même
   **Get appointments** (sans réserver).
3. `decouverte.txt` se termine par **« Appels observés »** : la liste des adresses appelées par le CRM (sans
   contenu). Envoyez-moi ce bloc et je branche la récupération des créneaux.

---

# En cas de souci

| Message | Que faire |
|---|---|
| « Configuration incomplète » (bandeau jaune) | Normal tant que la partie C n'est pas finie. Le mode Test fonctionne |
| « Configuration : xxx manquant » | Complétez la ligne `xxx` (partie C), puis relancez |
| `5-verifier.bat` : « champ inexistant dans le CRM » | Faute de frappe, ou mauvaise ligne recopiée : reprenez dans `decouverte.txt` |
| « Session CRM expirée » | Reconnectez-vous dans la fenêtre Edge, puis « Reprendre » |
| « Le CRM n'a pas créé le Work Order » | Dans la fiche du case ouverte dans Edge, cliquez « Finish », puis « Reprendre » |
| « Un SMS mentionnant cette date existe déjà » | Vérifiez les activités du case ; « Envoyer quand même » seulement si le client ne l'a pas reçu |
| « Encore surligné » à l'étape Email | Complétez les champs du formulaire, ou ajoutez la zone dans `[email.remplacements]` |
| Le fichier `assistant.toml` est refusé au lancement | Une règle de l'étape 5 n'est pas respectée (guillemets, `true`). Le message indique la ligne |
