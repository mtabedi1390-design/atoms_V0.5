# Changelog

All notable changes to **ATOMS** are documented in this file.

## [0.5.0] — 2026-11-20

### Added
- **All-Element Relativistic Total Electron Densities (`Z = 1..118`)**:
  - Integrated the Lobato et al. (2026) element-adaptive Dirac–Padé parameterization of all-electron relativistic B-spline Dirac–Fock (`atomx`, finite nuclear charge distribution, spherical average of open-shell occupations; exact Dirac 1s for `Z = 1`) across all 118 elements (`arXiv:2608.14934`, Apache-2.0).
  - Added closed-form evaluator and deterministic radial quadrature validator `src/physics/diracFock.ts` (`diracFockDensityBohr3`, `diracFockRadialPDF`, `diracFockRadialGrid`) with `< 2e-7` relative charge conservation error across `Z = 1..118`.
  - Wired `"tabulated-df"` inverse-CDF Monte Carlo sampling in `src/sampling/sampler.ts` and made Lobato 2026 Dirac–Fock the default quantitative density source in Full-Atom mode (`?source=dirac-fock|hf|model`).
- **Pinned Scientific Data Pipeline (`data/sources/`, `science/build_atomic_data.py`)**:
  - Pinned verbatim upstream snapshots with SHA-256 verification in `data/sources/MANIFEST.json`:
    - `data/sources/nist_asd_ie.tsv` (NIST ASD ground configurations, ground terms & $J$, 1st ionization energies + uncertainties for `Z = 1..108`).
    - `data/sources/lobato2026_adaptive_dirac_pade.txt` and `data/sources/lobato2026_positivity_certificate.json`.
  - Generated deterministic JSON assets `src/data/nist/asd_ground_levels.json` and `src/data/df/lobato2026.json`, plus authoritative citation registry `src/data/sources.ts`.
  - Enriched `ElementRecord` (`src/data/elements.ts`) with `groundTerm`, `groundJ`, `isOpenShell`, `ionizationUncertainty_eV`, `ionizationRef`, NIST predicted IEs for `Z = 104..108` (flagged `predicted`), and strict `null` / `unavailable` handling for missing `Z = 109..118` NIST fields.
- **118-Element Provider & Coverage Architecture**:
  - Expanded `src/science/providers.ts` with `lobatoDFProvider` (`computed-and-validated`), `pyscfHFProvider` (`computed-basis-limited`), `browser-slater` (`qualitative-approximation`), `datatoms-2026-mcdf` (explicitly blocked for neutral `Z > 10` due to upstream `1 <= N <= 10` ion scope), and `grasp-mcdhf` (explicitly blocked due to missing GRASP2018).
  - Created machine-readable `src/science/coverageMatrix.ts` and generator `scripts/generate_accuracy_matrix.ts` (`npm run data:matrix` → `docs/ACCURACY_MATRIX.md`).
- **Honest Scientific Visualization & UI Enhancements**:
  - Updated `RadialPlot.tsx` to render true total radial density $P_{\text{total}}(r) = 4\pi r^2\rho(r)$ (with numeric $\langle r \rangle$ and $\int 4\pi r^2\rho(r)\,dr$) when viewing Dirac–Fock or PySCF HF total densities, instead of falling back to single-orbital $P_r(r)$.
  - Updated `TelemetryBar.tsx`, `ControlRail.tsx`, `EnergyDiagram.tsx`, and `Inspector.tsx` to display open-shell spherical-average conventions, disable incompatible subshell-layer/phase controls in total-density modes, separate NIST 1st IE / PySCF total HF energy / model surrogate bars, and surface the per-element coverage matrix.
- **Documentation & Verification Suite**:
  - Added `docs/SCIENTIFIC_SCOPE.md`, `docs/ACCURACY_MATRIX.md`, `docs/USER_GUIDE.md`, and `docs/DEVELOPER_GUIDE.md`; updated `README.md`, `docs/MODELS.md`, `docs/DATA.md`, `docs/AUDIT.md`, `docs/VERIFICATION.md`, and `docs/BENCHMARK.md`.
  - Updated `scripts/test_native.sh` with direct `g++` C++17 Debug + Release fallback when `cmake` is absent, enabling all 5 C++↔TS parity tests in `vitest`.

### Fixed
- **`OrbitalScene.ts` single-layer `ownMax` bug**: `setLayer()` previously omitted `L.ownMax = data.maxDensity`, leaving single-orbital and total-density peak normalization fixed at `1.0`.
- **`App.tsx` cached electron-count loss**: Prevented electron-count totals from disappearing when cached subshells skipped re-sampling after layer parameter updates.
- **Incompatible color-mode enforcement (`App.tsx`)**: Enforced `colorMode = "density"` in total-density modes (`dirac-fock`, `hf`) and `atom` phase views so wavefunction sign/phase colors cannot mislabel spherical densities.
