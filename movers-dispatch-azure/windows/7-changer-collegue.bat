@echo off
rem Remplace un collegue qui quitte l'equipe Movers par un nouveau : dispatch.toml et rotations.
rem L'identifiant du nouveau est lu dans le CRM (lecture seule), affiche, puis ecrit apres votre confirmation.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
echo Fermez d'abord les autres fenetres noires de l'agent.
echo.
set /p ANCIEN=Cle du collegue qui part (ex. estefania) : 
set /p PRENOM=Prenom du nouveau collegue, comme dans le CRM (ex. Agathe) : 
set /p NOM=Nom de famille du nouveau collegue, comme dans le CRM : 
echo.
echo Une fenetre Edge va s'ouvrir : connectez-vous au CRM comme d'habitude.
python -m movers_dispatch.cli collegue -c dispatch.toml --ancien "%ANCIEN%" --prenom "%PRENOM%" --nom "%NOM%"
pause
