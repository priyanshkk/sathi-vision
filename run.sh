#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip -q
python -m pip install -r requirements.txt -q

echo
echo "Sathi Vision ready: http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."
echo
python -m uvicorn app:app --host 127.0.0.1 --port 8000
