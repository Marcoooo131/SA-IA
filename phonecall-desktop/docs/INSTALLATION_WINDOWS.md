# Installation sous Windows

> Prototype : à installer d'abord sur un poste de test, avec le **mode test** (conversations
> synthétiques), avant toute utilisation sur de vrais appels (voir `ACTIONS_RESTANTES.md`).

## 1. Prérequis

| Élément | Version / remarque |
|---|---|
| Windows | 10 (21H2+) ou 11, 64 bits |
| WebView2 Runtime | présent sur Windows 11 et Windows 10 à jour (sinon : *Evergreen Runtime* de Microsoft). À défaut, l'application s'ouvre dans le navigateur (`--browser`) |
| Processeur | 4 cœurs récents minimum pour le modèle `small` en local (à mesurer avec `docs/PROCEDURE_TEST_AUDIO.md`) |
| Mémoire | 8 Go (le modèle `small` int8 occupe ~1 Go en mémoire) |
| Disque | ~1,5 Go (application + modèle `small`) |
| Casque | recommandé (USB ou Bluetooth) ; micro autorisé dans *Paramètres › Confidentialité › Microphone* pour les applications de bureau |
| Réseau | HTTPS vers la passerelle de l'entreprise uniquement (aucun accès Internet nécessaire si le modèle est déployé par la DSI) |

## 2. Installation pour un poste de test (Python)

```powershell
# Python 3.12 x64 depuis python.org (cocher « Add to PATH »)
git clone <dépôt> ; cd SA-IA\phonecall-desktop
py -3.12 -m venv .venv ; .\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
python -m phonecall_desktop.diag                     # liste les périphériques WASAPI
```

Mode test (aucun vrai appel, aucune IA, aucune passerelle) :

```powershell
$env:PCD_ENVIRONMENT="dev"; $env:PCD_AUDIO_BACKEND="test-files"; $env:PCD_RECOGNIZER="scripted"; $env:PCD_NOTES_CLIENT="simulated"
python -m phonecall_desktop
```

Capture réelle + transcription locale + note simulée (pour tester l'audio sans passerelle) :

```powershell
$env:PCD_ENVIRONMENT="dev"; $env:PCD_AUDIO_BACKEND="wasapi"; $env:PCD_RECOGNIZER="whisper"; $env:PCD_WHISPER_MODEL="small"; $env:PCD_NOTES_CLIENT="simulated"
python -m phonecall_desktop     # le modèle est téléchargé au premier lancement (Hugging Face)
```

## 3. Paquet pour un déploiement (DSI)

1. Construire le paquet (ou récupérer la dernière **Release GitHub** « Phone Call Desktop » (fichier `PhoneCallDesktop-windows.zip`)) :
   ```powershell
   .\packaging\build_windows.ps1    # → dist\PhoneCallDesktop\ et dist\PhoneCallDesktop-windows.zip
   ```
2. **Signer** les exécutables avec le certificat de signature de code de l'entreprise (sinon
   SmartScreen / l'antivirus peut les bloquer) et les faire analyser par l'équipe sécurité.
3. Déployer le **modèle de transcription** sans téléchargement au poste : récupérer une fois le
   modèle CTranslate2 (`Systran/faster-whisper-small` sur Hugging Face), le placer dans
   `C:\ProgramData\PhoneCallDesktop\models\small\` (fichiers `model.bin`, `config.json`,
   `tokenizer.json`, `vocabulary.*`) et régler `PCD_WHISPER_MODEL_DIR`.
4. Copier `config.example.env` en `%APPDATA%\PhoneCallDesktop\config.env` (ou pousser les variables
   `PCD_*` par GPO / Intune) et renseigner `PCD_GATEWAY_URL`.
5. Installer le jeton de la passerelle pour chaque utilisateur : voir `CONFIGURATION_CLES.md`.
6. Vérifier : « Diagnostic audio.bat » (fourni dans le dossier) ou `PhoneCallDesktop.exe --diag 10 --report diag.txt`.
7. Raccourci : `PhoneCallDesktop.exe` (fenêtre unique ; fermer la fenêtre arrête toute capture).

## 4. Mise à jour

- Remplacer le dossier de l'application par la nouvelle version (aucune donnée n'y est stockée).
- Les réglages (`%APPDATA%\PhoneCallDesktop\config.env`), le jeton (coffre Windows) et, s'il est
  activé, l'historique (`%LOCALAPPDATA%\PhoneCallDesktop\history.db`) sont conservés.
- Le prompt et le contrôle qualité sont mis à jour **côté passerelle**, sans toucher aux postes.
- Changer de modèle de transcription = déposer le nouveau modèle et modifier `PCD_WHISPER_MODEL`,
  après mesure (`scripts/benchmark_stt.py` + procédure audio).

## 5. Désinstallation et effacement

Supprimer le dossier de l'application, puis `%APPDATA%\PhoneCallDesktop`,
`%LOCALAPPDATA%\PhoneCallDesktop` (journaux, historique) et, dans le *Gestionnaire d'identification
Windows › Informations d'identification Windows*, les entrées `PhoneCallDesktop`.
