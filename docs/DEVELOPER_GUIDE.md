# ATOMS v0.5.0 — Developer Guide

## 1. Repository Structure

```
data/sources/               Pinned upstream scientific snapshots + SHA-256 MANIFEST.json
science/
  build_atomic_data.py      Pure-Python SHA-256 verifier + JSON builder (NIST ASD + Lobato 2026)
  hf_export.py              Offline PySCF RHF/ROHF density exporter
native/
  quantum_core.hpp          Header-only C++17 reference physics core (zero OpenGL dependency)
  tests/                    quantum_core_test.cpp (340 checks) & reference_dump.cpp (1020 vectors)
scripts/
  test_native.sh            Debug + Release native build & test (CMake or g++ fallback)
  generate_accuracy_matrix.ts  Generates docs/ACCURACY_MATRIX.md from src/science/coverageMatrix.ts
  benchmark.mjs             Headless Chromium benchmark runner (writes docs/BENCHMARK.md)
src/
  data/                     elements.ts, sources.ts, nist/asd_ground_levels.json, df/lobato2026.json, hf/*.json
  physics/                  hydrogenic.ts, diracFock.ts, density.ts, current.ts, models.ts, special.ts, constants.ts
  science/                  providers.ts, coverageMatrix.ts
  sampling/                 sampler.ts, client.ts, sampler.worker.ts, protocol.ts
  render/                   OrbitalScene.ts, shaders.ts
  state/                    appState.ts
  components/               ControlRail, TelemetryBar, RadialPlot, EnergyDiagram, Inspector, PeriodicTable, ui
tests/browser/              Playwright E2E tests (core.spec.ts, science.spec.ts, responsive.spec.ts)
```

---

## 2. Rebuilding Scientific Data & Matrix

1. Regenerate normalized JSON tables from `data/sources/`:
   ```bash
   npm run data:build
   ```
   This verifies SHA-256 checksums in `data/sources/MANIFEST.json`, validates non-negativity and radial charge integrals (`max relative error < 1e-6`), and writes `src/data/nist/asd_ground_levels.json` and `src/data/df/lobato2026.json`.
2. Regenerate the 118-element Markdown accuracy matrix:
   ```bash
   npm run data:matrix
   ```

---

## 3. C++ ↔ TypeScript Reference Parity

- `native/quantum_core.hpp` mirrors the exact hydrogenic radial/angular functions, energies, $\langle r \rangle$, and azimuthal probability current $\mathbf{j}$ in `src/physics/`.
- Run `npm run test:native` to build both `build-core-Debug` (`-O0 -g`) and `build-core-Release` (`-O2 -DNDEBUG`) and execute the 340 always-active `CHECK` assertions.
- Whenever `build-core-Release/quantum_reference_dump` or `build-core-Debug/quantum_reference_dump` exists, `npm test` automatically executes all 5 tests in `src/physics/__tests__/native_parity.test.ts` across 1,020 vectors (`R`, `RZ`, `E`, `mean`, `Y`, `J`).

---

## 4. Verification Checklist Before Release

```bash
npm run data:build
npm run data:matrix
npm run typecheck
npm run test:native
npm test
npm run build
npm run test:browser
```

- WebGL2 tests use SwiftShader software rasterisation inside headless CI (`playwright.config.ts`). For real GPU performance measurements, run `ATOMS_BENCH_GPU=hardware npm run bench` on a workstation with hardware acceleration.
- Adding a new scientific provider must go through `src/science/providers.ts` and `src/science/coverageMatrix.ts` with explicit `EvidenceClass`, `EngineMetadata`, runtime validation checks, and concrete unavailability blockers when data or tools are missing.
