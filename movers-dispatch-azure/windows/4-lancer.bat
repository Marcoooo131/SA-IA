@echo off
rem Tableau de bord sur le vrai CRM. Mode Simulation par defaut : rien n'est modifie tant que vous ne validez pas.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
echo Une fenetre Edge va s'ouvrir : connectez-vous au CRM, le tableau de bord s'ouvrira ensuite.
echo Pour arreter l'agent : fermer cette fenetre.
python -m movers_dispatch.cli serve -c dispatch.toml --open
pause
