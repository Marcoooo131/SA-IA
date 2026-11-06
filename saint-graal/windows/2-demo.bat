@echo off
rem Essai sur un CRM de TEST et un Excel FICTIF : le vrai CRM n'est jamais ouvert.
chcp 65001 >nul
cd /d "%~dp0.."
if not exist node_modules (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
echo L'interface de demonstration va s'ouvrir dans le navigateur.
echo Pour l'arreter : fermer cette fenetre.
node src\demo.js --open
pause
