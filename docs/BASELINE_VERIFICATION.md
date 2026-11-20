# ATOMS v0.6.0 — Phase 0 Baseline Verification Record

**Captured:** 2026-11-20  
**Workspace:** `/app/applet` (`v0.5.0` pre-v0.6.0 baseline)  
**Git Status:** `fatal: not a git repository (or any of the parent directories): .git`

---

## 1. Executed Baseline Commands & Exact Results

| Command | Exit | Exact Output Summary |
|---|---|---|
| `npm run data:build` | `0` | Verified SHA-256 checksums in `data/sources/MANIFEST.json`; generated `src/data/nist/asd_ground_levels.json` (`108` records) and `src/data/df/lobato2026.json` (`118` records, `86037` bytes; max relative charge error `1.991e-07`) |
| `npm run data:matrix` | `0` | Generated `docs/ACCURACY_MATRIX.md` (`118` rows) |
| `npm run typecheck` | `0` | `tsc --noEmit -p tsconfig.json` — zero errors |
| `npm run test:native` | `0` | `cmake` absent; fallback built `build-core-Debug` (`g++ -std=c++17 -O0 -g -Wall -Wextra`) and `build-core-Release` (`g++ -std=c++17 -O2 -DNDEBUG -Wall -Wextra`). Both passed **`checks=340 failures=0`** (`quantum_core_test: all checks passed`) |
| `npm test` | `0` | **6 test files / 72 tests passed** (`8.30s` total; `native_parity.test.ts` used `/app/applet/build-core-Release/quantum_reference_dump` across all `1,020` parity vectors):<br>- `providers.test.ts` (`11`)<br>- `elements.test.ts` (`9`)<br>- `native_parity.test.ts` (`5`)<br>- `diracFock.test.ts` (`3`)<br>- `sampler.test.ts` (`18`)<br>- `hydrogenic.test.ts` (`26`) |
| `npm run build` | `0` | Vite `7.3.7`: `64` modules transformed; single-file `dist/index.html` **`1,280.64 kB`** (`gzip: 350.01 kB`) built in `4.80s` |
| `npm run test:browser` | `0` | Playwright (`1 worker`, Chromium Headless `155` with ANGLE/SwiftShader): **13 / 13 tests passed** (`1.2m`):<br>- `core.spec.ts` (`5`)<br>- `responsive.spec.ts` (`1`)<br>- `science.spec.ts` (`7`) |

---

## 2. Missing Dependencies / Unavailable Tools Recorded

- **Git / GitHub credentials:** Unavailable in AI Studio container; local git commands supplied for external integration.
- **CMake / CTest:** Not installed; native tests verified via `g++ 12.2.0` C++17 Debug and Release builds.
- **Python Scientific Stack (`numpy`, `scipy`, `pyscf`, `requests`, `sympy`, `matplotlib`):** Not installed; Python 3.11.2 stdlib only. Pre-generated PySCF HF datasets (`src/data/hf/*.json`) are preserved as static assets.
- **Hardware GPU / WebGPU:** Unavailable; browser tests and benchmarks execute on CPU ANGLE/SwiftShader.
- **GRASP2018 & Native GLFW/GLEW Desktop Viewers:** Unavailable; registered honestly with blockers.

---

## 3. Baseline Status Conclusion

The `ATOMS v0.5.0` codebase is **clean, type-safe, test-passing (`72` Vitest + `340×2` C++ + `13` Playwright), and reproducible** as the freeze point for Phase 1. Zero production physics or UI modules were altered during Phase 0.
