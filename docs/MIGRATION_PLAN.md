# ATOMS v0.6.0 — Minimal Incremental Migration Plan

This plan defines the exact, minimal-change migration path from the verified `v0.5.0` codebase to `v0.6.0` across Phases 1–7, preserving every `v0.5.0` feature and test suite at every step.

---

## Module Disposition & Migration Map

| Existing `v0.5.0` Module | Disposition in `v0.6.0` | Target Relationship |
|---|---|---|
| `src/physics/constants.ts` | **Preserve & wrap** | Re-exported and extended by `src/physics/constants/units.ts` (`CODATA_2018` kept verbatim for parity) |
| `src/physics/special.ts` | **Preserve & extend** | Shared by `hydrogenic.ts`, new `dirac/` radial solver, and new `numerics/specialFunctions/` (Wigner 3-$j$/6-$j$) |
| `src/physics/hydrogenic.ts` | **Preserve & delegate** | Used directly by `SchrodingerCoulombProvider` (adding consistent reduced-mass `a = m_e/mu` and E1 integrals) |
| `src/physics/diracFock.ts` | **Preserve intact** | Wrapped by `src/physics/providers/diracFock/` adapter (total spherical neutral density only) |
| `src/physics/models.ts`, `density.ts`, `current.ts` | **Preserve intact** | Re-exported by `slater/` and `schrodinger/` providers |
| `src/data/*`, `data/sources/*`, `science/*` | **Preserve intact** | Consumed by `AtomicSpecies` builder; augmented with pinned NIST Hydrogen reference lines for spectroscopy checks |
| `src/science/providers.ts`, `coverageMatrix.ts` | **Preserve & adapt** | Bridged into the new v0.6 `ProviderRegistry` so all 5 existing providers + `coverageMatrix` tests stay intact |
| `src/sampling/*` | **Preserve & extend** | Add spinor/isosurface grid workers (`src/workers/`) alongside `sampler.worker.ts` without breaking existing `SamplerClient` |
| `src/render/OrbitalScene.ts`, `shaders.ts` | **Preserve & extend** | Add optional `setIsosurfaceMesh(...)` and Dirac component display attributes without altering existing `Points` uniforms |
| `src/state/appState.ts` | **Extend incrementally** | Keep URL deep-links (`?z=&mode=&source=&samples=&adaptive=`) and existing `AppState` keys; layer `LaboratoryWorkspace` + active `AtomicSystem` / `QuantumState` / `ExperimentStore` |
| `src/components/*`, `src/App.tsx` | **Evolve incrementally** | Migrate `RadialPlot`, `EnergyDiagram`, `Inspector`, `TelemetryBar`, `ControlRail` into **ATOMS Laboratory** 8-workspace layout, decoupling render from direct physics computation |
| `native/*` | **Preserve intact** | Keep 340 C++ checks + 1,020 TS↔C++ parity vectors passing at every phase |

---

## Phase-by-Phase Execution Roadmap

### Phase 1 — General Atomic Domain, Quantum States, Units, & Provider Contracts
- **New modules:** `src/domain/atomic/`, `src/domain/quantum/`, `src/domain/observables/`, `src/physics/constants/units.ts`, `src/physics/providers/contracts.ts`, `src/physics/providers/registry.ts`.
- **Bridge:** Register existing `v0.5` providers (`lobato2026-df`, `pyscf-hf`, `browser-slater`, `datatoms-2026-mcdf`, `grasp-mcdhf`) via non-breaking adapters.
- **Verification Gate:** Unit tests covering `q = Z - N`, negative ions (`H-`, `O-`), isotopes, NR vs Dirac `(n, kappa, j, m_j)` bijection, unit conversions, and capability-gated `supports()` checks. Zero React/Three imports in `domain/` & `physics/`.

### Phase 2 — Experiment Platform & Persistence
- **New modules:** `src/experiments/{schema,registry,validation,execution,persistence,results}/`, `src/workers/` client wrapper.
- **Capabilities:** Lifecycle state machine (`queued`, `running`, `completed`, `failed`, `cancelled`, `unsupported`, `timed-out`), IndexedDB store (with in-memory adapter for Node tests), versioned JSON import/export, distinguishing loaded vs recomputed runs.
- **Verification Gate:** Integration tests executing real Hydrogen calculations, saving, reloading, exporting/importing JSON, cancelling mid-flight, and rejecting stale results.

### Phase 3 — Schrödinger–Coulomb Engine
- **New/updated modules:** `src/physics/providers/schrodinger/`, wiring `hydrogenic.ts` with explicit `reducedMassRatio(nuclearMass_kg)` ($a_\mu = a_0 m_e/\mu$), expectation values ($\langle r \rangle, \langle r^2 \rangle, \langle r^{-1} \rangle, \langle r^{-2} \rangle$), node sets, and spatial/radial evaluation results.
- **Verification Gate:** Tests for analytical energies, reduced mass (`1H`, `2H`/Deuterium, `He+`, `Li2+`), exact normalization, $\langle r \rangle_{nl}$ formula, and C++ parity intact.

### Phase 4 — Relativistic Dirac–Coulomb Engine
- **New modules:** `src/physics/providers/dirac/` (analytical Dirac energies $E_{n\kappa}$, radial spinor components $P_{n\kappa}(r)$ and $Q_{n\kappa}(r)$, spin-angular spherical spinors $\Omega_{\kappa m_j}$, total probability density $(|P|^2+|Q|^2)/(4\pi r^2)$ / $\theta$-dependent density, fine-structure $\Delta E$, domain checks $0 < Z\alpha < |\kappa|$).
- **Verification Gate:** Independent analytical/numerical Dirac energy tests, spinor normalization $\int(|P|^2+|Q|^2)\,dr = 1$, $\alpha \to 0$ convergence to Schrödinger, fine-structure `2p_3/2 - 2p_1/2` splitting, rejection of $Z \ge 137$ ($|\kappa|=1$) and finite-nucleus requests.

### Phase 5 — Quantum Visualization (Isosurfaces, Slices, Dirac Components)
- **New/updated modules:** `src/numerics/isosurface/` (worker-offloaded 3D voxel evaluation + marching cubes), `src/render/OrbitalScene.ts` (isosurface `THREE.Mesh` layer, smooth transparency/wireframe/solid controls), `RadialPlot.tsx` (Dirac $P, Q, |P|^2+|Q|^2$ plots alongside $P_r(r)$ and $4\pi r^2\rho(r)$), 2D XY/XZ/YZ slice views.
- **Verification Gate:** Numerical consistency tests checking isosurface value bounds & spinor radial density integrals; SwiftShader Playwright browser checks verifying WebGL2 rendering + fallback.

### Phase 6 — Electric-Dipole (E1) Transitions & Spectroscopy
- **New modules:** `src/numerics/specialFunctions/wigner.ts` (exact 3-$j$ / 6-$j$ symbols), `src/physics/transitions/` (NR E1 & Relativistic Dirac E1 dipole matrix elements, selection rules, polarization components, oscillator strengths, Einstein $A$), `src/physics/spectroscopy/` (Lyman, Balmer, Paschen, custom series builders, NIST Hydrogen reference comparison).
- **Verification Gate:** Exact selection-rule & forbidden-transition ($j=0 \to 0$, same-parity, $\Delta l \neq \pm 1$) tests, reference H Lyman-$\alpha$ / H-$\alpha$ wavelengths, positive $A_{fi}$, NR vs Dirac oscillator-strength limit as $\alpha \to 0$, and Thomas–Reiche–Kuhn / partial sum-rule sanity checks.

### Phase 7 — ATOMS Laboratory Integration, Regression, Benchmarks, & Release
- **UI Integration:** Full **ATOMS Laboratory** 8-workspace navigation (`Workbench`, `Atomic Systems`, `Quantum States`, `Energy Structure`, `Transitions`, `Spectroscopy`, `Analysis`, `Experiment History`) preserving all `v0.5.0` deep-links and controls.
- **Documentation & Release:** Complete all 15 release docs listed in Specification Section 14, full Playwright + Vitest + C++17 + Vite build + SwiftShader benchmark verification, and `package.json` bump to `0.6.0`.
