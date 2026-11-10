@echo off
REM AI Sales Coach - lancement sous Windows (double-clic)
cd /d "%~dp0"
if not exist .venv (
  echo Creation de l'environnement Python...
  py -3.11 -m venv .venv 2>nul || python -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)
if not exist .env copy .env.example .env >nul
echo Ouverture de http://localhost:8501 ...
streamlit run app\main.py --server.port 8501
pause
