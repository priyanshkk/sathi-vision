@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv
)

call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip -q
python -m pip install -r requirements.txt -q

echo.
echo Sathi Vision ready: http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.
python -m uvicorn app:app --host 127.0.0.1 --port 8000

endlocal
