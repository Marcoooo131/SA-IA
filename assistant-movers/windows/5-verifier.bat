@echo off
rem Controle assistant.toml dans le CRM (lecture seule) : verification.txt
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d abord 1-installer.bat & pause & exit /b 1)
python -m assistant_movers verifier -c assistant.toml
pause
