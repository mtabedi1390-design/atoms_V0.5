# ATOMS v0.6.0 — Developer Guide

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
npm test                # Run full Vitest suite (15 files, 112 tests, incl. C++ parity)
npm run build           # Production Vite singlefile + inline Worker build (dist/index.html)
npm run test:browser    # Run Playwright WebGL2 & Laboratory end-to-end tests (20 tests)
npm run bench           # CPU microbenchmarks + Chromium SwiftShader benchmark -> docs/BENCHMARK.md
```

---

## 3. Repository & Git Branching Note (`development/v0.6.0`)

Because this workspace container was provisioned from an imported copy without a `.git` metadata directory or GitHub push credentials, all edits reside cleanly in the workspace tree. On a local clone of `mtabedi1390-design/atoms` with Git initialized, finalize the release branch via:

```bash
git checkout -b development/v0.6.0
git status
git add -A
git commit -m "feat(v0.6.0): General Atomic Quantum Laboratory — domain, Dirac/Schrodinger engines, E1 spectroscopy, Worker experiments, 3D isosurfaces, and docs"
git push -u origin development/v0.6.0
```

---

## 4. Extending Physics Providers cleanly

1. Implement `PhysicsProvider<AtomicSystem, QuantumState, TInput, CalculationResult<TOutput>>` in `src/physics/providers/`.
2. Enforce exact system/nuclear/quantum validity inside `supports(system, state)` (never silently downgrade unsupported models).
3. Register the provider in `createDefaultProviderRegistry()` (`src/physics/providers/registry.ts`).
4. Add unit, numerical convergence, domain-rejection, and `Worker` integration tests before wiring UI controls.
