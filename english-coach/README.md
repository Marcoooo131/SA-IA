# English Coach — apprendre l'anglais écrit en 90 jours (application mobile)

English Coach est un **professeur d'anglais écrit** pour francophones, conçu d'abord pour le téléphone
(Android et iPhone, écrans de 360 à 430 px) et utilisable aussi sur tablette et ordinateur.
C'est une **application web installable (PWA)** : elle s'ouvre dans le navigateur et peut être ajoutée
à l'écran d'accueil, où elle se lance en plein écran comme une application.

> Aucune fonctionnalité vocale : tout se fait à l'écrit.

## Ce que fait l'application

| Rubrique (barre du bas) | Contenu |
|---|---|
| **Accueil** | Jour du programme (x / 90) et barre de progression, leçon du jour, bouton « Continuer mon cours » visible sans défiler, temps d'apprentissage du jour face à l'objectif, révisions en attente, série de jours consécutifs, erreurs à corriger. |
| **Apprendre** | Le programme complet : 13 semaines, 77 leçons (A1 → B1), un bilan le 7e jour de chaque semaine et une évaluation finale le jour 90. Une journée se débloque quand la précédente est terminée ; une journée terminée peut être refaite. |
| **Réviser** | Révisions espacées (1, 2, 4, 7, 15, 30, 60 jours), « Erreurs à corriger », liste du vocabulaire (acquis / en cours). |
| **Conversation** | Conversation écrite avec le professeur IA dans six situations (discussion libre, restaurant, hôtel, entretien d'embauche, collègues, e-mail). Chaque message est corrigé (fragment fautif → correction + explication en français) ; le vocabulaire proposé peut être ajouté aux révisions. |
| **Profil** | Bilan (journées, mots acquis, taux de réussite, temps total, série), objectif quotidien, installation sur l'écran d'accueil, sauvegarde et synchronisation entre appareils. |

Chaque leçon tient en une série d'écrans courts : fiche de grammaire avec exemples, puis exercices
« Choisis la bonne traduction », « Écris le mot en anglais », « Traduis en anglais », « Remets les mots dans
l'ordre », « Complète la phrase ». Après validation : correction, explication courte et bouton « Continuer ».

**Correction.** La correction locale (hors ligne) tolère majuscules, ponctuation, contractions
(*I'm* = *I am*, *doesn't* = *does not*…) et signale les simples fautes de frappe. Quand une traduction libre ne
correspond à aucune réponse prévue et que le téléphone est en ligne, le **professeur IA** juge si elle est
correcte. Hors ligne ou si l'IA est indisponible, l'application le dit et compare aux réponses attendues ;
l'utilisateur peut alors indiquer « Ma réponse était correcte ».

## Conception mobile

- Barre de navigation fixe en bas (5 rubriques, icônes + libellés), à portée de pouce ; elle s'efface quand le clavier est ouvert.
- Cibles tactiles d'au moins 44–52 px, textes ≥ 16 px dans les champs (pas de zoom automatique sur iPhone), aucun défilement horizontal.
- Zones de sécurité respectées (`viewport-fit=cover` + `env(safe-area-inset-*)`), mode portrait, thème clair/sombre automatique.
- **Clavier mobile** : les écrans d'exercice suivent la partie visible de l'écran (`visualViewport`) ; le champ de réponse et
  le bouton « Vérifier ma réponse » restent au-dessus du clavier. La touche Entrée du clavier valide aussi la réponse.
  Champs en anglais sans correction automatique (`autocorrect="off"`, `spellcheck="false"`, `lang="en"`).
- Transitions courtes (≤ 0,2 s), désactivées si l'appareil demande de réduire les animations.

## Sauvegarde, reprise et synchronisation

- Chaque réponse est enregistrée immédiatement dans **IndexedDB** (repli sur localStorage), qui survit à la fermeture
  de l'application et au redémarrage du téléphone ; l'application demande au navigateur un stockage persistant.
- Sont sauvegardés : leçons terminées et scores, chaque réponse donnée, vocabulaire (niveau de mémorisation de chaque mot),
  erreurs à corriger, révisions planifiées, jour actuel du programme, session en cours (exercice et **brouillon de saisie**),
  temps d'étude, conversations.
- **Reprise** : rouvrir l'application ramène directement à l'exercice interrompu ; l'accueil affiche « Reprends à l'exercice x sur y ».
- **Sauvegarde en ligne** : au premier lancement connecté, l'appareil reçoit un **code de synchronisation** (Profil). Saisir ce code
  sur un autre téléphone ou ordinateur y récupère la progression. Les données sont fusionnées sans perte (chaque élément garde
  sa version la plus récente, le temps d'étude est compté par appareil), avec contrôle de révision côté serveur (SQLite).

## Installation sur l'écran d'accueil

L'application **ne s'installe pas toute seule** : l'utilisateur l'ajoute lui-même (guide intégré : Profil → « Voir comment faire »).

- **iPhone / iPad (Safari)** : bouton *Partager* → **« Sur l'écran d'accueil »** → *Ajouter*.
- **Android (Chrome)** : menu **⋮** → **« Installer l'application »** (ou « Ajouter à l'écran d'accueil »). Quand Chrome le permet,
  un bouton **Installer** apparaît directement dans l'application.
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse ; Safari macOS : Fichier → « Ajouter au Dock ».

L'installation exige une adresse **https** (ou `localhost`). Éléments PWA fournis : `manifest.webmanifest` (nom, couleurs,
icônes 192/512, icône « maskable », raccourcis), `apple-touch-icon`, écrans de lancement iOS (10 tailles d'iPhone) et écran
de lancement intégré, **service worker** qui met en cache l'application et tout le programme pour un usage hors ligne.

**Hors ligne** : leçons, révisions, erreurs et vocabulaire fonctionnent. Le professeur IA (conversation, vérification des
traductions libres) et la synchronisation **nécessitent Internet** : l'application affiche un message clair et ne simule
jamais l'IA hors ligne. Les données en attente sont envoyées au retour du réseau.

## Version artefact claude.ai (sans serveur)

`npm run build:artifact` produit `dist-artifact/english-coach.html`, une page unique publiable comme artefact claude.ai :

- **mémoire** : la progression est enregistrée dans la base de données de l'artefact, dans l'espace privé de
  l'utilisateur (`data/users/<id>/progress`), donc liée à son compte Claude et retrouvée sur tous ses appareils ;
  une copie reste sur l'appareil ;
- **professeur IA** : Claude, appelé depuis la page sur le compte de l'utilisateur (capacité `sample`, accord demandé
  à la première utilisation) ;
- pas de service worker ni de serveur : les modules `src/artifact/` remplacent la synchronisation par code,
  le client du serveur IA et le guide d'installation PWA.

## Démarrage

Prérequis : **Node.js 22.18 ou plus récent** (TypeScript exécuté nativement, SQLite intégré `node:sqlite`).

```bash
cd english-coach
npm install
npm run build                 # vérification TypeScript + build dans dist/ (service worker inclus)
ANTHROPIC_API_KEY=sk-ant-... npm start   # http://localhost:8787 : application + API
```

Développement : `npm run dev:server` (API sur 8787) et `npm run dev` (Vite sur 5173, `/api` redirigé vers 8787).
Le service worker n'est actif que dans le build de production.

### Variables d'environnement du serveur

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé de l'API Claude : active le professeur IA. Sans clé, l'application fonctionne et indique que l'IA n'est pas configurée. | — |
| `EC_MODEL` | Modèle Claude utilisé | `claude-opus-5-5` |
| `EC_EFFORT` | Niveau d'effort (`low`, `medium`, `high`) | `low` |
| `EC_AI_DAILY_LIMIT` | Appels IA maximum par code et par jour | `300` |
| `EC_INVITE_CODE` | Si défini, code d'invitation exigé pour créer une sauvegarde (serveur privé) | — |
| `EC_REGISTER_PER_HOUR` | Créations de sauvegarde maximum par adresse IP et par heure | `30` |
| `EC_DB_PATH` | Fichier SQLite | `data/english-coach.db` |
| `PORT`, `HOST` | Écoute HTTP | `8787`, `0.0.0.0` |
| `EC_TUTOR=fake` | Professeur factice déterministe, **réservé aux tests** | — |

Les appels à Claude utilisent les sorties structurées (réponse, corrections, vocabulaire) et le repli serveur
automatique (`fallbacks: "default"`) si le modèle refuse une requête.

En production, placer le serveur derrière un proxy HTTPS (Caddy, Nginx…) et sauvegarder le fichier SQLite.

## Tests

```bash
npm test            # 40 tests unitaires : programme (90 jours, chaque réponse attendue acceptée), correcteur,
                    # répétition espacée, sessions et reprise, fusion entre appareils, API du serveur
npm run test:e2e    # tests de bout en bout (Playwright, Chromium) sur 5 tailles d'écran
```

Les tests de bout en bout construisent l'application, lancent le vrai serveur (SQLite temporaire, professeur factice) et
vérifient sur **Android 360×640, iPhone 390×844, Android 430×932, tablette 768×1024 et ordinateur 1280×800** :
navigation par la barre du bas, absence de défilement horizontal, taille des cibles tactiles et des textes, bouton
principal visible sans défiler, leçon complète avec correction d'une erreur, saisie par Entrée, brouillon et reprise après
rechargement, réouverture sur la leçon interrompue, champ et bouton visibles quand le clavier réduit l'écran de moitié,
erreurs à corriger, conversation corrigée, ajout de vocabulaire aux révisions, synchronisation vers un second appareil,
fonctionnement hors ligne après installation du service worker, messages d'erreur réseau et d'IA indisponible,
manifeste, icônes et mise en cache.

Ces tests émulent les tailles d'écran et le tactile dans Chromium ; ils ne remplacent pas un essai sur de vrais
téléphones (Safari iOS en particulier, dont le comportement du clavier et de l'installation diffère).

## Structure

```
english-coach/
├── src/curriculum/   programme : 77 leçons (grammaire, 6 mots, 4 phrases), bilans et évaluation finale
├── src/core/         correction, répétition espacée, sessions, fusion, stockage, synchronisation, client IA
├── src/ui/           écrans (Accueil, Apprendre, Réviser, Conversation, Profil, exercices), PWA, clavier
├── server/           serveur Node : fichiers de l'application, API de synchronisation (SQLite), professeur IA (Claude)
├── sw/               modèle du service worker (liste des fichiers générée au build)
├── public/           manifeste, icônes, écrans de lancement iOS (régénérables : npm run icons)
└── e2e/              tests Playwright multi-écrans
```
