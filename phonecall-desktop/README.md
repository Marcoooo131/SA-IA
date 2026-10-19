# Phone Call Desktop — prise de notes assistée sur le poste du conseiller

Application de bureau Windows qui **capte la conversation sur l'ordinateur** (son joué par le PC
via WASAPI loopback + micro du conseiller), la **transcrit en direct en français, localement**, puis
produit un **compte rendu « Phone Call » dans la template générale de l'entreprise** (8 rubriques,
champs Movers / Frontline / Appel sortant, voir [docs/TEMPLATE_PHONE_CALL.md](docs/TEMPLATE_PHONE_CALL.md)),
rempli sans IA (gratuit, hors ligne) ou, en option, par Claude, à relire et à copier
dans le CRM. Indépendante de Twilio.

> ⚠️ **Prototype.** Testé automatiquement avec des sources audio simulées et des conversations
> **synthétiques** ; la capture WASAPI réelle **n'a pas encore été testée sur un poste équipé d'un
> casque** (voir `docs/LIMITATIONS.md`). Aucune donnée réelle de Sector Alarm ne doit être utilisée
> avant les validations de `docs/ACTIONS_RESTANTES.md`.

## Essai rapide (mode test, sans audio réel ni IA)

```bash
cd phonecall-desktop
python -m venv .venv && . .venv/bin/activate        # Windows : .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
PCD_ENVIRONMENT=dev PCD_AUDIO_BACKEND=test-files PCD_RECOGNIZER=scripted PCD_NOTES_CLIENT=simulated \
  python -m phonecall_desktop --browser
python -m pytest                                    # tests (dont l'interface dans Chromium)
```

Sous Windows : `python -m phonecall_desktop.diag --record 10` vérifie la capture du son du PC et
du micro (aucun son n'est enregistré).

## Utilisation

1. Choisir le **son du PC** (le périphérique où l'on entend l'appel, souvent le casque) et le **micro**.
2. Cocher la confirmation d'information de l'interlocuteur (si l'entreprise l'exige), cliquer **Démarrer**.
   Bandeau rouge et chronomètre visibles pendant toute la capture ; vu-mètres « son détecté ».
3. La transcription s'affiche en direct (gris = provisoire, noir = définitif, souligné = incertain).
   Chaque phrase définitive passe par l'**améliorateur de texte** local : hésitations (« euh ») et
   bégaiements retirés, vocabulaire métier corrigé (« secteur alarme » → « Sector Alarm »), numéros
   de téléphone groupés (« 06, 12, 34… » → « 06 12 34… »), ponctuation française. Aucun mot ni chiffre
   n'est ajouté ; le texte brut reste visible au survol. `PCD_TEXT_ENHANCER=false` le désactive ;
   `PCD_TEXT_CORRECTIONS=mal entendu=>Correct; …` ajoute des corrections propres à l'entreprise.
4. **Fin** (ou Échap) : l'écoute s'arrête immédiatement, les derniers mots sont transcrits, la note est générée.
5. Relire, **Modifier la note** si besoin, **Copier la note**, coller dans le champ Phone Call du CRM.
6. **Nouvelle conversation** efface tout.

**Mettre en forme la transcription** (au-dessus de la transcription) : transforme la transcription de
l'appel, ou une transcription collée, en Phone Call au format de l'équipe, **par script, sans IA**
(`notes/formatter.py`). Des règles de situation (`notes/template/phone_call_facts.yaml`, copie modifiable
à côté de l'exe) rédigent des phrases propres ; le contact du repreneur, l'adresse et les numéros dictés
sont extraits ; les phrases restantes sont mises à la 3ᵉ personne. Rien n'est conservé.

## Documents

| Document | Contenu |
|---|---|
| [AUDIT.md](AUDIT.md) | audit du projet existant, possibilités réelles de capture, comparaison Electron / Tauri / web, plan |
| [ARCHITECTURE.md](ARCHITECTURE.md) | architecture cible justifiée, flux, états, sécurité |
| [docs/INSTALLATION_WINDOWS.md](docs/INSTALLATION_WINDOWS.md) | installation, paquet, mise à jour, désinstallation |
| [docs/CONFIGURATION_CLES.md](docs/CONFIGURATION_CLES.md) | clé Claude (coffre Windows ou passerelle) et jetons |
| [docs/PROCEDURE_TEST_AUDIO.md](docs/PROCEDURE_TEST_AUDIO.md) | tests audio à réaliser sur poste réel |
| [docs/COUTS.md](docs/COUTS.md) | mesures (qualité, latence) et coût par heure et par appel |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | limitations connues et ce qui n'a pas été vérifié |
| [docs/ACTIONS_RESTANTES.md](docs/ACTIONS_RESTANTES.md) | actions avant un déploiement professionnel |
| [config.example.env](config.example.env) | configuration d'exemple sans secret |

## Organisation du code

```
phonecall_desktop/
  audio/        sources (WASAPI, fichiers de test), périphériques, capture supervisée, traitement du flux
  stt/          segmentation, transcription en flux, faster-whisper, reconnaisseur scripté (tests)
  transcript/   assemblage : ordre, doublons, écho ; améliorateur de texte (enhancer.py)
  notes/        note : synthèse sans IA (local_summary.py, par défaut), client direct Claude
                (clé du coffre Windows) ou client de la passerelle (moteur phonecall_agent.note_service)
  web/          serveur local sécurisé + interface (HTML/CSS/JS sans dépendance externe)
  session.py    cycle de vie d'une conversation (états, arrêt garanti)
  history.py    historique optionnel chiffré
  config.py     profils dev / test / production ; secrets_store.py : coffre Windows
  diag.py       diagnostic audio Windows ; synthetic.py : conversations fictives
scripts/benchmark_stt.py   mesure de la transcription réelle (voix de synthèse)
packaging/                 construction de l'exécutable Windows (PyInstaller)
```
