# Construit RelancesSMS (dossier dist\RelancesSMS) avec PyInstaller.
# Prérequis : Python 3.12 x64, exécuté depuis sms-reminders-desktop\
$ErrorActionPreference = "Stop"
python -m pip install --upgrade pip
python -m pip install -e ../sms-reminders -e ".[build]"
# --paths : take the packages from the sources (editable installs are not seen by PyInstaller)
pyinstaller --noconfirm --clean --name RelancesSMS --windowed --paths . --paths ../sms-reminders `
  --collect-submodules sms_desktop --collect-submodules sms_reminders --collect-data sms_reminders `
  --collect-all keyring --collect-data tzdata --collect-all phonenumbers `
  --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on `
  packaging\launcher.py
# Version console : auto-test et diagnostic
pyinstaller --noconfirm --name RelancesSMS-Test --console --paths . --paths ../sms-reminders `
  --collect-submodules sms_desktop --collect-submodules sms_reminders --collect-data sms_reminders `
  --collect-data tzdata --collect-all phonenumbers `
  --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on `
  packaging\selftest_launcher.py
Copy-Item config.example.env dist\RelancesSMS\config.example.env
Copy-Item ..\sms-reminders\examples\rendez-vous-exemple.xlsx dist\RelancesSMS\
Copy-Item ..\sms-reminders\examples\rendez-vous-exemple.csv dist\RelancesSMS\
Write-Host "OK : dist\RelancesSMS\RelancesSMS.exe et dist\RelancesSMS-Test\RelancesSMS-Test.exe"
