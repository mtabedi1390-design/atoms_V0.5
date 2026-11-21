#!/usr/bin/env bash
# Set up an isolated local Python virtual environment with PySCF and Basis Set Exchange
# for ATOMS v0.7.0 multi-electron Hartree-Fock calculations.
set -euo pipefail

TARGET_ENV="${ATOMS_VENV:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if command -v uv >/dev/null 2>&1; then
  uv venv "$TARGET_ENV" --python "$PYTHON_BIN"
  uv pip install --python "$TARGET_ENV/bin/python" -r science/requirements.txt
elif "$PYTHON_BIN" -m venv --help >/dev/null 2>&1; then
  "$PYTHON_BIN" -m venv "$TARGET_ENV"
  "$TARGET_ENV/bin/pip" install --upgrade pip
  "$TARGET_ENV/bin/pip" install -r science/requirements.txt
else
  echo "Neither 'uv' nor 'python3 -m venv' is available on PATH." >&2
  echo "Install uv (https://docs.astral.sh/uv/) or python3-venv + python3-pip, then re-run." >&2
  exit 1
fi

"$TARGET_ENV/bin/python" -c "import pyscf, numpy, scipy, basis_set_exchange; print('ATOMS Python HF backend ready:', pyscf.__version__, 'BSE:', basis_set_exchange.__version__)"
