@echo off
rem SAINT GRAAL sur le vrai CRM. Choisissez le mode dans l'interface (Mode test par defaut).
rem Installation si besoin, sauvegarde des reglages hors du dossier de l'agent.
chcp 65001 >nul
cd /d "%~dp0.."
set SAINT_GRAAL_DONNEES=%USERPROFILE%\Saint-Graal-donnees
if not exist "%SAINT_GRAAL_DONNEES%" mkdir "%SAINT_GRAAL_DONNEES%"
rem Nouveau dossier telecharge : on remet les reglages sauvegardes
if not exist reglages.json if exist "%SAINT_GRAAL_DONNEES%\reglages.json" (
  copy "%SAINT_GRAAL_DONNEES%\reglages.json" reglages.json >nul
  echo Reglages restaures depuis %SAINT_GRAAL_DONNEES%
)
if not exist node_modules (
  echo Premiere utilisation : installation des composants, quelques minutes...
  call windows\1-installer.bat auto || (pause & exit /b 1)
)
if exist reglages.json copy /y reglages.json "%SAINT_GRAAL_DONNEES%\reglages.json" >nul
echo.
echo Journal, captures, sauvegardes Excel et session Edge : %SAINT_GRAAL_DONNEES%
echo Pour arreter SAINT GRAAL : bouton ARRETER, puis fermer cette fenetre.
node src\server.js --open
pause
