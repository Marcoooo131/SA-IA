# AUDIT — Agent IA de génération automatique des Phone Call

*Sector Alarm — Twilio + CRM interne. Audit réalisé le 13/10/2026 sur le dépôt `SA-IA`.*

> **Statut** : prototype. Aucune donnée réelle n'a été traitée. Aucun appel à Twilio, au CRM
> ou à un fournisseur d'IA n'a été effectué avec des identifiants réels. Toutes les données
> de test sont synthétiques et fictives.

---

## 1. Méthode

1. Inventaire du dépôt : fichiers, dépendances, configuration, CI, documentation.
2. Recherche de toute trace existante de Twilio, d'un CRM, d'un backend ou de secrets.
3. Revue de la documentation Twilio sur les enregistrements d'appels et la sécurité des webhooks.
4. Liste de ce qui est disponible, de ce qui manque et des décisions à prendre.
5. Plan de développement priorisé, puis prototype de bout en bout sur données synthétiques.

---

## 2. Architecture existante

| Élément | Constat |
|---|---|
| Contenu du dépôt | Un seul projet : **« Audit Movers »**, prototype frontend de démonstration (plan 2D/3D, moteur de règles, catalogue, devis PDF) pour le service Movers. |
| Stack | React 19, TypeScript 5.9, Vite 7, Zustand, three.js / @react-three, Zod, jsPDF, ExcelJS, Tailwind 4. Tests : Vitest (unitaires) et Playwright (bout en bout). |
| Backend | **Aucun.** Aucune API serveur, base de données, file d'attente ou authentification. |
| Persistance | Navigateur uniquement (localStorage validé par Zod, IndexedDB pour les images). Données ni centralisées ni partagées. |
| Déploiement | GitHub Pages (`.github/workflows/deploy-pages.yml`), sur `main`, après `npm test` et `npm run build`. |
| Twilio | **Aucune trace** : ni code, ni dépendance, ni configuration, ni identifiant. |
| CRM | **Aucune trace technique.** `docs/LIMITES_ET_VALIDATIONS.md` indique explicitement « sans intégration à un système interne (CRM, …) ». |
| Secrets | Aucun secret dans le dépôt (vérifié). `.gitignore` sans règle pour `.env`. |

### Conséquence sur la stack

Le projet existant est un **frontend statique**, dont le domaine (audit de logement, devis) est
sans lien avec le traitement d'appels. Il ne fournit aucune brique réutilisable pour :
recevoir des webhooks signés, garder des secrets côté serveur, traiter des tâches en arrière-plan
ou stocker des données sensibles.

**Décision** : le nouvel agent est un **service séparé** (`phonecall-agent/`) dans la stack
recommandée : **Python 3.11+, FastAPI, PostgreSQL, Redis + RQ**. Le projet Movers n'est pas
modifié, son workflow GitHub Pages non plus. L'interface de supervision est rendue côté serveur
(Jinja2), sans framework JS, pour limiter la surface d'attaque (CSP stricte, aucun script inline,
aucun secret dans le navigateur). Une interface React pourra être ajoutée plus tard sur la même
API si l'entreprise le souhaite.

---

## 3. Dépendances retenues

| Dépendance | Rôle | Justification |
|---|---|---|
| `fastapi`, `uvicorn` | API, webhook, interface | Standard, typé, performant |
| `sqlalchemy` 2, `psycopg` 3 | Base de suivi (PostgreSQL ; SQLite en dev) | ORM mature, testé ici sur les deux moteurs |
| `redis`, `rq` | File de tâches, workers, nouvelles tentatives | Simple, suffisant pour 50–200 appels/jour |
| `twilio` | **Uniquement** `RequestValidator` (validation officielle de signature) | Pas d'implémentation maison de la cryptographie |
| `httpx` | Téléchargement authentifié des enregistrements | Délais, flux, redirections maîtrisés |
| `cryptography` (Fernet) | Chiffrement au repos (audio temporaire, transcriptions, comptes rendus) | |
| `anthropic` | Génération du Phone Call (sorties JSON structurées) | SDK officiel |
| `jinja2` (bac à sable) | Interface + gabarit de compte rendu configurable | `SandboxedEnvironment` pour les gabarits métier |
| `faster-whisper` (optionnel) | Transcription auto-hébergée | L'audio ne quitte pas l'infrastructure |

---

## 4. Documentation Twilio : ce qui est établi

Sources : documentation officielle Twilio (ressource *Recording* de Voice, *Recording Status
Callback*, *Webhooks Security*). **À revérifier par l'équipe avant la mise en production**,
car la documentation évolue.

| Sujet | Comportement documenté | Mise en œuvre |
|---|---|---|
| Fin d'enregistrement | `recordingStatusCallback` (avec `recordingStatusCallbackEvent`, `completed` par défaut ; `in-progress` et `absent` possibles). Paramètres : `AccountSid`, `CallSid`, `RecordingSid`, `RecordingUrl`, `RecordingStatus`, `RecordingDuration` (seulement à `completed`), `RecordingChannels`, `RecordingSource`, `RecordingStartTime`, `ErrorCode`. | `POST /twilio/recording-status` |
| Statut `absent` | Peut survenir (y compris à la suite d'une erreur système). | Appel marqué `recording_absent`, aucun téléchargement |
| Disponibilité du média | Le fichier n'est récupérable **que si le statut est `completed`** et si le média est stocké chez Twilio ; sinon 404 (supprimé ou stockage externe). | Lecture des métadonnées `GET …/Recordings/{Sid}.json` avant tout téléchargement ; 404 traité comme définitif |
| Téléchargement | URI de la ressource + `.mp3` ou `.wav`. | URL **reconstruite à partir du SID** ; `RecordingUrl` du webhook ignorée (pas de SSRF, pas d'URL stockée) |
| Authentification | API REST en HTTP Basic (Account SID + Auth Token, ou API Key SID + Secret). Option console *Enforce HTTP Auth on Media URLs* pour interdire l'accès public aux médias. | Clé API restreinte recommandée ; activer l'option dans la console (**décision D3**) |
| Signature des webhooks | En-tête `X-Twilio-Signature` = HMAC-SHA1 (clé : Auth Token) de l'URL complète suivie des paramètres POST triés. | `twilio.request_validator.RequestValidator`, URL publique configurée (`PCA_PUBLIC_BASE_URL`) |
| Suppression | `DELETE` sur la ressource Recording. | Désactivé par défaut, activable une fois la politique de conservation validée |
| Double canal | `RecordingChannels=2` si l'appel est enregistré en double canal : chaque interlocuteur sur sa piste. | Permet d'identifier les locuteurs de façon fiable (**décision D5**) |

Points **non confirmés** pendant l'audit (accès réseau à twilio.com indisponible dans
l'environnement de travail ; seules des recherches indirectes ont abouti) et à vérifier sur la
documentation officielle : la liste exacte des paramètres de callback selon le mode
d'enregistrement (`<Dial record>`, `<Recording>`, API, Flex/TaskRouter), le comportement de
redirection des URL de média et la politique de nouvelles tentatives des webhooks Twilio.

---

## 5. Éléments disponibles / inconnues

### Disponible
- Le besoin métier, le volume cible (50–200 appels/jour) et la langue (français).
- La documentation publique de Twilio.
- La stack recommandée par le cahier des charges.

### Inconnues bloquantes (Twilio)
| # | Question | Impact |
|---|---|---|
| T1 | Comment les appels sont-ils passés : Twilio Voice « nu », **Twilio Flex**, autre centre de contact basé sur Twilio ? | Événement de fin d'appel à écouter, emplacement des enregistrements, lien conseiller ↔ appel |
| T2 | Les appels sont-ils déjà enregistrés ? En simple ou double canal ? Par quel mécanisme ? | Configuration du `recordingStatusCallback` ; qualité de l'attribution des locuteurs |
| T3 | Compte(s) / sous-comptes Twilio concernés, région, stockage externe des enregistrements éventuel | Liste blanche d'`AccountSid`, URL de téléchargement |
| T4 | Qui peut créer une clé API restreinte et configurer le callback ? | Mise en place |
| T5 | Comment relier un appel à un conseiller et à un client (attributs de tâche Flex, numéro, identifiant CRM) ? | Recherche du dossier CRM, routage de la validation |

### Inconnues bloquantes (CRM interne)
| # | Question |
|---|---|
| C1 | Nom, éditeur et version du CRM (solution du marché ou développement interne). |
| C2 | Existe-t-il une **API, un SDK ou un connecteur officiellement autorisé** permettant de créer ou de modifier un Phone Call ? Documentation ? |
| C3 | Mécanisme d'authentification autorisé (compte de service, OAuth, certificat…) et périmètre de droits. |
| C4 | Modèle de données du Phone Call : champs obligatoires, longueur maximale du texte libre, type d'appel, lien avec le dossier/contrat, auteur. |
| C5 | Clé de recherche du dossier client à partir d'un appel. |
| C6 | Un environnement de recette / bac à sable existe-t-il ? |
| C7 | L'API permet-elle une écriture idempotente ou une recherche permettant de vérifier qu'un Phone Call existe déjà ? |
| C8 | Le Phone Call doit-il apparaître comme créé par le conseiller ou par un compte technique ? |

**Aucune de ces informations n'a été supposée.** Le connecteur CRM réel n'est pas écrit.
L'application fonctionne en mode **« validation + copie manuelle »** tant qu'une interface
officielle n'a pas été documentée, autorisée et testée.

### Inconnues métier
| # | Question |
|---|---|
| M1 | Exemples réels **anonymisés et validés** de bons Phone Calls, par type d'appel. |
| M2 | Liste officielle des motifs d'appel et règles de classification. |
| M3 | Informations qui ne doivent **jamais** figurer dans un Phone Call. |
| M4 | Règles particulières par contexte (déménagement, résiliation, rétention : mentions obligatoires, offres autorisées…). |
| M5 | Experts métier disponibles pour évaluer un jeu de comptes rendus. |

---

## 6. Risques

| Risque | Gravité | Mesures dans le prototype | Reste à faire |
|---|---|---|---|
| **Invention ou déformation** par l'IA (montant, date, promesse, action présentée comme réalisée) | Élevée | Prompt strict, sortie structurée avec justification par segment, contrôle des chiffres et quantités, détection « proposé ≠ réalisé », validation humaine obligatoire pendant le pilote | Évaluation par des experts sur un jeu anonymisé, calibrage |
| Erreurs de transcription (bruit, accents, noms propres, chiffres) | Élevée | Passages incertains signalés, interdiction d'affirmer à partir d'un passage incertain | Mesure du taux d'erreur sur des appels réels anonymisés ; choix du fournisseur |
| Mauvaise attribution client / conseiller | Moyenne | Avertissement si locuteurs non identifiés ; double canal recommandé | Valider le double canal (T2) |
| **Données personnelles** : envoi des conversations à des sous-traitants (transcription, LLM) | Élevée | Minimisation (aucun numéro, nom ni URL stockés), chiffrement au repos, purge, journal d'audit, fournisseur auto-hébergé possible | **Validation DPO** : AIPD, base légale, information des clients sur l'enregistrement et son usage, DPA, localisation, durée de conservation |
| Écriture CRM incorrecte ou en double | Élevée | Connecteur désactivé ; logique idempotente avec relecture obligatoire, testée sur un CRM simulé | Interface officielle (C2–C7) |
| Webhook falsifié / rejoué | Moyenne | Signature vérifiée, liste blanche de comptes, idempotence par `RecordingSid` | HTTPS, URL publique exacte, supervision des rejets |
| Fuite d'identifiants Twilio / IA | Élevée | Secrets côté serveur uniquement, journaux expurgés, clé API Twilio restreinte | Gestionnaire de secrets, rotation |
| Dépendance à un fournisseur d'IA (panne, refus, évolution) | Moyenne | Interfaces abstraites, nouvelles tentatives, repli serveur `fallbacks` | Mode dégradé documenté (copie manuelle) |
| Confiance excessive dans l'indicateur qualité | Moyenne | Présenté comme « règles explicites, non calibré » | Calibrage pendant le pilote |
| Adoption par les conseillers | Moyenne | Interface de relecture avec justification par passage, bouton de copie | Formation, retour terrain |

---

## 7. Décisions à prendre

| # | Décision | Qui | Proposition |
|---|---|---|---|
| D1 | Autoriser le traitement des enregistrements par un agent IA (AIPD, information client) | DPO / juridique | Préalable à toute donnée réelle |
| D2 | Fournisseur de transcription : auto-hébergé (faster-whisper) ou service géré (avec DPA, région UE) | DSI + DPO | Comparer 2–3 options sur 50 appels anonymisés (précision et coût) |
| D3 | Activer *Enforce HTTP Auth on Media URLs* et créer une clé API Twilio restreinte | Admin Twilio | Oui |
| D4 | Fournisseur de LLM, modèle, région et conservation des données | DSI + DPO + Achats | Claude via l'API Anthropic (ou via un cloud européen) ; modèle choisi après évaluation (§ COUTS) |
| D5 | Enregistrement en double canal | Admin Twilio | Oui (attribution fiable des locuteurs) |
| D6 | Durées de conservation : audio, transcription, compte rendu, journaux | DPO | Audio supprimé après transcription ; transcription 30 j ; compte rendu suivant la politique CRM |
| D7 | Supprimer l'enregistrement chez Twilio après traitement ? | DPO + métier | Dépend des autres usages des enregistrements (qualité, litiges) |
| D8 | Intégration CRM : quelle interface officielle ? | DSI / éditeur du CRM | Obtenir C1–C8 |
| D9 | Règle de validation humaine après le pilote (100 %, ou seulement les cas signalés) | Responsables relation client | 100 % pendant le pilote, puis selon les mesures |
| D10 | Hébergement (cloud, on-premise), SSO de l'entreprise pour l'interface | DSI | OIDC avec rôles issus des groupes |

---

## 8. Plan de développement priorisé

| Phase | Contenu | Statut |
|---|---|---|
| **1. Audit et architecture** | Ce document, `ARCHITECTURE.md` | ✅ Fait |
| **2. Webhook Twilio + récupération** | Signature, idempotence, métadonnées, téléchargement authentifié, limites de taille et de type, nouvelles tentatives, chiffrement, suppression | ✅ Fait (testé contre un faux Twilio) — **reste** : essai avec un compte Twilio de test et un enregistrement synthétique (D3, T1–T4) |
| **3. Transcription + génération** | Interfaces abstraites, mode simulé, fournisseur faster-whisper optionnel, générateur Claude à sortie structurée | ✅ Fait sur transcriptions synthétiques — **reste** : choix du fournisseur (D2, D4), exemples métier (M1) |
| **4. Validation métier + supervision** | Contrôle qualité à règles explicites, interface de relecture et de copie, rôles, indicateurs, audit | ✅ Prototype fait — **reste** : jeu d'évaluation métier (`docs/EVALUATION.md`), SSO |
| **5. Connexion CRM** | Interface abstraite, logique idempotente avec relecture, tests de contrat sur CRM simulé | ⏸️ Bloquée par C1–C8. Le connecteur réel ne sera écrit qu'avec une interface officielle et autorisée |
| **6. Pilote** | 5–10 conseillers, 100 % de validation, mesure des corrections et des erreurs | À planifier après D1, D2, D4, D6 |
| **7. Montée en charge** | 50–200 appels/jour : 2 workers, PostgreSQL managé, supervision | Dimensionnement dans `docs/INSTALLATION.md` |

---

## 9. Ce que le prototype démontre, et ce qu'il ne démontre pas

**Démontré** (113 tests automatisés, sur SQLite et sur PostgreSQL 16, Redis réel pour la file) :
réception signée et idempotente, téléchargement robuste, chiffrement, pipeline avec reprise,
détection d'inventions sur des cas synthétiques, validation humaine, contrôle d'accès, purge,
logique d'écriture CRM idempotente et vérifiée **contre un CRM simulé**.

**Non démontré** : qualité de transcription et de rédaction sur de vrais appels, comportement
réel de Twilio, intégration au CRM réel. **Aucune intégration CRM ne fonctionne à ce jour.**
