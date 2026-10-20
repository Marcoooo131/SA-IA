# Alcoolique Quest : La Sobriété Perdue — cinématique d'introduction

Cinématique d'ouverture **en temps réel** (≈ 2 minutes, 16:9) d'un RPG dark fantasy humoristique :
un aigle s'éveille, traverse la mer, les nuages et les montagnes, survole une plaine dévastée puis une
cité gothique ; cinq héros combattent ; un Colosse se dresse ; la musique se tait… et dans une cathédrale
abandonnée, la Grande Prêtresse brandit la relique la plus puissante de l'univers : **une bouteille d'eau**.

Tout est calculé dans le navigateur (Three.js / WebGL / Web Audio). Les décors, personnages, la plupart
des textures, les effets, la musique et les bruitages sont générés par le code ; l'éclairage et le relief
des matériaux s'appuient sur des **ressources CC0 réellement intégrées** (HDRI Poly Haven, normal maps,
texture de nuage — voir « Ressources » et « Limites » plus bas).

---

## 1. Lancer

Prérequis : Node.js 20+ (testé avec Node 22) et un navigateur récent avec WebGL 2 (Chrome, Edge, Firefox, Safari 16+).

```bash
cd alcoolique-quest
npm install
npm run dev        # http://localhost:5173
npm run build      # vérification TypeScript + build statique dans dist/
npm run preview    # sert le build sur http://localhost:4173
```

Le dossier `dist/` est un site statique (chemins relatifs) : il peut être déposé tel quel sur n'importe quel
hébergement (GitHub Pages, Netlify, serveur Apache/Nginx…).

### Commandes pendant la cinématique

| Action | Souris / tactile | Clavier |
|---|---|---|
| Lancer | bouton « Lancer la cinématique » (nécessaire pour autoriser le son) | Entrée |
| Passer | bouton « Passer › », discret, **n'apparaît qu'après ~4,5 s** | Espace / Échap (après 4,5 s) |
| Plein écran | bouton ⛶ (apparaît au mouvement de la souris) | F |
| Couper le son | bouton ♪ | M |

À la fin : **REVOIR LA CINÉMATIQUE** ou **ENTRER DANS L'AVENTURE** (écran d'accueil provisoire du jeu, avec
le logo animé en fond). Aucun menu n'apparaît pendant la cinématique.

### Paramètres d'URL (vérification et réglages)

| Paramètre | Effet |
|---|---|
| `?quality=low` / `?quality=high` | force la qualité (par défaut : `low` sur mobile, `high` sur ordinateur) |
| `?t=95` | démarre la lecture à 95 s (utile pour revoir une scène) |
| `?debug=1` | affiche le temps, le plan courant et la résolution |
| `?still=62.6` | rend une image fixe à l'instant donné (captures automatiques) |
| `?hide=rays,clouds,…` | masque certains éléments (débogage de quelques scènes) |

---

## 2. Architecture

```
alcoolique-quest/
├── index.html              écrans : chargement, lancement, fin, accueil provisoire
├── viewer.html             visionneuse de modèles (développement, hors build)
├── src/
│   ├── main.ts             chargement, lecteur, horloge, interface, plein écran, modes de test
│   ├── style.css
│   ├── core/
│   │   ├── timeline.ts     ★ timeline maîtresse : scènes, plans, fondus, répliques, impacts
│   │   ├── director.ts     rendu WebGL + post-production + aiguillage des scènes
│   │   ├── camera.ts       caméra cinématographique (trajectoires, visée, focale, roulis, caméra portée, secousses)
│   │   └── math.ts         easing, aléatoire déterministe, bruit simplex / fbm / crêtes
│   ├── audio/
│   │   ├── engine.ts       synthèse Web Audio (orchestre, chœurs, percussions, bruitages), réverbérations, ordonnanceur
│   │   └── score.ts        partition + conception sonore calées sur la timeline
│   ├── scenes/             une scène 3D par séquence (voir storyboard)
│   ├── world/              modèles procéduraux (aigle, terrain, océan, ciel, cité, personnages, prêtresse, bouteille, logo…)
│   └── fx/                 particules GPU, cercles runiques, portails, traînées de lame, éclairs, rayons divins, brume
└── scripts/
    ├── capture.mjs         capture d'images clés (Chromium sans écran)
    ├── view.mjs            capture de la visionneuse de modèles
    └── ui-test.mjs         test de bout en bout de l'interface (ordinateur + mobile)
```

### Principes techniques

- **Horloge unique = horloge audio.** Le temps de la cinématique est lu sur `AudioContext.currentTime` :
  image et son restent synchronisés à l'échantillon près, même si le navigateur ralentit ou si l'onglet est
  mis en arrière-plan (le contexte audio est suspendu et la lecture reprend au même instant). Sans audio,
  l'horloge bascule sur `performance.now()`.
- **Timeline déclarative** (`core/timeline.ts`) : chaque plan a un identifiant, une scène et des bornes ;
  les scènes lisent `prog('5b', t)`/`inShot(...)` pour animer caméra et acteurs. Les impacts (`HITS`) servent
  à la fois aux images (étincelles, secousses, ralentis) et à la partition (percussions synchronisées).
- **Ralentis** : fenêtres de « temps simulé » (`timeScale`) qui ralentissent particules et chorégraphies,
  sans désynchroniser la musique.
- **Post-production** : bloom HDR, profondeur de champ (plans rapprochés), étalonnage dark fantasy
  (ombres bleu nuit / hautes lumières dorées), vignettage, grain, aberration chromatique, flashs, inversion
  de l'éclair noir, fondus au noir et coupes franches.
- **Personnages** : squelette hiérarchique à 19 articulations (`world/rig.ts`), poses clés interpolées
  par quaternions (`Clip`), couches additives (respiration, garde, regard), cycles de marche/course.
  L'aigle a son propre squelette (ailes à trois segments, plumes instanciées, paupières, serres).
- **Performances** : instanciation massive (herbes, maisons, foule, plumes, dalles), shaders compilés à
  l'avance, **résolution dynamique** (le ratio de pixels baisse si l'appareil passe sous ~33 images/s),
  qualité réduite automatiquement sur mobile (moins d'instances, pas de profondeur de champ ni de MSAA).
- **Responsive** : le rendu occupe toujours une boîte 16:9 centrée (bandes noires sinon) ; sur téléphone,
  passage en plein écran et verrouillage paysage tentés au lancement, invite à tourner l'appareil.

---

## 3. Storyboard / timeline

| Plan | Temps | Contenu | Caméra |
|---|---|---|---|
| **1 — Le réveil de l'aigle** | | | |
| 1a | 0 – 5,2 | Noir, vent ; l'œil de l'aigle s'ouvre (iris texturé, paupière), clignement | très gros plan, lente poussée, profondeur de champ |
| 1b | 5,2 – 7,4 | Serres agrippées au rocher, plumes au vent | travelling latéral rasant |
| 1c | 7,4 – 9,6 | Il déploie ses ailes en contre-jour de l'aube, cri | contre-plongée, silhouette |
| 1d | 9,6 – 11 | Il s'accroupit et saute dans le vide | derrière lui, **travelling arrière** révélant l'à-pic |
| 1e | 11 – 12 | Plongée vers la mer | **vue subjective** depuis ses yeux |
| **2 — La traversée du monde** | | | |
| 2a | 12 – 18 | Au ras des vagues d'un fjord, embruns, navires anciens | poursuite basse puis glissement sur son flanc |
| 2b | 18 – 21 | Remontée brutale le long des falaises | la caméra « s'arrache » derrière lui |
| 2c | 21 – 24 | Traversée des nuages, rayons de soleil | caméra embarquée, visibilité réduite |
| 2d | 24 – 30 | Mer de nuages, chaîne de montagnes enneigées, ruines sur les crêtes | grand mouvement circulaire jusqu'au plan d'ensemble |
| **3 — La plaine oubliée** | | | |
| 3a | 30 – 32,6 | Herbes ondulant sous le vent, contre-jour doré | macro au ras du sol, profondeur de champ |
| 3b | 32,6 – 35,2 | Arbre mort et menhir aux runes luminescentes | lente poussée |
| 3c | 35,2 – 38 | Squelette colossal, trébuchet et tour de siège effondrés | travelling latéral |
| 3d | 38 – 42 | Route de pierre vers la cité à l'horizon ; l'aigle traverse le cadre | plan large, panoramique |
| **4 — La grande cité** | | | |
| 4a | 42 – 46 | Statues colossales des héros (l'une porte un toast éternel), porte monumentale, passage du rempart | poursuite |
| 4b | 46 – 50 | Plongée dans l'avenue : étals, forges (braises), lanternes, foule | caméra basse et rapide |
| 4c | 50 – 54 | Autour de la grande tour centrale | arc en léger retard |
| 4d | 54 – 60 | La grande place : les cinq aventuriers se préparent, lèvent les yeux vers l'aigle | grue descendante, ralentissement |
| **5 — Les héros et les combats** | | | |
| 5a | 60 – 63,6 | **Le mage** : runes dans les airs, boule d'énergie, explosion (ralenti) | contre-plongée → par-dessus l'épaule → plan large |
| 5b | 63,6 – 67,2 | **L'épéiste** : parade (gerbe d'étincelles), esquive renversée (ralenti), contre circulaire avec traînée lumineuse | profil serré → plan bas → orbite |
| 5c | 67,2 – 71 | **L'invocateur** : cercle tracé au sol, fissures lumineuses, portail, la bête surgit, rugit, bondit | plongée → face → gros plan → caméra au sol |
| 5d | 71 – 74,6 | **Le berserker** : charge, la hache se brise sur un bouclier (il contemple le manche…), il empoigne un **maillet-tonneau** et pulvérise le mur de boucliers | travelling → profil → gros plan → contre-plongée |
| 5e | 74,6 – 78 | **Le rôdeur** tire en plein saut ; **la caméra suit la flèche au ralenti** jusqu'à l'impact | profil → caméra embarquée sur la flèche → impact |
| 5f | 78 – 82 | Le sol tremble ; **le Colosse** se dresse derrière eux ; les héros se retournent ; rugissement | face aux héros → contre-plongée derrière eux |
| **6 — Le grand méchant** | | | |
| 6a | 82 – 88 | La musique s'arrête net. Nef abandonnée, brume, rosace, trône | lente avancée |
| 6b | 88 – 91,5 | Les ailes noires se déploient, particules sombres | plan moyen bas |
| 6c | 91,5 – 94,5 | **La relique** : une bouteille d'eau sous un rayon divin, chœur céleste | gros plan, profondeur de champ |
| 6d | 94,5 – 97 | Elle lève la tête et regarde l'objectif, yeux luminescents sous le voile | gros plan |
| 6e | 97 – 99,3 | Elle saisit la bouteille (le plastique crépite dans la nef), grondement | plan serré |
| 6f | 99,3 – 104,2 | Les ailes s'ouvrent en grand, ombres géantes sur les murs — « Vous avez cherché la puissance… » | plan large, recul |
| 6g | 104,2 – 108 | Elle brandit la bouteille — « La sobriété… ne vous sera pas rendue. » Éclair noir, **coupe au noir** | contre-plongée, poussée |
| **7 — Le titre** | 108 – 120 | Impact, particules noires et dorées, logo qui se révèle par dissolution brûlante, sous-titre, silhouette de la prêtresse, dernier scintillement de la bouteille du blason, noir | lente poussée |

Les répliques sont sous-titrées (`#subtitle`).

---

## 4. Son et musique

Tout est **synthétisé en temps réel** (`audio/engine.ts`) — aucune musique commerciale, aucun échantillon :

- *Orchestre* : nappes de cordes (dents de scie désaccordées filtrées), cuivres (filtre qui s'ouvre à l'attaque),
  ostinatos de cordes, **chœurs** (sources riches passées dans des filtres de formants « a / o / u », vibrato),
  timbales/taïkos, cymbales, cloches (partiels de cloche), gong.
- *Bruitages* : vent à rafales, ressac, battements d'ailes, cri de rapace, goélands, rumeur de foule, enclumes,
  chocs métalliques (partiels inharmoniques), souffles, explosions, crépitements, rugissements (formants mobiles
  + saturation), corde d'arc, tonnerre, grondements, battements de cœur, gouttes dans la nef.
- *Espaces* : deux réverbérations à convolution générées (salle, cathédrale de 7,5 s), compresseur maître.
- *Progression* (`audio/score.ts`, en ré mineur) : calme mystérieux → thème héroïque aux cors → mystère
  de la plaine → procession de la cité → combat à 120 BPM avec percussions **calées sur chaque impact** →
  **silence brutal** → nef, cœur qui bat, chœur « céleste » en ré **majeur** pour la bouteille, grondements →
  impact orchestral et chœur final sur le logo.
- *Voix de la prêtresse* : synthèse vocale du navigateur (français, très grave et lente) doublée d'un
  murmure synthétique réverbéré, et sous-titres.

### Remplacer par de vrais enregistrements

Déposer des fichiers dans `public/audio/` ; ils sont détectés automatiquement au lancement :

| Fichier | Effet |
|---|---|
| `score.mp3` | remplace **toute la musique** synthétique (les bruitages restent synthétisés et synchronisés). Doit durer 120 s et suivre la timeline. |
| `voice-1.mp3` | réplique « Vous avez cherché la puissance… mais vous avez oublié l'essentiel. » (99,7 s) |
| `voice-2.mp3` | réplique « La sobriété… ne vous sera pas rendue. » (104,9 s) |

Les voix sont jouées dans la réverbération de cathédrale, légèrement ralenties.

---

## 5. Ressources visuelles

### Ressources externes intégrées (licence CC0 1.0)

Les sites de ressources (Poly Haven, ambientCG…) ne sont pas joignables depuis l'environnement de
développement ; les ressources proviennent donc du paquet npm **`@pmndrs/assets`** (CC0, auto-hébergé,
chargé par import dynamique au démarrage — `src/world/assets.ts`) :

| Ressource | Usage |
|---|---|
| HDRI `park`, `sky`, `dawn`, `night`… (Poly Haven, 512 px, EXR) | éclairage par l'image (lumière du ciel, reflets de l'eau, du métal et des vitres) selon la scène |
| Normal maps tuilables (roche, pavés, planches, écorce, enduit, tuiles, tissu, terre, eau) | relief des matériaux ; roches et terrains en **projection triplanaire** (sans UV, sans étirement) |
| Texture de nuage | cumulus, banc de nuages, fumées de cheminée |

Si une ressource ne se charge pas, les matériaux retombent sur le relief procédural (aucun écran blanc).

### Ressources générées par le code

| Élément | Technique |
|---|---|
| Aigle | squelette articulé, ~1 500 cartes de plumes (manteau instancié + rémiges), iris peint, cornée brillante |
| Mer | vagues de Gerstner (8 trains) en espace monde, Fresnel, reflets solaires, écume ; maillage qui suit la caméra |
| Relief | champs de hauteurs (bruit simplex, crêtes), couleurs par altitude/pente, **détail rocheux et relief procéduraux en espace monde** (sans étirement sur les parois) |
| Ciel, nuages, brume | dôme atmosphérique (soleil, halo, voile nuageux), volutes, nappes de brume animées, rayons volumétriques |
| Plaine | collines, rivière (eau réfléchissante animée), chemin de terre à ornières, champs de blé et labours, murets de pierres sèches, clôtures ; jusqu'à 110 000 brins d'herbe, 16 000 fleurs sauvages, 26 000 épis de blé, buissons, fougères, roseaux, animés par le vent |
| Arbres | chênes, bouleaux, sapins, peupliers, saules, arbres morts : branches récursives, cartes de feuillage aux normales « volumiques », écorce texturée ; forêts lointaines en niveau de détail bas |
| Hameau | maisons de village et fermes, moulin à vent (ailes en rotation), puits, charrette tirée par un cheval, fumées de cheminées, villageois qui marchent, discutent ou travaillent aux champs, moutons, vaches, poules |
| Maisons | générateur de maisons médiévales : soubassement de pierre, étages à colombages en encorbellement, poutres et croix de Saint-André en relief, fenêtres à meneaux et volets peints, portes, auvents, enseignes, lucarnes, cheminées, toits de tuiles, d'ardoise ou de chaume ; une vingtaine de modèles instanciés |
| Cité | remparts à 22 tours, porte monumentale, statues de 36 m, jusqu'à 1 400 maisons détaillées, avenue marchande, forges, canal et ponts, deux cathédrales, tour de 300 m, jardins, rues pavées ; foule animée (marchands, forgerons, passants), chevaux, chiens, poules, charrette, fumées |
| Personnages | mage, épéiste, invocateur, berserker, rôdeur, Gardes de la Tempérance, bête spectrale, Colosse de 44 m, prêtresse ailée |
| Relique | bouteille PET de 50 cl (profil de révolution, nervures, étiquette « Source Claire » fictive, bouchon cranté, eau intérieure, matériau transmissif) |
| Logo | gravé sur canevas : métal biseauté, usure, fissures incandescentes, blason à la bouteille ; révélé par un shader de dissolution |

Polices : Cinzel, Cinzel Decorative, Cormorant Garamond (SIL Open Font License, embarquées via `@fontsource`).

---

## 6. Limites connues (et solutions de remplacement retenues)

- **Pas de modèles 3D sculptés ni de capture de mouvement.** Les bibliothèques de modèles et de textures
  photographiques (Poly Haven, ambientCG, Sketchfab…) sont bloquées par le réseau de l'environnement de
  développement ; seules les ressources CC0 du paquet npm `@pmndrs/assets` ont pu être intégrées. Les modèles
  restent donc procéduraux : silhouettes lisibles et stylisées, mais pas le niveau de détail
  d'une production AAA (visages en particulier — d'où le voile de la prêtresse et les cadrages en
  silhouette). Les personnages utilisent une **hiérarchie d'articulations** (squelette rigide) plutôt qu'un
  maillage déformé par *skinning*. Pour monter en qualité : remplacer les fabriques de `world/characters.ts`,
  `world/priestess.ts` et `world/eagle.ts` par des modèles glTF animés (le `GLTFLoader` de Three.js s'intègre
  sans toucher à la timeline ni aux caméras).
- **Voix** : la synthèse vocale du navigateur n'est pas une comédienne ; son timbre dépend du système, et
  certains navigateurs (ou le mode silencieux des téléphones) ne la jouent pas. Les sous-titres restent
  affichés ; fournir `voice-1.mp3` / `voice-2.mp3` pour une vraie interprétation.
- **Musique synthétique** : orchestration crédible mais pas un orchestre enregistré ; `score.mp3` permet
  d'intégrer une composition originale.
- **Performances** : prévu pour une carte graphique récente en qualité haute ; la résolution dynamique et
  le mode `low` gardent la lecture fluide sur portables et téléphones, au prix de la netteté.

---

## 7. Vérifications

```bash
npm run build                # TypeScript strict + build de production
node scripts/ui-test.mjs     # parcours complet : lancement, « Passer » différé, 16:9, fin, accueil, relecture (ordinateur + mobile)
node scripts/capture.mjs     # images clés de toute la timeline dans shots/
node scripts/capture.mjs 62.6 93   # images à des instants précis
```

Les scripts utilisent Chromium (Playwright) en rendu logiciel : ils servent à vérifier la mise en scène et
l'absence d'erreurs, pas à mesurer la fluidité (à évaluer sur un vrai navigateur, avec `?debug=1`).
