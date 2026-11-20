# ATOMS v0.6.0 — Target Architecture Freeze

This document freezes the target modular architecture for **ATOMS v0.6.0 — General Atomic Quantum Laboratory**, evolved incrementally from the verified `v0.5.0` codebase.

---

## 1. Architectural Principles

1. **General-First, Capability-Gated:** Domain models (`AtomicSystem`, `QuantumState`, `TransitionPair`, `ExperimentDefinition`) are solver-independent and general from day one, while `PhysicsProvider.supports(system, state)` enforces exact mathematical/physical validity before any execution.
2. **Strict Separation of Layers (Zero Circular Dependencies):**
   - `domain/`, `physics/`, `numerics/`, `experiments/`, and `data/` **never** import React, DOM APIs, or Three.js.
   - `render/` and `rendering/` **never** execute scientific physics solvers or invent data; they consume typed provider/experiment buffers only.
   - `components/` **never** compute physics directly during render; all observables, plots, spectra, and 3D fields flow through validated experiment/provider outputs.
3. **Preservation of `v0.5.0` Assets:** All existing `v0.5.0` data (`elements.ts`, `nist/`, `df/lobato2026.json`, `hf/*.json`), numerical cores (`special.ts`, `hydrogenic.ts`, `diracFock.ts`, `native/quantum_core.hpp`), sampler (`sampler.ts`), renderer (`OrbitalScene.ts`), and provider matrix (`coverageMatrix.ts`) are retained and wrapped/extended rather than discarded.

---

## 2. Target Module Map

```
src/
  domain/
    atomic/        AtomicSystem, AtomicSpecies, IsotopeSpec, NuclearModel, charge relation q = Z - N
    quantum/       NonRelativisticState (n,l,m_l,m_s), RelativisticState (n,kappa,j,m_j), Superposition, kappa<->(l,j)
    observables/   Typed observables, uncertainty/error breakdown, physical units
    transitions/   TransitionSpec, E1SelectionRuleResult, TransitionResult, SpectralLine
    validation/    Typed ValidationResult & SupportAssessment primitives
  physics/
    constants/     Pinned CODATA_2018 (default) + explicit unit conversion algebra (Hartree, eV, a0, m, A, nm, s, Hz, C, u)
    providers/
      contracts.ts        PhysicsProvider<TSystem, TState, TInput, TResult>, ProviderCapability, ProviderRegistry
      schrodinger/        SchrodingerCoulombProvider (analytical NR hydrogen-like + reduced mass + expectation values)
      dirac/              DiracCoulombProvider (analytical point-nucleus spinors P, Q, Omega_kappam, E_nkappa, fine structure)
      hartreeFock/        Adapter wrapping v0.5 pyscfHFProvider (H, He, C, N, O, Ne)
      diracFock/          Adapter wrapping v0.5 lobatoDFProvider (Z=1..118 total density)
      slater/             Adapter wrapping v0.5 slaterProvider (qualitative orbital shapes)
      unavailable/        Datatoms 2026 (N<=10) & GRASP2018 MCDHF honest unavailable descriptors
    transitions/   Nonrelativistic E1 & Relativistic Dirac E1 matrix elements, Wigner 3j/6j, oscillator strengths, Einstein A
    spectroscopy/  Series builders (Lyman, Balmer, Paschen, custom range), emission/absorption lines, NIST comparison
    (preserved v0.5 modules: constants.ts, special.ts, hydrogenic.ts, models.ts, density.ts, current.ts, diracFock.ts)
  numerics/
    specialFunctions/  Re-exports/extends special.ts + Wigner 3j/6j / Clebsch-Gordan / spin-angular harmonics
    quadrature/        Composite Simpson, Gauss-Legendre radial quadrature for spinors & E1 radial integrals
    isosurface/        3D scalar field sampling & marching-cubes triangle mesh extraction
  experiments/
    schema/        Versioned ExperimentSchema v1 (system, nuclear model, provider+version, state(s), constantsVersion, numerics)
    registry/      ExperimentRegistry (supported experiment kinds)
    validation/    ExperimentValidator (system + state + provider + domain validation pre-execution)
    execution/     ExperimentRunner, ExperimentScheduler (async Worker orchestration, cancellation, progress, timeout)
    persistence/   IndexedDB ExperimentStore + ResultRegistry + JSON import/export (ExperimentSerializer)
  workers/         Structured-clone-safe worker dispatch for sampling, Dirac/Schrodinger fields, isosurfaces, & transitions
  rendering/       Extends src/render/OrbitalScene.ts (isosurface Mesh layer, Dirac P/Q/|psi|^2 component buffers, 2D slice heatmap/slab)
  data/            Preserved v0.5 data + pinned NIST Hydrogen reference transition/level comparison subset
  components/
    laboratory/    ATOMS Laboratory shell + 8 integrated workspace views
    quantum/       Atomic Systems, Quantum States, Energy Structure, Dirac spinor plots
    spectroscopy/  Transitions calculator & interactive Spectroscopy canvas/table
    analysis/      Preserved/extended RadialPlot, EnergyDiagram, Inspector, TelemetryBar
    shared/        ui.tsx, PeriodicTable.tsx
```

---

## 3. Core Contracts (Frozen Shapes)

### 3.1 `AtomicSystem` & `NuclearModel`
- `AtomicSystem`: `{ species: AtomicSpecies; Z: number; N: number; q: number; massNumber?: number; nuclearMass_u: number; nuclearModel: NuclearModel }`
- Invariant: `q === Z - N` checked at construction; `Z >= 1`, `N >= 0` (`N > Z` allowed for negative ions; solvers assess physical binding & support independently).
- `NuclearModel`: `{ kind: "point-infinite-mass" | "point-finite-mass" | "finite-fermi" | "finite-uniform"; nuclearMass_kg?: number; rmsRadius_fm?: number }`.
  - `"point-infinite-mass"` and `"point-finite-mass"` (using reduced mass $\mu = m_e M_{\text{nuc}} / (m_e + M_{\text{nuc}})$) are supported by Schrödinger–Coulomb; `"point-infinite-mass"` is the primary Dirac–Coulomb v0.6 reference (with finite-mass recoil explicitly separated as a known limitation or exact reduced-mass scaling documentation). `"finite-fermi"` and `"finite-uniform"` are representable in the schema and rejected with an explicit `unsupported` assessment until a finite-nucleus radial solver is implemented and validated.

### 3.2 `QuantumState`
Strictly discriminated union (`kind`):
- `"nonrelativistic"`: `{ kind: "nonrelativistic"; n: number; l: number; m_l: number; m_s: -0.5 | 0.5; basis: "real" | "complex" }`
- `"relativistic"`: `{ kind: "relativistic"; n: number; kappa: number; j: number; m_j: number }` with enforced $\kappa \in \mathbb{Z}\setminus\{0\}$, $l(\kappa) = \kappa > 0 ? \kappa : -\kappa - 1$, $j(\kappa) = |\kappa| - \frac{1}{2}$, $1 \le n$, $l(\kappa) < n$, and $m_j \in \{-j, -j+1, \dots, +j\}$.
- `"superposition"`: weighted finite linear combination of compatible bound states of the same system & Hamiltonian.
- `"configuration-average"`: existing neutral-atom shell / total-density state representation for `lobato2026-df`, `pyscf-hf`, and `browser-slater`.

### 3.3 `PhysicsProvider<TSystem, TState, TInput, TResult>`
- Typed `capabilities: readonly ProviderCapability[]` (e.g., `"bound-energy"`, `"radial-wavefunction"`, `"spinor-wavefunction"`, `"spatial-density"`, `"total-spherical-density"`, `"expectation-values"`, `"e1-transitions"`).
- Deterministic `supports(system, state): SupportAssessment` returning `{ supported: boolean; evidenceClass: EvidenceClass; reasons: string[]; limitations: string[] }`.
- `calculate(input, context: { signal: AbortSignal; onProgress?: (p: number) => void }): Promise<CalculationResult<TResult>>`.
- Every `CalculationResult` embeds `units`, `constantsVersion`, `providerId`, `providerVersion`, `model`, `assumptions`, `numericalQuality`, `validationStatus`, and `limitations`.

---

## 4. Eight Workspaces of ATOMS Laboratory

All 8 workspaces share one `LabState` + `ExperimentStore` inside the single-page application:
1. **Workbench**: Preserves and enhances the classic 3-column interactive 3D cloud / wavefunction / isosurface / slice lab.
2. **Atomic Systems**: System builder (`Z = 1..118`, charge $q = Z - N$ / electron count $N$, isotope mass selector, nuclear charge model) with live provider compatibility matrix.
3. **Quantum States**: Nonrelativistic $(n,l,m_l,m_s)$ and Relativistic $(n,\kappa,j,m_j)$ editors, Pauli/Dirac validity checks, and real-time node/spinor previews.
4. **Energy Structure**: Side-by-side nonrelativistic vs Dirac fine-structure level diagrams (distinct binding vs total relativistic energy scales, NIST 1st IE / energy levels where applicable).
5. **Transitions**: Initial $\to$ final state E1 transition matrix element calculator (selection rules, angular/radial/polarization factors, oscillator strength $f_{if}$, Einstein $A_{fi}$, $\Delta E$, $\lambda$).
6. **Spectroscopy**: Generated discrete emission/absorption spectra (Lyman, Balmer, Paschen, custom $\lambda$ bounds), NR vs Dirac model comparison, and NIST Hydrogen reference line overlay.
7. **Analysis**: Deep numerical inspector (`P_r`, Dirac `P_nkappa(r)` & `Q_nkappa(r)` radial plots, expectation values, quadrature residuals, `v0.5` coverage matrix & provenance).
8. **Experiment History**: Persistent IndexedDB ledger of saved experiments, status (`queued`..`completed`/`cancelled`/`failed`), JSON import/export, and deterministic **Load Result** vs **Re-run Experiment** actions.
