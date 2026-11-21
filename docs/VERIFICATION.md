# Verification Record (`ATOMS v0.6.1`)

Date: 2026-11-21 · Branch: `development/v0.6.1` (branched from immutable `v0.6.0` `e26d46b`; `v0.5.0` `47b84f8` preserved).

## 1. Commands Executed & Measured Results

| Command | Exit | Result Summary |
|---|---|---|
| `npm run data:build` (`python3 science/build_atomic_data.py`) | 0 | Verified SHA-256 of pinned NIST ASD & Lobato 2026 snapshots; generated `108` NIST + `118` Dirac–Fock JSON records (max relative charge error `1.991e-07`) |
| `npm run data:matrix` (`tsx scripts/generate_accuracy_matrix.ts`) | 0 | Generated 118-row coverage table in `docs/ACCURACY_MATRIX.md` |
| `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | 0 | Strict TypeScript clean (`0` errors) |
| `npm run lint` (`tsc --noEmit -p tsconfig.json`) | 0 | Clean syntax & type validation (`0` errors) |
| `npm run test:native` (`bash scripts/test_native.sh`) | 0 | Built `build-core-Debug` (`g++ -std=c++17 -O0 -g`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG`); both passed **340 checks (`failures=0`)** |
| `npm test` (`vitest run`) | 0 | **16 test files / 126 tests passed** (including C++↔TS parity on 1,020 vectors and 14 new `v0.6.1` scientific stabilization tests) |
| `npm run build` (`vite build`) | 0 | Single-file bundle `dist/index.html` (`1,873.69 kB` / `gzip: 502.02 kB`), inline Web Workers & pinned JSON datasets |
| `npm run test:browser` (`playwright test`) | 0 | **21 Playwright scenarios passed** across Chromium Headless + ANGLE/SwiftShader WebGL2 (`core`: 5, `responsive`: 1, `science`: 7, `laboratory`: 8) |

---

## 2. Unit, Stabilization & Integration Coverage (`126` Vitest Tests across `16` Files)

- `src/physics/__tests__/stabilization.test.ts` (`14` tests): All `m_l != 0` real & complex Schrödinger provider validations, `n=1..12` radial nodes, quadrature refinement convergence, Dirac $(n,j)$ degeneracy & $r^\gamma$ cusp log-slope, 2D spin-angular normalization/orthogonality, closed-form Gordon $1s\text{–}2p / 2s\text{–}3p / 2p\text{–}3d$, independent 2D spherical E1 quadrature, sublevel Einstein-$A$ sum rule, forbidden-rate zeroing, custom Brackett spectroscopy, CODATA-2018 consistency, 2D/3D symmetries, and Worker/IndexedDB/JSON safety.
- `src/physics/__tests__/hydrogenic.test.ts` (`26` tests), `diracProvider.test.ts` (`7` tests), `schrodingerProvider.test.ts` (`4` tests), `transitionsSpectroscopy.test.ts` (`10` tests), `visualization.test.ts` (`3` tests), `diracFock.test.ts` (`3` tests), `native_parity.test.ts` (`5` tests), `unitsAndRegistry.test.ts` (`4` tests).
- `src/sampling/__tests__/sampler.test.ts` (`18` tests), `src/data/__tests__/elements.test.ts` (`9` tests), `src/science/__tests__/providers.test.ts` (`11` tests), `src/domain/__tests__/` (`7` tests), `src/experiments/__tests__/` (`5` tests).

---

## 3. Browser E2E Scenarios Verified (`21 / 21` Passed)

- `tests/browser/core.spec.ts` (`5` tests), `tests/browser/responsive.spec.ts` (`1` test), `tests/browser/science.spec.ts` (`7` tests).
- `tests/browser/laboratory.spec.ts` (`8` tests): 8-workspace navigation & WebGL2 preservation, $\text{He}^+$ nuclear vs neutral mass & unsupported finite-nucleus UI, Dirac 4-spinor + 3D Marching Tetrahedra Worker extraction, E1 allowed/forbidden transitions + Worker history persistence, Balmer/Lyman NIST spectroscopy + Analysis slice, IndexedDB replay vs recompute + JSON bundle validation, mobile layout zero overflow, and `v0.6.1` custom spectroscopy `Lower n`, `m_l=+1` Worker `completed`, and Dirac `Analysis` expectation values.

---

## 4. Known Scientific & Environment Boundaries

1. **Software WebGL2 only in CI**: Headless Chromium uses ANGLE/SwiftShader rather than hardware GPU acceleration.
2. **One-Electron Analytical Solvers & Finite Nucleus**: Exact Schrödinger/Dirac engines cover $N=1$ point-Coulomb systems; multi-electron ions ($1 < N < Z$), anions ($N > Z$), and finite nuclear charge distributions (`finite-uniform`, `finite-fermi`) report `unsupported`.
3. **Subshell Orbitals Beyond Hydrogen & QED**: Multi-electron Dirac–Fock (`lobato2026-df`) and PySCF HF (`pyscf-hf`) provide total spherical $\rho(r)$ only; QED Lamb shift, Breit interaction, hyperfine splitting, and M1/E2 channels remain omitted.
4. **NIST ASD `Z = 109..118`**: Ground terms and 1st ionization energies remain `null` / `unavailable`.
