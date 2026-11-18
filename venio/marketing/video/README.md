# Publicité Venio (80 s) — sources

La vidéo est **calculée** : aucune image générée par IA, aucun faux écran. Toutes les interfaces sont des
captures du vrai produit, prises dans un espace de démonstration (données fictives).

| Fichier | Rôle |
|---|---|
| `caps.cjs` | Joue le vrai parcours dans l'application lancée en local (4 appels manqués simulés, 3 réservations) et capture chaque étape, plus 5 parcours métier |
| `stage.html` | La mise en scène : 7 scènes pilotées par `render(t)`, mêmes polices et couleurs que le produit ; `#v` = format vertical |
| `render.cjs`, `renderall.sh` | Rendu image par image (Chromium) en 4 processus, encodage H.264 |
| `music.py` | Musique et design sonore synthétisés (100 BPM), calés sur les événements de `stage.html` |
| `script-voix-off.md`, `sous-titres.srt` | Texte de la voix off minuté, sous-titres |

## Refaire la vidéo

1. Lancer l'API (avec `VENIO_PUBLIC_BASE_URL=https://venio-rdv.netlify.app`) et l'interface sur le port 3100.
2. `node caps.cjs $PWD/caps` puis générer `data.js` (icônes, texte du SMS, positions des taps) — voir l'historique.
3. Copier les polices de `web/node_modules/@fontsource*` dans `fonts/`, servir le dossier sur le port 4500.
4. `node render.cjs h 1 30 0 0 $PWD/events` (événements sonores), `python music.py events.json music.wav`.
5. `./renderall.sh h 2 30 master-h-4k.mp4` et `./renderall.sh v 2 30 master-v-2x.mp4`, puis assemblage avec ffmpeg.
