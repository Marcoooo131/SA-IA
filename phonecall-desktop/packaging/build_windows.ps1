# Construit Phone Call (dossier dist\PhoneCallDesktop + dist\PhoneCallDesktop-windows.zip) avec PyInstaller.
# Prérequis : Python 3.12 x64, exécuté depuis phonecall-desktop\
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
Compress-Archive -Path dist\PhoneCallDesktop -DestinationPath dist\PhoneCallDesktop-windows.zip -Force
Write-Host "OK : dist\PhoneCallDesktop\PhoneCallDesktop.exe et dist\PhoneCallDesktop-windows.zip"
