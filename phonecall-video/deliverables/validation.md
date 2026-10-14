# Validation technique — PHONE CALL AI (vidéo 30 s)

Fichier : `out/phone-call-ai.mp4` — 64.1 Mo, 17091 kb/s

| Contrôle | Résultat | Détail |
|---|---|---|
| Durée | OK | 30.000 s (attendu 30 s) |
| Résolution | OK | 1080×1920 |
| Codec vidéo | OK | h264 High yuv420p, bt709 |
| Fréquence | OK | 60/1 (moyenne 60/1) |
| Nombre d'images | OK | 1800 (attendu 1800) |
| Images régulières (pas de saut) | OK | 0 écart(s) irrégulier(s) sur 1799 |
| Audio | OK | aac 2 canaux 48000 Hz 263 kb/s |
| Synchronisation A/V | OK | départs vidéo 0.000 s / audio 0.000 s, durée audio 30.000 s |
| Loudness intégré | OK | -14.1 LUFS (cible -14) |
| True peak | OK | -3.8 dBTP (max -1) |
| Pas d'écran noir accidentel | OK | noirs détectés : 4.00–4.18 s (voulus : ouverture, coupure à 4 s, fond noir de la signature avant le logo) |
| Dernières images | OK | luminance max 255 (texte et logo visibles) |
| Planche de contact | OK | out/contact_sheet.jpg (14 images clés) |

Loudness : intégré -14.1 LUFS, LRA 2.4 LU, true peak -3.8 dBTP (EBU R128, filtre ebur128 de FFmpeg).

Tous les contrôles automatiques sont passés.
## Contrôles complémentaires

| Contrôle | Résultat | Détail |
|---|---|---|
| Rendu déterministe | OK | images à 12,34 s et 21,5 s rendues deux fois dans deux sessions, dans un ordre différent : fichiers PNG identiques (md5) |
| Synchronisation sur la coupe à 4 s | OK | image noire 4,00–4,18 s ; audio coupé à 4,00 s (silence < -60 dB de 4,05 à 4,14 s après la queue de réverbération, puis souffle annonçant l'impulsion rouge de 4,18 s) |
| Zone de sécurité TikTok | OK (contrôle visuel) | images fixes rendues avec le cadre `SAFE` (x 70–930, y 210–1450) pour chaque scène : aucun texte ni élément essentiel en dehors |
| Planche de contact | OK (contrôle visuel) | 2 images par scène, lisibilité des textes vérifiée en réduction (format mobile) |

Rendu : 1800 images en ≈ 8 min (3 navigateurs Chromium, 4 cœurs), encodage H.264 High CRF 15, preset slow.
