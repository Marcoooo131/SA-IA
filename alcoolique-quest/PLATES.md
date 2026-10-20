# Plans en « images de fond animées »

Pour obtenir le rendu des images de référence (matte painting photoréaliste, brume, lumière dorée),
chaque plan peut être remplacé par **une image fixe animée en 2,5D**. Les plans sans image gardent la scène 3D
temps réel : on peut donc remplacer les plans un par un.

Ce que le moteur fait sur l'image (`src/plates/plateScene.ts`) :

- cadrage « cover » (l'image remplit l'écran 16:9 quel que soit son format, mobile compris) ;
- mouvement de caméra : zoom, travelling, rotation, interpolés sur la durée du plan ;
- parallaxe : les zones proches glissent plus que les lointaines (profondeur estimée, ou carte de profondeur fournie) ;
- brume qui dérive, rayons de soleil, ombres de nuages, ondulation et scintillement de l'eau ;
- particules (poussière, braises, cendres, neige, plumes) ;
- aigle 3D composé devant l'image (position, taille et cap au début et à la fin du plan) ;
- étalonnage et fondus par plan ; pas de tone mapping filmique sur ces plans (l'image est déjà étalonnée).

Le son et la musique restent calés sur la timeline (`src/core/timeline.ts`) : une image remplace un plan
exactement sur ses bornes.

## Images intégrées

La planche de 30 vignettes fournie a été découpée (`public/plates/01.jpg` … `25.jpg`, agrandies en 1600 px
avec un léger renforcement) et les vignettes 1 à 25 couvrent toute la cinématique jusqu'au titre :

| Vignette | Plans | Temps |
|---|---|---|
| 1 Regard de l'aigle | 1a | 0–5,2 s |
| 2 Envol | 1b–1d | 5,2–11 s |
| 3 Au-dessus de la mer | 1e–2a | 11–18 s |
| 4 Dans les nuages | 2b–2c | 18–24 s |
| 5 Montagnes | 2d | 24–30 s |
| 6–9 Plaine (vue d'ensemble, nature, ruines, route) | 3a–3d | 30–42 s |
| 10–13 Village (vue, marché, forgeron, vie quotidienne) | 4a–4c | 42–54 s, 3 s chacune |
| 14–15 Cité (approche, survol) | 4d | 54–60 s |
| 16–21 Mage, épéiste, invocateur, berserker, rôdeur, monstre | 5a–5f | 60–82 s |
| 22 Apparition de la prêtresse (plan large puis serré) | 6a–6b | 82–91,5 s |
| 23 La bouteille d'eau | 6c | 91,5–94,5 s |
| 24 Le discours (deux cadrages) | 6d–6f | 94,5–104,2 s |
| 25 La malédiction | 6g | 104,2–108 s |

Gardés tels quels : le titre (26–27) reste le logo 3D animé et net, l'écran noir (28) et les boutons (29)
sont déjà en HTML ; l'écran d'accueil (30) n'est pas utilisé (le logo 3D sert de fond). Les scènes 3D
entièrement remplacées ne sont plus construites au chargement ; si une image manque, la 3D revient pour ce plan.

**Limite** : les vignettes de la planche ne font qu'environ 300 × 160 px. Elles sont correctes en plan large mais
floues en gros plan et en plein écran. Pour un rendu net, remplacer chaque `NN.jpg` par l'image d'origine en
pleine résolution (1920×1080 ou plus), même cadrage, même nom : rien d'autre à modifier.

## Mise en place

1. Déposer les images dans `public/plates/` (JPG ou WebP, 1920×1080 minimum ; 2560×1440 ou plus large si le plan
   a un travelling, car le zoom recadre l'image).
2. Copier `public/plates/manifest.example.json` en `public/plates/manifest.json` et l'adapter.
3. `npm run dev` : les plans décrits remplacent la 3D. Sans `manifest.json`, la cinématique reste 100 % 3D.

Vérification sans écran : `Q=low node scripts/capture.mjs 27 101` écrit `shots/t000027.png`, etc.

## Champs du manifeste

| Champ | Rôle |
|---|---|
| `shot` | identifiant du plan (`2d`, `6f`…), ou `start`/`end` en secondes |
| `image` | chemin depuis `public/` |
| `crop` | `[x, y, largeur, hauteur]` en fractions de l'image, pour retirer des bandes noires |
| `depth` | carte de profondeur facultative (blanc = proche), même cadrage que l'image |
| `from`, `to` | `{ zoom, x, y, rot }` au début et à la fin ; `y` positif descend dans l'image |
| `easing` | `inOut` (défaut), `out`, `linear` |
| `parallax` | amplitude `[x, y]` en fraction d'image (ex. `[0.03, 0.008]`) |
| `mist` | `{ amount, height, color, speed }` ; `height` = ligne (0 haut, 1 bas) où la brume commence |
| `rays` | `{ x, y, strength, color }` : position du soleil dans l'image (0..1) |
| `water` | `{ y, strength }` : l'eau se trouve sous la ligne `y` |
| `cloudShadows` | intensité des ombres de nuages (0..0,5) |
| `particles` | `dust`, `embers`, `ash`, `snow`, `feathers`, `none` |
| `eagle` | `{ from: [x, y, taille], to: [...], heading, bank, flap }` ; x, y en -1..1 à l'écran |
| `grade` | réglages de post-traitement (`saturation`, `contrast`, `bloomStrength`…) |
| `fadeIn`, `fadeOut` | fondus au noir en secondes |

## Pour remplacer ou régénérer une image

Style commun : fantasy médiévale photoréaliste type matte painting / rendu Unreal Engine 5, lumière naturelle
dorée, brume atmosphérique, couleurs riches mais naturelles, 16:9, **sans texte, sans logo, sans filigrane,
sans personnage au premier plan** (l'aigle est ajouté en 3D), sauf mention contraire.

Les plans d'action (combats 5a–5f, aigle en gros plan 1a–1e, titre 7a) gardent la 3D : leurs animations ne
peuvent pas venir d'une image fixe. Plans conseillés :

| Plan | Durée | Image | Proposition de prompt |
|---|---|---|---|
| 2a | 6 s | côte, falaises, navires | *aerial view low over ocean waves toward towering sea cliffs, medieval sailing ships, golden morning light, sea spray, epic fantasy matte painting, photorealistic* |
| 2c | 3 s | mer de nuages | *above a sea of clouds, god rays piercing through, distant mountain peaks, sunrise, photorealistic fantasy* |
| 2d | 6 s | chaîne de montagnes et côte | *aerial vista of a fantasy kingdom, green valleys, castle on a hill, coastal town, snowy mountain range, haze, sun on the right* (comme la 1re référence) |
| 3a | 2,6 s | plaine verdoyante | *lush green rolling plain, tall grass and wildflowers, scattered oaks, stone walls, distant hamlet, soft summer light* |
| 3d | 4 s | route de pierre vers la cité | *ancient stone road across green meadows leading to a distant walled medieval city, mountains behind, golden hour* |
| 4a | 4 s | remparts de la cité | *colossal medieval city walls with giant hero statues at the gate, banners, low angle, morning mist* |
| 4b | 4 s | rues et marché | *bustling medieval market street seen from above, timber-framed houses, stalls, smoke from forges, warm light* |
| 4d | 6 s | grande place | *grand cobblestone plaza of a medieval capital, fountain, tall tower, crowds, golden afternoon light* |
| 6a | 6 s | nef abandonnée | *abandoned gothic cathedral nave, broken stained glass, light shafts through dust, fog on the floor, cold palette* |
| 6b, 6f, 6g | 3,5–5 s | prêtresse aux ailes noires | *dark-winged priestess with long auburn hair, black gothic dress, in a ruined cathedral, holding a plain bottle of water like a relic, cinematic portrait* (comme la 2e référence) |

Une carte de profondeur (`depth`) améliore nettement la parallaxe ; elle peut être générée à partir de l'image
avec un outil d'estimation de profondeur (Depth Anything, MiDaS…), en niveaux de gris, blanc = proche.

## Droits

N'utiliser que des images dont vous avez les droits : générées par vous (en respectant les conditions de l'outil
utilisé), sous licence compatible, ou créées par un artiste qui vous les cède. Les captures de jeux, les images
trouvées en ligne ou portant un filigrane ne doivent pas être publiées avec le projet.
