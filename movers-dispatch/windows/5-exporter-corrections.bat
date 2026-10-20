@echo off
rem Exporte les corrections faites en mode Supervise dans corrections.csv (a ouvrir avec Excel).
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
python -m movers_dispatch.cli journal -c dispatch.toml --corrections -o corrections.csv
echo.
echo Fichier : %CD%\corrections.csv
pause
