# Construit Phone Call (dossier dist\PhoneCallDesktop + dist\PhoneCallDesktop-windows.zip) avec PyInstaller.
# Prérequis : Python 3.12 x64, exécuté depuis phonecall-desktop\
$ErrorActionPreference = "Stop"
python -m pip install --upgrade pip
python -m pip install -e ".[build]" -e ..\phonecall-agent
# --paths : take the packages from the sources (editable installs are not seen by PyInstaller).
# phonecall_agent: only the note engine (prompt, schema, checks, Claude client) is bundled,
# not the gateway server (Twilio, database, queue).
pyinstaller --noconfirm --clean --name PhoneCallDesktop --windowed --paths . --paths ..\phonecall-agent `
  --collect-submodules phonecall_desktop `
  --collect-all faster_whisper --collect-all ctranslate2 --collect-all webview `
  --collect-data phonecall_desktop --collect-data phonecall_agent `
  --hidden-import phonecall_agent.note_service --hidden-import phonecall_agent.generation.anthropic_generator `
  --hidden-import pyaudiowpatch `
  packaging\launcher.py
# Files delivered next to the executable (configuration, README, shortcuts)
Copy-Item -Path packaging\dist_files\* -Destination dist\PhoneCallDesktop\ -Recurse -Force
if (-not (Test-Path dist\PhoneCallDesktop\config.env)) { throw "config.env absent du paquet (packaging\dist_files\config.env)" }
# Business configuration of the note (categories, format): to be replaced by the validated version
Copy-Item -Path ..\phonecall-agent\config\business.example.yaml -Destination dist\PhoneCallDesktop\business.yaml -Force
Compress-Archive -Path dist\PhoneCallDesktop -DestinationPath dist\PhoneCallDesktop-windows.zip -Force
Write-Host "OK : dist\PhoneCallDesktop\PhoneCallDesktop.exe et dist\PhoneCallDesktop-windows.zip"
