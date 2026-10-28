@echo off
rem Rappels de l'equipe : active les rappels, cree le dossier Rappels dans OneDrive, y ecrit rappels-movers.json,
rem ou indique ce qui bloque. Option : un rappel d'essai dans 20 minutes pour tester les notifications.
cd /d "%~dp0.."
call .venv\Scripts\activate.bat || (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
set ESSAI=
set /p ESSAI=Ajouter un rappel d'essai dans 20 minutes pour tout le monde ? (o/n) :
if /i "%ESSAI%"=="o" (
  python -m movers_dispatch.cli rappels -c dispatch.toml --essai tous
) else (
  python -m movers_dispatch.cli rappels -c dispatch.toml
)
echo.
pause
