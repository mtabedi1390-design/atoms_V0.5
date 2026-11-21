# Changelog

All notable changes to **ATOMS** are documented in this file.

## [0.6.1] — 2026-11-21 (Scientific Stabilization)

### Fixed
- **Schrödinger Provider `m_l !== 0` Validation (`src/physics/providers/schrodinger/index.ts`)**: Fixed the `node-counts` validation expression where `- (st.basis === "real" ? Math.abs(st.m_l) : 0) + (st.basis === "real" ? Math.abs(st.m_l) : 0)` cancelled to `0`, causing every non-zero `m_l` calculation (`2p m=±1`, `3d m=±1,±2`, etc.) to report `ok: false`. Now verifies polar cone count (`l - |m_l|`) plus `|m_l|` equals `l` across both `real` and `complex` bases.
- **Nonrelativistic E1 Angular Phase Sign (`src/physics/transitions/nonrelativisticE1.ts`)**: Included the `(-1)^{l_f}` phase of the reduced matrix element $\langle l_f \| C^{(1)} \| l_i \rangle$ in `nonrelativisticAngularC1` (net Wigner–Eckart phase `(-1)^{m_f}` rather than `(-1)^{l_f - m_f}`), verified directly against independent 2D spherical harmonic quadrature.
- **Forbidden Sublevel E1 Rate Consistency (`src/physics/transitions/nonrelativisticE1.ts`, `relativisticE1.ts`, `TransitionsWorkspace.tsx`)**: Zeroed `oscillatorStrength`, `einsteinA_s1`, `reducedDipoleSquared_e2a02` / `reducedLineStrength_S`, and newly added exact `sublevelEinsteinA_s1` whenever `selectionRule.allowed === false` (e.g., spin-flip or `|Δm_l| > 1` / `|Δm_j| > 1`), eliminating contradictions where `E1 FORBIDDEN` appeared beside non-zero multiplet rates.
- **High-`n` Radial Node Scanning & Finite-Mass Scaling (`src/physics/hydrogenic.ts`, `RadialPlot.tsx`, `QuantumStatesWorkspace.tsx`, `AnalysisWorkspace.tsx`)**: Upgraded `radialNodes` to a non-uniform quadratic coordinate grid (`r_i = rMax * (i/N)^2`, `N = 6000`) preventing missed inner origin-adjacent zeros up to `n = 12`; added optional trailing reduced-mass `a = 1` parameter to `integrateRadialMass` and `radialDomainForMass`; wired `bohrScale = 1 / reducedMassRatio` into `RadialPlot` and `AnalysisWorkspace`.
- **Analysis Dirac Expectation Values & Custom Spectroscopy Lower-`n` UI (`AnalysisWorkspace.tsx`, `SpectroscopyWorkspace.tsx`, `useAtomsLaboratory.ts`)**: Displayed Dirac spinor expectation values (`<r>`, RMS radius, numeric & analytic `<r^-1>`, `<r^-2>`, `normError`, `invRError`) when in Dirac mode; added the missing `Lower n` control (`spectroscopyCustomLowerN`) for `custom` series spectroscopy; aligned `constants.ts` `hbar_Js` comment and exposed `CODATA_2018_UNCERTAINTIES` in `units.ts`.

### Verification & Release Engineering
- Added `src/physics/__tests__/stabilization.test.ts` (14 verification tests: `m_l !== 0`, `n=1..12` radial nodes, grid refinement convergence, Dirac `(n,j)` degeneracy & `r^gamma` cusp slope, 2D spin-angular & E1 spherical quadrature checks, closed-form Gordon $1s\text{–}2p / 2s\text{–}3p / 2p\text{–}3d$ benchmarks, sublevel Einstein $A$ sum rule, forbidden transition zeroing, custom spectroscopy, CODATA-2018 self-consistency, 2D/3D symmetries, and Worker/IndexedDB/JSON safety).
- Expanded Playwright verification in `tests/browser/laboratory.spec.ts` to **21 tests** (`Custom` Brackett spectroscopy, `m_l = +1` Worker validation `completed`, Dirac `Analysis` expectation values).
- Preserved `v0.5.0` (`47b84f8`) and `v0.6.0` (`e26d46b`) immutably; developed `v0.6.1` on `development/v0.6.1` tagged `v0.6.1`, and packaged clean reproducible archive `ATOMS_v0.6.1_Scientific_Stabilization.zip` verified via isolated fresh-directory extraction.

---

## [0.6.0] — 2026-11-21

### Added
- **General Atomic & Quantum Domain Layer (`src/domain/`, `src/physics/units.ts`)**:
  - Added general `AtomicSystem` ($Z = 1..118$, $N \ge 0$, $q = Z - N$ cations/anions/neutral), `IsotopeSpec` explicitly distinguishing bare `nuclearMass_u` from `neutralAtomicMass_u`, and `NuclearModel` (`point-infinite-mass`, `point-finite-mass`, `finite-uniform`, `finite-fermi`).
  - Added strictly typed `QuantumState` union (`NonRelativisticState`, `RelativisticState`, `SuperpositionState`, `ConfigurationAverageState`) with exact $\kappa \leftrightarrow (l, j)$ bijections and validity guards.
  - Added centralized pinned `CODATA-2018` physical constants and typed unit conversion algebra (`Ha`, `eV`, `J`, `cm-1`, `a0`, `m`, `angstrom`, `nm`, `pm`, `fm`, `s`, `au_t`, `Hz`, `THz`, `u`, `kg`, `me`, `e`, `C`).
- **Auditable Experiment Platform (`src/experiments/`, `src/workers/`)**:
  - Separated versioned `ExperimentDefinition` (`atom-exp/v1`), `ExperimentExecution` (`atom-exec/v1`), `ExperimentResultRecord` (`atom-res/v1`), and `ScientificProvenance`.
  - Implemented `ExperimentRunner`, `ExperimentScheduler` (monotonic `runSequence` stale-result protection, `assertStructuredCloneSafe`), real `AbortSignal` cancellation, `ExperimentWorkerClient` (`experiment.worker.ts`), `IndexedDBExperimentStore` (`atoms_laboratory_db`, with `MemoryExperimentStore` fallback), and schema-validated `ExperimentSerializer` (`atoms-experiment-bundle` JSON export/import distinguishing `computed` vs `loaded-from-store` vs `imported-json`).
- **Analytical Physics Providers (`src/physics/providers/`)**:
  - Implemented `schrodingerCoulombV6Provider` (`0.6.0`) wrapping `v0.5` hydrogenic math with isotope bare-nuclear reduced-mass scaling, analytic expectation values ($\langle r^k \rangle$, $k = -3..-1, 1, 2$), and domain gating.
  - Implemented `diracCoulombV6Provider` (`0.6.0`) solving exact point-Coulomb 4-component Dirac spinors ($P_{n\kappa}, Q_{n\kappa}, \Omega_{\kappa m_j}$), Sommerfeld–Dirac fine-structure energies, nonrelativistic $\alpha \to 0$ convergence, spinor quadrature norms, and exact $(Z\alpha)^2 < \kappa^2$ domain enforcement.
  - Preserved and adapted `v0.5` providers (`lobato2026-df`, `pyscf-hf`, `browser-slater`, `datatoms-2026-mcdf`, `grasp-mcdhf`) in `PhysicsProviderRegistry`.
- **Quantum Visualization Numerics (`src/numerics/isosurface/`, `src/sampling/diracSampler.ts`, `src/workers/visualization.worker.ts`)**:
  - Added off-thread Dirac 4-spinor cloud sampling (`total |Ψ|²`, `large |P|²`, `small |Q|²` views), watertight 6-tetrahedra 3D Marching Tetrahedra isosurface mesh extraction (`extractStateIsosurface`), and 2D XY/XZ/YZ plane slice heatmaps (`Slice2DCanvas`).
- **E1 Transitions & Dynamic Spectroscopy (`src/physics/transitions/`, `src/physics/spectroscopy/`)**:
  - Implemented `BigInt`-stabilized `wigner3j` / `wigner6j` angular algebra and length-gauge Nonrelativistic Schrödinger & Relativistic Dirac E1 transition calculators (selection rules, polarization components $q = -1,0,+1$, oscillator strength $f_{if}$, Einstein $A_{fi}$, $\Delta E$, vacuum $\lambda$).
  - Implemented `generateHydrogenLikeSpectrum` (`lyman`, `balmer`, `paschen`, `custom` series, vacuum convention, zero empirical broadening) with empirical $^1\text{H}$ vacuum NIST comparison (`src/data/references/nistHydrogenLines.json`, derived transparently from pinned `nist_asd_ie.tsv`).
- **Integrated ATOMS Laboratory UI (`src/components/laboratory/`, `src/app/useAtomsLaboratory.ts`)**:
  - Added `WorkspaceNav` unifying 8 live workspaces (`Workbench`, `Atomic Systems`, `Quantum States`, `Energy Structure`, `Transitions`, `Spectroscopy`, `Analysis`, `Experiment History`) while keeping the `v0.5` `OrbitalScene` WebGL2 context preserved.
- **Verification & Documentation**:
  - Expanded suites to 15 Vitest files (**112 tests**), **340** C++17 native checks (Debug + Release), and **20** Playwright browser tests (`v0.5` regression + `v0.6` laboratory).
  - Delivered all 15 v0.6 documentation files under `docs/`.
- **Git Release Engineering & Artifact Packaging**:
  - Preserved `v0.5.0` immutably via annotated tag `v0.5.0` and branch `release/v0.5.0` (`47b84f8`).
  - Maintained `v0.6.0` on dedicated development branch `development/v0.6.0` with annotated release tag `v0.6.0` and reproducible release packager `scripts/package_release.mjs` (`npm run release:pack`) producing source archive, standalone web bundle, manifest, and SHA-256 checksums.

---

## [0.5.0] — 2026-11-20

### Added
- **All-Element Relativistic Total Electron Densities (`Z = 1..118`)**:
  - Integrated the Lobato et al. (2026) element-adaptive Dirac–Padé parameterization of all-electron relativistic B-spline Dirac–Fock (`atomx`, finite nuclear charge distribution, spherical average of open-shell occupations; exact Dirac 1s for `Z = 1`) across all 118 elements (`arXiv:2608.14934`, Apache-2.0).
  - Added closed-form evaluator and deterministic radial quadrature validator `src/physics/diracFock.ts` (`diracFockDensityBohr3`, `diracFockRadialPDF`, `diracFockRadialGrid`) with `< 2e-7` relative charge conservation error across `Z = 1..118`.
  - Wired `"tabulated-df"` inverse-CDF Monte Carlo sampling in `src/sampling/sampler.ts` and made Lobato 2026 Dirac–Fock the default quantitative density source in Full-Atom mode (`?source=dirac-fock|hf|model`).
- **Pinned Scientific Data Pipeline (`data/sources/`, `science/build_atomic_data.py`)**:
  - Pinned verbatim upstream snapshots with SHA-256 verification in `data/sources/MANIFEST.json`.
  - Enriched `ElementRecord` (`src/data/elements.ts`) with NIST ground terms, uncertainties, and honest `unavailable` status for missing `Z = 109..118`.
- **118-Element Provider & Coverage Architecture**, honest UI/Inspector enhancements, and `v0.5.0` verification suite.

### Fixed
- Fixed `OrbitalScene.ts` single-layer `ownMax` normalization, `App.tsx` cached electron-count retention, and incompatible color-mode enforcement in total-density modes.
