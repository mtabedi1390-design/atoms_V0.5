# Verification Record (`ATOMS v0.5.0`)

Date: 2026-11-20 · Environment: `/app/applet` (imported workspace copy of `mtabedi1390-design/atoms`, no `.git` metadata present).

## 1. Commands Executed & Measured Results

| Command | Exit | Result Summary |
|---|---|---|
| `npm run data:build` (`python3 science/build_atomic_data.py`) | 0 | Verified SHA-256 of pinned NIST ASD & Lobato 2026 snapshots; generated `src/data/nist/asd_ground_levels.json` (`108` records) and `src/data/df/lobato2026.json` (`118` records, `86,037` bytes, max relative charge error `1.991e-07`) |
| `npm run data:matrix` (`tsx scripts/generate_accuracy_matrix.ts`) | 0 | Generated 118-row coverage table in `docs/ACCURACY_MATRIX.md` |
| `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) | 0 | Strict TypeScript clean (`noUnusedLocals`, `noUnusedParameters`, `resolveJsonModule`) |
| `npm run test:native` (`bash scripts/test_native.sh`) | 0 | Built `build-core-Debug` (`g++ -std=c++17 -O0 -g`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG`); both passed **340 always-active checks (`failures=0`)** |
| `npm test` (`vitest run`) | 0 | **6 test files / 72 tests passed** (including all **5 C++↔TS parity tests** executed against `build-core-Release/quantum_reference_dump`) |
| `npm run build` (`vite build`) | 0 | Single-file bundle `dist/index.html` **`1,280.64 kB`** (`gzip: 350.01 kB`), worker & pinned JSON datasets inlined |
| `npm run test:browser` (`playwright test`) | 0 | **13 Playwright scenarios passed** (`1.2m`, Chromium Headless 155 with ANGLE/SwiftShader) |
| `npm run bench` (`node scripts/benchmark.mjs`) | 0 | Generated `docs/BENCHMARK.md` across 7 workloads (`25,000–300,000` points, ANGLE/SwiftShader software rendering) |

---

## 2. Unit & Integration Test Coverage (`72` Vitest Tests)

- `src/physics/__tests__/hydrogenic.test.ts` (`26` tests): Special functions, radial normalization, analytic $\langle r \rangle$, node locations, angular normalization/orthogonality, Condon–Shortley sign, probability current analytic vs numeric gradient, tail control ($\le 10^{-8}$ up to `n=20, l=19`), and full-atom $R^2/(4\pi)$ configuration-average normalization.
- `src/physics/__tests__/diracFock.test.ts` (`3` tests): Positivity, finite $\langle r \rangle$, relativistic core compression (`Z=79, 92` vs `Z=1`), and trapezoid charge conservation $\int_0^\infty 4\pi r^2\rho(r)\,dr \approx Z$ (`< 1e-3` grid error) across **all 118 elements** (`Z = 1..118`).
- `src/physics/__tests__/native_parity.test.ts` (`5` tests): Cross-implementation parity against `build-core-Release/quantum_reference_dump` on **1,020 reference vectors** (`R`, `RZ`, `E`, `mean`, `Y`, `J`).
- `src/sampling/__tests__/sampler.test.ts` (`18` tests): Seeded `xoshiro128**`, KS tests ($\alpha = 0.001$) for radial, polar ($\sin\theta$ Jacobian), complex/real azimuthal, PySCF HF tabulated density (`Z=10`), Lobato 2026 Dirac–Fock tabulated density (`Z=79`, `Z=118`), cache-key invalidation, occupancy scaling, and electron-count mismatch rejection.
- `src/data/__tests__/elements.test.ts` (`9` tests): 118-element uniqueness, Aufbau exceptions, Pauli capacity, cross-check of all 108 `asd_ground_levels.json` records (configurations, `groundTerm`, `groundJ`, IE), open-shell flags, `Z = 104..108` `predicted` IEs, `Z = 109..118` `null`/`unavailable` enforcement, and `Slater Z_eff` textbook values.
- `src/science/__tests__/providers.test.ts` (`11` tests): PySCF HF validation/variationality checks, `lobatoDFProvider` quantitative/relativistic selection across `Z = 1..118`, `datatoms-2026-mcdf` (`1 <= N <= 10` blocker) and `grasp-mcdhf` (`GRASP2018 is not installed` blocker) refusals, and 118-row `COVERAGE_MATRIX` checks.

---

## 3. Native C++ Verification Environment

- `g++ 12.2.0` (`-std=c++17`), CMake absent in container so `scripts/test_native.sh` fell back to direct `g++` Debug (`-O0 -g -Wall -Wextra`) and Release (`-O2 -DNDEBUG -Wall -Wextra`) builds.
- `ATOMS_BUILD_NATIVE_VIEWERS=OFF`: Legacy upstream GLFW/OpenGL desktop viewers remain unbuilt (absent from snapshot; see `native/upstream/README.md`).

---

## 4. Browser Scenarios Verified (`13 / 13` Passed)

- `tests/browser/core.spec.ts` (`5` tests): Default `1s` Hydrogen boot + WebGL2 + zero console/page errors; 118-element search + arrow-key navigation; complex basis negative-`m` sampling; `XY/XZ/YZ` slab slicing + offsets; rapid element switching without stale results.
- `tests/browser/responsive.spec.ts` (`1` test): `390×844` mobile layout drawers and zero horizontal overflow (`scrollWidth - innerWidth <= 1`).
- `tests/browser/science.spec.ts` (`7` tests): Default Lobato 2026 Dirac–Fock across `C` (`Z=6`) and superheavy `Og` (`Z=118`, `unavailable` IE/term, coverage matrix); selectable PySCF HF (`Ne`) + Inspector validation; honest `Fe` (`Z=26`) DF coverage + disabled HF + Datatoms/GRASP blockers; Slater subshells (`?z=10&mode=atom&source=model`) functional visibility/opacity controls; Energy Diagram separation (`NIST IE` vs `PySCF total HF E`); honest zero-current message; WebGL2 fallback retaining analytical panels.

---

## 5. Known Remaining Scientific & Environment Boundaries

1. **No `.git` / GitHub remote in workspace**: Workspace copy verified locally; Git branch/commit/PR commands are provided for local repo application.
2. **Software WebGL2 only in CI**: `docs/BENCHMARK.md` reflects headless Chromium ANGLE/SwiftShader (`19 fps` @ 25k pts down to `2–3 fps` @ 300k pts) and is **not** hardware GPU performance.
3. **Subshell orbitals & fine structure beyond Hydrogen**: Neutral multi-electron Dirac–Fock (`lobato2026-df`) and PySCF (`pyscf-hf`) provide total spherical $\rho(r)$ only; individual relativistic $R_{nlj}(r)$ subshells and spin–orbit splittings require GRASP2018 (unavailable).
4. **NIST ASD `Z = 109..118`**: Ground terms and 1st ionization energies remain `null` / `unavailable` rather than extrapolated without a pinned authoritative source.
