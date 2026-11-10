# Architecture

## Flux d'une analyse

```
Audio (MP3/WAV/M4A) ──► Whisper local ──► segments ──► tours de parole ──┐
TXT / DOCX / SRT / texte ──► parser (étiquettes, horodatage) ────────────┤
                                                                          ▼
                                   attribution des locuteurs (vérifiée par l'utilisateur)
                                                                          ▼
                                   anonymisation (par défaut) ──► Transcript
                                                                          ▼
          nlp.py : questions (ouverte / information / fermée / orientée négativement / reformulation),
                   objections, signaux client, comportements du commercial
          retention.py : situations de déménagement + checklist
                                                                          ▼
          analyzer.py : détecteurs d'erreurs (citation exacte) ─► notation 7 critères ─► occasions
                        manquées ─► conversation idéale ─► plan d'action ─► sources entreprise (RAG)
                                                                          ▼
          (option) llm_analyzer.py : constats IA ─► vérification des citations ─► fusion
                                                                          ▼
          verify_report() : contrôle final anti-invention ─► AnalysisReport
                                                                          ▼
          repo.save_analysis() : transcription + rapport chiffrés, notes en clair (tableau de bord)
```

## Modules

| Module | Rôle | Points d'extension |
|---|---|---|
| `transcription/parser.py` | Lecture TXT/DOCX/SRT/VTT, étiquettes, horodatage | Ajouter des étiquettes dans `AGENT_LABELS` / `CLIENT_LABELS` |
| `transcription/audio.py` | Whisper local, diarisation optionnelle, silences, débit | Nouveau moteur : ajouter un `_run_xxx` et l'enregistrer dans `available_backends` |
| `analysis/nlp.py` | Motifs français (questions, objections, comportements) | Enrichir les listes de motifs (texte sans accents, minuscules) |
| `analysis/retention.py` | Playbook des 11 situations de déménagement | Ajouter une `Situation` (motifs client, checklist, pistes, requête RAG) |
| `analysis/catalog.py` | Pédagogie des erreurs, exercices par niveau | Ajouter un `ErrorType` et son détecteur dans `analyzer._detect` |
| `analysis/analyzer.py` | Détection, notation, rapport, vérification | Barème par critère dans `_score` |
| `analysis/llm_analyzer.py` | Enrichissement IA vérifié | Prompt `SYSTEM` / `SCHEMA` |
| `coaching/engine.py` | Profil, 3 difficultés (fréquence × gravité × faiblesse du critère), GROW | Objectifs SMART par erreur |
| `training/` | Personas (faits cachés, conditions de rétention), simulateur à état, moteur IA | Ajouter un `Persona` |
| `knowledge/` | Extraction, découpage, embeddings, recherche avec citation, sources publiques | Nouveau backend d'embeddings dans `get_embedder` |
| `llm/factory.py` | Fournisseurs interchangeables, garde-fou « externe » | Nouveau fournisseur : sous-classe de `LLM` |
| `security/` | Anonymisation, chiffrement Fernet, comptes, rôles, journal | Rôles dans `ROLES` |
| `storage/` | SQLAlchemy (SQLite, PostgreSQL) | Migrations : ajouter Alembic pour la production |
| `api/main.py` | API REST | Intégration CRM / téléphonie |

## Modèle de données

`agents` · `users` (rôle, rattachement à un agent) · `calls` (transcription chiffrée, audio chiffré, consentement,
date de purge) · `analyses` (note, niveau, notes par critère, codes d'erreur, rapport chiffré) · `outcomes`
(résultat commercial réel, séparé) · `training_sessions` · `kb_documents` (périmètre, source, URL, date,
fiabilité) · `kb_chunks` (texte, vecteur) · `audit_log`.

## Notation

Chaque critère additionne des éléments observables (ex. découverte : nombre de questions ouvertes, ratio
ouvertes / fermées, reformulation, découverte avant proposition, pénalité pour questions orientées
négativement). Un critère non observable est exclu et la note totale est ramenée sur 100. Les seuils de
niveau : < 40 Débutant · 40 En développement · 60 Confirmé · 75 Avancé · 90 Expert.

Ces règles sont des **heuristiques transparentes** issues de pratiques de formation commerciale, pas un
modèle validé statistiquement : pour les calibrer, faites noter un échantillon d'appels par des formateurs
experts et comparez (écart moyen par critère), puis ajustez les barèmes dans `analyzer._score`.

## Limites connues

- Détection par motifs : une formulation inhabituelle peut échapper aux règles (l'IA optionnelle complète).
- Anonymisation par motifs : un prénom isolé sans civilité ni présentation peut passer ; relecture recommandée.
- Sans diarisation, l'attribution des locuteurs d'un audio est heuristique et doit être vérifiée.
- Le potentiel de rétention est une estimation qualitative, jamais un résultat.
