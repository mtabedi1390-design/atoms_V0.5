# Verification Record (`ATOMS v0.7.1`)

Date: 2026-11-23 · Baseline: `ATOMS v0.7.0`. Container workspace has no `.git` directory.

## 1. Commands Executed & Measured Results

| Command | Exit | Result Summary |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | 0 | Strict TypeScript clean (`0` errors) |
| `npm run lint` (`tsc --noEmit -p tsconfig.json`) | 0 | Clean syntax & type validation (`0` errors) |
| `npm run test:native` (`bash scripts/test_native.sh`) | 0 | Built `build-core-Debug` (`g++ -std=c++17 -O0 -g`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG`); both passed **340 checks (`failures=0`)** |
| `npm test` (`vitest run`) | 0 | **18 test files / 141 tests passed** (134 `v0.5`–`v0.7.0` regression + C++ parity + live PySCF HF tests + 7 LS-Term / Fixed-Orbital LS-CI validation tests) |
| `npm run build` (`vite build`) | 0 | Single-file bundle `dist/index.html` (`~2.12 MB`), inline Web Workers & pinned JSON datasets |
| `npm run test:browser` (`playwright test`) | 0 | **27 Playwright scenarios passed** via `NODE_ENV=production PORT=4173 node server.ts` (`core`: 5, `responsive`: 1, `science`: 7, `laboratory`: 8, `hartreeFock`: 4, `atomicTerms`: 2) |
| Production Express Server Smoke Check | 0 | Verified `NODE_ENV=production ATOMS_HOST=0.0.0.0 PORT=3005 node server.ts`: HTTP 200 on `/api/hf/capabilities`, `/api/ls/capabilities`, and live `POST /api/ls/calculate` (`C 3P val-cas`) |
| Docker CLI Build Check | N/A (`BLOCKED`) | `docker` binary is not installed inside this container runtime (`which docker` empty); `Dockerfile` and `.dockerignore` verified by inspection |

---

## 2. Unit, Stabilization, Live HF, & LS-CI Coverage (`141` Vitest Tests across `18` Files)

- `src/physics/__tests__/lsTermCi.test.ts` (`7` tests): Configuration parser & Pauli checks; exact equivalent-electron terms (`s, p^2, p^3, p^4, d^2, d^3` with seniority $v=1,3$, `d^5`); multi-shell Clebsch–Gordan coupling (`2p1 3p1`, `2p2 3d1` even parity) & `wigner3j` CG spot checks; honest gating (`N=1`, `Z=31`, `K=19`); live capabilities (`orbitalOptimizationSupported: false`) & offline transport fallback; live PySCF + exact `(L^2, S^2, Π)` CSF matching `pyscf.fci` identically on `He`, `Be`, `C` multiplets (`3P < 1D < 1S`), `N` odd multiplets (`4So < 2Do < 2Po`), `O`, `Si`, and `V2+ 3d3` repeated `2D` roots; full `ExperimentRunner` + `Worker` + `MemoryExperimentStore` replay/recompute.
- Preserved `17` `v0.7.0` & `v0.6.1` suites (`134` tests): `hartreeFock.test.ts` (`8`), `stabilization.test.ts` (`14`), `hydrogenic.test.ts` (`26`), `sampler.test.ts` (`18`), `providers.test.ts` (`11`), `transitionsSpectroscopy.test.ts` (`10`), `elements.test.ts` (`9`), `diracProvider.test.ts` (`7`), `native_parity.test.ts` (`5`), `schrodingerProvider.test.ts` (`4`), `unitsAndRegistry.test.ts` (`4`), `atomic.test.ts` (`4`), `lifecycle.test.ts` (`4`), `quantum.test.ts` (`3`), `visualization.test.ts` (`3`), `diracFock.test.ts` (`3`), `v0.5Integration.test.ts` (`1`).

---

## 3. Browser E2E Scenarios Verified (`27 / 27` Passed)

- `tests/browser/core.spec.ts` (`5`), `tests/browser/responsive.spec.ts` (`1`), `tests/browser/science.spec.ts` (`7`), `tests/browser/laboratory.spec.ts` (`8`), `tests/browser/hartreeFock.spec.ts` (`4`).
- `tests/browser/atomicTerms.spec.ts` (`2`):
  1. Navigates to `Atomic Terms & CI`, verifies active backend + `METHOD: FIXED-ORBITAL LS-COUPLED CI` + `NOT performed` MCHF disclosure, selects Nitrogen `2p3` odd terms (`⁴S°`, `²D°`, `²P°`), confirms Hydrogen `N=1` gating (`N >= 2`, disabled Run button), runs live Carbon `³P` `valence-cas` through Web Worker -> `/api/ls/calculate` -> PySCF/CSF CI (`-37.678115 Ha`, `pure-ls-eigenstate`, `Matched PySCF determinant FCI`), and replays from IndexedDB in `Experiment History` (`source: loaded-from-store`) with zero console/page errors.
  2. Intercepts `/api/ls/capabilities` with `200 text/html` static fallback and verifies `Offline / Unavailable` + disabled Run button.

---

## 4. Known Scientific & Environment Boundaries

1. **Software WebGL2 only in CI**: Headless Chromium uses ANGLE/SwiftShader.
2. **MCHF Orbital Optimization & Spin–Orbit Not Implemented in `v0.7.1`**: LS-CI uses fixed `AtomSphAverageRHF` radial orbitals (`orbitalOptimizationSupported: false`); allowed `J` ranges are unsplit Russell–Saunders labels only; dynamical correlation (`MP2`/`CCSD`) outside the CI active space and relativistic MCDHF (`GRASP2018`/`Datatoms`) are not implemented.
3. **LS-CI Domain Limits**: Restricted to `Z = 1..30`, `N >= 2`, all-electron BSE v1 bases (`K=19`/`Ca=20` omitted in standard Dunning sets), and pre-allocation safety caps (`12,000` determinants, `2,500` CSFs).
4. **Full Local Mode vs Static Mode**: Live HF and LS-CI execution require `.venv` / `ATOMS_PYTHON` (`PySCF 2.15.1` + `BSE 0.12`) served behind `server.ts`. Standalone static HTML reports `backend offline` honestly.
