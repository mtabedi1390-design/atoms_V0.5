# ATOMS v0.7.0 — Software & Scientific Architecture

ATOMS v0.7.0 (**Multi-Electron Atomic Structure**) extends the verified `v0.6.1` hydrogenic laboratory with a live **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`** multi-electron Hartree–Fock backend (`server.ts` + `science/hf_backend.py`) while preserving all `v0.5.0` and `v0.6.1` solvers, rendering, datasets, and parity tests.

---

## 1. Architectural Principles

1. **General-First, Capability-Gated**:
   Domain objects (`AtomicSystem`, `QuantumState`, `ExperimentDefinition`) represent arbitrary elements (`Z = 1..118`), ionization charges (`q = Z - N`, including anions and cations), isotopes, nuclear models, one-electron nonrelativistic/relativistic states, and `MultiElectronHFState` configurations cleanly. Every `PhysicsProvider` implements `supports(system, state)` to enforce mathematical and physical validity domains before execution—never substituting point-Coulomb formulas for multi-electron atoms or applying hydrogenic reduced-mass scaling to multi-electron HF.
2. **Strict Layer Isolation (Zero React/Three/Node Built-In Imports in Pure Core Modules)**:
   - Verified via CI/grep: `src/domain/`, `src/physics/`, `src/science/`, `src/experiments/`, `src/workers/`, `src/numerics/`, and `src/sampling/` (outside `__tests__`) contain **0** imports from `react`, `three`, or `node:*`.
   - Rendering modules (`src/render/`, `src/components/`) consume typed buffers and structured results produced off-thread in Web Workers (`src/sampling/sampler.worker.ts`, `src/workers/experiment.worker.ts`, `src/workers/visualization.worker.ts`).
3. **Truthful Local Process Boundary (`server.ts` ↔ `science/hf_backend.py`)**:
   - Compiled Python/C libraries (`PySCF`, `libcint`, `SciPy`) run strictly inside a local Python environment (`.venv/bin/python`, `/opt/atoms-py/bin/python`, or `ATOMS_PYTHON`) spawned by Express 5 (`server.ts`).
   - Browser Web Workers communicate with localhost `/api/hf/*` via blob-origin-safe `HFTransport` (`src/physics/hf/transport.ts`) with real `AbortSignal` / `SIGTERM` cancellation. Offline previews disable HF runs cleanly instead of mocking scientific data.
4. **Preservation of `v0.5.0` and `v0.6.1` Core**:
   All prior modules (`elements.ts`, `hydrogenic.ts`, `special.ts`, `diracFock.ts`, `sampler.ts`, `OrbitalScene.ts`, `native/quantum_core.hpp`, Schrödinger/Dirac providers, E1 transitions, spectroscopy, PySCF & Lobato JSON snapshots) remain preserved and regression-tested.

---

## 2. Implemented Module Map (`v0.7.0`)

```text
server.ts                  Express 5 + Vite dev/prod host + /api/hf/capabilities & /api/hf/calculate
science/
  hf_backend.py            PySCF 2.15.1 + libcint + BSE 0.12 live engine (RHF/UHF/ROHF/AtomSphAvg + 110-pt Lebedev + 3D GTO grids)
  requirements.txt         Pinned Python dependencies (pyscf==2.15.1, basis-set-exchange==0.12, numpy, scipy, h5py)
scripts/
  setup_python_backend.sh  Isolated .venv installer (uv / venv / --without-pip + get-pip fallback)
src/
  domain/
    atomic/index.ts        AtomicSystem, AtomicSpecies, IsotopeSpec (nuclearMass_u vs neutralAtomicMass_u), NuclearModel
    quantum/index.ts       NonRelativisticState, RelativisticState, SuperpositionState, ConfigurationAverageState, MultiElectronHFState, kappa <-> (l, j)
    observables/index.ts   TypedObservable (incl. multi-electron-hf, orbital-resolved-hf, spin-density, scf-diagnostics)
    validation/index.ts    Structured ValidationIssue, ValidationResult, SupportAssessment
  physics/
    constants.ts           CODATA 2018 reference constants (C++17 parity exact)
    units.ts               Pinned CONSTANTS_VERSION="CODATA-2018", EXTENDED_CONSTANTS, unit conversions, TypedQuantity<U>
    hydrogenic.ts          Analytic Laguerre radial R_nl, spherical/tesseral harmonics, expectation values, radial nodes
    special.ts             Log-gamma factorial, generalized Laguerre L_n^alpha, associated Legendre P_l^m
    diracFock.ts           Lobato et al. (2026) Dirac-Pade Z=1..118 total spherical density evaluator
    current.ts             Azimuthal probability current j = (hbar/m) Im(psi* grad psi)
    models.ts              Model A (hydrogenic-exact) & Model B (slater-screened-hydrogenic) descriptors
    hf/
      types.ts             Typed structured-clone-safe HF requests, orbitals, SCF history, radial/volume grids
      basisCatalog.ts      Pinned BSE v1 catalog (STO-3G, 6-31G, cc-pVDZ/TZ, aug-cc-pVTZ, def2-SVP/TZVP) + ECP Z<=36 cap
      configurations.ts    Curated NIST ground & Aufbau+Hund subshell proposal + spin validation
      benchmarks.ts        Pinned compas/sphf (MIT), Koga–Thakkar (1999), and 1-e exact (-Z^2/2) references
      transport.ts         Blob-Worker-origin-safe HTTP HFTransport + capability cache
    providers/
      contracts.ts         PhysicsProvider interface, ProviderCapability, CalculationResult
      registry.ts          PhysicsProviderRegistry & createDefaultProviderRegistry() (incl. pyscf-hf-live)
      hartreeFock/index.ts pyscfLiveProvider (`pyscf-hf-live` 0.7.0): gating, SCF rejection, & 5 post-SCF validation checks
      schrodinger/index.ts SchrodingerCoulombProvider (bound energies, reduced mass, wavefunctions, <r^k>, radial PDF)
      dirac/index.ts       DiracCoulombProvider (4-spinor P/Q radial + Omega_{kappa,m_j}, Sommerfeld-Dirac spectrum, fine structure)
      legacyAdapters.ts    v0.5 adapters: lobatoDFProvider, pyscfHFProvider, slaterProvider, datatomsMCDFProvider, graspMCDHFProvider
    transitions/           NR & Dirac length-gauge E1 dipole matrix elements & rates
    spectroscopy/index.ts  Series generators (Lyman, Balmer, Paschen, custom), vacuum wavelengths, NIST 1H comparison
  numerics/
    specialFunctions/wigner.ts Exact BigInt-stabilized Wigner 3-j and 6-j symbols
    isosurface/marchingTetrahedra.ts Watertight 6-tetrahedra 3D isosurface (hydrogenic + PySCF HF grids) & 2D slice evaluators
  experiments/
    schema/index.ts        Versioned ExperimentDefinition (atom-exp/v1), ExperimentExecution, ExperimentResultRecord
    registry/index.ts      Supported experiment kinds (incl. multi-electron-hf)
    validation/index.ts    Pre-execution validation of system, quantum states, provider capability, & numerical parameters
    execution/             ExperimentScheduler, ExperimentRunner, Transition/Spectroscopy dispatcher
    results/index.ts       ResultRegistry tracking computed vs loaded-from-store vs imported-json provenance
    persistence/           IndexedDBExperimentStore (atoms_laboratory_db v1) + ExperimentSerializer (atoms-experiment-bundle v1)
  workers/
    protocol.ts            Structured-clone-safe worker protocol
    experiment.worker.ts   Off-main-thread physics experiment execution (1-e & PySCF HF)
    experimentClient.ts    Promise/AbortSignal client with stale-result protection
    browserWorkerFactory.ts Browser Worker factory for Vite ?worker&inline builds
    visualization.worker.ts Off-main-thread Dirac 4-spinor sampling & 3D Marching Tetrahedra extraction
    visualizationClient.ts  Request-ID-filtered WebGL buffer client with Transferable Float32Arrays
  sampling/ & render/      v0.5 seeded xoshiro128** inverse-CDF samplers & Three.js/WebGL2 OrbitalScene renderer
  data/                    118 IUPAC elements, NIST ASD (Z=1..108), Lobato DF (Z=1..118), bundled PySCF snapshots, NIST 1H lines
  app/useAtomsLaboratory.ts Unified laboratory & ExperimentRunner hook (incl. HF capabilities probe & 3D HF overlay state)
  components/
    laboratory/            WorkspaceNav (9 workspaces) & all workspace views (incl. HartreeFockWorkspace.tsx)
    ControlRail.tsx, RadialPlot.tsx, Slice2DCanvas.tsx, EnergyDiagram.tsx, Inspector.tsx, TelemetryBar.tsx, PeriodicTable.tsx
```

---

## 3. Data & Execution Flow

1. **System & State Construction**: `App.tsx` + `useAtomsLaboratory` synthesize `AtomicSystem` ($Z, N, q = Z-N$, isotope `nuclearMass_u`, `nuclearModel`) and `QuantumState` (`nonrelativistic`, `relativistic`, or `multi-electron-hf`).
2. **Workbench 3D Interactive Rendering**:
   - In nonrelativistic/full-atom mode, `SamplerClient` -> `sampler.worker.ts` transfers `Float32Array` particle buffers to `OrbitalScene`.
   - In Dirac 4-spinor mode or hydrogenic 3D Isosurface mode, `VisualizationWorkerClient` -> `visualization.worker.ts` runs `sampleDiracSpinorCloud` / `extractStateIsosurface` off-thread.
   - When a user projects a live PySCF 3D volumetric field (`mo-signed`, `mo-density`, `total-density`, or `spin-density`) from `HartreeFockWorkspace`, `App.tsx` invokes `extractIsosurfacesFromVolumeGrid` cleanly and hides synthetic point clouds while displaying real positive/negative lobe meshes.
3. **Reproducible Experiment Platform (`v0.6`–`v0.7.0`)**:
   - Running any 1-electron, E1 transition, spectroscopy, or **multi-electron Hartree–Fock** calculation constructs an immutable `ExperimentDefinition` (`atom-exp/v1`), validates it pre-flight, assigns a monotonic `runSequence` via `ExperimentScheduler`, executes inside `experiment.worker.ts` (calling `/api/hf/calculate` over `blob:`-safe `HFTransport` for PySCF), records `ExperimentExecution` (`atom-exec/v1`) and normalized `ExperimentResultRecord` (`atom-res/v1`), and persists successful runs into IndexedDB (`IndexedDBExperimentStore`).
   - Loading a previously stored result preserves `source: "loaded-from-store"`, whereas triggering recalculation spawns a fresh execution with `source: "computed"` and incremented `recomputedCount`. Unconverged SCF or cancelled executions fail cleanly without overwriting valid stored results.
