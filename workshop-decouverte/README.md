# Workshop « L'art de la découverte client »

Atelier interactif pour l'équipe Movers : **poser des questions ouvertes pour mieux conserver**.
Conçu pour être animé par un responsable d'équipe en vidéoprojection, et consultable sur ordinateur, tablette et téléphone.

> « Celui qui pose les bonnes questions n'a pas besoin de forcer la vente. Il permet au client de trouver lui-même les raisons de rester. »

**En ligne :** `https://<compte>.github.io/SA-IA/workshop-decouverte/`

## Déroulé (≈ 55 min)

| # | Écran | Ce que fait l'équipe |
|---|-------|----------------------|
| 1 | Introduction | 3 principes, phrase d'accroche, déroulé de la séance |
| 2 | Ouverte ou fermée | Compare deux réponses client, découvre pourquoi, transforme 3 questions |
| 3 | Les 4 situations | Déménagement, prix, alarme inutilisée, utilité remise en cause : contexte → mauvaise approche → questions (une par une) → réponses client → opportunités → reformulation et leçon |
| 4 | Transforme ta question ! | 5 questions fermées à reformuler à l'oral, champ pour noter la proposition de l'équipe, révélation animée |
| 5 | Challenge final | 3 situations tirées au hasard parmi 8, score, correction expliquée, écran de résultats |
| 6 | Conclusion | Les 5 réflexes, phrase finale, bouton « Recommencer » |

## Animer la séance

| Commande | Effet |
|----------|-------|
| `→` / `←` (ou `Page suivante` / `Page précédente` d'une télécommande de présentation) | Étape suivante / précédente |
| `F` ou bouton ⛶ | Plein écran (mode présentation) |
| `H` ou bouton « Réponses masquées » | Affiche **toutes** les réponses d'un coup (mode révision) ou revient au mode atelier |
| `N` ou bouton « Notes » | Conseils d'animation de l'écran en cours (à garder masqués devant l'équipe si besoin) |
| `S` ou bouton « Voix » | Active ou coupe la voix du client (lecture automatique des réponses client) |
| `A` `B` `C` | Répondre au challenge final |
| Boutons « 30 s » / « 1 min » | Minuteur de réflexion flottant |
| `Échap` | Arrête le minuteur |

Conseils :
- Dans les situations, **demandez toujours les questions de l'équipe avant de révéler celles du support**.
- Faites jouer le client par un agent à partir des « réponses client » révélées.
- Au challenge, faites voter à main levée avant de cliquer.

Chaque étape a sa propre adresse (`#introduction`, `#situations`, `#challenge`…), ce qui permet de reprendre directement à un écran.

## Voix du client

Quand on clique sur « Écouter la réponse du client » (écran 2) ou « Réponse du client » (mises en situation), la réponse est
**lue à voix haute** par la synthèse vocale française du navigateur (aucun fichier audio, rien n'est envoyé).
Le petit haut-parleur dans chaque bulle client permet de la réécouter, y compris au challenge final.
La voix dépend de l'appareil : Chrome et Edge proposent les voix les plus naturelles. Branchez le PC sur les enceintes de la salle.

## Données conservées

Aucun compte, aucun serveur. Seuls sont enregistrés **dans le navigateur de l'appareil** (`localStorage`) :
le meilleur score, le dernier score et le nombre de parties du challenge, les propositions notées dans l'exercice 4 et le réglage de la voix.
Si le stockage est bloqué (navigation privée), le workshop fonctionne normalement sans mémoriser.

## Modifier le contenu

Tout le texte pédagogique est dans **`js/data.js`** : situations, questions, réponses client, opportunités, exercice, quiz, réflexes et notes d'animation.
Il suffit de modifier ce fichier et de pousser sur `main` : aucune compilation.

Pour le quiz, chaque entrée a une proposition `correct: true` ; les autres portent une explication `why` affichée si elle est choisie.
Les propositions sont mélangées à chaque partie : n'écrivez pas « la réponse B » dans les explications.

## Structure

```
workshop-decouverte/
├── index.html        squelette de la page (en-tête, navigation, minuteur)
├── css/styles.css    identité visuelle, animations, responsive
├── js/icons.js       icônes au trait intégrées
├── js/data.js        contenu pédagogique
└── js/app.js         navigation, révélations, exercice, quiz, plein écran
```

## Tester en local

```bash
cd workshop-decouverte
python3 -m http.server 8000     # puis ouvrir http://localhost:8000
```

Ouvrir directement `index.html` dans le navigateur fonctionne aussi.

## Déploiement GitHub Pages

Le workflow existant [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) copie ce dossier dans
`dist/workshop-decouverte/` et publie le site à chaque push sur `main` (ou manuellement via *Actions → Déploiement GitHub Pages → Run workflow*).

Prérequis (une seule fois) : *Settings → Pages → Source* = **GitHub Actions**.

> Outil de formation interne non officiel. Les situations et réponses client sont des exemples pédagogiques fictifs.
