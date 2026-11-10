# 🎯 AI SALES COACH — coach IA de rétention commerciale (déménagement)

Application Python qui analyse les conversations entre un commercial et un client qui veut résilier
à cause d'un déménagement, note l'appel sur 100, explique chaque erreur **à partir d'un extrait réel**,
propose de meilleures formulations, construit un programme de progression individuel et entraîne les
agents face à des clients simulés.

> ⚠️ **Outil de formation, non officiel.** Il ne contient **aucun tarif, aucune offre, aucune condition
> contractuelle** de l'entreprise : ces informations ne peuvent venir que des documents métier que vous
> importez dans la base de connaissances (périmètre « Entreprise »). Les appels fournis sont **fictifs**.

---

## Sommaire

1. [Ce que fait l'application](#1-ce-que-fait-lapplication)
2. [Démarrage rapide](#2-démarrage-rapide)
3. [Les 8 pages](#3-les-8-pages)
4. [Moteurs IA : modes, limites matérielles et qualité](#4-moteurs-ia--modes-limites-et-qualité)
5. [Grille d'évaluation et principes anti-invention](#5-grille-dévaluation-et-principes-anti-invention)
6. [Base de connaissances (RAG)](#6-base-de-connaissances-rag)
7. [Confidentialité et sécurité](#7-confidentialité-et-sécurité)
8. [Architecture](#8-architecture)
9. [Tests](#9-tests)
10. [État des fonctionnalités (ce qui est testé, ce qui ne l'est pas)](#10-état-des-fonctionnalités)
11. [Documentation complémentaire](#11-documentation-complémentaire)

---

## 1. Ce que fait l'application

| Besoin | Réalisation |
|---|---|
| Importer un appel | Audio **MP3 / WAV / M4A** (transcription Whisper **locale**), transcription **TXT / DOCX / SRT / VTT**, texte collé |
| Distinguer commercial / client | Étiquettes du fichier (`COMMERCIAL :`, `Conseiller :`, `Client :`…) ; pour l'audio : diarisation pyannote si installée, sinon découpage sur les pauses + **attribution manuelle obligatoire** avant l'analyse |
| Étapes de la conversation | Ouverture, découverte, argumentation, objections, proposition, conclusion (avec horodatage) |
| Silences, interruptions, répétitions | Silences ≥ 2 s et débit (audio) ; interruptions (si diarisation) ; tics et phrases répétées (texte) — l'outil indique ce qui n'est **pas** mesurable |
| Questions ouvertes / fermées | Classement : ouverte, information, fermée, **fermée orientée négativement**, reformulation, accueil |
| Objections | Budget, déjà équipé, plus besoin, insatisfaction, résiliation, décision définitive, pressé, réflexion, effort, engagement, concurrence |
| Rétention déménagement | 11 situations (quitte son logement, devient propriétaire / locataire, autre région, étranger, logement déjà équipé, plus d'alarme, budget, insatisfait, résiliation définitive, repreneur) avec checklist de ce que le commercial devait explorer |
| Notation sur 100 | 7 critères pondérés (grille du cahier des charges), chaque note justifiée |
| Rapport de correction | **A** résultat · **B** erreurs (dit / pourquoi / à comprendre / à faire / meilleure formulation) · **C** occasions manquées · **D** conversation idéale (CLIENT / COMMERCIAL / COACH / MEILLEURE RÉPONSE) · **E** 3 actions |
| Coaching individuel | Profil, note moyenne, points forts, **3 difficultés principales**, erreurs récurrentes, progression, objectifs, programme **GROW** différent pour chaque agent |
| Entraînement | 7 profils de clients (pressé, mécontent, agressif, ne veut plus payer, déjà équipé, refuse tout, indécis), 5 niveaux, aucune aide pendant l'exercice, débriefing noté, **rejeu des passages ratés**, difficulté progressive |
| Tableau de bord | Appels analysés, note moyenne, évolution, difficultés fréquentes, progression individuelle, niveaux, découverte, objections, occasions manquées ; filtres agent / période / erreur ; **résultats commerciaux réels affichés séparément** |
| Base de connaissances | PDF, DOCX, XLSX, TXT, CSV, MD ; 3 périmètres séparés (général / entreprise / IA) ; source, URL, date, fiabilité ; import OpenAlex et URL (robots.txt respecté) |
| Sécurité | Anonymisation, chiffrement au repos, rôles, purge automatique, journal des accès, consentement, blocage des API externes par défaut |

## 2. Démarrage rapide

Prérequis : **Python 3.11 ou supérieur**.

```bash
cd ai-sales-coach
python -m venv .venv
# Windows : .venv\Scripts\activate      macOS / Linux : source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # Windows : copy .env.example .env
streamlit run app/main.py       # http://localhost:8501
```

Au premier lancement, l'application demande de **créer le compte administrateur**. Ensuite :

- **Paramètres → Charger la démonstration** : crée 13 analyses fictives sur 3 commerciaux fictifs ;
- **Analyse d'un appel → Appels fictifs** : 6 appels fictifs prêts à analyser.

Windows : double-cliquez sur `lancer_windows.bat` (voir [docs/INSTALLATION_WINDOWS.md](docs/INSTALLATION_WINDOWS.md)).

Options :

```bash
pip install -r requirements-audio.txt   # transcription audio locale (faster-whisper)
pip install -r requirements-ml.txt      # recherche sémantique (sentence-transformers, chromadb)
uvicorn sales_coach.api.main:app --port 8000   # API REST (définir ASC_API_TOKEN)
python scripts/load_demo.py             # données de démonstration en ligne de commande
```

## 3. Les 8 pages

| Page | Contenu | Rôles |
|---|---|---|
| 📊 Dashboard | Indicateurs, évolution, niveaux, difficultés, résultats réels | tous (un commercial ne voit que ses données) |
| 🎧 Analyse d'un appel | Import, transcription, attribution des locuteurs, anonymisation, analyse, rapport A→E, export | tous |
| 🗂️ Historique | Filtres, rapport complet, saisie du résultat réel, suppression | tous / managers |
| 🧭 Coaching individuel | Profil, 3 difficultés, programme GROW, objectifs | tous |
| 🥊 Entraînement | Client simulé, débriefing, rejeu | tous |
| 📈 Performances | Comparaison des agents, courbes, maîtrise par critère | managers, admin |
| 📚 Base de connaissances | Recherche avec source, import, OpenAlex, URL | lecture : tous ; import : managers, admin |
| ⚙️ Paramètres | Configuration active, limites des modes IA, utilisateurs, purge, journal | admin (partiel pour les autres) |

## 4. Moteurs IA : modes, limites et qualité

L'application **fonctionne entièrement sans abonnement ni connexion** (mode « règles »). Un modèle IA est
un **complément optionnel** et interchangeable (`ASC_LLM_PROVIDER`).

| Mode | Données envoyées hors machine | Matériel | Qualité / limites |
|---|---|---|---|
| `none` (défaut) — moteur « règles » | Non | Tout PC | Instantané et reproductible. Détection par motifs explicites et transparents : fiable sur les formulations courantes, **aveugle aux nuances** (ironie, sous-entendus, tournures rares). Client simulé par scénarios. |
| `ollama` (local) | Non | 8 Go de RAM pour un modèle 7-8B quantifié ; CPU : 10 à 60 s par analyse ; GPU 8 Go+ conseillé | Ajoute des constats et une synthèse ; qualité inférieure aux grands modèles en français nuancé. Peut aussi jouer le client en entraînement. |
| `openai_compatible` local (LM Studio, vLLM, llama.cpp) | Non | idem Ollama | idem Ollama |
| `openai_compatible` externe / `anthropic` | **Oui** — bloqué tant que `ASC_ALLOW_EXTERNAL_API=false` | aucun | Meilleure compréhension des nuances ; coût par appel ; **anonymisation obligatoire** et case d'autorisation **par appel**. Non utilisé en entraînement. |
| Transcription Whisper (`faster-whisper`, local) | Non | modèle *small* ≈ 2 Go RAM, 1× à 3× la durée de l'appel sur CPU ; *medium* plus précis mais bien plus lent sans GPU | Dépend fortement de la qualité audio (téléphonie 8 kHz). Sans diarisation, attribution des locuteurs **à vérifier manuellement**. |
| Recherche documentaire « hashing » (défaut) | Non | Tout PC | Lexicale : retrouve les passages qui partagent les mots de la question, pas les synonymes. |
| Recherche `sentence-transformers` | Non (après téléchargement du modèle) | +500 Mo à 2 Go (PyTorch CPU) | Sémantique, multilingue. |

**La note reste toujours calculée par le moteur « règles »** : elle est stable et comparable d'un appel à
l'autre (indispensable pour mesurer une progression). L'IA ajoute des constats et une synthèse, **vérifiés**.

## 5. Grille d'évaluation et principes anti-invention

| Critère | Points |
|---|---|
| Prise de contact et mise en confiance | 10 |
| Découverte du besoin | 20 |
| Compréhension des raisons du déménagement | 15 |
| Argumentation et valorisation du service | 15 |
| Traitement des objections | 20 |
| Proposition de solutions de rétention | 10 |
| Conclusion et engagement client | 10 |

Chaque critère affiche points positifs, erreurs, **extraits horodatés**, conséquence possible et correction.
Si un critère n'est pas observable (ex. aucune objection), il est marqué « non évaluable » et la note est
ramenée sur 100 à partir des critères observables — l'outil ne note pas ce qu'il ne voit pas.

Garde-fous :

1. **Aucune phrase inventée** : toute critique cite le texte exact d'une réplique ; `verify_report` contrôle
   chaque citation (réplique, locuteur, texte mot pour mot) et retire tout constat invérifiable.
2. **Constats IA vérifiés** : une erreur proposée par un modèle n'est retenue que si sa citation existe
   dans une réplique du COMMERCIAL ; sinon elle est rejetée et comptée dans les avertissements.
3. **Aucun tarif, offre, condition ou possibilité de transfert** dans le code : les pistes sont des *types* de
   solutions « à vérifier dans la documentation métier » ; les documents « Entreprise » trouvés sont cités.
4. **Note ≠ résultat** : le « potentiel de rétention » est une estimation qualitative explicitement signalée ;
   les résultats réels (conservé / résilié / en attente) sont saisis à part et affichés séparément.
5. Les « meilleures formulations » sont présentées comme des **recommandations du coach**.

## 6. Base de connaissances (RAG)

Trois périmètres, jamais mélangés :

1. **Connaissances commerciales générales** — 17 fiches fournies (`data/knowledge_seed/`) : SPIN, SONCAS, CAP,
   écoute active, questionnement, négociation raisonnée (Harvard), objections, fidélisation (Reichheld & Sasser),
   valeur vie client, effort client, *service recovery*, GROW, feedback (Kluger & DeNisi), pratique délibérée,
   persuasion éthique (Cialdini), psychologie de la décision (Kahneman & Tversky), vente consultative.
   Chaque fiche porte sa référence et son **niveau de fiabilité** ; les méthodes de formation (SONCAS, CAP,
   entonnoir…) sont explicitement indiquées « pratique professionnelle, non validée scientifiquement ».
   Les fiches sont des synthèses rédigées pour l'outil : **vérifiez les références** avant tout usage externe.
2. **Connaissances spécifiques à l'entreprise** — vos procédures, offres, scripts, exemples d'appels.
   Un modèle vide est fourni : `data/samples/MODELE_procedure_demenagement_entreprise.md`.
3. **Recommandations générées par l'IA** — à valider avant réutilisation.

Import de sources publiques **respectueux** : API OpenAlex (métadonnées et résumés uniquement), une URL à la
fois après vérification de `robots.txt`, délai entre requêtes, README GitHub via `raw.githubusercontent.com`.
Pas d'exploration de liens (pas de *crawl*). HubSpot Academy, Salesforce Trailhead ou Harvard PON se
consultent dans leur interface ; importez uniquement ce que leurs conditions d'utilisation autorisent.

## 7. Confidentialité et sécurité

| Exigence | Mise en œuvre |
|---|---|
| Anonymisation | Noms (après civilité / présentation), téléphones, e-mails, IBAN, cartes, adresses, codes postaux, n° de contrat → jetons `[NOM_1]`… ; activée par défaut |
| Protection des fichiers audio | L'audio n'est conservé que sur demande, **chiffré** ; le fichier temporaire de transcription est supprimé aussitôt |
| Chiffrement | Transcriptions et rapports (qui contiennent des citations) chiffrés au repos (Fernet : AES-128-CBC + HMAC-SHA256) ; clé dans `ASC_ENCRYPTION_KEY` |
| Gestion des accès | Rôles Administrateur / Manager / Commercial ; mots de passe PBKDF2-SHA256 (200 000 itérations) ; un commercial ne voit que ses données |
| Suppression | Purge automatique après `ASC_RETENTION_DAYS` jours (transcription, rapport détaillé, audio) ; les notes chiffrées restent pour le suivi ; suppression manuelle par l'administrateur |
| Journalisation | Connexions, échecs, analyses, consultations, imports, suppressions, purges |
| Consentement | Case obligatoire avant tout enregistrement d'un appel réel |
| Transmissions externes | Bloquées par défaut (`ASC_ALLOW_EXTERNAL_API=false`) ; si activées : autorisation **par appel** + anonymisation obligatoire |
| Secrets | Aucune clé dans le code ; `.env` ignoré par git |

À valider avant tout usage sur des appels réels : base légale RGPD et information des personnes, analyse
d'impact (AIPD) si nécessaire, accord des représentants du personnel le cas échéant (évaluation des salariés),
contrat de sous-traitance si un service IA externe est utilisé.

## 8. Architecture

```
ai-sales-coach/
├── app/                      Interface Streamlit (thème noir / blanc / rouge)
│   ├── main.py               connexion, navigation, purge automatique
│   ├── ui.py                 composants, rendu du rapport A→E, graphiques
│   └── views/                8 pages
├── sales_coach/
│   ├── config.py             configuration (.env)
│   ├── core/models.py        Transcript, Finding, AnalysisReport…
│   ├── transcription/        parser TXT/DOCX/SRT, audio Whisper local, attribution des locuteurs
│   ├── analysis/             nlp (questions, objections), retention (playbook), catalog (pédagogie),
│   │                         analyzer (notation + vérification), llm_analyzer (IA vérifiée)
│   ├── coaching/engine.py    profil, 3 difficultés, programme GROW
│   ├── training/             personas, simulateur (scénario / IA), rejeu
│   ├── knowledge/            loaders, embeddings, store (RAG), seed, sources publiques
│   ├── llm/factory.py        fournisseurs interchangeables + garde-fou externe
│   ├── security/             anonymisation, chiffrement, comptes et journal
│   ├── storage/              SQLAlchemy (SQLite / PostgreSQL), dépôt
│   ├── analytics.py          indicateurs du tableau de bord
│   ├── services.py           pipeline d'analyse
│   └── api/main.py           API REST FastAPI
├── data/samples/             appels FICTIFS + modèle de procédure entreprise
├── data/knowledge_seed/      fiches de connaissances générales sourcées
├── tests/                    tests automatisés (pytest)
└── docs/                     installation Windows, lancement, publication GitHub, architecture
```

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 9. Tests

```bash
python -m pytest            # ~80 tests, < 15 s, sans réseau ni modèle
```

Couverture : lecture des transcriptions, classement des questions, détection des objections, notation des
6 appels fictifs (classement cohérent avec l'attendu), **vérification de chaque citation**, absence de tarif
inventé, rejet des constats IA inventés, blocage des API externes, anonymisation, chiffrement au repos, purge,
consentement, résultats réels séparés, RAG et périmètres, import OpenAlex / robots.txt (simulés), coaching
individualisé, simulateur, API REST, rendu de chaque page Streamlit.

## 10. État des fonctionnalités

| Fonctionnalité | État |
|---|---|
| Analyse « règles », notation, rapport A→E, coaching, entraînement « scénario », tableau de bord, RAG lexical, sécurité, API | ✅ opérationnel et testé automatiquement |
| Interface Streamlit | ✅ testée (rendu de toutes les pages + parcours analyse → enregistrement → entraînement → débriefing dans un navigateur) |
| Transcription audio Whisper | ⚙️ code opérationnel, nécessite `requirements-audio.txt` ; le modèle Whisper est téléchargé au premier usage (connexion nécessaire une fois). Le regroupement en tours de parole et les métriques sont testés ; voir docs/LANCEMENT_LOCAL.md |
| Diarisation pyannote | ⚙️ optionnelle, non testée dans ce dépôt (dépendance lourde + jeton Hugging Face) |
| Enrichissement IA (Ollama / API) et client simulé par IA | ⚙️ code opérationnel, testé avec un modèle simulé ; nécessite un modèle configuré |
| Recherche sémantique sentence-transformers / ChromaDB | ⚙️ optionnelle, nécessite `requirements-ml.txt` |
| PostgreSQL | ⚙️ via `ASC_DATABASE_URL` (SQLAlchemy) ; tests exécutés sur SQLite |

## 11. Documentation complémentaire

- [docs/INSTALLATION_WINDOWS.md](docs/INSTALLATION_WINDOWS.md) — installation pas à pas sous Windows
- [docs/LANCEMENT_LOCAL.md](docs/LANCEMENT_LOCAL.md) — lancement local, audio, Ollama, API, démonstration
- [docs/PUBLICATION_GITHUB.md](docs/PUBLICATION_GITHUB.md) — procédure de publication sur GitHub
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — flux de données, modules, extension
- [.env.example](.env.example) — toutes les variables de configuration
