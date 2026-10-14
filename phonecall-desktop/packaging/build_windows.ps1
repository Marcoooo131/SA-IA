# Construit Phone Call (dossier dist\PhoneCallDesktop + dist\PhoneCallDesktop-windows.zip) avec PyInstaller.
# Prérequis : Python 3.12 x64, exécuté depuis phonecall-desktop\
# -WhisperModel : modèle de transcription livré dans le paquet (aucun téléchargement sur le poste ;
#   utile quand le réseau de l'entreprise bloque Hugging Face). -NoModel : ne pas l'inclure.
param([string]$WhisperModel = "small", [switch]$NoModel)
$ErrorActionPreference = "Stop"
python -m pip install --upgrade pip
python -m pip install -e ".[build]"
# --paths . : take the package from the sources (editable installs are not seen by PyInstaller)
pyinstaller --noconfirm --clean --name PhoneCallDesktop --windowed --paths . `
  --collect-submodules phonecall_desktop `
  --collect-all faster_whisper --collect-all ctranslate2 --collect-all webview `
  --collect-data phonecall_desktop `
  --hidden-import pyaudiowpatch `
  packaging\launcher.py
# Files delivered next to the executable (configuration, README, shortcuts)
Copy-Item -Path packaging\dist_files\* -Destination dist\PhoneCallDesktop\ -Recurse -Force
if (-not (Test-Path dist\PhoneCallDesktop\config.env)) { throw "config.env absent du paquet (packaging\dist_files\config.env)" }
# Business configuration (categories) and Phone Call template: editable copies next to the .exe
Copy-Item -Path ..\phonecall-agent\config\business.example.yaml -Destination dist\PhoneCallDesktop\business.yaml -Force
Copy-Item -Path phonecall_desktop\notes\template\phone_call_template.yaml -Destination dist\PhoneCallDesktop\phone_call_template.yaml -Force
if (-not $NoModel) {
  # Downloaded here (build machine), delivered in models\<name> next to the .exe
  python -c "import sys; from faster_whisper import download_model; download_model(sys.argv[1], output_dir=sys.argv[2])" $WhisperModel "dist\PhoneCallDesktop\models\$WhisperModel"
  if (-not (Test-Path "dist\PhoneCallDesktop\models\$WhisperModel\model.bin")) { throw "modèle $WhisperModel absent du paquet" }
  Remove-Item -Recurse -Force "dist\PhoneCallDesktop\models\$WhisperModel\.cache" -ErrorAction SilentlyContinue
}
Compress-Archive -Path dist\PhoneCallDesktop -DestinationPath dist\PhoneCallDesktop-windows.zip -Force
Write-Host "OK : dist\PhoneCallDesktop\PhoneCallDesktop.exe et dist\PhoneCallDesktop-windows.zip"
