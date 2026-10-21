@echo off
rem Essai sur des donnees FICTIVES : ne se connecte pas au CRM.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
echo Le tableau de bord de demonstration va s'ouvrir dans le navigateur.
echo Pour l'arreter : fermer cette fenetre.
python -m movers_dispatch.cli serve --demo --open
pause
