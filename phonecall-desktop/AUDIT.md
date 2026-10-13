# AUDIT — Agent de transcription en direct et de note « Phone Call » (poste Windows)

*Audit du dépôt `SA-IA` au 13/10/2026, avant tout développement.*

## 1. Le projet existant

| Module | Technologie | État vérifié | Pertinence pour ce besoin |
|---|---|---|---|
| `/` (Audit Movers) | React 19, TypeScript, Vite, Zustand, three.js ; tests Vitest + Playwright ; GitHub Pages | Opérationnel (tests existants) | **Aucune** : domaine différent (plan 2D/3D, devis), application web statique sans serveur. Conservé tel quel |
| `phonecall-agent/` (PR #8, fusionnée) | Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL, Redis/RQ, SDK `anthropic`, `twilio` | Opérationnel : 113 tests sur SQLite + PostgreSQL, CI verte | **Forte** pour la partie IA : schéma structuré avec justifications, prompt versionné, validateur anti-invention, interface CRM abstraite, journaux expurgés. **Dépendant de Twilio** pour la capture |

Fonctions réutilisables de `phonecall-agent` :

- **Génération** : sortie JSON structurée (faits du client / informations du conseiller / actions réalisées / à faire / points à vérifier), chaque élément justifié par des segments de transcription, catégorie ou « indéterminé ».
- **Contrôle qualité** : chiffres, montants et dates absents de la transcription, action « proposée » présentée comme « réalisée », action à la fois réalisée et à faire, affirmations tirées de passages incertains, etc.
- **Sécurité** : clé du fournisseur d'IA uniquement côté serveur, chiffrement, expurgation des journaux, configuration dev/test/production avec refus des réglages dangereux.
- **CRM** : interface `health_check / find_record / upsert_phone_call / verify_write`, écriture idempotente vérifiée, connecteur réel absent (aucune API connue).

Manques pour le nouveau besoin : aucune capture audio locale, aucune transcription en flux,
aucune application de bureau, note limitée à la structure du flux Twilio (pas de « motif », de
« solutions proposées » ni de « résultat » distincts), aucun point d'entrée pour un client autre que Twilio.

**Décision** : on **conserve** `phonecall-agent` et on l'étend en **passerelle IA** (nouvel
endpoint `POST /api/v1/notes`, sans Twilio, sans stockage du contenu). Le nouveau poste de travail
`phonecall-desktop/` capture et transcrit **localement**, puis envoie uniquement le texte à la
passerelle. Twilio reste une source possible (flux existant) mais n'est plus nécessaire.

## 2. Possibilités réelles de capture audio sous Windows

### 2.1 Mécanismes

| Besoin | Mécanisme Windows | Vérification |
|---|---|---|
| Son du PC (voix de l'interlocuteur dans Teams, softphone, navigateur…) | **WASAPI loopback** : ouverture d'un périphérique de *rendu* en mode boucle ; on reçoit le mélange de tout ce qui est joué sur ce périphérique | Documentation Microsoft WASAPI ; implémentation PortAudio/PyAudioWPatch (code source et exemple officiel lus : `get_loopback_device_info_generator`, `get_default_wasapi_loopback`, `isLoopbackDevice`) |
| Voix du conseiller | Capture WASAPI du **microphone** (périphérique d'entrée) | idem |
| Une seule application (ex. Teams seulement) | *Process loopback* (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`, Windows 10 2004 / build 20348+ et Windows 11) | Documenté par Microsoft ; **non exposé** par PortAudio → évolution possible (module natif) |

### 2.2 Limitations concrètes à connaître

1. **Le loopback capte tout ce qui sort du périphérique** : notifications, musique, autre onglet. Il
   faut donc capter le périphérique sur lequel l'appel est joué (souvent le casque).
2. **Périphérique « communications » ≠ périphérique « par défaut »** : Teams et beaucoup de softphones
   jouent l'appel sur le périphérique de communication. PortAudio n'expose que le périphérique *par
   défaut* → l'application permet de **choisir explicitement** le périphérique de sortie (et le micro).
3. **Silence = aucune donnée** : en loopback, WASAPI ne livre aucun paquet quand rien n'est joué.
   L'application recale la chronologie (insertion de silence) au lieu de croire à une panne.
4. **Casques Bluetooth** : pendant un appel, le casque passe en profil « mains libres » (HFP), qui
   crée un **autre** périphérique de sortie et d'entrée (qualité 8–16 kHz). Il faut sélectionner ce
   périphérique « Mains libres » ; la qualité de reconnaissance baisse.
5. **Changement de périphérique pendant l'appel** (branchement d'un casque, passage HFP) : PortAudio
   ne voit les nouveaux périphériques qu'après réinitialisation. L'application détecte l'arrêt du flux,
   réinitialise l'énumération et tente de rouvrir le périphérique choisi, puis le périphérique par défaut,
   en le signalant.
6. **Haut-parleurs sans casque** : le micro capte aussi la voix de l'interlocuteur → doublons.
   L'application supprime les segments du micro qui répètent un segment du son PC au même moment
   (« écho »), mais **le casque reste fortement recommandé**.
7. **Mode exclusif** : une application qui ouvre le périphérique en mode exclusif n'est pas captée.
8. **Confidentialité Windows** : si l'accès au micro est désactivé (Paramètres › Confidentialité ›
   Microphone), la capture du micro échoue ou ne renvoie que du silence ; l'application l'indique.
   Windows affiche l'icône micro dans la barre des tâches pendant la capture du micro (pas pour le loopback).
9. **Applications Citrix / VDI** : si le softphone tourne dans un bureau virtuel, le son est joué
   localement par le client Citrix : le loopback local fonctionne en général ; à vérifier sur le poste réel.

### 2.3 Ce qui a pu être vérifié ici, et ce qui ne l'a pas été

L'environnement de développement est un conteneur **Linux sans carte son**. Conséquences :

- La capture WASAPI (loopback, micro, casques, Bluetooth, changement de périphérique) **n'a pas pu
  être testée physiquement**. Le code est écrit d'après la documentation et le code source de
  PyAudioWPatch. Vérifié sur un runner **Windows** de GitHub Actions (sans carte son) : tests
  automatisés, initialisation de WASAPI, énumération (« 0 périphérique » correctement signalé),
  construction des exécutables PyInstaller et auto-test des deux `.exe` (code de sortie 0).
  → **Procédure de test audio manuelle** : `docs/PROCEDURE_TEST_AUDIO.md` + commande `diag`.
- Toute la chaîne en aval (traitement du flux, segmentation, transcription, assemblage sans doublon,
  arrêt, finalisation, génération, copie, historique, sécurité de l'interface) est testée
  automatiquement avec des **sources audio simulées** (fichiers WAV synthétiques lus en temps réel).
- La transcription française réelle (faster-whisper) est mesurée dans la CI Linux sur une
  conversation **synthétique** (voix espeak-ng et Piper), Hugging Face n'étant pas accessible depuis
  le conteneur de développement. Résultat : modèle `small` ≈ 4 % d'erreurs sur voix naturelle,
  texte définitif ~1,7 s après la fin de la phrase (détails : `docs/COUTS.md`).

## 3. Comparaison des technologies d'application

| Critère | Application web (navigateur) | Electron | Tauri | **Python natif + interface WebView2** (retenu) |
|---|---|---|---|---|
| Son système | `getDisplayMedia` : l'utilisateur doit choisir **à chaque fois** un écran/onglet et cocher « partager l'audio » ; audio système seulement sous Windows/ChromeOS pour un écran entier, sinon audio d'un onglet ; Firefox ne le permet pas ; une piste vidéo est imposée | `setDisplayMediaRequestHandler({ audio: 'loopback' })` : **Windows uniquement** (doc Electron), mélange de tout le système, pas de choix fin du périphérique de sortie | Pas d'API intégrée : module Rust (ex. `cpal` + WASAPI) à écrire | WASAPI direct (PyAudioWPatch) : choix du périphérique de sortie et du micro, deux flux séparés |
| Micro | `getUserMedia` (choix du périphérique) | idem | module natif | WASAPI direct |
| Deux interlocuteurs séparés | Non fiable (une seule piste mixée) | Oui (2 flux) | Oui | **Oui : canal « son PC » = interlocuteur, canal « micro » = conseiller** |
| Transcription locale (pas d'audio hors du poste) | Non réaliste | Sidecar Python/natif nécessaire | Sidecar nécessaire | **Intégrée** (faster-whisper) |
| Réutilisation du code existant | — | Réécriture en TypeScript ou sidecar | sidecar | Même langage que `phonecall-agent` |
| Empreinte / installation | rien à installer | ~150–250 Mo | ~10–20 Mo + sidecar | ~150–300 Mo (Python + modèles) ; WebView2 déjà présent sur Windows 10/11 à jour |
| Risque principal | autorisations répétées, pas de son système fiable | dépend du mélange système | deux piles (Rust + Python) | taille du paquet, performances CPU de la transcription locale |

**Recommandation** : application de bureau Windows en **Python** avec capture **WASAPI native**
(PyAudioWPatch), transcription **locale** par défaut, serveur local FastAPI limité à `127.0.0.1` et
interface HTML affichée dans une fenêtre **WebView2** (pywebview) — ou dans le navigateur à défaut.
Electron serait la seconde option si l'entreprise impose une pile JavaScript : sa capture loopback
est réelle sous Windows mais moins contrôlable (mélange système, pas de choix du périphérique).

## 4. Transcription en flux : options

| Option | Confidentialité | Latence typique | Coût indicatif (à vérifier sur les grilles officielles) | Locuteurs |
|---|---|---|---|---|
| **faster-whisper local** (retenu par défaut) | audio jamais envoyé | 1–4 s selon le PC et le modèle | 0 € de service ; coût = CPU du poste | par canal (son PC / micro) |
| Azure AI Speech (temps réel, région UE) | sous-traitant Microsoft, région UE possible | < 1 s (partiels) | facturé à l'heure d'audio ; tarif à lire sur la page Azure | diarisation en option (payante) |
| AssemblyAI Universal-Streaming Multilingual | sous-traitant US, endpoint UE annoncé | < 1 s | ~0,15 $/h (facturé à la durée de session) | diarisation +0,02 $/h |
| Deepgram Nova-3 (multilingue) | sous-traitant US | < 1 s | ~0,35–0,55 $/h selon les sources (incohérentes) | diarisation en option |
| Speechmatics temps réel | sous-traitant UK/UE | < 1 s | ~0,24–0,43 $/h selon le niveau | diarisation |

Les fournisseurs cloud nécessitent une validation DPO (sous-traitance de la voix des clients). Le
projet fournit l'**interface** `StreamingRecognizer` pour les ajouter ; aucun n'est implémenté ni
testé à ce stade.

## 5. Risques

| Risque | Gravité | Mesure |
|---|---|---|
| Capture sur le mauvais périphérique (silence) | Élevée | Sélection explicite, vu-mètres par canal, alerte « aucun son détecté » par canal |
| Voix du conseiller en double (haut-parleurs) | Moyenne | Suppression de l'écho par recoupement temps + texte, recommandation casque |
| Poste trop lent pour la transcription locale | Moyenne | Mesure de retard affichée, modèle configurable (`small`/`base`), fournisseur cloud possible |
| Invention dans la note | Élevée | Prompt strict, justifications, validateur, relecture obligatoire avant copie |
| Capture à l'insu / oubli d'arrêt | Élevée | Démarrage seulement par clic, bandeau rouge permanent, arrêt sur fermeture de la fenêtre ou perte de l'interface, durée maximale |
| Données client sur le poste | Élevée | Pas d'audio enregistré ; transcription en mémoire ; historique désactivé par défaut, chiffré, purgé |
| Clé d'API sur le poste | Élevée | Aucune clé de fournisseur d'IA sur le poste : passerelle serveur ; jeton révocable par utilisateur, stocké dans le Gestionnaire d'identification Windows |
| Information des clients | Élevée | Case de confirmation configurable avant « Démarrer » ; règle à fixer avec le juridique |

## 6. Plan de développement priorisé

| # | Étape | Vérification |
|---|---|---|
| 1 | Audit (ce document) | — |
| 2 | Traitement du flux audio : mono, rééchantillonnage 16 kHz, niveaux, détection de voix, chronologie avec trous | tests unitaires sur signaux synthétiques |
| 3 | Sources audio : fichier WAV temps réel (mode test) ; WASAPI loopback + micro avec reprise | tests automatiques (fichier) ; CI Windows (import, énumération) ; **test manuel** |
| 4 | Gestionnaire de capture : deux canaux, alertes silence, perte de périphérique, arrêt garanti | tests avec sources simulées |
| 5 | Transcription en flux : segmentation, partiels/finaux, file prioritaire, finalisation | tests avec reconnaisseur simulé ; **faster-whisper réel en CI** (WER, latence) |
| 6 | Assemblage : ordre, pas de doublon, écho, incertitudes | tests unitaires |
| 7 | Passerelle note dans `phonecall-agent` (prompt v2 versionné, sections demandées) | tests serveur |
| 8 | Client note : délais, reprise, mode hors ligne | tests (serveur réel local) |
| 9 | Interface et contrôleur de session (états, copie, modification, nouvelle conversation, historique) | tests d'API + **Playwright** |
| 10 | Historique chiffré optionnel, journaux, configuration dev/test/production | tests |
| 11 | Paquet Windows (PyInstaller), CI Windows, docs | build CI |
| 12 | Tests réels sur postes Sector Alarm (après validations) | procédure manuelle |
