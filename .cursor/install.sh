#!/usr/bin/env bash
# Idempotent setup for FlightWatcher (FastAPI backend + Vite/React frontend).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure python venv support is available (default image ships python3 without it).
if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv
fi

# Python backend virtualenv + dependencies.
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

# ryanair-py is referenced as a git submodule but ships without a .gitmodules
# entry, so populate it from the pinned commit when the sources are missing.
# This also provides ryanair/airports.csv used by the /api/airports endpoint.
RYANAIR_COMMIT="cc56552fd70ac97b27e02ec8c99d9358774dbd59"
if [ ! -f ryanair-py/ryanair/__init__.py ]; then
  tmp="$(mktemp -d)"
  git clone --quiet https://github.com/cohaolain/ryanair-py.git "$tmp"
  git -C "$tmp" checkout --quiet "$RYANAIR_COMMIT"
  mkdir -p ryanair-py
  cp -r "$tmp"/ryanair ryanair-py/
  cp "$tmp"/requirements.txt "$tmp"/setup.py "$tmp"/README.md "$tmp"/LICENSE.md ryanair-py/ 2>/dev/null || true
  rm -rf "$tmp"
fi
pip install -r ryanair-py/requirements.txt

# Frontend dependencies.
cd frontend
npm install

echo "FlightWatcher setup complete."
