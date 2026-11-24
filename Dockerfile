# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund && npm install firebase --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html firebase-blueprint.json ./
COPY public ./public
COPY src ./src
RUN echo '{"apiKey":"AIzaSyDummyKeyForLocalRun1234567890","authDomain":"://firebaseapp.com","projectId":"atoms-lab","storageBucket":"://appspot.com","messagingSenderId":"123456789","appId":"1:123456789:web:abcdef123456","firestoreDatabaseId":"(default)"}' > firebase-applet-config.json

RUN npm run typecheck && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Install Python 3, venv/pip, OpenMP runtime (libgomp1), and CA certificates for PySCF/libcint
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      libgomp1 \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Provision isolated Python PySCF + libcint + Basis Set Exchange environment outside /app
COPY science/requirements.txt ./science/requirements.txt
RUN python3 -m venv /opt/atoms-py \
    && /opt/atoms-py/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/atoms-py/bin/pip install --no-cache-dir -r science/requirements.txt \
    && /opt/atoms-py/bin/python -c "\
import numpy, scipy, h5py, pyscf, basis_set_exchange as bse; \
from pyscf import gto, scf; \
from pyscf.gto import moleintor; \
assert hasattr(moleintor, 'libcgto'); \
mol = gto.M(atom='He 0 0 0', basis='sto-3g', verbose=0, parse_arg=False); \
mf = scf.RHF(mol); e = float(mf.kernel()); \
assert mf.converged and -2.9 < e < -2.7, f'Unexpected He/STO-3G energy: {e}'; \
print(f'Verified PySCF {pyscf.__version__}, BSE {bse.__version__}, He/STO-3G={e:.8f} Ha')"

# Install production Node.js dependencies only (Express; server.ts runs on Node 22 native TS stripping)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy runtime server, Python computational backend, and prebuilt Vite dist bundle
COPY server.ts ./
COPY science ./science
COPY --from=frontend-builder /app/dist ./dist

RUN chmod -R a+rX /opt/atoms-py /app

ENV NODE_ENV=production \
    ATOMS_HOST=0.0.0.0 \
    PORT=3000 \
    ATOMS_PYTHON=/opt/atoms-py/bin/python \
    PYTHONUNBUFFERED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/hf/capabilities').then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => process.exit(d && d.available === true ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
