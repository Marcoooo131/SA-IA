# PHONE CALL AI — vidéo motion design (30 s)

Publicité verticale de 30 secondes (1080 × 1920, 60 i/s, H.264 + AAC stéréo) présentant l'agent IA
Phone Call : le conseiller lance l'écoute, la conversation est transcrite en direct, et la note
« Phone Call » est générée à la fin de l'appel.

> Toutes les données affichées (conversation, note MOVERS) sont **fictives**. La vidéo montre une
> démonstration du résultat généré : elle ne prétend pas qu'une note est enregistrée dans un CRM réel.

## Livrables

| Fichier | Contenu |
|---|---|
| `deliverables/phone-call-ai.mp4` | la vidéo finale |
| `deliverables/contact_sheet.jpg` | planche de contact (2 images par scène, horodatées) |
| `deliverables/validation.md` | rapport de validation technique |
| `src/config.js` | **configuration centrale** : format, zone de sécurité, couleurs, polices, textes, conversation, note, **timeline** |
| `src/timeline.js` | interpolations, easings, aléatoire déterministe |
| `src/scene.js` | animation Canvas 2D image par image (scènes, caméra, flou de mouvement, bloom, grain, particules) |
| `src/audio.js` | bande-son originale synthétisée en Web Audio (OfflineAudioContext) |
| `index.html` | page de rendu (et prévisualisation avec son) |
| `scripts/render.mjs` | rendu Playwright déterministe → FFmpeg |
| `scripts/assemble.mjs` | normalisation loudness en 2 passes et assemblage FFmpeg |
| `scripts/verify.mjs` | contrôles automatiques + planche de contact |

## Principe : une seule timeline

Toutes les animations et tous les sons lisent leurs instants dans `src/config.js` (`SCENES`, `CUES`).
L'image à l'instant `t` est une fonction pure de `t` (aucun minuteur, aucun `Math.random`) :
Playwright demande l'image `n` au temps `n / 60` s, dans n'importe quel ordre (rendu parallèle),
et la bande-son est calculée par la même page à partir des mêmes instants. Image et son ne peuvent
pas se décaler.

## Prérequis

- Node.js 20+ ; Playwright 1.56 (`npm install` dans ce dossier, ou module global : variable
  `PLAYWRIGHT_MODULE=/chemin/vers/node_modules/playwright`) avec Chromium ;
- FFmpeg 6+ avec libx264 et les filtres `loudnorm` / `ebur128` ;
- police **Inter** et **Inter Display** installées sur la machine (rendu des textes).

## Commandes

```bash
npm run stills      # quelques images fixes avec la zone de sécurité TikTok → out/stills/
npm run draft       # brouillon rapide à 15 i/s → out/draft_15fps.mp4
npm run render      # rendu complet 60 i/s + son + normalisation + vérifications (≈ 8 min sur 4 cœurs)
npm run preview     # puis ouvrir http://localhost:8080/?preview  (lecture temps réel avec le son)
                    # http://localhost:8080/?t=12.5&safe        (image fixe + zone de sécurité)
```

Le rendu complet produit `out/phone-call-ai.mp4`, `out/contact_sheet.jpg` et `out/validation.md`.

## Modifier la vidéo

- **Textes** : `TEXT` dans `src/config.js`. Les mots entre `*astérisques*` sont en rouge, `\n` force
  un retour à la ligne. La taille s'adapte automatiquement à la largeur de la zone de sécurité.
- **Conversation fictive et note** : `CONVERSATION`, `GENERATED_FIELDS`, `NOTE`.
- **Couleurs et polices** : `COLORS`, `FONT`.
- **Rythme** : déplacer un instant dans `CUES` (clic sur « Démarrer », clic « Fin », impact final...)
  déplace à la fois l'animation et le son correspondant. Les bornes des scènes sont dans `SCENES`.
- **Durée** : `VIDEO.duration`, puis ajuster `SCENES` et `CUES` (la scène 7 doit finir à la durée).
- **Musique** : `src/audio.js` — tempo (`CUES.bpm`), accords (`chord`), instruments (`kick`, `bassNote`,
  `pad`, `impact`...). Le mixage est normalisé à -14 LUFS / -1 dBTP par `assemble.mjs`.
- **Zone de sécurité** : `SAFE` (texte essentiel entre x 70–930 et y 210–1450 : barre du haut,
  boutons à droite et légende en bas de TikTok évités).

## Effets

Transitions (coupe sèche, whip latéral avec flou de mouvement, zoom traversant), parallaxe des fonds
et des particules, bloom discret, grain filmique, léger dédoublement rouge/cyan à l'entrée des
titres, ondes audio, transformation de la transcription en particules qui forment les champs de la
note, tracé lumineux de la signature. Le flou de mouvement est calculé par moyenne de positions de
caméra intermédiaires quand la caméra se déplace vite.
