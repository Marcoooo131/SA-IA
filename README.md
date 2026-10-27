# Audit Movers – prototype d'audit de sécurité 2D/3D et de génération de devis

Prototype de démonstration réalisé dans le cadre d'une **proposition d'amélioration du service Movers** :
lors d'un déménagement, le conseiller prépare dans une seule interface le dossier, le plan du nouveau
logement, la maquette 3D, l'audit de sécurité, la comparaison des offres et le devis PDF.

> ⚠️ **Prototype non officiel.** Ce n'est ni un outil validé par Sector Alarm, ni une certification de
> sécurité. Les tarifs, compositions de packs et règles d'audit sont des **données de démonstration /
> hypothèses de configuration** à valider par les responsables métier. Toutes les données préchargées
> sont fictives. Aucune intégration à un système interne n'existe.

> 💬 **Relances SMS Movers & Takeovers** (Python, distinct de l'application Movers) :
> [`sms-reminders/`](sms-reminders/README.md) — import des rendez-vous, relances automatiques J-2 / J-1,
> suivi des confirmations ; mode simulation tant que le fournisseur SMS n'est pas configuré.
> Application Windows prête à lancer : [`sms-reminders-desktop/`](sms-reminders-desktop/README.md)
> (`RelancesSMS.exe`, à télécharger dans les *Releases* du dépôt).

> 📨 **Dispatch Movers Emails** (Python, distinct de l'application Movers) :
> [`movers-dispatch/`](movers-dispatch/README.md) — agent Dynamics 365 qui renseigne *Worked By* sur la file
> Movers Emails à partir de l'Owner du Case du compte client ; Simulation par défaut, Supervisé, Automatique.
> Ancienne version conservée à part (sans le bouton « Corriger ») : [`movers-dispatch-ancienne-version/`](movers-dispatch-ancienne-version/README.md).

> 📽️ **Présentation équipe : nouvelle organisation Movers** (React + TypeScript, distincte de l'application Movers) :
> [`movers-presentation/`](movers-presentation/README.md) — 13 diapositives interactives (planning, rôles, cinq templates,
> rotation, gestion de la charge), plein écran, sommaire, notes de l'orateur et PowerPoint modifiable ;
> en ligne sur GitHub Pages : `…/SA-IA/presentation-movers/`.

> 🎬 **Alcoolique Quest : La Sobriété Perdue** (Three.js, distinct de l'application Movers) :
> [`alcoolique-quest/`](alcoolique-quest/README.md) — cinématique d'introduction en temps réel d'un RPG dark fantasy
> humoristique (scènes 3D procédurales, musique et bruitages synthétisés, logo, écran d'accueil provisoire).

> 📞 **Prototypes « Phone Call »** (Python, distincts de l'application Movers) :
> - [`phonecall-desktop/`](phonecall-desktop/README.md) — poste conseiller Windows : capture du son du PC et du micro,
>   transcription en direct, note Phone Call à copier dans le CRM (indépendant de Twilio) ;
> - **Améliorateur Phone Call** (page web, `…/SA-IA/ameliorateur/` sur GitHub Pages) — colle une transcription,
>   rend la Phone Call au format de l'équipe, par script et entièrement dans le navigateur (rien n'est envoyé ni conservé) ;
> - [`phonecall-agent/`](phonecall-agent/README.md) — passerelle IA (`/api/v1/notes`) et traitement des
>   enregistrements Twilio.

---

## 1. Démarrage rapide

Prérequis : **Node.js 20 ou plus récent** (testé avec Node 22) et un navigateur récent (Chrome, Edge, Firefox) avec WebGL.

```bash
npm install          # installe les dépendances (.npmrc : legacy-peer-deps)
npm run dev          # lance l'application sur http://localhost:5173
```

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm run build` | vérification TypeScript + build de production dans `dist/` |
| `npm run preview` | sert le build de production (http://localhost:4173) |
| `npm test` | tests unitaires et de composants (Vitest, 73 tests) |
| `npm run test:e2e` | tests de bout en bout dans Chromium (Playwright, 3 parcours) – nécessite `npx playwright install chromium` la première fois |
| `npm run typecheck` | vérification des types |
| `node scripts/generate-demo-assets.mjs` | régénère les fichiers de démonstration de `demo-assets/` |

### Version en ligne (GitHub Pages)

Le workflow `.github/workflows/deploy-pages.yml` construit et publie l'application à chaque mise à jour de
`main`. Activation unique : *Settings → Pages → Source : GitHub Actions*.
L'adresse est ensuite `https://<compte>.github.io/SA-IA/`.

Au premier lancement, l'application contient :
- un dossier **MOV-DEMO-0001** (maison fictive à deux niveaux : entrée, séjour, cuisine ouverte, trois chambres, couloirs, garage, cellier, 13 ouvertures extérieures) déjà audité en mode volumétrique ;
- un dossier **MOV-DEMO-0002** (appartement fictif incomplet, pour montrer les alertes « information manquante ») ;
- le catalogue et les deux packs de démonstration.

Le bouton **« Réinitialiser la démo »** du tableau de bord restaure ces données à tout moment.

---

## 2. Parcours guidé (9 étapes)

Navigation principale : **Tableau de bord**, **Dossiers**, **Audits**, **Catalogue**, **Paramètres**.
Dans un dossier, une barre de progression rouge et noire affiche l'étape active (rouge), les étapes terminées (✓ noir)
et les étapes restantes ; chaque étape reste accessible à tout moment, sans perte de données, et un bandeau indique ce
qu'il reste à compléter. Boutons « Précédent / Continuer » en bas des étapes de formulaire.

| Étape | Ce que fait le conseiller |
|---|---|
| 1. Informations du logement | référence, client fictif, adresse, type, surface, étages, dates, animaux, usage de nuit, commentaires |
| 2. Modèle ou import du plan | galerie de 16 modèles (vignettes 2D et 3D issues du plan réellement généré, type, niveaux, surface), import d'un plan / d'une photo ou dessin libre |
| 3. Questionnaire | réponses par cartes de choix et compteurs, aperçu en direct, génération du plan 2D et de la maquette 3D |
| 4. Pièces et menuiseries | tableau par pièce, ouvertures à positionner, détecteurs indicatifs |
| 5. Plan 2D meublé | édition du plan, mobilier, menuiseries, équipements ; modes plan architectural / meublé |
| 6. Visualisation 3D | maquette meublée, avec ou sans équipements, vues isométrique / dessus / face |
| 7. Audit et équipements | propositions volumétrique et périmétrique, alertes, placement et validation des équipements |
| 8. Proposition commerciale | comparateur des offres, forfait, ajustements, déménagement, remises |
| 9. Devis | synthèse (logement, équipements inclus / supplémentaires, frais initiaux et mensuels séparés, points à valider), génération du PDF, historique |

Écran de conception : **à gauche** niveaux, pièces, bibliothèques (mobilier, menuiseries, équipements de sécurité) ;
**au centre** le plan 2D ou la scène 3D ; **à droite** les propriétés de l'objet sélectionné, la synthèse d'audit et la
synthèse tarifaire. Les panneaux latéraux se replient (tablette) ; la barre d'affichage bascule 2D / 3D, affiche ou
masque le mobilier et les équipements, et enregistre.

### Direction artistique
Interface blanche, noire et rouge, sobre et professionnelle (inspiration : principes de parcours guidé et de mise en
avant des actions ; aucun visuel, code ou texte propriétaire repris). Le thème est **centralisé** dans
`src/index.css` (variables `--color-brand-*` pour le rouge d'action, gris neutres, alias `--sa-red`, `--sa-ink`) et
`src/theme.ts` (mêmes valeurs pour le SVG, la 3D et le PDF). **La valeur du rouge est provisoire** : la remplacer à cet
endroit par la valeur de la charte officielle dès qu'elle est fournie. Aucun logo officiel n'est reproduit (identité
typographique temporaire) ; les illustrations d'équipements sont des dessins génériques à remplacer par les visuels
produits autorisés. Composants communs dans `src/ui/kit.tsx` (boutons principal / secondaire / noir, champs, cartes de
sélection, compteurs, badges, modales, barres de progression, états vides et de chargement).

---

## 3. Scénario de démonstration (≈ 10 minutes)

Fichiers fournis dans `demo-assets/` : `plan-exemple.png`, `plan-exemple.pdf` (plan fictif avec une cote de
10,00 m) et `catalogue-exemple.xlsx` (catalogue à importer, avec erreurs volontaires).

1. **Modifier le plan** – Ouvrir *MOV-DEMO-0001* → *Plan 2D*. Cliquer sur le séjour, tirer une poignée ou saisir la largeur ; les cotes s'affichent.
2. **Ajouter une ouverture** – Outil *Fenêtre* (barre d'outils), cliquer sur un mur extérieur : l'ouverture reçoit un identifiant unique (ex. `RDC-O14`) et est reconnue comme extérieure.
3. **Importer une image de référence** – Niveau *Étage (R+1)* → *Importer un plan* → `plan-exemple.png` (ou `.pdf`). Régler la transparence, la rotation, la position.
4. **Corriger le plan** – Outil *Échelle* : cliquer les deux extrémités de la cote rouge, saisir `10` m. Tracer ou ajuster les pièces par-dessus, puis *Retirer le fond* si besoin. `Ctrl+Z` / `Ctrl+Y` pour annuler / rétablir.
5. **Générer la vue 3D** – Onglet *Vue 3D* : niveaux côte à côte, vue isométrique / dessus, *Rez-de-chaussée seul*, *Masquer un mur au clic*.
6. **Positionner des équipements** – Bibliothèque → *Sirène extérieure* → clic sur le sol en 3D (ou sur le plan 2D) : l'équipement apparaît dans les deux vues. Sélection, orientation, quantité et changement de référence dans le panneau de droite.
7. **Comparer les modes de protection** – Onglet *Audit* : nombres d'équipements, prix et limites des modes volumétrique et périmétrique, tableau des écarts ; *Appliquer sur le plan*.
8. **Comparer les deux packs** – Onglet *Devis* : comparateur, clic sur une case de la ligne « Configuration retenue » pour choisir l'offre.
9. **Modifier un tarif** – *Catalogue & règles* → *Produits* : changer le prix du détecteur de fumée (ou importer `catalogue-exemple.xlsx` via *Import / export Excel*, avec aperçu, doublons et erreurs signalés).
10. **Voir le devis se recalculer** – Retour au dossier, onglet *Devis* : les montants sont mis à jour instantanément.
11. **Exporter le PDF** – *Générer le devis PDF* (option « Utiliser cette vue pour le devis » dans l'onglet 3D). Le devis est ajouté à l'historique avec la copie des prix appliqués.

---

## 4. Fonctionnalités

### Créer mon plan en quelques questions (`src/generator/`)
Méthode recommandée sur la page d'accueil (« Créer un plan avec le questionnaire »), à côté de « Dessiner mon logement en 2D » et « Importer un plan ou une photo ».
1. **Choix du logement** : 16 modèles (studio, T2 à T4, couloir central, cuisine ouverte, plain-pied, à étage, garage attenant ou séparé, plusieurs chambres à l'étage, maison en L, rectangulaire, avec extension, logement personnalisé), chacun avec vignette 2D, miniature 3D et aperçu (plans de tous les niveaux + maquette 3D interactive).
2. **Questionnaire adaptatif** (11 questions, dont le nombre de pièces principales, + commentaire libre) avec **aperçu en direct** : les questions s'adaptent (pas de garage pour un appartement, « duplex » au lieu de 3 niveaux, pas de couloir pour un studio, escalier ajouté d'office au-delà d'un niveau, garage communicant seulement si attenant). Les réponses sont conservées dans le dossier.
3. **Génération déterministe** (aucun aléatoire) : pièces rangées en bandes (jour / couloir / nuit) ou en L, largeurs minimales par type de pièce, surface visée respectée autant que possible, escalier aligné entre les niveaux, garage, véranda, extension, portes intérieures et passages ouverts, porte d'entrée, accès, fenêtres et baies répartis sur les murs extérieurs. Contrôles automatiques : chevauchements, pièces sans accès, surface, ouvertures non placées ; si le plan n'est pas cohérent, le modèle le plus proche est proposé avec demande de correction.
4. **Maquette 3D** générée depuis la géométrie (murs découpés, menuiseries, escaliers en volume, trémie à l'étage), même système de coordonnées que le plan et les équipements.
5. **Vérification des pièces et des menuiseries** (onglet « Pièces & menuiseries », ouvert juste après la génération), puis **vérification du plan** : bandeau « Votre plan a été généré à partir de vos réponses… », bouton « Valider le plan ». Tant qu'il n'est pas validé, l'audit et le PDF le signalent comme **plan générique non vérifié**.
6. **Provenance visible** sur le plan : Q = issu du questionnaire, G = généré automatiquement, C = corrigé par le conseiller ; les équipements suggérés restent des recommandations à valider.
7. **Régénération** après modification des réponses : choix explicite entre « Conserver mes modifications » (ajouts, modifications et suppressions réappliqués) et « Repartir du modèle » ; jamais d'écrasement silencieux, et annulation possible (Ctrl+Z).

### Pièces et menuiseries (`src/plan/joinery.ts`, onglet « Pièces & menuiseries »)
Les trois modes de création (questionnaire, dessin, import) alimentent le même modèle : chaque ouverture n'est enregistrée **qu'une seule fois** et le tableau, le plan 2D, la 3D, l'audit, le devis et le PDF en sont des vues.
- **Tableau par niveau** : nom, type, surface, portes extérieures, portes intérieures, fenêtres, baies vitrées, autres ouvertures extérieures, total des portes, détecteurs indicatifs, commentaire ; ajout, suppression (avec ses ouvertures), renommage, changement de type, duplication d'une pièce ; copie de la configuration d'un étage vers un autre ; totaux par niveau et généraux. Les quantités n'acceptent que des **entiers positifs ou nuls** (champ signalé en rouge sinon, valeur précédente conservée).
- **Deux modes de saisie** : quantités rapides (chaque quantité crée des ouvertures **« à positionner »**, rattachées à la pièce, sans position) ou **détail** par ouverture (identifiant, type, intérieur/extérieur, porte sectionnelle, largeur/hauteur facultatives, position, statut d'audit, détecteurs, commentaire, suppression). Diminuer une quantité retire d'abord les ouvertures non positionnées.
- **Positionnement** : bouton « Positionner » puis clic sur un mur de la pièce dans le plan 2D. Une ouverture non positionnée apparaît en **repère pointillé orange** dans sa pièce (2D) et en **repère translucide** (3D) ; elle est déjà comptée dans l'audit et signalée « à positionner » ; le plan ne peut pas être validé tant qu'il en reste. Une ouverture déplacée à la main ou positionnée a une position **confirmée**.
- **Détecteurs indicatifs** (règles configurables) : 1 par ouverture extérieure, 2 par baie vitrée, aucun automatique sur porte de garage sectionnelle, ouvertures intérieures exclues ; explication par pièce, par ex. « Séjour : 2 fenêtres × 1 détecteur + 1 baie vitrée × 2 détecteurs = 4 détecteurs indicatifs. ». Un changement de type ou une suppression met à jour les détecteurs **suggérés non validés** liés à l'ouverture (jamais les équipements manuels ou validés) : pas de double comptage. Les devis déjà émis ne changent pas.
- Synthèse dans l'onglet **Audit** et tableau « Menuiseries par pièce » dans le **PDF**.

### Mobilier et menuiseries génériques 2D/3D (`src/furniture/`)
Chaque logement généré (questionnaire ou modèle) est **meublé automatiquement** ; le mobilier sert à visualiser l'aménagement, **sans effet sur l'audit** ni sur la couverture des détecteurs.
- **Bibliothèque** (`models.ts`) : ~35 modèles génériques (canapé, table basse, meuble TV, téléviseur, tables à manger, meubles bas / hauts, évier, plaque et four, réfrigérateur, lit avec variantes 160 / 140 / 90, chevets, armoire / dressing, commode, bureau, vasque, miroir, douche, baignoire, WC, lave-mains, meuble à chaussures, porte-manteau, console, voiture, étagères, établi, lave-linge, sèche-linge, plante, salon de véranda…). Chaque modèle est décrit **une seule fois** par des volumes simples (dimensions, ancrage, orientation, couleur, variantes) : le **symbole 2D** (vue de dessus) et la **géométrie 3D** procédurale en sont dérivés, avec les mêmes dimensions et la même position.
- **Placement automatique déterministe** (`placement.ts`) : recette par type de pièce (séjour : meuble TV face au canapé, table basse entre les deux, fauteuil, espace repas ; cuisine : linéaire réfrigérateur / évier / cuisson / meubles bas et hauts, table si la cuisine est fermée ; chambre : lit adapté à la pièce et orienté, chevets, armoire, bureau / commode si la surface le permet ; salle de bain : **douche + baignoire** seulement si la surface et les dimensions le permettent, sinon douche ; WC ; entrée ; couloir dégagé ; garage avec voiture face à la porte, étagères, établi ; buanderie ; bureau ; véranda). Contrôles : objets dans les murs, sans chevauchement, débattement des portes et passages préservé, rien de haut devant les fenêtres. Une pièce trop petite reçoit une variante plus petite ou moins d'objets ; ses dimensions ne sont jamais modifiées. Pièce sans modèle (ex. extension « autre ») : laissée vide avec une invitation à choisir son mobilier.
- **Menuiseries** (`joineryModels.ts`) : porte intérieure, porte d'entrée, porte extérieure, porte-fenêtre, fenêtre simple / double, baie coulissante, porte de garage, autre ouverture, passage. Symbole architectural en 2D (battant et sens d'ouverture, vantaux, coulissants) et, en 3D, menuiserie **intégrée dans le mur** (cadre, vitrage, meneau, ouvrant, poignée, appui). Une menuiserie reste une ouverture unique rattachée à sa pièce : l'audit, les quantités et le devis restent synchronisés.
- **Édition** : sélectionner, glisser (2D), pivoter (R), dupliquer (Ctrl+D), supprimer, changer de variante, de dimensions (si autorisé), de couleur ; ajouter un objet depuis la bibliothèque (recherche, miniatures, ajout dans la pièce sélectionnée ou par clic) ; **réinitialiser le mobilier d'une pièce** sans toucher aux autres ; aménager les pièces vides d'un plan dessiné ou importé ; **verrouiller la structure** pendant l'aménagement. En 3D, un clic sélectionne l'objet et « Déplacer au clic » le repositionne.
- **Modes d'affichage** : plan architectural, plan meublé, 3D meublée, 3D + équipements de sécurité, 3D sans mobilier (sans perte des modifications). Le PDF reprend le plan meublé avec un mobilier atténué pour que les équipements restent lisibles.

### Plan 2D
- Pièces rectangulaires typées (séjour, cuisine, chambre, couloir, entrée, garage, salle de bain…), pièce ouverte (cuisine ouverte).
- Murs / cloisons libres déplaçables (poignées d'extrémité), épaisseur réglable.
- Portes, portes intérieures, fenêtres, baies vitrées, portes de garage (sectionnelles ou non), indicateur « donne sur l'extérieur » déduit de la géométrie et modifiable, identifiant unique par ouverture.
- Plusieurs niveaux (ajout, suppression, reprise de l'emprise du niveau inférieur).
- Grille magnétique (5 cm à 1 m), alignement magnétique sur les autres pièces avec guides, déplacement au clavier (flèches).
- Cotes de la pièce sélectionnée, surfaces, échelle graphique, coordonnées du curseur, zoom molette, déplacement de la vue.
- Annuler / rétablir (80 étapes), enregistrement automatique + bouton *Enregistrer*.

### Import d'un plan ou d'une photo
- PNG, JPG/JPEG (photo, capture d'écran) et **PDF** (première page rendue avec pdf.js).
- Fond de référence : déplacement, taille, transparence, rotation, verrouillage, masquage.
- **Échelle par dimension connue** (deux clics + valeur réelle).
- **Aucune reconnaissance automatique** : le conseiller trace la géométrie ; la 3D et le devis n'utilisent jamais l'image.

### Visualisation 3D (Three.js / React Three Fiber)
- Sols colorés par type de pièce, murs avec découpes aux ouvertures, menuiseries (verre, portes, porte de garage), liseré sur les accès extérieurs, dalles, niveaux empilés ou côte à côte.
- Libellés des pièces, légende des équipements, équipements en volume avec repère au sol.
- Vues isométrique, de dessus, de face ; rotation, zoom, déplacement ; niveau seul ; murs complets / coupés / masqués ; masquage d'un mur au clic.
- Sélection d'un équipement, placement et déplacement au clic : même source de données que le plan 2D (synchronisation immédiate dans les deux sens).
- Secteurs de détection orange **explicitement indiqués comme simulations indicatives**, découpés aux limites de la pièce.

### Équipements
- Bibliothèque issue du catalogue (produits actifs), placement 2D ou 3D, déplacement, suppression, orientation, quantité, changement de référence, caractéristiques.
- Distinction visuelle : cercle plein = placé par le conseiller ou suggestion validée ; cercle pointillé / translucide = suggestion du moteur de règles non validée.
- Tableau récapitulatif par niveau et total par équipement.

### Moteur d'audit (`src/rules/`)
Indépendant de l'interface (fonction pure `runAudit`) et paramétrable dans *Catalogue & règles → Règles d'audit*. Règles implémentées (hypothèses à valider) :
- 1 centrale par logement/adresse ; 1 clavier, jusqu'à 4 si plusieurs points d'entrée (point à vérifier) ;
- mouvement : séjour (avec étude de la cuisine ouverte selon la diagonale vs portée 10 m), entrée, couloirs ≥ 4 m, garage à étudier, minimum 1 par étage ; caractéristiques 110° / 10 m utilisées comme **référence** seulement ;
- fumée : estimation par niveau à 50 m² indicatifs, toujours en « point à vérifier » (pas de règle « un seul détecteur au dernier étage ») ;
- choc / ouverture : 1 par menuiserie extérieure, 2 pour une baie, jamais automatique sur porte sectionnelle ;
- modes volumétrique et périmétrique comparés (nombre, prix, différences, limites animaux / usage de nuit sans garantie) ;
- contrôles : informations manquantes, échelle non définie, pièces qui se chevauchent, ouvertures en doublon, incohérence « extérieure », écart entre placement et proposition, surface plan vs déclarée.
- Statuts : *Information manquante*, *Point à vérifier*, *Suggestion automatique*, *Validé par le conseiller* (avec justification), chacun avec motif et action recommandée.

### Catalogue, tarifs et import Excel (`src/catalog/`)
- Produits (référence, nom, catégorie, description, prix matériel, supplément mensuel, facturation, quantité de lot, statut, compatibilité, commentaires), édition en ligne, activation / désactivation, ajout.
- Packs modifiables (prix forfaitaire et composition), remises configurables, paramètres (TVA, base HT/TTC, frais d'installation, validité, conditions commerciales, regroupement en lot).
- Import `.xlsx` / `.csv` : correspondance automatique et manuelle des colonnes, aperçu, validation des prix (formats français, négatifs, invalides), doublons (dans le fichier et avec le catalogue), champs et colonnes obligatoires manquants, différences ligne à ligne, annulation, **confirmation explicite** ; les produits existants ne sont modifiés que si la case est cochée et les produits absents du fichier ne sont jamais supprimés. La version précédente est archivée et restaurable (*Historique*).
- Modèle Excel téléchargeable (avec feuille d'aide) et export `.xlsx` / `.csv`.

### Calculateur et comparateur (`src/quote/`)
- Le prix d'un pack est un **forfait** ; les équipements inclus ne sont **jamais facturés deux fois** ; seuls les suppléments sont ajoutés à leur prix unitaire.
- Distinction : forfait, suppléments, frais d'installation (« à confirmer » si non renseignés), remises, coût initial, coût mensuel, TVA (uniquement si renseignée), éléments inclus non positionnés.
- Prix inconnu : « à confirmer », **exclu des totaux et signalé** – jamais de prix inventé.
- **Centrale : supplément mensuel toujours à 0 €** (règle métier validée) – verrouillé dans le catalogue et le devis ; un import Excel indiquant une autre valeur affiche une alerte, exige une confirmation et conserve 0 €.
- **Prix modifiables dans le devis** (prix matériel, supplément mensuel, prix du forfait) sans changer le catalogue ; « Prix du catalogue » pour revenir à la valeur d'origine.
- **Montants finaux modifiables** : frais initiaux et mensualité du devis saisissables à la main, avec un motif ; l'écart avec le calcul apparaît comme « ajustement » dans le récapitulatif et le PDF.
- **Déménagement** : équipements repris du logement précédent (case par ligne, quantité réglable) et abonnement transféré : **frais matériels à 0 €, mensualité conservée** ; bouton « Tout passer en déménagement ». Repris dans le PDF et l'historique.
- Regroupement automatique en pack périmétrique lorsque c'est moins cher (sans augmenter le mensuel).
- Calculs en centimes (aucune erreur d'arrondi), ajustements de quantités, recalcul instantané.
- Comparateur : configuration retenue (plan), standard (volumétrique), alternative (périmétrique) × Pack Essentiel, Pack Sérénité, sans forfait. Les variantes ne figurent **pas** sur le devis PDF, sauf celles cochées « Afficher sur le devis » (section « Variantes proposées », à côté de l'offre retenue).

### Devis PDF (`src/export/`)
Référence, date, validité, dossier, descriptif du logement, plans 2D de chaque niveau, vue 3D, liste des équipements (quantités, inclus, suppléments, prix unitaires connus), détail du pack, récapitulatif initial / mensuel, remises, TVA, ouvertures extérieures, comparaison des propositions, réserves (informations manquantes, points à vérifier, prix à confirmer), conditions commerciales et mentions « non contractuel ». Le PDF est conservé localement et peut être retéléchargé ; la copie des prix appliqués est stockée avec le devis.

### Tableau de bord
Création d'un audit, liste des dossiers, recherche par référence ou client, filtre par statut, dernière modification, statut modifiable (Brouillon, Audit en cours, Audit à vérifier, Devis généré, Proposition validée (démo), Dossier clôturé), montants initial et mensuel estimés, accès direct au plan et au devis, duplication, suppression.

---

## 5. Architecture technique

React 19 · TypeScript · Vite · Tailwind CSS 4 · Three.js / React Three Fiber / drei · Zustand · Zod · ExcelJS · jsPDF + AutoTable · pdf.js · Vitest + Testing Library · Playwright.

```
src/
  domain/        modèle de données (types.ts), schémas Zod, libellés
  furniture/     mobilier et menuiseries génériques : modèles, placement automatique, rendus 2D/3D, actions
  plan/          menuiseries par pièce (joinery.ts), géométrie (murs, ouvertures, alignement, doublons), actions d'édition, rendu SVG partagé, import d'image/PDF
  view3d/        scène 3D (génération depuis le plan), vue interactive, capture hors écran pour le PDF
  rules/         moteur de règles d'audit (pur) + application des propositions sur le plan
  catalog/       catalogue de démonstration, import/validation Excel-CSV (pur), lecture/écriture Excel
  quote/         calculateur (pur), comparateur, copie historique des prix
  export/        génération du PDF et des images du plan
  persistence/   stockage local (localStorage validé par Zod) et images (IndexedDB)
  state/         store applicatif (Zustand) : dossiers, historique annuler/rétablir, catalogue
  ui/            interface (tableau de bord, espace de travail, catalogue)
  demo/          données fictives préchargées
e2e/             tests de bout en bout Playwright
demo-assets/     plan et catalogue d'exemple (fictifs)
docs/            limites, validations métier et évolutions
```

Principes :
- **Une seule source de vérité** (le dossier : plan + équipements) ; 2D, 3D, audit et devis sont des vues calculées.
- Les modules métier (`plan/geometry`, `rules`, `quote/calculator`, `catalog/importer`) sont des fonctions pures testées indépendamment de l'interface.
- Unités : mètres et euros ; un prix `null` signifie « non communiqué / à confirmer ».

### Persistance
Les données sont enregistrées **uniquement dans le navigateur du poste** (localStorage pour les dossiers, le catalogue et les règles ; IndexedDB pour les images importées et les PDF générés), avec enregistrement automatique, validation au chargement et copie de sauvegarde des données illisibles. **Elles ne sont ni centralisées ni partagées entre conseillers.** L'interface `Repository` (`src/persistence/storage.ts`) permet de brancher une API serveur (base de données + authentification) sans modifier les modules métier – voir `docs/LIMITES_ET_VALIDATIONS.md`.

---

## 6. Tests

- **Unitaires / composants (Vitest)** : géométrie et dessin de plusieurs pièces, redimensionnement, ouvertures, murs, calibrage d'échelle, import d'image (formats refusés), synchronisation 2D/3D, moteur de règles, application des propositions, calculs initial/mensuel, packs, suppléments, lots, remises, TVA, arrondis, historique des prix, import Excel/CSV (validation des prix, doublons, champs manquants, non-écrasement), menuiseries par pièce (quantités nulles, saisies invalides, suppression, positionnement sans doublon, changement de type, duplication, copie d'étage, devis émis inchangé après modification, validation du plan, enregistrement/rechargement), nombre de pièces principales, store (création, annuler/rétablir, ajout/suppression d'équipement, recalcul après changement de tarif), persistance (enregistrement/rechargement, données corrompues, quota), génération PDF, tableau de bord (création de dossier, recherche).
- **Bout en bout (Playwright, Chromium)** : parcours complet *création → import d'un plan PNG → échelle → tracé → correction → ouvertures → annuler/rétablir → audit → 3D → équipements → comparaison → modification de tarif → recalcul → PDF → rechargement* ; **menuiseries** *maison à 2 niveaux depuis un modèle → nombre de chambres → saisie par pièce → ajout d'une fenêtre au séjour → totaux → positionnement 2D → 3D → détecteurs → changement de type → audit sans double comptage → devis → modification après devis → rechargement* ; questionnaire ; import Excel ; scénario de démonstration avec import PDF, 3D par niveau et PDF.

Les limites connues et les validations métier restantes sont détaillées dans **[docs/LIMITES_ET_VALIDATIONS.md](docs/LIMITES_ET_VALIDATIONS.md)**.
