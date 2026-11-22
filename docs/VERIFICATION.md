# Verification Record (`ATOMS v0.7.0`)

Date: 2026-11-22 · Baseline: `ATOMS v0.6.1` (`bfc0d6a91b2ca5a88ace754bcf85551e5ffa5690`). Container workspace has no `.git` directory.

## 1. Commands Executed & Measured Results

| Command | Exit | Result Summary |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | 0 | Strict TypeScript clean (`0` errors) |
| `npm run lint` (`tsc --noEmit -p tsconfig.json`) | 0 | Clean syntax & type validation (`0` errors) |
| `npm run test:native` (`bash scripts/test_native.sh`) | 0 | Built `build-core-Debug` (`g++ -std=c++17 -O0 -g`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG`); both passed **340 checks (`failures=0`)** |
| `npm test` (`vitest run`) | 0 | **17 test files / 133 tests passed** (126 `v0.6.1` regression + C++ parity tests + 7 live PySCF/BSE/Experiment tests) |
| `npm run build` (`vite build`) | 0 | Single-file bundle `dist/index.html` (`~1.98 MB`), inline Web Workers & pinned JSON datasets |
| `npm run test:browser` (`playwright test`) | 0 | **23 Playwright scenarios passed** via `NODE_ENV=production PORT=4173 node server.ts` (`core`: 5, `responsive`: 1, `science`: 7, `laboratory`: 8, `hartreeFock`: 2) |

---

## 2. Unit, Stabilization, & Live HF Coverage (`133` Vitest Tests across `17` Files)

- `src/physics/__tests__/hartreeFock.test.ts` (`7` tests): 1-electron analytical `-Z²/2` convergence & `J+K=0` (`H`, `He+`), closed-shell RHF convergence (`He`, `Be`, `Ne`), open-shell `UHF`/`ROHF`/`AtomSphAverageRHF` (`Li`, `C`, `N`, `F`) including `ROHF` `<Fa>`/`<Fb>` diagnostics, honest rejection of unconverged `maxCycle=1` / invalid spin / finite nucleus / missing basis elements (`K`, `Ca`, `Rb`), and Worker + `ExperimentRunner` + `MemoryExperimentStore` + JSON + 3D/2D grid pipeline.
- Preserved `16` `v0.6.1` suites (`126` tests): `stabilization.test.ts` (`14`), `hydrogenic.test.ts` (`26`), `sampler.test.ts` (`18`), `providers.test.ts` (`11`), `transitionsSpectroscopy.test.ts` (`10`), `elements.test.ts` (`9`), `diracProvider.test.ts` (`7`), `native_parity.test.ts` (`5`), `schrodingerProvider.test.ts` (`4`), `unitsAndRegistry.test.ts` (`4`), `atomic.test.ts` (`4`), `lifecycle.test.ts` (`4`), `quantum.test.ts` (`3`), `visualization.test.ts` (`3`), `diracFock.test.ts` (`3`), `v0.5Integration.test.ts` (`1`).

---

## 3. Browser E2E Scenarios Verified (`23 / 23` Passed)

- `tests/browser/core.spec.ts` (`5`), `tests/browser/responsive.spec.ts` (`1`), `tests/browser/science.spec.ts` (`7`), `tests/browser/laboratory.spec.ts` (`8`).
- `tests/browser/hartreeFock.spec.ts` (`2`):
  1. Live PySCF capabilities probe, `C` (`2S=2`) disabled-RHF enforcement, `UHF/cc-pVDZ` execution inside Web Worker -> Express -> `.venv` Python PySCF, orbital/SCF/Lebedev radial verification, 3D Marching Tetrahedra Workbench overlay projection, Analysis 2D slice integration, and IndexedDB replay distinction (`loaded-from-store`).
  2. Mocked `503` `/api/hf/capabilities` check confirming honest `backend offline` reporting with zero fabricated results.

---

## 4. Known Scientific & Environment Boundaries

1. **Software WebGL2 only in CI**: Headless Chromium uses ANGLE/SwiftShader.
2. **Container Build Tools**: `g++` 12.2.0 is installed; `cmake`, `gfortran`, and `.git` metadata are absent in this container (`compas/sphf` benchmark values use pinned upstream `MIT` outputs rather than local Fortran compilation).
3. **HF Physical & Basis Boundaries**: Nonrelativistic `point-infinite-mass` fixed nucleus only; `def2-*` capped at `Z <= 36` (ECPs excluded); `K (19)`/`Ca (20)` omitted in standard Dunning sets per BSE v1; electron correlation (`MP2`/`CCSD`) and relativistic multi-electron Dirac–Fock deferred to `v0.7.1`/`v0.8.0`.
4. **Local Python Runtime**: Multi-electron HF calculations require `.venv` / `/opt/atoms-py` / `ATOMS_PYTHON` (`PySCF 2.15.1` + `BSE 0.12`).
