# ATOMS v0.6.0 — Architecture Decisions (ADRs)

---

## ADR-001: General-First `AtomicSystem` Decoupled from Solver Support
- **Context:** `v0.5.0` ties element state directly to neutral `ElementRecord` (`N = Z`). `v0.6.0` requires representing neutral atoms, positive ions, and negative ions (`q = Z - N`, including $N > Z$) plus isotopes and nuclear models.
- **Decision:** Define `AtomicSystem` independently of physics solvers. Allow arbitrary `Z >= 1, N >= 0`. Delegate physical binding and capability checks exclusively to `provider.supports(system, state)`.
- **Consequences:** Negative ions (e.g., `H^-`) can be constructed and inspected safely while one-electron solvers (`N = 1`) cleanly report `unsupported: one-electron solver requires N = 1`.

## ADR-002: Strictly Discriminated Quantum-State Representations
- **Context:** Nonrelativistic `(n, l, m_l, m_s)` and relativistic `(n, kappa, j, m_j)` states are physically distinct eigenstates of different Hamiltonians ($\hat{H}_{\text{NR}}$ vs $\hat{H}_{\text{Dirac}}$).
- **Decision:** Model `QuantumState` as a TypeScript discriminated union (`"nonrelativistic" | "relativistic" | "superposition" | "configuration-average"`) with dedicated validation functions (`validateNonRelativisticState`, `validateRelativisticState`) and exact $\kappa \leftrightarrow (l, j)$ mapping.
- **Consequences:** Eliminates any possibility of passing $\kappa$ to a Schrödinger solver or omitting spinor structure in Dirac observables.

## ADR-003: Typed `PhysicsProvider` Contract Wrapping v0.5 Providers
- **Context:** `v0.5.0` has a working `src/science/providers.ts` registry covering `lobato2026-df`, `pyscf-hf`, `browser-slater`, `datatoms-2026-mcdf`, and `grasp-mcdhf`.
- **Decision:** Introduce the generic async `PhysicsProvider<TSystem, TState, TInput, TResult>` contract in `src/physics/providers/contracts.ts`, implement native v0.6 `SchrodingerCoulombProvider` and `DiracCoulombProvider`, and wrap the 5 existing `v0.5.0` providers through lightweight adapters so zero data or validation logic is duplicated or lost.
- **Consequences:** Full backward compatibility for `v0.5.0` unit and browser tests while providing a unified capability-checked laboratory API.

## ADR-004: Analytical Point-Nucleus Dirac–Coulomb Spinors as Primary Relativistic Reference
- **Context:** Point-Coulomb Dirac radial functions $P_{n\kappa}(r)$ and $Q_{n\kappa}(r)$ possess an exact closed-form analytical solution in terms of confluent hypergeometric functions / generalized Laguerre polynomials $L_{n_r}^{(2\gamma)}(2\lambda r)$ with $\gamma = \sqrt{\kappa^2 - (Z\alpha)^2}$ (Grant 2007; Greiner 2000; Drake 2006).
- **Decision:** Implement the exact analytical Dirac–Coulomb radial spinor formulas + spin-angular spherical spinors $\Omega_{\kappa, m_j}(\theta, \phi)$ (with log-$\Gamma$ normalization matching `special.ts` stability) rather than an error-prone finite-difference shooting ODE solver for point-Coulomb. Enforce the mathematical validity domain $0 < Z\alpha < |\kappa|$ (and finite-mass vs point-charge caveats), while keeping finite nuclear distributions (`finite-fermi`, `finite-uniform`) explicitly `unsupported` until a dedicated numerical Dirac solver is built and validated.
- **Consequences:** Machine-precision agreement with analytical Dirac energies $E_{n\kappa}$, exact $\int_0^\infty (|P|^2+|Q|^2)\,dr = 1$ normalization, clean $\alpha \to 0$ convergence to Schrödinger orbitals, and zero silent approximations.

## ADR-005: Exact Relativistic & Nonrelativistic E1 Matrix Elements Without Fake Broadening
- **Context:** Spectra must be computed from transition matrix elements, not hard-coded line tables.
- **Decision:** Compute nonrelativistic E1 using exact spherical-tensor angular factors (3-$j$ symbols) and high-precision radial dipole integrals $\int r^3 R_{n'l'} R_{nl}\,dr$ (cross-checked against Gordon's formula), and relativistic E1 using Dirac radial integrals $\int r (P_f P_i + Q_f Q_i)\,dr$ (length gauge / relativistic dipole operator $-e\mathbf{r}$) with Wigner 3-$j$/6-$j$ spin-angular algebra ($\Delta j = 0, \pm 1$, $0 \not\to 0$, parity flip $\kappa_i \kappa_f$ sign/parity check). Spectra display ideal discrete stick lines with optional reference NIST overlays—no fake Voigt/Doppler thermal broadening or fabricated population intensities.
- **Consequences:** All spectral lines, wavelengths, oscillator strengths, and Einstein $A$ coefficients are strictly derived from validated dipole matrix elements.

## ADR-006: UI-Independent Experiment Platform with Worker Execution & IndexedDB Persistence
- **Context:** Calculating 3D spinor fields, marching-cubes isosurfaces, and full spectral series must never block the main UI thread or rely on React state for reproducibility.
- **Decision:** Build `src/experiments/` with a deterministic `ExperimentRunner`, `ExperimentScheduler`, structured-clone Web Workers, `AbortController`-compatible cancellation, versioned JSON `ExperimentSerializer`, and `IndexedDB` storage (`ExperimentStore`) with an in-memory fallback when running in Node/Vitest environments without IndexedDB.
- **Consequences:** Every calculation is reproducible from its JSON recipe (`constantsVersion`, `providerVersion`, `system`, `state`, `numerics`), and distinguishing "loaded cached result" from "recomputed" is explicit.

## ADR-007: Pinned `CODATA 2018` Constants Baseline & Explicit Typed Units
- **Context:** `v0.5.0` pins `CODATA_2018` in `src/physics/constants.ts`, matched across `native/quantum_core.hpp` (1,020 parity vectors).
- **Decision:** Keep `CODATA_2018` as the active pinned default constants dataset in `v0.6.0` (avoiding silent shifts in parity constants), formalize explicit unit conversions (`Hartree`, `eV`, `a0`, `m`, `Å`, `nm`, `s`, `Hz`, `C`, `u`), and record `constantsVersion: "CODATA-2018"` on every experiment and result.
- **Consequences:** Exact parity with `v0.5.0` and C++17 reference vectors is preserved while eliminating unit ambiguity across spectroscopy and Dirac energies.

## ADR-008: Extending `OrbitalScene.ts` Rather Than Replacing Three.js Renderer
- **Context:** `OrbitalScene.ts` and `shaders.ts` already deliver performant, leak-free WebGL2 `THREE.Points` clouds, slab slicing, axes, nucleus, current segments, and clean WebGL2-unavailable fallback.
- **Decision:** Keep `OrbitalScene` as the core 3D engine and extend it additively with a marching-cubes `THREE.Mesh` isosurface layer (`src/numerics/isosurface/`) and Dirac spinor visualization modes (`|P|^2+|Q|^2`, $P$ large, $Q$ small) computed off-thread in workers.
- **Consequences:** Existing `core.spec.ts`, `science.spec.ts`, `responsive.spec.ts`, and `benchmark.mjs` workflows remain compatible.

## ADR-009: Incremental Migration With Compatibility Preservation
- **Decision:** Implement new domain, provider, and experiment modules alongside existing `v0.5.0` modules first, then wire `App.tsx` and analysis components incrementally to consume experiment outputs while preserving existing URL query links (`?z=&mode=&source=&samples=&adaptive=`) and DOM test hooks.
- **Consequences:** Zero regression downtime; `npm test` and `npm run test:browser` stay green at every phase boundary.

## ADR-010: Workspace & Git Safety Policy in Non-Git Container
- **Decision:** Because `/app/applet` has no `.git` directory or GitHub credentials, treat the filesystem as a strictly isolated working copy, log every changed/added file per phase, and never claim remote commits or pushes occurred. Provide explicit `git` patch/branch commands for external execution on `development/v0.6.0`.
