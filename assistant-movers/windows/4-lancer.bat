@echo off
rem Assistant sur le vrai CRM. Une fenetre Edge s'ouvre : connectez-vous, l'assistant s'ouvre ensuite.
rem Rien n'est conserve apres la fermeture de cette fenetre.
cd /d "%~dp0.."
if not exist .venv\Scripts\activate.bat call windows\1-installer.bat auto || (pause & exit /b 1)
call .venv\Scripts\activate.bat
python -m assistant_movers lancer -c assistant.toml
pause
