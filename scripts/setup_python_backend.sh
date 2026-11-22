#!/usr/bin/env bash
# Set up an isolated local Python virtual environment with PySCF and Basis Set Exchange
# for ATOMS v0.7.0 multi-electron Hartree-Fock calculations.
set -euo pipefail

TARGET_ENV="${ATOMS_VENV:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if command -v uv >/dev/null 2>&1; then
  uv venv "$TARGET_ENV" --python "$PYTHON_BIN"
  uv pip install --python "$TARGET_ENV/bin/python" -r science/requirements.txt
elif "$PYTHON_BIN" -m venv "$TARGET_ENV" 2>/dev/null; then
  "$TARGET_ENV/bin/pip" install --upgrade pip
  "$TARGET_ENV/bin/pip" install -r science/requirements.txt
elif "$PYTHON_BIN" -m venv --without-pip "$TARGET_ENV" 2>/dev/null && command -v curl >/dev/null 2>&1; then
  curl -sSL https://bootstrap.pypa.io/get-pip.py | "$TARGET_ENV/bin/python"
  "$TARGET_ENV/bin/pip" install --no-cache-dir -r science/requirements.txt
else
  echo "Neither 'uv', 'python3-venv+ensurepip', nor 'curl' bootstrap is available." >&2
  echo "Install uv (https://docs.astral.sh/uv/) or python3-venv + python3-pip, then re-run." >&2
  exit 1
fi

"$TARGET_ENV/bin/python" -c "import pyscf, numpy, scipy, basis_set_exchange; print('ATOMS Python HF backend ready:', pyscf.__version__, 'BSE:', basis_set_exchange.__version__)"
