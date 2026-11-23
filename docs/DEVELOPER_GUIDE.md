# ATOMS v0.7.0 — Developer Guide

---

## 1. Architecture & Layer Rules

- **Strict Layer Isolation**: `src/domain/`, `src/physics/`, `src/science/`, `src/experiments/`, `src/workers/`, `src/numerics/`, and `src/sampling/` (outside `__tests__`) never import `react`, DOM globals (outside worker/IndexedDB storage boundaries), `three`, or Node built-ins (`node:*`).
- **Two-Stage Execution + Local Computational Bridge**:
  - Real-time 3D visualization fields & point clouds execute off-thread in `sampler.worker.ts` and `visualization.worker.ts` with `Transferable` `Float32Array` buffers and monotonic request IDs.
  - Auditable scientific calculations execute asynchronously via `ExperimentRunner` -> `ExperimentWorkerClient` -> `experiment.worker.ts` (with `AbortSignal` cancellation and `assertStructuredCloneSafe` validation). Live multi-electron HF experiments call `POST /api/hf/calculate` (hosted by `server.ts`) via blob-origin-safe `HFTransport`.

---

## 2. Execution Modes, Python Backend & Build Commands

- **Full Local Scientific Mode (`tsx server.ts` / `node server.ts`)**: Express 5 binds to **`127.0.0.1` by default** (use `--host 0.0.0.0` or `ATOMS_HOST=0.0.0.0` only for managed container previews), validates Host/Origin headers on `/api/hf/*` (`403 FORBIDDEN_ORIGIN` on cross-origin requests), invokes `.venv/bin/python science/hf_backend.py`, reports `EADDRINUSE` owning socket details without killing unrelated processes, and cleans up child processes + Vite cleanly on `SIGINT`/`SIGTERM`.
- **Static / Viewer Mode (`vite preview` or standalone `dist/index.html`)**: Serves UI/1-e/dataset views only; `/api/hf/capabilities` returns non-JSON or unavailable status and live HF submission stays disabled cleanly.

Verified on Linux (`x86_64`, Node `22.23.2`, Python `3.11.2`):

```bash
# Verify Node (>=20), Python (>=3.10), Express, create .venv/, install pinned deps, & run He smoke test
bash scripts/setup_python_backend.sh

npm ci                  # Install Node dependencies cleanly
npm run dev             # Express 5 + Vite middleware + PySCF API on http://127.0.0.1:3000
npm run data:build      # Verify SHA-256 hashes & build NIST/Lobato JSON tables
npm run data:matrix     # Regenerate docs/ACCURACY_MATRIX.md
npm run typecheck       # Strict TypeScript compiler check (tsc --noEmit)
npm run lint            # TypeScript syntax/type validation
npm run test:native     # Compile Debug & Release C++17 native core (340 checks each)
npm test                # Run full Vitest suite (incl. live PySCF & C++ parity)
npm run build           # Production Vite singlefile + inline Worker build (dist/index.html)
npm start               # Production Express server serving dist/ + /api/hf/* on http://127.0.0.1:3000
npm run test:browser    # Run Playwright full-stack Chromium + WebGL2 + PySCF tests
```

---

## 3. Repository & Git Release Delivery (`development/v0.7.0`)

Note: Container snapshots operate without a `.git` repository directory. When working in a cloned Git repository with historical baselines intact (`v0.5.0` `47b84f8`, `v0.6.0` `e26d46b`, `v0.6.1` `bfc0d6a91b2ca5a88ace754bcf85551e5ffa5690`):

```bash
git checkout -b development/v0.7.0 v0.6.1
# verify build & tests cleanly
npm run typecheck && npm run test:native && npm test && npm run build && npm run test:browser
git add -A && git commit -m "Release ATOMS v0.7.0: Multi-Electron Hartree-Fock Laboratory"
git tag -a v0.7.0 -m "ATOMS v0.7.0 — Multi-Electron Atomic Structure"
```

Never force-push or rewrite prior `v0.5.0`, `v0.6.0`, or `v0.6.1` tags/branches.

---

## 4. Extending Physics Providers cleanly

1. Implement `PhysicsProvider<AtomicSystem, QuantumState, TInput, CalculationResult<TOutput>>` in `src/physics/providers/`.
2. Enforce exact system/nuclear/quantum validity inside `supports(system, state)` (never silently downgrade unsupported models or apply 1-e approximations to N-electron systems).
3. Register the provider in `createDefaultProviderRegistry()` (`src/physics/providers/registry.ts`).
4. Add unit, numerical convergence, domain-rejection, Worker/IndexedDB, and Playwright integration tests before wiring UI controls.
