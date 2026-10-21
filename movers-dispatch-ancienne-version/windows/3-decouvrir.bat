@echo off
rem Lecture seule : verifie la connexion au CRM et affiche les informations a reporter dans dispatch.toml.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
echo Une fenetre Edge va s'ouvrir : connectez-vous au CRM comme d'habitude, puis revenez ici.
python -m movers_dispatch.cli discover -c dispatch.toml > decouverte.txt 2>&1
type decouverte.txt
echo.
echo Ces informations sont aussi enregistrees dans decouverte.txt (a ouvrir avec le Bloc-notes).
pause
