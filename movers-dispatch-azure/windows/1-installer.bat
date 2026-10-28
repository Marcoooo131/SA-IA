@echo off
rem Installation de l'agent (une seule fois). Double-cliquer ce fichier.
cd /d "%~dp0.."
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python est introuvable. Installez Python 3.12 depuis https://www.python.org/downloads/
  echo en cochant la case "Add python.exe to PATH", puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)
if not exist .venv (
  echo Creation de l'environnement Python...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installation des composants (quelques minutes)...
python -m pip install --upgrade pip >nul
python -m pip install -e ".[browser]"
if errorlevel 1 (
  echo.
  echo L'installation a echoue : voir les messages ci-dessus.
  pause
  exit /b 1
)
if not exist dispatch.toml (
  copy config\dispatch.example.toml dispatch.toml >nul
  echo Fichier de configuration cree : dispatch.toml
)
echo.
echo Installation terminee. Etape suivante : double-cliquer sur 2-demo.bat
pause
