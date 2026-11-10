# Guide de lancement local

## Lancer l'interface

```bash
cd ai-sales-coach
source .venv/bin/activate          # Windows : .venv\Scripts\activate
streamlit run app/main.py          # http://localhost:8501
```

Premier lancement : création du compte **administrateur** (10 caractères minimum). Créez ensuite les comptes
Manager et Commercial dans **Paramètres → Utilisateurs et rôles** (un compte Commercial est rattaché à un
commercial et ne voit que ses propres données).

Poste personnel sans écran de connexion : `ASC_REQUIRE_LOGIN=false` dans `.env` (déconseillé en équipe).

## Tester sans données réelles

- **Paramètres → Charger la démonstration** (ou `python scripts/load_demo.py`) : 13 analyses fictives, 3 commerciaux.
- **Analyse d'un appel → Appels fictifs** : 6 appels fictifs (`data/samples/`).

| Appel fictif | Ce qu'il illustre |
|---|---|
| `appel_01_budget_acceptation_rapide` | Budget, acceptation immédiate de la résiliation, questions fermées |
| `appel_02_autre_region_excellent` | Appel exemplaire : découverte, reformulation, argument personnalisé, continuité, engagement |
| `appel_03_deja_equipe_moyen` | Logement déjà équipé, questions fermées, argument générique |
| `appel_04_insatisfait_pression` | Client mécontent, formulations sous pression, anonymisation (nom + téléphone fictifs) |
| `appel_05_etranger_definitif` | Départ définitif à l'étranger : sortie de qualité, reprise par les acquéreurs |
| `appel_06_proprietaire_moyen` | Devient propriétaire, monologue, proposition sans adhésion |

## Format des transcriptions

```
[00:00] COMMERCIAL : Bonjour, je suis Camille du service clients.
[00:05] CLIENT : Bonjour, je déménage en septembre…
```

Étiquettes reconnues : COMMERCIAL, Conseiller, Agent, Vendeur… / CLIENT, Cliente, Abonné… Les étiquettes
inconnues (`SPEAKER_00`, `Locuteur A`, un prénom) sont proposées à l'attribution avant l'analyse.
Horodatage facultatif : `[00:01:12]`, `00:45 -`, `(01:02)`. SRT / VTT acceptés.

## Audio

```bash
pip install -r requirements-audio.txt
```

Puis **Analyse d'un appel → Audio**. Déroulement : transcription locale (Whisper) → découpage en tours de
parole sur les pauses (ou diarisation pyannote si `pyannote.audio` est installé et `ASC_HF_TOKEN` défini) →
**vous attribuez « Locuteur A / B » au commercial et au client** → analyse. Les silences ≥ 2 s et le débit
sont mesurés ; les interruptions ne le sont qu'avec diarisation (sinon l'outil l'indique).

Vérification rapide en ligne de commande :

```bash
python -c "from sales_coach.transcription.audio import available_backends; print(available_backends())"
```

## Modèle IA (facultatif)

| Fournisseur | `.env` |
|---|---|
| Ollama (local) | `ASC_LLM_PROVIDER=ollama`, `ASC_LLM_MODEL=llama3.1:8b` |
| LM Studio (local) | `ASC_LLM_PROVIDER=openai_compatible`, `ASC_LLM_BASE_URL=http://localhost:1234/v1`, `ASC_LLM_MODEL=<nom>` |
| API compatible OpenAI (externe) | `ASC_LLM_PROVIDER=openai_compatible`, `ASC_LLM_BASE_URL=https://…/v1`, `ASC_LLM_API_KEY=…`, `ASC_ALLOW_EXTERNAL_API=true` |
| Anthropic (externe) | `ASC_LLM_PROVIDER=anthropic`, `ASC_LLM_MODEL=claude-sonnet-5-5`, `ASC_LLM_API_KEY=…`, `ASC_ALLOW_EXTERNAL_API=true` |

Un fournisseur externe reste **bloqué** tant que `ASC_ALLOW_EXTERNAL_API=false`. Même autorisé, chaque envoi
exige l'anonymisation et une case d'autorisation cochée pour l'appel concerné.

## API REST

```bash
export ASC_API_TOKEN=un-jeton-long-et-aleatoire
uvicorn sales_coach.api.main:app --port 8000
# documentation interactive : http://localhost:8000/docs
curl -X POST localhost:8000/analyze -H "X-API-Token: $ASC_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"transcript": "COMMERCIAL : Bonjour\nCLIENT : Je déménage et je veux résilier."}'
```

Points d'entrée : `GET /health`, `POST /analyze`, `GET /agents`, `GET /agents/{id}/profile`, `GET /kb/search`,
`POST /training/turn`.

## PostgreSQL (multi-utilisateurs)

```bash
pip install "psycopg[binary]"
ASC_DATABASE_URL=postgresql+psycopg://sales_coach:motdepasse@localhost:5432/sales_coach
```

Les tables sont créées automatiquement au premier lancement.

## Sauvegarde

Sauvegardez ensemble : la base (`data/runtime/sales_coach.db` ou PostgreSQL) **et** la clé de chiffrement
(`ASC_ENCRYPTION_KEY` ou `data/runtime/.encryption.key`). Sans la clé, les transcriptions sont illisibles.

## Créer un compte en ligne de commande (dépannage)

```bash
python -c "from sales_coach.security.auth import create_user; create_user('admin2', 'un-mot-de-passe-long', 'admin')"
```
