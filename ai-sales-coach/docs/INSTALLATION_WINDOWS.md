# Installation sous Windows 10 / 11

## 1. Installer Python 3.11 (ou plus récent)

1. Téléchargez Python depuis <https://www.python.org/downloads/windows/> (version 3.11, 3.12 ou 3.13).
2. Lancez l'installateur et **cochez « Add python.exe to PATH »**, puis « Install Now ».
3. Vérifiez dans un terminal (touche Windows → « PowerShell ») :

```powershell
python --version
```

## 2. Récupérer le projet

- Avec Git : `git clone https://github.com/<votre-compte>/<votre-depot>.git` puis `cd <votre-depot>\ai-sales-coach`
- Sans Git : bouton **Code → Download ZIP** sur GitHub, décompressez, ouvrez le dossier `ai-sales-coach`.

## 3. Méthode simple : double-clic

Double-cliquez sur **`lancer_windows.bat`**. Au premier lancement, il :

1. crée un environnement Python isolé (`.venv`) ;
2. installe les dépendances (`requirements.txt`, quelques minutes) ;
3. copie `.env.example` en `.env` ;
4. ouvre l'application sur <http://localhost:8501>.

Les lancements suivants sont immédiats.

## 4. Méthode manuelle (PowerShell)

```powershell
cd chemin\vers\ai-sales-coach
python -m venv .venv
.venv\Scripts\Activate.ps1          # si bloqué : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -r requirements.txt
copy .env.example .env
streamlit run app\main.py
```

## 5. Options

### Transcription audio (locale)

```powershell
pip install -r requirements-audio.txt
```

`faster-whisper` décode lui-même MP3 / WAV / M4A (pas besoin de ffmpeg). Le modèle choisi
(`ASC_WHISPER_MODEL=small` par défaut, ~500 Mo) est téléchargé **une seule fois** au premier usage, puis
tout fonctionne hors ligne. Avec une carte NVIDIA et CUDA : `ASC_WHISPER_DEVICE=cuda`.

### Modèle IA local avec Ollama

1. Installez Ollama : <https://ollama.com/download/windows>
2. `ollama pull llama3.1:8b` (≈ 5 Go ; 8 Go de RAM minimum, 16 Go conseillés)
3. Dans `.env` :

```
ASC_LLM_PROVIDER=ollama
ASC_LLM_MODEL=llama3.1:8b
ASC_LLM_BASE_URL=http://localhost:11434
```

### Recherche sémantique

```powershell
pip install -r requirements-ml.txt
```

(installe PyTorch CPU : ~1 à 2 Go d'espace disque). Au redémarrage, la base de connaissances est
réindexée automatiquement.

## 6. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `python` n'est pas reconnu | Réinstallez Python en cochant « Add to PATH », ou utilisez `py -3.11` |
| `Activate.ps1` bloqué | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Port 8501 occupé | `streamlit run app\main.py --server.port 8502` |
| Mot de passe administrateur perdu | Supprimez `data\runtime\sales_coach.db` (⚠️ efface les analyses) ou créez un compte via Python : voir LANCEMENT_LOCAL.md |
| « Déchiffrement impossible » | La clé de chiffrement a changé : restaurez `ASC_ENCRYPTION_KEY` ou `data\runtime\.encryption.key` |
