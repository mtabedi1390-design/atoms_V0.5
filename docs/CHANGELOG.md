# Changelog

All notable changes to **ATOMS** are documented in this file. See also [`../CHANGELOG.md`](../CHANGELOG.md).

## [0.7.0] — 2026-11-22 (Multi-Electron Atomic Structure)

- Integrated live **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`** multi-electron Hartree–Fock (`RHF (det)`, `UHF (det)`, `ROHF (det)`, `AtomSphAvg (ensemble)`) via Express 5 API (`/api/hf/capabilities`, `/api/hf/calculate`, `127.0.0.1` loopback default with `--host`/`--port` overrides, Host/Origin `403` protection, `EADDRINUSE` diagnostics, and clean child reaping) and `pyscf-hf-live` (`0.7.0`) provider.
- Corrected open-shell & atomic-state semantics: distinguished determinants vs fractional `AtomSphAverageRHF` ensembles (`atomic_configuration` override for ions like `C+` and `Cr 3d5 4s1`, `N>=2` guard, `spinDiagnostics.available = false`), explicitly reported `termSymbol`, `totalJ`, and `lSquared` unavailable rather than fabricating terms, and added 110-pt Lebedev angular isotropy + `SO(3)` subshell degeneracy diagnostics.
- Directly built and executed upstream **`compas/sphf`** (`commit 913991ff361ddb52f05d207c23fd1932d0c960e3`, MIT, `gfortran 12.3.0`) for matched B-spline vs GTO basis-sequence comparisons across `He..Ne` and `V 4F`/`Cr 7S`.
- Added `HartreeFockWorkspace` (9th laboratory tab), real 3D GTO volumetric Marching Tetrahedra projection into Workbench, Analysis 2D slice integration, and honest Static/Viewer offline mode (`backend offline`).
- **Verification**: 17 Vitest suites (**134 tests** incl. `Li, B, C, N, O, F, Cr, C+` open-shell matrix), **340** C++17 native checks (Debug + Release), **25** Playwright full-stack browser tests, isolated `.venv` setup check, server lifecycle/restart/stop checks, and static HTML fallback checks.

## [0.6.1] — 2026-11-21 (Scientific Stabilization)

- Fixed `schrodinger-coulomb` `node-counts` validation for all `m_l !== 0` eigenstates (`ok: true` verified across real and complex bases), `nonrelativisticAngularC1` `(-1)^{l_f}` phase sign verified against 2D spherical quadrature, and E1 rate zeroing + exact `sublevelEinsteinA_s1` on spin/magnetic-forbidden transitions.
- Upgraded `radialNodes` to non-uniform quadratic grid scan (`n = 1..12`), added reduced-mass `a` scaling across `integrateRadialMass`, `radialDomainForMass`, and `RadialPlot`, wired Dirac spinor expectation values into `AnalysisWorkspace`, added `Custom` series `Lower n` UI control in `SpectroscopyWorkspace`, and exposed `CODATA_2018_UNCERTAINTIES`.
- **Verification**: 16 Vitest suites (**126 tests**), **340** C++17 native checks (Debug + Release), **21** Playwright browser tests, and isolated clean-directory extraction verification of `ATOMS_v0.6.1_Scientific_Stabilization.zip`.

## [0.6.0] — 2026-11-21

- Evolves ATOMS v0.5.0 into **ATOMS v0.6.0 — General Atomic Quantum Laboratory**.
- **Domain & Constants**: `AtomicSystem` ($Z = 1..118, N \ge 0, q = Z-N$), distinct `nuclearMass_u` vs `neutralAtomicMass_u`, `NuclearModel`, discriminated `QuantumState`, and pinned `CODATA-2018` typed units (`src/physics/units.ts`).
- **Experiment Platform**: Versioned definitions, executions, and results; off-thread `experiment.worker.ts` execution; cancellation; stale-result `runSequence` guards; IndexedDB (`atoms_laboratory_db`) persistence distinguishing replay vs recomputation; and schema-validated JSON import/export.
- **Physics Solvers**: Analytical `schrodingerCoulombV6Provider`, analytical 4-component `diracCoulombV6Provider`, NR & Dirac E1 dipole matrix elements (`wigner3j`/`wigner6j`, $f_{if}$, Einstein $A_{fi}$), vacuum spectral series (`lyman`, `balmer`, `paschen`, `custom`) with $^1\text{H}$ NIST vacuum benchmarks, and wrapped `v0.5` total-density adapters.
- **Visualization & UI**: Off-thread Dirac 4-spinor sampling, 6-tetrahedra 3D Marching Tetrahedra isosurfaces, 2D XY/XZ/YZ slices, and 8 integrated ATOMS Laboratory workspaces.
- **Verification**: 15 Vitest suites (**112 tests**), **340** C++17 native checks (Debug + Release), and **20** Playwright browser tests (`v0.5` + `v0.6`).

## [0.5.0] — 2026-11-20

- Added Lobato et al. (2026) relativistic Dirac–Fock `Z = 1..118` total spherical densities, SHA-256 pinned data pipeline, observable-dependent `providers.ts` & 118-element `ACCURACY_MATRIX.md`, `RadialPlot` total-density mode, and native C++ parity checks.
