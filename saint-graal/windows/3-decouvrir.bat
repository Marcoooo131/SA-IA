@echo off
rem LECTURE SEULE : verifie la calculette, la connexion au CRM et les reperes de la fiche contrat.
rem Le resultat est enregistre dans decouverte.txt. Rien n'est modifie dans le CRM.
chcp 65001 >nul
cd /d "%~dp0.."
if not exist node_modules (echo Lancez d'abord 1-installer.bat & pause & exit /b 1)
set SAINT_GRAAL_DONNEES=%USERPROFILE%\Saint-Graal-donnees
if not exist "%SAINT_GRAAL_DONNEES%" mkdir "%SAINT_GRAAL_DONNEES%"
echo Une fenetre Edge va s'ouvrir : suivez les instructions affichees ici.
node src\decouvrir.js
echo.
echo Ces informations sont aussi enregistrees dans decouverte.txt (a ouvrir avec le Bloc-notes).
pause
