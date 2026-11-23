#!/usr/bin/env bash
# Set up and verify an isolated local Python virtual environment with pinned PySCF,
# bundled libcint, Basis Set Exchange, NumPy, SciPy, and h5py for ATOMS v0.7.0.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ENV="${ATOMS_VENV:-${ROOT_DIR}/.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
REQ_FILE="${ROOT_DIR}/science/requirements.txt"

if [[ ! -f "$REQ_FILE" ]]; then
  echo "Missing pinned requirements file: $REQ_FILE" >&2
  exit 1
fi

# 1. Verify Node.js (>=20) and npm/Express state
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (>=20.x) to run the ATOMS full-stack Express server." >&2
  exit 1
fi
NODE_VER="$(node -p "process.versions.node")"
NODE_MAJOR="${NODE_VER%%.*}"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js >= 20 is required (found v$NODE_VER)." >&2
  exit 1
fi
if ! node -e "require.resolve('express', { paths: ['$ROOT_DIR'] })" >/dev/null 2>&1; then
  echo "Node dependency 'express' is not installed in '$ROOT_DIR/node_modules'." >&2
  echo "Run 'npm install' in '$ROOT_DIR' before starting ATOMS." >&2
  exit 1
fi

# 2. Verify Python (>=3.10)
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python interpreter '$PYTHON_BIN' not found (Python >=3.10 required)." >&2
  exit 1
fi
"$PYTHON_BIN" - <<'PY'
import sys
if sys.version_info < (3, 10):
    sys.stderr.write(f"Python >= 3.10 is required (found {sys.version.split()[0]}).\n")
    sys.exit(1)
print(f"Verified Python {sys.version.split()[0]}")
PY

# 3. Create or validate virtual environment and install pinned dependencies
if command -v uv >/dev/null 2>&1; then
  uv venv --allow-existing "$TARGET_ENV" --python "$PYTHON_BIN"
  uv pip install --python "$TARGET_ENV/bin/python" -r "$REQ_FILE"
elif "$PYTHON_BIN" -m venv "$TARGET_ENV" 2>/dev/null; then
  "$TARGET_ENV/bin/pip" install --upgrade pip
  "$TARGET_ENV/bin/pip" install -r "$REQ_FILE"
elif "$PYTHON_BIN" -m venv --without-pip "$TARGET_ENV" 2>/dev/null && command -v curl >/dev/null 2>&1; then
  curl -sSL https://bootstrap.pypa.io/get-pip.py | "$TARGET_ENV/bin/python"
  "$TARGET_ENV/bin/pip" install --no-cache-dir -r "$REQ_FILE"
else
  echo "Neither 'uv', 'python3-venv+ensurepip', nor 'curl' bootstrap is available." >&2
  echo "Install uv (https://docs.astral.sh/uv/) or python3-venv + python3-pip, then re-run." >&2
  exit 1
fi

# 4. Verify imports (PySCF, libcint, NumPy, SciPy, h5py, BSE) + real He RHF smoke run
"$TARGET_ENV/bin/python" - <<'PY'
import numpy
import scipy
import h5py
import pyscf
from pyscf import gto, scf
from pyscf.gto import moleintor
import basis_set_exchange as bse

assert hasattr(moleintor, "libcgto"), "PySCF bundled libcint (libcgto) missing"
mol = gto.M(atom="He 0 0 0", basis="sto-3g", verbose=0, parse_arg=False)
mf = scf.RHF(mol)
e_tot = float(mf.kernel())
assert mf.converged and -2.9 < e_tot < -2.7, f"Unexpected He/STO-3G energy: {e_tot}"
print(
    f"ATOMS Python HF backend ready: PySCF={pyscf.__version__}, "
    f"NumPy={numpy.__version__}, SciPy={scipy.__version__}, h5py={h5py.__version__}, "
    f"BSE={bse.__version__}, He/STO-3G={e_tot:.8f} Ha"
)
PY
