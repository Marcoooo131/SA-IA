@echo off
rem Tableau de bord sur le vrai CRM. Mode Simulation par defaut : rien n'est modifie tant que vous ne validez pas.
rem Tout est automatique : installation si besoin, sauvegarde des reglages hors du dossier, rappels de l'equipe.
cd /d "%~dp0.."
set SAUVEGARDE=%USERPROFILE%\Movers-Dispatch-sauvegarde
rem Nouveau dossier telecharge : on remet les reglages et l'historique sauvegardes
if not exist dispatch.toml if exist "%SAUVEGARDE%\dispatch.toml" (
  copy "%SAUVEGARDE%\dispatch.toml" dispatch.toml >nul
  if exist "%SAUVEGARDE%\movers_dispatch.db" copy "%SAUVEGARDE%\movers_dispatch.db" movers_dispatch.db >nul
  echo Reglages restaures depuis %SAUVEGARDE%
)
if not exist .venv\Scripts\activate.bat (
  echo Premiere utilisation : installation des composants, quelques minutes...
  call windows\1-installer.bat auto || (pause & exit /b 1)
)
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
rem Mise a jour des composants si une nouvelle version en demande, sans message
python -m pip install -q -e ".[browser]" >nul 2>nul
rem Sauvegarde des reglages et de l'historique, hors du dossier de l'agent
if not exist "%SAUVEGARDE%" mkdir "%SAUVEGARDE%"
if exist dispatch.toml copy /y dispatch.toml "%SAUVEGARDE%\dispatch.toml" >nul
if exist movers_dispatch.db copy /y movers_dispatch.db "%SAUVEGARDE%\movers_dispatch.db" >nul
rem Rappels de l'equipe : active, dossier Rappels dans OneDrive cree si besoin, fichier ecrit
python -m movers_dispatch.cli rappels -c dispatch.toml
echo.
echo Une fenetre Edge va s'ouvrir : connectez-vous au CRM, le tableau de bord s'ouvrira ensuite.
echo Pour arreter l'agent : fermer cette fenetre.
python -m movers_dispatch.cli serve -c dispatch.toml --open
pause
