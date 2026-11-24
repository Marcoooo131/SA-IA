@echo off
rem Releve les noms techniques du CRM (lecture seule) dans decouverte.txt.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
python -m assistant_movers decouvrir -c assistant.toml %*
pause
