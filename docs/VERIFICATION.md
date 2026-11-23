# Verification Record (`ATOMS v0.7.0`)

Date: 2026-11-22 · Baseline: `ATOMS v0.6.1` (`bfc0d6a91b2ca5a88ace754bcf85551e5ffa5690`). Container workspace has no `.git` directory.

## 1. Commands Executed & Measured Results

| Command | Exit | Result Summary |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | 0 | Strict TypeScript clean (`0` errors) |
| `npm run lint` (`tsc --noEmit -p tsconfig.json`) | 0 | Clean syntax & type validation (`0` errors) |
| `npm run test:native` (`bash scripts/test_native.sh`) | 0 | Built `build-core-Debug` (`g++ -std=c++17 -O0 -g`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG`); both passed **340 checks (`failures=0`)** |
| `npm test` (`vitest run`) | 0 | **17 test files / 134 tests passed** (126 `v0.6.1` regression + C++ parity tests + 8 live PySCF/BSE/Experiment/open-shell-matrix tests) |
| `npm run build` (`vite build`) | 0 | Single-file bundle `dist/index.html` (`~1.99 MB`), inline Web Workers & pinned JSON datasets |
| `npm run test:browser` (`playwright test`) | 0 | **25 Playwright scenarios passed** via `NODE_ENV=production PORT=4173 node server.ts` (`core`: 5, `responsive`: 1, `science`: 7, `laboratory`: 8, `hartreeFock`: 4) |
| Isolated `setup_python_backend.sh` + Server Lifecycle | 0 | Isolated venv bootstrap (`pyscf==2.15.1`), `127.0.0.1` loopback bind, live `/api/hf/calculate` HTTP 200, Origin `403`, `EADDRINUSE` owner diagnostic, clean `SIGTERM` stop/restart (0 orphans), & `vite preview` static fallback verified |

---

## 2. Unit, Stabilization, & Live HF Coverage (`134` Vitest Tests across `17` Files)

- `src/physics/__tests__/hartreeFock.test.ts` (`8` tests): `atom-sph-avg` `N<2` guard, 1-electron analytical `-Z²/2` & `J+K=0` (`He+`), closed-shell RHF convergence (`He`, `Be`, `Ne`), open-shell `Li, B, C, N, O, F, Cr` matrix (`stateCharacter`, unavailable term/`J`/`<L^2>`, `<S^2>` vs unavailable on spherical ensemble, 110-pt Lebedev isotropy, `SO3` degeneracy `< 1e-11`, `C+` ion `tracePS=5`, `Cr 7S` vs direct `compas/sphf`), honest rejection checks, and Worker + `ExperimentRunner` + `MemoryExperimentStore` + JSON + 3D/2D grid pipeline.
- Preserved `16` `v0.6.1` suites (`126` tests): `stabilization.test.ts` (`14`), `hydrogenic.test.ts` (`26`), `sampler.test.ts` (`18`), `providers.test.ts` (`11`), `transitionsSpectroscopy.test.ts` (`10`), `elements.test.ts` (`9`), `diracProvider.test.ts` (`7`), `native_parity.test.ts` (`5`), `schrodingerProvider.test.ts` (`4`), `unitsAndRegistry.test.ts` (`4`), `atomic.test.ts` (`4`), `lifecycle.test.ts` (`4`), `quantum.test.ts` (`3`), `visualization.test.ts` (`3`), `diracFock.test.ts` (`3`), `v0.5Integration.test.ts` (`1`).

---

## 3. Browser E2E Scenarios Verified (`25 / 25` Passed)

- `tests/browser/core.spec.ts` (`5`), `tests/browser/responsive.spec.ts` (`1`), `tests/browser/science.spec.ts` (`7`), `tests/browser/laboratory.spec.ts` (`8`).
- `tests/browser/hartreeFock.spec.ts` (`4`):
  1. Live PySCF capabilities probe, explicit method/state taxonomy (`RHF (det)`, `AtomSphAvg (ensemble)`, unavailable `²ˢ⁺¹L` & `J`), `C` (`2S=2`) disabled-RHF enforcement, `UHF/cc-pVDZ` execution inside Worker -> Express -> `.venv` Python PySCF, anisotropic determinant label, 3D Workbench projection, Analysis 2D slice, and Experiment History replay (`loaded-from-store`).
  2. `AtomSphAvg` `N<2` guard on `H` plus live `AtomSphAvg/cc-pVDZ` spherical ensemble run on `C` verifying `spherical-ensemble-average`, `unavailable (spin-unpolarized spherical ensemble)`, and `spherical` isotropy.
  3. Mocked `503` `/api/hf/capabilities` offline check.
  4. Static/viewer `200 text/html` SPA fallback check confirming `backend offline` and disabled Run button.

---

## 4. Known Scientific & Environment Boundaries

1. **Software WebGL2 only in CI**: Headless Chromium uses ANGLE/SwiftShader.
2. **Linux x86_64 Verified Only**: Direct `compas/sphf` build (`gfortran 12.3.0`, `liblapack-dev`) and `scripts/setup_python_backend.sh` were tested on Ubuntu 22.04 `x86_64` (`Node 22.23.2`, `Python 3.11.2`). Windows/macOS were not tested in this environment.
3. **HF Physical & Basis Boundaries**: Nonrelativistic `point-infinite-mass` fixed nucleus only; `def2-*` capped at `Z <= 36` (ECPs excluded); `K (19)`/`Ca (20)` omitted in standard Dunning sets per BSE v1; term-resolved `^{2S+1}L`, `J`, `<L^2>`, electron correlation (`MP2`/`CCSD`), and relativistic multi-electron Dirac–Fock are **not implemented in `v0.7.0`**.
4. **Full Local Mode vs Static Mode**: Live multi-electron HF requires `.venv` / `ATOMS_PYTHON` (`PySCF 2.15.1` + `BSE 0.12`) served behind `server.ts`. Standalone static HTML reports `backend offline`.
