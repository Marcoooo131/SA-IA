# Construit PhoneCallDesktop (dossier dist\PhoneCallDesktop) avec PyInstaller.
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
# Version console pour le diagnostic et l'auto-test
pyinstaller --noconfirm --name PhoneCallDiag --console --paths . `
  --collect-submodules phonecall_desktop `
  --collect-data phonecall_desktop --hidden-import pyaudiowpatch `
  packaging\diag_launcher.py
Write-Host "OK : dist\PhoneCallDesktop\PhoneCallDesktop.exe et dist\PhoneCallDiag\PhoneCallDiag.exe"
