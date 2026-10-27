# Présentation équipe — Nouvelle organisation Movers

Présentation interactive destinée aux agents du service Movers : planning réception / sortant, rôles,
les cinq templates CRM et leurs champs, rotation des dossiers, règles de gestion de la charge, ce qui change
et ce qui arrivera plus tard. React + TypeScript (Vite), charte rouge et noir.

Un **PowerPoint modifiable** est fourni : [`public/Nouvelle-organisation-Movers.pptx`](public/Nouvelle-organisation-Movers.pptx)
(également téléchargeable depuis la barre d'outils de la présentation). Les notes de l'orateur y sont incluses.

## Lancer la présentation

```bash
cd movers-presentation
npm install
npm run dev       # http://localhost:5173
npm run build     # version statique dans dist/ (ouvrable depuis n'importe quel serveur ou sous-dossier)
```

En ligne : publiée avec le reste du dépôt sur GitHub Pages, à l'adresse `https://<compte>.github.io/SA-IA/presentation-movers/`.

## Pendant la réunion

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Diapositive suivante / précédente | → ↓ Espace Page suiv. / ← ↑ Page préc. | Boutons « Suivant » / « Précédent », balayage |
| Première / dernière diapositive | Début / Fin | — |
| Accès direct | 1 à 9 | Sommaire (vignettes) |
| Sommaire | G | Bouton grille ou compteur « 3 / 13 » |
| Plein écran | F | Bouton plein écran |
| Notes de l'orateur | N | Bouton notes |
| Raccourcis | ? | Bouton clavier |

- La toile est en 16:9 et s'adapte à l'écran (vidéoprojecteur) ; en plein écran, la barre d'outils s'efface
  quand la souris ne bouge plus.
- Chaque diapositive a son lien (`#/5`), pratique pour reprendre là où l'on s'est arrêté.
- Diapositive 4 : un clic sur un template ouvre sa fiche détaillée. Diapositive 9 : « Étape suivante » déroule
  le cycle de rotation. Diapositive 13 : les boutons ramènent sur n'importe quel sujet pour répondre aux questions.
- Sur téléphone, la présentation passe en mise en page verticale défilable.

## Modifier le contenu

Tout le texte (titres, champs des templates, règles, notes de l'orateur) est dans **`src/content.ts`**,
partagé par la version web et par le PowerPoint. Après une modification :

```bash
npm run pptx      # régénère public/Nouvelle-organisation-Movers.pptx
```

Le PowerPoint reste aussi modifiable directement dans PowerPoint (textes, formes et tableaux natifs).

Règle de rédaction suivie : aucun horaire, chiffre ou règle métier qui ne figure pas dans la note d'organisation.
Les horaires exacts et le jour de la répartition inversée (4 h / 3 h) sont renvoyés au planning de chacun ;
les exemples de tâches sont marqués « Exemple fictif ».

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/content.ts` | Contenu et notes de l'orateur (source unique) |
| `src/slides.tsx` | Mise en page des 13 diapositives |
| `src/App.tsx` | Navigation, plein écran, sommaire, notes, mise à l'échelle |
| `src/styles.css` | Charte graphique (#111111, #E30613, #FFFFFF, #242424, #F2F2F2) |
| `scripts/build-pptx.mjs` | Génération du PowerPoint (pptxgenjs) |
