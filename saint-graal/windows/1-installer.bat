@echo off
rem Installation de SAINT GRAAL (une seule fois). Double-cliquer ce fichier.
rem Appele par 4-lancer.bat avec auto : sans pause a la fin.
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js est introuvable. Installez la version LTS depuis https://nodejs.org
  echo puis redemarrez le PC et relancez ce fichier.
  echo.
  pause
  exit /b 1
)
echo Installation des composants (quelques minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo L'installation a echoue : voir les messages ci-dessus.
  pause
  exit /b 1
)
if not exist reglages.json (
  copy config\reglages.exemple.json reglages.json >nul
  echo Fichier de reglages cree : reglages.json
)
if /i "%~1"=="auto" exit /b 0
echo.
echo Installation terminee. Etape suivante : double-cliquer sur 2-demo.bat
pause
