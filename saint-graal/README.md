# SAINT GRAAL – agent de pose des LID

SAINT GRAAL lit le fichier Excel des LID, retrouve chaque contrat dans le CRM par son numéro, calcule la date
avec la **calculette NID / LID existante** (pilotée comme un utilisateur), renseigne la rubrique
*Termination Information*, enregistre (*Save & Close*), relit le contrat pour vérifier, puis met à jour le
suivi Excel.

```
EXCEL → CONTRAT → RECHERCHE CRM → CALCULETTE → MODIFICATION → SAVE & CLOSE → CONTRÔLE → SUIVI EXCEL
```

> **État : phase 1 (socle vérifié).** Le moteur, la lecture et l'écriture Excel, le pilotage de la
> calculette, les trois modes, l'interface et le contrôle des doublons sont faits et testés de bout en
> bout sur un **CRM de test**. Les repères du **vrai CRM** et la **règle de calcul** (mode et date de
> référence) restent **non confirmés** : ils doivent être calés sur les vidéos Partie 1 et 2 et sur le
> vrai fichier Excel, qui n'ont pas été transmis (voir « Ce qu'il me faut »). Tant que ce n'est pas fait,
> tous les dossiers passent **EN ATTENTE** et le mode autonome reste verrouillé.

## 1. Ce qui a été analysé

| Élément | État |
|---|---|
| Vidéo Partie 1 (Excel) | **Non reçue** : rien n'était joint à la demande |
| Vidéo Partie 2 (CRM) | **Non reçue** |
| « LID posées par MO-TO - Chloé2.xlsx » | **Non reçu**. La lecture suit la structure annoncée (onglets *Contract Advanced Find View*, *Feuil1*, *Feuil2*, *hiddenSheet*, colonnes listées dans le cahier des charges), qui est celle d'un export « Advanced Find » de Dynamics 365 |
| Calculette NID / LID | **Analysée** : [`../calculette-nid/index.html`](../calculette-nid/index.html). Deux onglets (*Installation* / *Résiliation*), un champ date, un champ « Jour de la NID », résultat « LID à poser » et détail des périodes |

La calculette n'est **ni recopiée ni modifiée**. SAINT GRAAL l'ouvre dans le navigateur, clique sur
l'onglet, remplit les champs par leur libellé, puis lit la date affichée. Les résultats des tests sont
identiques aux exemples de la calculette (résiliation 04/11 + NID le 10 → LID 09/02).

## 2. Garanties de fiabilité

- **Numéro de contrat** : lu comme texte, jamais converti en nombre (préfixes et zéros conservés). La
  recherche se fait toujours par le numéro complet. La fiche ouverte doit afficher **exactement** ce
  numéro. Contrat introuvable ou plusieurs résultats → EN ATTENTE.
- **Case Reason** : la liste du CRM est lue et journalisée avant chaque sélection. Seule une égalité
  **exacte** est acceptée (seuls la casse et les espaces sont tolérés), sauf correspondance validée par
  vous dans `regles.correspondancesCaseReason`. Pas d'à-peu-près : motif absent → EN ATTENTE.
- **Case Category** : jamais modifiée si elle est déjà renseignée. Elle n'est remplie que si une règle
  validée existe (`regles.caseCategoryParCaseReason`).
- **Last Income Date** : la date est saisie au format du CRM puis relue. Si une LID différente est déjà
  présente, on ne l'écrase pas → EN ATTENTE.
- **Avant Save & Close** : contrôle du numéro, de la LID et du Case Reason, et capture d'écran.
- **Après Save & Close** : attente de la fermeture de la fiche sans message d'erreur, réouverture du
  contrat et relecture des valeurs. Le statut **POSÉE** n'est donné qu'à ce moment-là.
- **Doublons** : un contrat déjà POSÉ ou DÉJÀ CONFORME dans l'historique SAINT GRAAL n'est jamais
  retraité. Si *Last LID population date* est renseignée → EN ATTENTE (réglage prudent par défaut). Si
  le CRM contient déjà la bonne valeur → **DÉJÀ CONFORME**, sans modification.
- **Excel** : les onglets d'origine ne sont jamais modifiés. Avant chaque écriture, une sauvegarde est
  faite dans `sauvegardes/`. L'écriture passe par un fichier temporaire, et on vérifie que toutes les
  valeurs des onglets d'origine sont identiques (état « très masqué » de *hiddenSheet* compris) avant
  de remplacer l'original. Si le fichier est ouvert dans Excel, les lignes attendent dans
  `data/file-ecriture-excel.json` et sont écrites dès qu'il est fermé : aucune perte.
- **Erreurs** : aucune improvisation. Le dossier passe EN ATTENTE ou en ERREUR avec son code, une capture
  est prise, puis on passe au suivant. Les erreurs à risque (CRM ou calculette indisponible, champ
  introuvable, valeurs relues différentes après enregistrement, intégrité Excel) **arrêtent la session**.
- **Authentification** : SAINT GRAAL utilise votre navigateur et **votre** session CRM, que vous ouvrez
  vous-même. Rien n'est contourné.

## 3. Modes

| Mode | Comportement |
|---|---|
| **TEST** | Lit, recherche, ouvre, calcule et compare, mais **n'écrit rien**, ni dans le CRM ni dans l'Excel. Produit `data/rapport-test-….csv` avec les résultats attendus |
| **SUPERVISÉ** | Remplit les champs puis affiche une fenêtre de validation (anciennes et nouvelles valeurs, détail de la calculette, capture). **Rien n'est enregistré sans votre clic** |
| **AUTONOME** | Pose sans validation systématique. **Verrouillé** tant que `modes.autonomeAutorise` n'est pas à `true` et que `crm-selectors.json` n'a pas `valide: true` |

- **PAUSE** : prend effet à la prochaine étape sûre.
- **ARRÊTER** : aucune nouvelle opération n'est lancée. Avant *Save & Close*, le contrat est abandonné
  sans rien enregistrer. Après, l'enregistrement et sa vérification vont à leur terme.
- **Reprise** : relancer suffit. Les contrats déjà posés sont ignorés, ceux en attente ou en erreur sont
  retentés.

## 4. Fichier Excel produit

- **SUIVI SAINT GRAAL** : Date de traitement, Heure, Collaborateur associé, Numéro de contrat,
  Installation, Ancienne / Nouvelle Last Income Date, Case Reason, Case Category, Utilisateur ayant
  effectué la pose, Statut, Commentaire / Erreur, Mode, Ligne Excel.
- **TABLEAU DE BORD SAINT GRAAL** : LID posées aujourd'hui (total et par Kader, Chloé, Estef,
  Marc Antoine), dossiers en attente, erreurs, historique par journée et par collaborateur. Il est
  calculé **uniquement sur les poses confirmées**.

Le collaborateur est déduit de la colonne *Modified By* (alias dans `config/saint-graal.config.json`). Il
sert uniquement aux statistiques : la pose est faite avec votre compte CRM.

## 5. Installation sur le poste (Windows)

👉 **Suivez le [tutoriel pas à pas](TUTORIEL.md)** : fichiers `.bat` à double-cliquer dans `windows/`
(`1-installer`, `2-demo`, `3-decouvrir`, `4-lancer`), réglages dans `reglages.json`, données (journal,
captures, sauvegardes Excel, session Edge) dans `%USERPROFILE%\Saint-Graal-donnees`.

En ligne de commande : `npm install`, `npm run demo` (CRM et Excel fictifs), `npm run decouvrir`
(contrôle des repères sur le vrai CRM, lecture seule), `npm start`.

## 6. Architecture

| Fichier | Rôle |
|---|---|
| `src/excel.js` | Lecture par nom de colonne, suivi et tableau de bord, sauvegardes, écriture contrôlée, file d'attente si le fichier est verrouillé |
| `src/calculette.js` | Pilotage de la calculette existante (Playwright, comme un utilisateur) |
| `src/crm.js` | Recherche globale, ouverture et vérification, lecture et saisie des champs, Save & Close. Repères dans `config/crm-selectors.json` |
| `src/agent.js` | Enchaînement des étapes, modes, pause et arrêt, anti-doublon, classement des erreurs, captures |
| `src/server.js` + `public/index.html` | Interface locale (127.0.0.1 uniquement) en temps réel |
| `test/` | Classeur de test, CRM de test (fictifs) et tests de bout en bout : `npm test` |

Approche technique : **Playwright sur le DOM**, en ciblant les éléments par leur libellé visible et leur
rôle, comme un utilisateur. Le CRM attendu (Dynamics 365) est accessible de cette façon. Les captures
d'écran servent de preuve et de contrôle. Le pilotage visuel (*Computer Use*) n'est prévu qu'en secours,
si une partie de l'interface ne se laisse pas piloter : c'est la vidéo Partie 2 qui le dira. Le fichier
Excel est lu et écrit directement, sans piloter l'application Excel.

## 7. Ce qu'il me faut pour la phase 2 (calage sur le réel)

1. **Les deux vidéos.** Elles serviront à caler les repères CRM (barre de recherche, liste des résultats,
   libellés exacts, type de liste Case Reason ou Case Category, bouton *Save & Close*, message de
   confirmation) et les éventuelles manipulations Excel (filtres, tri, colonne *Commentaire*).
2. **Le fichier Excel**, ou au minimum le résultat de l'onglet *Analyse de l'Excel* (noms de colonnes et
   Case Reason, sans données client). Le fichier réel ne doit pas être versionné sur GitHub (`*.xlsx`
   est exclu).
3. **Règle de la calculette** : quel onglet utiliser (*Résiliation* pour tous les motifs ?) et **quelle
   date** saisir comme date de résiliation. Aucune des colonnes listées n'est une date de résiliation.
   Faut-il prendre une autre colonne, ou une date lue dans le CRM ?
4. **Jour de NID** : celui de *Next Invoice Date* de l'Excel ou celui du CRM ? Aujourd'hui, si les deux
   sont différents, le dossier passe en attente.
5. **Last LID population date** : que signifie-t-elle exactement ? Un dossier qui en a une est-il déjà
   traité ?
6. **Last Income Date déjà présente et différente** : faut-il l'écraser ou laisser le dossier en attente
   (réglage actuel) ?
7. **Case Category** : est-elle obligatoire pour enregistrer ? Quelle catégorie pour quel motif ?
8. **Calculette** : est-ce bien celle de `calculette-nid/` (en ligne sur `…/SA-IA/nid/`) ? Sinon,
   l'adresse de celle à utiliser.
9. **Un contrat autorisé** pour la première pose supervisée.
