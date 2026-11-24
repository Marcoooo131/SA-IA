@echo off
rem Demo sur un CRM fictif : aucune connexion, aucune donnee reelle.
cd /d "%~dp0.."
if not exist .venv\Scripts\activate.bat call windows\1-installer.bat auto || (pause & exit /b 1)
call .venv\Scripts\activate.bat
python -m assistant_movers demo
pause
