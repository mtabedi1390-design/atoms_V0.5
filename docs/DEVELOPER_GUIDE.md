# ATOMS v0.6.1 — Developer Guide

---

## 1. Architecture & Layer Rules

- **Strict Layer Isolation**: `src/domain/`, `src/physics/`, `src/science/`, `src/experiments/`, `src/workers/`, and `src/numerics/` never import `react`, DOM globals (outside worker/IndexedDB storage boundaries), or `three`.
- **Two-Stage Execution**:
  - Real-time 3D visualization fields & point clouds execute off-thread in `sampler.worker.ts` and `visualization.worker.ts` with `Transferable` `Float32Array` buffers and monotonic request IDs (eliminating stale-frame races).
  - Auditable scientific calculations execute asynchronously via `ExperimentRunner` -> `ExperimentWorkerClient` -> `experiment.worker.ts` (with `AbortSignal` cancellation and `assertStructuredCloneSafe` validation).

---

## 2. Commands & Build Workflow

```bash
npm ci                  # Install dependencies cleanly
npm run data:build      # Verify SHA-256 hashes & build NIST/Lobato JSON tables
npm run data:matrix     # Regenerate docs/ACCURACY_MATRIX.md
npm run typecheck       # Strict TypeScript compiler check (tsc --noEmit)
npm run lint            # TypeScript syntax/type validation
npm run test:native     # Compile Debug & Release C++17 native core (340 checks each)
npm test                # Run full Vitest suite (16 files, 126 tests, incl. C++ parity)
npm run build           # Production Vite singlefile + inline Worker build (dist/index.html)
npm run test:browser    # Run Playwright WebGL2 & Laboratory end-to-end tests (21 tests)
npm run bench           # CPU microbenchmarks + Chromium SwiftShader benchmark -> docs/BENCHMARK.md
```

---

## 3. Repository & Git Release Workflow (`development/v0.6.1`)

Version control preserves prior releases immutably while developing `v0.6.1` on its own branch:

- **`v0.5.0` (`release/v0.5.0`, commit `47b84f8`)**: Immutable `v0.5.0` baseline (annotated tag `v0.5.0`).
- **`v0.6.0` (`development/v0.6.0`, commit `e26d46b`)**: Immutable `v0.6.0` baseline (annotated tag `v0.6.0`).
- **`development/v0.6.1`**: Dedicated stabilization branch for `ATOMS v0.6.1` and release tag `v0.6.1`.

```bash
npm run build && npm run release:pack   # Verify production build and write releases/v0.6.1/ artifacts + SHA256SUMS.txt
git push origin development/v0.6.1 v0.6.1 development/v0.6.0 v0.6.0 v0.5.0 release/v0.5.0
```

---

## 4. Extending Physics Providers cleanly

1. Implement `PhysicsProvider<AtomicSystem, QuantumState, TInput, CalculationResult<TOutput>>` in `src/physics/providers/`.
2. Enforce exact system/nuclear/quantum validity inside `supports(system, state)` (never silently downgrade unsupported models).
3. Register the provider in `createDefaultProviderRegistry()` (`src/physics/providers/registry.ts`).
4. Add unit, numerical convergence, domain-rejection, and `Worker` integration tests before wiring UI controls.
