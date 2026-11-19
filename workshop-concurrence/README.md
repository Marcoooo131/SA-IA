# Workshop « Sector Alarm face à la concurrence »

Atelier interactif pour l'équipe Movers (20 à 30 min) : comprendre les offres concurrentes, comparer ce qui est réellement inclus, et défendre la valeur de Sector Alarm face à une objection prix.

**En ligne :** `https://<compte>.github.io/SA-IA/workshop-concurrence/`

## Déroulé

| # | Slide | Durée |
|---|-------|-------|
| 1 | Sector Alarm vs la concurrence : accroche, acteurs, question d'ouverture (3 critères à noter) | ≈ 4 min |
| 2 | Comparatif : 5 acteurs × 16 prestations (vert inclus, orange option/conditions, rouge non inclus, gris info non disponible) | ≈ 6 min |
| 3 | Positionnement : une fiche par concurrent | ≈ 5 min |
| 4 | Ne pas vendre un prix, défendre une valeur : Accueillir → Comparer → Valoriser | ≈ 5 min |
| 5 | À vous de jouer : 4 jeux de rôle en binôme (2 min + 1 min de débrief) | ≈ 8 min |
| 6 | Débrief : 4 règles, question finale, phrase de conclusion | ≈ 3 min |

## Commandes

| Touche | Effet |
|--------|-------|
| `→` / espace / télécommande | Révèle l'élément suivant, puis passe à la slide suivante |
| `←` | Slide précédente |
| `F` | Plein écran |
| `C` | Affiche ou masque toutes les corrections |
| `N` | Notes de l'animateur |
| `P` | Version imprimable / PDF (toutes les corrections visibles, une page par situation) |
| `1` à `4` (slide 5) | Choisir la situation |

Boutons « 1 min » / « 2 min » : minuteur pour les jeux de rôle. Bouton « Sources » : captures concurrentes et pages officielles Sector Alarm.

## Sources et mise à jour

- Concurrents : les 4 captures de `assets/`.
- Sector Alarm : site officiel sectoralarm.fr, consulté le 19/11/2026.
- Les cases grises « Non précisé » signifient « information non disponible », pas « non inclus ».

Tout le contenu est dans **`js/data.js`**. Pour compléter une case Sector Alarm validée en interne, remplacer `['na', 'Non précisé']` par `['ok', 'Inclus']` (ou `opt` / `no`), puis pousser sur `main`.

## Structure

```
workshop-concurrence/
├── index.html
├── css/styles.css
├── js/data.js      contenu
├── js/app.js       navigation, révélations, minuteur, impression
└── assets/         captures sources
```

Les icônes viennent de `workshop-commun/js/icons.js`.

> Outil de formation interne. Les répliques client et réponses sont des exemples pédagogiques.
