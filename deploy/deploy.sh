#!/usr/bin/env bash
# =============================================================
# deploy.sh  –  run this as user 'uteach' on the server
# Usage:  bash deploy.sh
# =============================================================
set -euo pipefail

REPO_URL="https://github.com/honzas83/uteach/archive/refs/heads/main.tar.gz"
DEPLOY_DIR="/srv/uteach"
VENV_DIR="${DEPLOY_DIR}/.venv"

echo ">>> [1/4] Downloading source code..."
cd "${DEPLOY_DIR}"

# Remove old code (keep .venv if it exists)
find "${DEPLOY_DIR}" -mindepth 1 -maxdepth 1 ! -name '.venv' -exec rm -rf {} +

curl -fsSL "${REPO_URL}" \
  | tar xz --strip-components=1 -C "${DEPLOY_DIR}"

echo ">>> [2/4] Creating Python virtual environment..."
# Debian/Ubuntu ship python3-venv separately; fall back to --without-pip
if python3 -m venv "${VENV_DIR}" 2>/dev/null; then
    echo "  venv created with ensurepip"
else
    echo "  ensurepip unavailable, using --without-pip + get-pip.py"
    python3 -m venv --without-pip "${VENV_DIR}"
    curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    "${VENV_DIR}/bin/python3" /tmp/get-pip.py
fi

echo ">>> [3/4] Installing dependencies..."
"${VENV_DIR}/bin/pip" install --upgrade pip --quiet
"${VENV_DIR}/bin/pip" install --quiet -r "${DEPLOY_DIR}/backend/requirements.txt"
"${VENV_DIR}/bin/pip" install --quiet gunicorn

echo ">>> [4/4] Smoke-test import..."
cd "${DEPLOY_DIR}/backend"
"${VENV_DIR}/bin/python" -c "import server; print('  app object found:', server.app)"

echo ""
echo "========================================="
echo "  Deploy finished successfully!"
echo "========================================="
echo "  Start manually to test:"
echo "  ${VENV_DIR}/bin/gunicorn \\"
echo "    --workers 2 --bind 127.0.0.1:5001 \\"
echo "    --chdir ${DEPLOY_DIR}/backend server:app"
echo ""
echo "  Then from another terminal:"
echo "  curl http://127.0.0.1:5001/health"
echo "========================================="

