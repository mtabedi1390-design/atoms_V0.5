# ATOMS v0.6.0 — Software & Scientific Architecture

ATOMS v0.6.0 (**General Atomic Quantum Laboratory**) evolves the verified `v0.5.0` atomic-visualization workstation into a layered, Web-Worker-executed computational atomic-physics platform while preserving all `v0.5.0` rendering, datasets, and parity tests.

---

## 1. Architectural Principles

1. **General-First, Capability-Gated**:
   Domain objects (`AtomicSystem`, `QuantumState`, `ExperimentDefinition`) represent arbitrary elements (`Z = 1..118`), ionization charges (`q = Z - N`, including anions and cations), isotopes, nuclear models, and both nonrelativistic and relativistic quantum states cleanly. Every `PhysicsProvider` implements `supports(system, state)` to enforce mathematical and physical validity domains before execution—never substituting point-Coulomb formulas for multi-electron atoms or finite nuclear charge models.
2. **Strict Layer Isolation (Zero React/Three Imports in Scientific Layers)**:
   - Verified via CI/grep: `src/domain/`, `src/physics/`, `src/science/`, `src/experiments/`, `src/workers/`, and `src/numerics/` contain **0** imports from `react` or `three`.
   - Rendering modules (`src/render/`, `src/components/`) consume typed buffers and structured results produced off-thread in Web Workers (`src/sampling/sampler.worker.ts`, `src/workers/experiment.worker.ts`, `src/workers/visualization.worker.ts`).
3. **Preservation of `v0.5.0` Core**:
   All `v0.5.0` modules (`elements.ts`, `hydrogenic.ts`, `special.ts`, `diracFock.ts`, `sampler.ts`, `OrbitalScene.ts`, `native/quantum_core.hpp`, PySCF HF & Lobato DF JSON snapshots) remain preserved, wrapped via `src/physics/providers/legacyAdapters.ts`, and regression-tested.

---

## 2. Implemented Module Map (`v0.6.0`)

```text
src/
  domain/
    atomic/index.ts        AtomicSystem, AtomicSpecies, IsotopeSpec (nuclearMass_u vs neutralAtomicMass_u), NuclearModel
    quantum/index.ts       NonRelativisticState, RelativisticState, SuperpositionState, ConfigurationAverageState, kappa <-> (l, j)
    observables/index.ts   TypedObservable, PhysicalAssumptions, UncertaintyBreakdown, NumericalQuality
    validation/index.ts    Structured ValidationIssue, ValidationResult, SupportAssessment
  physics/
    constants.ts           CODATA 2018 reference constants (C++17 parity exact)
    units.ts               Pinned CONSTANTS_VERSION="CODATA-2018", EXTENDED_CONSTANTS, unit conversions, TypedQuantity<U>
    hydrogenic.ts          Analytic Laguerre radial R_nl, spherical/tesseral harmonics, expectation values, radial nodes
    special.ts             Log-gamma factorial, generalized Laguerre L_n^alpha, associated Legendre P_l^m
    diracFock.ts           Lobato et al. (2026) Dirac-Pade Z=1..118 total spherical density evaluator
    current.ts             Azimuthal probability current j = (hbar/m) Im(psi* grad psi)
    models.ts              Model A (hydrogenic-exact) & Model B (slater-screened-hydrogenic) descriptors
    providers/
      contracts.ts         PhysicsProvider interface, ProviderCapability, CalculationResult
      registry.ts          PhysicsProviderRegistry & createDefaultProviderRegistry()
      schrodinger/index.ts SchrodingerCoulombProvider (bound energies, reduced mass, wavefunctions, <r^k>, radial PDF)
      dirac/index.ts       DiracCoulombProvider (4-spinor P/Q radial + Omega_{kappa,m_j}, Sommerfeld-Dirac spectrum, fine structure)
      legacyAdapters.ts    v0.5 adapters: lobatoDFProvider, pyscfHFProvider, slaterProvider, datatomsMCDFProvider, graspMCDHFProvider
    transitions/
      nonrelativisticE1.ts Real/complex NR E1 dipole matrix elements, selection rules, oscillator strengths, Einstein A
      relativisticE1.ts    Dirac 4-spinor E1 radial (r P_f P_i + r Q_f Q_i) & spin-angular reduced matrix elements via 3-j/6-j
    spectroscopy/index.ts  Series generators (Lyman, Balmer, Paschen, custom), vacuum wavelengths, NIST 1H comparison
  numerics/
    specialFunctions/wigner.ts Exact BigInt-stabilized Wigner 3-j and 6-j symbols
    isosurface/marchingTetrahedra.ts Watertight 6-tetrahedra 3D isosurface extractor & 2D plane slice evaluator
  experiments/
    schema/index.ts        Versioned ExperimentDefinition (atom-exp/v1), ExperimentExecution (atom-exec/v1), ExperimentResultRecord (atom-res/v1)
    registry/index.ts      Supported experiment kinds (single-state, multi-state, comparison, e1-transition, spectroscopy-series, energy-levels)
    validation/index.ts    Pre-execution validation of system, quantum states, provider capability, & numerical parameters
    execution/
      scheduler.ts         Structured-clone guard (assertStructuredCloneSafe), monotonic runSequence, cancellation
      runner.ts            ExperimentRunner coordinating validation, Worker/direct execution, provenance, & persistence
      dispatchSpecialExperiment.ts Transition & spectroscopy experiment dispatcher
    results/index.ts       ResultRegistry tracking computed vs loaded-from-store vs imported-json provenance
    persistence/
      store.ts             IndexedDBExperimentStore (atoms_laboratory_db v1) + MemoryExperimentStore fallback
      serializer.ts        ExperimentSerializer (atoms-experiment-bundle v1) JSON export/import with full validation & fresh ID remapping
  workers/
    protocol.ts            Structured-clone-safe worker message protocol
    experiment.worker.ts   Off-main-thread physics experiment execution
    experimentClient.ts    Promise/AbortSignal client with stale-result protection
    browserWorkerFactory.ts Browser Worker factory for Vite ?worker&inline builds
    visualization.worker.ts Off-main-thread Dirac 4-spinor sampling & 3D Marching Tetrahedra extraction
    visualizationClient.ts  Request-ID-filtered WebGL buffer client with Transferable Float32Arrays
  sampling/
    sampler.ts             v0.5 seeded xoshiro128** inverse-CDF cloud sampler (single, subshell, HF, DF)
    diracSampler.ts        4-spinor Monte Carlo cloud sampler (total |Psi|^2, large |P|^2, small |Q|^2 views)
    sampler.worker.ts      v0.5 Monte Carlo point-cloud Web Worker
  render/
    OrbitalScene.ts        Three.js/WebGL2 renderer: additive point sprites, current arrows, 3D isosurface mesh group, slice heatmap & slab
    shaders.ts             GLSL shaders for density, real sign, complex arg phase, subshell palette, & cross-section slab
  data/
    elements.ts            118 IUPAC elements, ground configurations, subshells, CIAAW weights, Cordero radii, NIST ASD links
    nist/                  asd_ground_levels.json (Z=1..108)
    df/                    lobato2026.json (Z=1..118 Dirac-Fock total densities)
    hf/                    H.json, He.json, C.json, N.json, O.json, Ne.json (PySCF RHF/ROHF aug-cc-pVTZ)
    references/            nistHydrogenLines.json + nistHydrogen.ts (1H vacuum benchmark centroids)
  app/
    useAtomsLaboratory.ts  Reactive UI bridge connecting domain, providers, Worker ExperimentRunner, & IndexedDB store
  components/
    laboratory/            WorkspaceNav & 7 workspaces (AtomicSystems, QuantumStates, EnergyStructure, Transitions, Spectroscopy, Analysis, ExperimentHistory)
    ControlRail.tsx        Workbench left rail + v0.6 Schrödinger/Dirac toggle & Marching Tetrahedra controls
    RadialPlot.tsx         NR P(r), Total 4*pi*r^2*rho(r), & Dirac P/Q/|P|^2+|Q|^2 SVG plotter
    Slice2DCanvas.tsx      2D XY/XZ/YZ heatmap renderer
    EnergyDiagram.tsx      v0.5 subshell / NIST IE / HF energy panel
    Inspector.tsx          v0.5 provenance, coverage matrix, & validation panel
    TelemetryBar.tsx       Top quantitative telemetry banner (`header.h-12`)
    PeriodicTable.tsx      118-element keyboard-navigable periodic table
```

---

## 3. Data & Execution Flow

1. **System & State Construction**: `App.tsx` + `useAtomsLaboratory` synthesize `AtomicSystem` ($Z, N, q = Z-N$, isotope `nuclearMass_u`, `nuclearModel`) and `QuantumState` (`nonrelativistic` or `relativistic`).
2. **Workbench 3D Interactive Rendering**:
   - In nonrelativistic/full-atom mode, `SamplerClient` -> `sampler.worker.ts` transfers `Float32Array` particle buffers to `OrbitalScene`.
   - In Dirac 4-spinor mode or when 3D Isosurface is enabled, `VisualizationWorkerClient` -> `visualization.worker.ts` runs `sampleDiracSpinorCloud` / `extractStateIsosurface` off-thread and transfers vertex/normal `Float32Array` buffers.
3. **Reproducible Experiment Platform**:
   - Running any state, E1 transition, or spectroscopy calculation constructs an immutable `ExperimentDefinition` (`atom-exp/v1`), validates it pre-flight, assigns a monotonic `runSequence` via `ExperimentScheduler`, executes inside `experiment.worker.ts`, records an `ExperimentExecution` (`atom-exec/v1`) and normalized `ExperimentResultRecord` (`atom-res/v1`), and persists all three into IndexedDB (`IndexedDBExperimentStore`).
   - Loading a previously stored result preserves `source: "loaded-from-store"`, whereas triggering a recalculation spawns a new execution producing `source: "computed"` with incremented `recomputedCount`.
