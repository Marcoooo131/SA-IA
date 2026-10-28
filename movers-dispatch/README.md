# Dispatch Movers Emails — agent Dynamics 365

Agent qui parcourt les mails et tâches Movers du CRM (sous-tableaux *Queue Item - Movers - Emails* et
*Queue Item - Movers tasks*), retrouve le **Case** Movers indiqué par le champ **Regarding**, lit l'**Owner**
de ce Case et renseigne le même collaborateur dans le champ **Worked By** du Queue Item. Seuls Kader,
Estefania, Marc-Antoine et Chloé peuvent être affectés. Quand aucun Case ne désigne l'un d'eux, une liste
déroulante du tableau de bord permet de choisir à qui attribuer l'élément.

> **État actuel : à lire avant toute utilisation**
>
> | Élément | État |
> |---|---|
> | Règles de décision, modes Simulation / Supervisé / Automatique, arrêt immédiat, journal, tableau de bord | **Opérationnels**, testés sur des données **fictives** (115 tests), dont les deux mails de la vidéo reproduits |
> | Connexion « navigateur » (session CRM de l'utilisateur) | Testée dans un vrai Chromium face à un **serveur imitant le Web API** d'un CRM sur site, jamais face au vrai CRM |
> | Connexion « msal » | **Sans objet** pour le CRM Sector Alarm, qui est installé sur site (pas Dynamics 365 en ligne) |
> | Vidéo de la procédure | **Analysée** (2 mails traités, § 1). Ce qu'elle montre a corrigé les règles (§ 2) |
> | Adresse du CRM, identifiants des 4 collaborateurs | **Non renseignés** : à relever avec `discover`. Toute écriture reste bloquée en attendant |
> | Règle « Case pertinent pour Movers » quand le Regarding est le compte | Observée dans la vidéo : titre « Mover » / « MOVERS », **quel que soit le statut**. **À confirmer par le métier** |
> | Mode Automatique | **Désactivé** par la configuration (`automatic_allowed = false`) |

## 1. Processus observé dans la vidéo

CRM Dynamics 365 **sur site** (interface web classique, `…/<Organisation>/main.aspx`), tableau de bord
*Churn - Defence Main activites*, sous-tableau *Queue Item - Movers - Emails* (colonnes Title, Entered
Queue, Type, Due Date, Account (Object), Regarding). La vidéo traite deux mails :

| | Mail 1 « Voir document joint » | Mail 2 « Re : Contrat Sector Alarm CRM:… » |
|---|---|---|
| Regarding du mail | un **compte** client | un **Case** intitulé « MOVERS » |
| Ce que l'utilisateur consulte | la fiche du compte → section **Cases** (le sous-tableau *Open Cases* est vide) | la fiche du Case, puis les Cases du compte |
| Cases du compte | un seul : « Mover », statut **Canceled** | « Mover » (**Resolved**), « MOVERS » (**Canceled**) et deux Cases non Movers, chacun avec un Owner différent |
| Case retenu | « Mover » → Owner **Estefania** | « MOVERS », **celui du Regarding** → Owner **Kader** |
| Worked By saisi | Estefania (choisie dans la liste du lookup) | Kader (choisi dans la liste du lookup) |

Parcours à l'écran : double-clic sur le mail → clic sur le Regarding → lecture du Case et de son Owner →
retour au mail → **Save & Close** du mail → réouverture → menu « … » → **Queue Item Details** (fenêtre
*Queue Item* : Queue = « Movers », Worked By, Queue Item = le mail, Entered Queue, Modified On) → saisie
du prénom dans **Worked By** et choix de la fiche utilisateur proposée → **Save & Close** → **Save & Close**
du mail.

Seule l'écriture de **Worked By** sur le **Queue Item** modifie le CRM. Le *Save & Close* du mail ne
change aucune valeur : il ferme la fiche.

## 2. Informations techniques réellement accessibles

Ce que montre la vidéo :

- Serveur **sur site** : l'API du CRM est le **Web API 8.x** (`<adresse>/<Organisation>/api/data/v8.x/`).
  La connexion se fait avec la session déjà ouverte dans le navigateur, pas via Microsoft Entra ID.
- La fenêtre *Queue Item Details* est le formulaire `queueitem` (`etc=2029` dans son adresse). La file
  s'appelle **Movers**. **Worked By** est un lookup vers une fiche utilisateur (nom complet affiché).
- Le **Regarding** peut pointer vers un **compte** ou vers un **Case**. Le Case retenu peut être
  **Canceled** ou **Resolved** : le statut n'est pas un critère.
- La fiche mail a aussi un champ **Case** (vide dans les deux exemples) et la fiche Case un champ
  **Case worked by**. Ce sont des champs personnalisés : l'agent ne les utilise pas, puisque la règle
  demandée est l'**Owner** du Case.

Colonnes standard de Dynamics, que l'agent **vérifie lui-même** dans les métadonnées du CRM avant toute
écriture (`preflight`) :

| Écran de la procédure | Table / colonne |
|---|---|
| Élément de la file | `queueitem` (clé unique `queueitemid`, file `queueid`, objet `objectid`) |
| **Worked By** du Queue Item Details | `queueitem.workerid`, lookup `systemuser`, écrit par `workerid_systemuser@odata.bind` |
| Mail | `email` (`activityid`, `subject`) |
| **Regarding** | `email.regardingobjectid` → `account` ou `incident` |
| Section **Cases** du compte | `incident` filtré sur `customerid` = le compte |
| Owner du Case → collaborateur | `incident.ownerid` → `systemuser` (`firstname`, `fullname`, `isdisabled`) |

Rien n'a été inventé : l'adresse du CRM, la version d'API et l'identifiant de chaque collaborateur se
relèvent avec `discover` dans votre session.

## 3. Méthode d'intégration retenue

1. **API officielle du CRM (Web API)**, celle qu'utilise l'interface elle-même. Elle évite les clics, les
   coordonnées et les délais fixes, et s'applique **avec les droits de l'utilisateur connecté**.
   Connexion `browser` : une fenêtre Edge s'ouvre sur le CRM, vous vous connectez comme d'habitude, et
   l'agent appelle le Web API **depuis cette page**, avec sa session. Aucun mot de passe n'est transmis
   à l'agent. **À faire valider par l'IT** (usage automatisé de la session).
2. **Rejouer les clics** (Playwright) n'est **pas** implémenté. Le Web API couvre toutes les étapes, et
   la fenêtre *Queue Item Details* est une ancienne fenêtre pop-up dont les sélecteurs sont fragiles. Si
   l'IT refuse le Web API, cette voie reste possible avec la même logique de décision.

Correspondance avec la vidéo : aucune écriture sur le mail (son *Save & Close* ne change rien). Les deux
*Save & Close* correspondent à **une seule** écriture de `workerid` avec l'ETag lu juste avant, puis à
une relecture qui confirme l'enregistrement.

### Déroulé contrôlé, par élément

1. Relire le Queue Item (identité, Worked By actuel, ETag).
2. Lire le mail et son Regarding (jamais de recherche par le nom du client) :
   - **Regarding = un Case** → c'est **ce Case** qui est retenu, quels que soient son titre et son statut (mail 2) ;
   - **Regarding = un compte** → Cases du compte filtrés par les règles `[cases]` : titre contenant
     « mover » (comparaison sans casse ni accents), tout statut (mail 1).
3. Ne garder que les Cases dont l'Owner est un `systemuser` dont l'**identifiant** figure dans la
   configuration. Le prénom ne sert que de contrôle croisé, jamais à identifier quelqu'un.
4. Décider (`rules.py`) :

| Situation | Résultat |
|---|---|
| Un seul Case retenu, Owner parmi les 4, actif, Worked By vide | **affectable** |
| Worked By déjà égal au bon collaborateur | ignoré (déjà traité) |
| Worked By déjà renseigné avec quelqu'un d'autre que l'Owner trouvé | validation humaine (**jamais écrasé**) |
| Worked By déjà renseigné et aucun collaborateur à proposer | ignoré (déjà traité) |
| Regarding = compte, Cases Movers d'Owners différents : un seul est **actif ou annulé**, les autres **résolus** | **affectable** à l'Owner du Case actif ou annulé |
| Regarding = compte, plusieurs Cases Movers **actifs ou annulés** d'Owners différents (ou tous résolus) | validation humaine |
| Plusieurs Cases Movers, même Owner | validation humaine (ou affectation si `multiple_same_owner = "assign"`) |
| Aucun Case Movers / Owner hors des 4 (autre personne, équipe) | validation humaine, avec **liste déroulante** pour attribuer à la main |
| Mail sans Regarding / Regarding ni compte ni Case | validation humaine |
| Collaborateur inactif | validation humaine |
| Prénom CRM ≠ prénom configuré pour cet identifiant | erreur de configuration |

5. Selon le mode : proposer, attendre la validation, ou écrire **une fois** puis relire.

Sur chaque ligne en **validation humaine**, le tableau de bord propose une **liste déroulante** des quatre
collaborateurs et un bouton **Attribuer**. L'agent relit alors l'élément et refuse d'écraser un Worked By
déjà rempli. Il écrit une fois, relit la valeur, et note dans l'historique qui a fait ce choix. Les éléments
**ignorés** (déjà bien renseignés) sont comptés mais ne sont pas listés.

Le mail 2 illustre les deux règles : son compte a un Case « Mover » **résolu** (Estefania) et un Case
« MOVERS » **annulé** (Kader). Que l'agent passe par le Regarding (le Case « MOVERS ») ou par le compte
(l'annulé l'emporte sur le résolu), il retient Kader, comme dans la vidéo.

### Regarding vide, catégories et rotation (2e vidéo et exemples du 22/10)

**Retrouver le client.** La 2e vidéo montre la méthode : un indice tiré du mail, une recherche du compte,
puis le **n° de compte** saisi dans le Regarding. L'indice peut être l'adresse de l'expéditeur, le
« Numéro de client » écrit dans le texte ou le champ « Email » du formulaire HubSpot. L'agent fait pareil
avec le Web API, en recherche **exacte** sur les comptes actifs :
1. n° client écrit dans le texte (`accountnumber`) ;
2. adresse de l'expéditeur, puis adresses écrites dans le texte (`[client] champs_email`), sans les
   adresses Sector Alarm et HubSpot ;
3. téléphones écrits dans le texte, sous leurs différentes écritures (`[client] champs_telephone`).

Il ne retient le client que si **un seul compte** ressort de tous les indices. Deux comptes pour une même
adresse, ou des indices qui désignent des comptes différents, envoient l'élément en validation humaine.
Le client trouvé est d'abord proposé (« à rattacher »). Une fois validé, l'agent écrit le Regarding, le
relit, puis écrit Worked By. Même en mode Automatique, un humain valide ce rattachement tant que
`[client] automatique = false`. Dans le tableau de bord, la case **N° de compte**, avec **Rattacher le
client** ou **Corriger le client**, fait ce que vous faites à la main. Le contenu des mails est lu en
mémoire et jamais enregistré : le journal garde « via adresse de l'expéditeur cl•••@exemple.fr ».

**Tâches (4e vidéo).** Sur une tâche (« Contact customer - PRIO », « Takeover - CS », « Moving - CS »),
le Regarding est souvent un contrat « C-SFR-… ». Le client figure dans le champ **Account** de la tâche,
et c'est par lui que l'équipe ouvre la fiche client et ses Cases. L'agent lit ce champ. Il trouve tout
seul la colonne dans les métadonnées du CRM : c'est la seule colonne de la tâche qui pointe vers un
compte, en dehors du Regarding. S'il y en a plusieurs, il ne devine pas et il faut la désigner dans
`[client] liens_compte`. Le Regarding de la tâche n'est pas modifié.

**Compteurs de la rotation.** Le bloc « Rotation 1 pour 1 » affiche, pour chaque catégorie, le nombre
d'éléments donnés **par la rotation** aujourd'hui et depuis le début, avec la part de chaque
collègue. Ce sont les éléments sans Case d'un des quatre, ce qui permet de vérifier le 1 pour 1.

Quand le Regarding pointe vers une autre table (une tâche « Moving - CS » rattachée à un contrat
« C-SFR-… »), l'agent passe par la colonne « compte » de cette table, indiquée dans `[client]
liens_compte` et relevée avec `discover --table contract`. Sans ce réglage, l'élément part en validation
humaine avec la marche à suivre.

**Rotations par nom de tâche (organisation du 27/10).** Il y a quatre rotations indépendantes :
« Prio - Movers - Déménagement », « Movers - Résiliation », « Movers - Résiliation exception » et
« Movers - Takeovers ».
- Une **tâche** va dans la rotation dont elle porte le nom. La comparaison ignore les majuscules, les
  accents et les tirets, et « Takeover » vaut « Takeovers ». Le nom le plus long l'emporte : « …
  Résiliation exception » passe avant « … Résiliation ».
- Les **mails**, et les tâches qui portent un autre nom, sont rangés par mots. Les mots de résiliation
  (résili, termination, désactiv, décès…) mènent à « Movers - Résiliation ». Ceux de déménagement
  (déménag, moving home, nouvelle adresse…) mènent à « Prio - Movers - Déménagement ».
- **Une résiliation trouvée par les mots n'est jamais attribuée d'office.** C'est le cas d'un mail, ou
  d'une ancienne tâche (« Moving - CS », chatbot) rangée d'après sa **description** ; une tâche sans mot
  reconnu reste une résiliation, comme avant. L'élément part en validation humaine, et la personne choisit
  « Suivant en Movers - Résiliation » ou « Suivant en Movers - Résiliation exception » (`choix`). Le
  formulaire HubSpot « Moving Home » va directement en « Prio - Movers - Déménagement ».
- Tout se règle dans `[[rotations]]` (key, label, taches, mots, choix) et l'ordre de passage dans `[rotation]`.
  Une ancienne section `[categories]` ne sert plus qu'à fournir ses listes de mots.

**Rotation 1 pour 1.** Une rotation par catégorie, dans l'ordre de `[rotation]`. Elle s'applique quand
aucun Case pertinent n'appartient à l'un des quatre (`applique = "sans_owner"`). Si un tel Case existe,
la règle de l'Owner reste prioritaire et le client garde son interlocuteur. Avec `"toujours"`, la
rotation s'applique à chaque élément classé. Un collègue coché **absent** dans le tableau de bord est
sauté. La position de chaque rotation est conservée d'un jour à l'autre et n'avance que lorsqu'un
Worked By est réellement écrit (jamais en Simulation). Une correction fait repartir la rotation du
collègue choisi. Un seul poste doit faire tourner l'agent, sinon deux rotations avanceraient en parallèle.

**Courriers scannés (3e vidéo).** Les mails « Voir document joint » viennent du scanner du courrier
(noreply@sectoralarm.fr). Leur PDF est une **lettre manuscrite**, et le n° client y est écrit à la main.
L'agent ne lit pas cette écriture lui-même : un chiffre mal lu peut désigner un autre client qui existe
vraiment. Il signale la pièce jointe dans le motif, et le bouton **Voir la pièce jointe** ouvre le scan
directement depuis le tableau de bord. Le fichier est lu dans le CRM à la demande, sans être enregistré,
et seuls les PDF et les images sont affichés. Vous tapez le n° lu. Avant d'écrire, l'agent affiche le
**nom du compte** correspondant pour confirmation. Comme ces lettres n'ont pas de catégorie lisible, la
liste **Attribuer à…** propose aussi « Suivant en Résiliation » et « Suivant en Déménagement », pour
que la rotation 1 pour 1 s'applique.

**Lecture des lettres par Azure AI Document Intelligence (section `[lecture]`, désactivée par défaut).**
Une fois l'accord de l'informatique et du DPO obtenu, l'agent envoie les PDF et images des mails dont le
client n'est pas retrouvé à la ressource Azure **de l'entreprise** (modèle « prebuilt-read », qui lit
l'écriture manuscrite). Il ne garde pas le texte : seulement les n° client (ceux écrits « n° client » d'abord,
sinon les nombres de 6 à 10 chiffres), les téléphones et les adresses e-mail. Il cherche ensuite le compte
comme pour un mail, avec un compte unique et cohérent. Le motif dit ce qu'il a lu (« j'ai lu : n° 10075432 »).
Le client proposé est **toujours validé par un humain**, même en mode Automatique : un chiffre mal lu peut
désigner un autre client réel. Le bouton **Lire la lettre (Azure)** fait la même lecture à la demande et
préremplit le n° ; rien n'est écrit sans « Rattacher le client ». La clé est lue dans la variable Windows
`MD_AZURE_DI_KEY`, jamais dans `dispatch.toml`. Les identifiants lus restent en mémoire le temps de la
session, pour ne pas renvoyer la même lettre à Azure à chaque passage.

**Pas encore fait :** retrouver le client par **nom + adresse**.

### Modes

| Mode | Écritures | Activation |
|---|---|---|
| **Simulation** (défaut) | aucune : le connecteur lui-même refuse toute écriture | par défaut |
| **Supervisé** | une par validation humaine. Avant d'écrire, l'agent relit tout : si la situation a changé, il n'écrit pas | choix dans le tableau de bord |
| **Automatique** | cas non ambigus uniquement | `automatic_allowed = true` dans la configuration **et** saisie de `AUTOMATIQUE` à chaque lancement (ou `--confirm-automatic`) |

**Supervision et corrections.** En mode Supervisé, chaque proposition peut être **validée**, **corrigée**
(liste « Corriger : le bon collègue est… » avec une raison courte, la bonne personne étant écrite dans le
CRM) ou **refusée**. L'agent ne modifie pas ses règles tout seul. Les corrections sont conservées avec les
Cases qu'il avait vus (n°, titre, statut, Owner), affichées dans le *Bilan de la supervision*, et
exportables (`journal --corrections -o corrections.csv`, ou `windows/5-exporter-corrections.bat`) pour
réviser les règles. Le bilan indique la **série** de propositions validées d'affilée sans correction.
L'objectif avant le mode Automatique est réglable : `readiness_streak`, 100 par défaut.

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

- **Règle « Case Movers » déduite de deux exemples.** Titre contenant « mover », tout statut. D'autres
  critères sont possibles (sur la fiche du Case « MOVERS » : type *Takeover*, catégorie *Moving Customer*,
  processus *Movers*). À confirmer par le métier avant le mode Automatique, en Simulation sur la vraie file.
- **Ancienneté** : un compte peut avoir un vieux Case Movers d'un autre collaborateur. Dans ce cas, avec un
  Regarding sur le compte, l'agent demande une validation au lieu de choisir le plus récent.
- **Connexion `browser`** : elle utilise la session de l'utilisateur sans contourner aucun contrôle. Elle
  reste un usage automatisé de cette session, que la politique de l'entreprise doit autoriser.
- **Version du CRM** : la vidéo montre une interface 8.x. Si le Web API répondait mal, par exemple sans le
  nom de la table derrière un lookup, `discover` et les contrôles préalables le signaleraient. Aucune
  écriture ne serait alors possible.
- **Droits** : l'agent a exactement les droits de l'utilisateur connecté. La vidéo affiche d'ailleurs un
  message « You do not have enough privileges » sur un sous-tableau : les refus sont journalisés.
- **Données personnelles** : le journal conserve des identifiants, le sujet tronqué à 80 caractères, le nom
  du compte, le n° de Case et les noms des collaborateurs. Il ne garde ni corps de mail, ni adresse, ni
  téléphone. Le fichier `movers_dispatch.db` reste sur le poste : il faut en définir la durée de conservation.

## 5. Plan de développement

| Étape | État |
|---|---|
| 1. Logique de décision, 10 scénarios demandés + les 2 mails de la vidéo (données fictives) | fait |
| 2. Connecteur Web API : lectures (compte ou Case en Regarding), écriture unique avec ETag, contrôles des métadonnées, détection de la version | fait (testé face à un faux serveur) |
| 3. Session utilisateur dans le navigateur, CRM sur site (testée dans Chromium) | fait |
| 4. Modes, arrêt immédiat, journal, tableau de bord responsive | fait |
| 5. **Vous** : `discover` sur le vrai CRM (version d'API, libellé Worked By, file « Movers », identifiants des 4 collaborateurs) et report dans `dispatch.toml` | à faire |
| 6. **Vous + métier** : confirmer la règle « titre contient mover, tout statut » | à faire |
| 7. Simulation sur la vraie file, puis comparaison des propositions avec vos affectations manuelles | à faire |
| 8. Mode Supervisé sur quelques mails réels, avec contrôle dans le CRM | à faire |
| 9. Si tout concorde : `automatic_allowed = true` | à décider |

## Installation et utilisation

> **Première fois ? Suivez le [tuto pas à pas pour Windows](TUTORIEL.md)** : installation et lancement
> par double-clic sur les fichiers de `windows/`, sans taper de commande.

Prérequis : Python 3.11+ (Windows ou Linux).

```bash
cd movers-dispatch
python -m venv .venv && .venv\Scripts\activate        # Linux : source .venv/bin/activate
pip install -e ".[browser]"                            # ajouter ",dev" pour les tests
# Edge déjà installé sous Windows : rien à télécharger (browser_channel = "msedge")

# Essai sans CRM, sur des données FICTIVES :
movers-dispatch serve --demo

# Sur le vrai CRM :
copy config\dispatch.example.toml dispatch.toml        # puis renseigner environment_url (adresse du CRM)
movers-dispatch discover -c dispatch.toml              # lecture seule : contrôles, files, vues, utilisateurs
# → reporter api_version si besoin et les 4 systemuser_id dans dispatch.toml
movers-dispatch run -c dispatch.toml                   # Simulation
movers-dispatch serve -c dispatch.toml                 # tableau de bord : lien affiché dans la console
```

| Commande | Rôle |
|---|---|
| `discover -c …` | lecture seule : version du Web API, métadonnées de Worked By, files et vues « Movers », utilisateurs par prénom |
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
  transports.py   session utilisateur : navigateur (Playwright) ; MSAL pour Dynamics 365 en ligne
  journal.py      SQLite : états, historique, passages
  fake.py         CRM en mémoire, données FICTIVES (tests et démo)
  web/            tableau de bord local
config/dispatch.example.toml
```
