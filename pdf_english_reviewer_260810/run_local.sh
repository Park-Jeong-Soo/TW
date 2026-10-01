#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -c "import fastapi, fitz, multipart, requests, uvicorn" >/dev/null 2>&1 || pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
