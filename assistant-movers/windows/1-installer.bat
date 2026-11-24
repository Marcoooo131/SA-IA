@echo off
rem Installation (une seule fois). Memes composants que movers-dispatch.
cd /d "%~dp0.."
where python >nul 2>nul
if errorlevel 1 (
  echo Python est introuvable. Demandez son installation a l'IT ^(Python 3.11 ou plus^).
  pause
  exit /b 1
)
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
echo Installation des composants...
python -m pip install -e ".[browser]"
if errorlevel 1 (
  echo L'installation a echoue : voir les messages ci-dessus ^(a montrer a l'IT si le depot de paquets est bloque^).
  pause
  exit /b 1
)
if not exist assistant.toml copy config\assistant.example.toml assistant.toml >nul
if /i "%~1"=="auto" exit /b 0
echo Installation terminee. Etape suivante : 2-demo.bat
pause
