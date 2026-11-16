@echo off
REM AI Sales Coach - lancement sous Windows (double-clic)
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist .venv\Scripts\python.exe (
  echo [1/3] Creation de lenvironnement Python...
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
if not exist .venv\Scripts\python.exe (
  echo ERREUR : Python introuvable. Installez Python 3.11+ en cochant "Add python.exe to PATH".
  pause
  exit /b 1
)
.venv\Scripts\python.exe -c "import streamlit, plotly, sqlalchemy, cryptography, docx, pypdf, openpyxl" 2>nul
if errorlevel 1 (
  echo [2/3] Installation des dependances, quelques minutes...
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (
    echo ERREUR : installation impossible. Reseau dentreprise ? Voir docs\INSTALLATION_WINDOWS.md
    pause
    exit /b 1
  )
)
if not exist .env copy .env.example .env >nul
echo [3/3] Demarrage. Lapplication souvre sur http://127.0.0.1:8501
echo Gardez cette fenetre ouverte. En cas de page noire, copiez ici les messages affiches.
start "" http://127.0.0.1:8501
.venv\Scripts\python.exe -m streamlit run app\main.py --server.address 127.0.0.1 --server.port 8501 --server.enableWebsocketCompression false
pause
