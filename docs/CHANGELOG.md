# Changelog

All notable changes to **ATOMS** are documented in this file. See also [`../CHANGELOG.md`](../CHANGELOG.md).

## [0.7.2] — 2026-11-25 (Post-Hartree–Fock Electron Correlation)

- Implemented real post-Hartree–Fock **Electron Correlation** (`science/correlation_backend.py`, `/api/correlation/capabilities`, `/api/correlation/calculate`) powered by **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`**: `RMP2`, `UMP2`, `ROMP2`, `RCISD`, `UCISD`, and bounded Direct `FCI` / `CASCI` (`none` vs `noble-core`, multi-root `fix_spin_`, `direct_uhf` overlap-corrected `<S²>`).
- Enforced domain, UI, API, and Python guardrails: rejects `AtomSphAverageRHF` fractional ensembles, rejects `ROHF + CISD` (PySCF silent `UCISD` conversion), adds HF-seed `[1, 0, ...]` retry in `_solve_cisd` (fixing BSE `Li/cc-pVDZ UCISD`), checks `|E_total - (E_HF + E_corr)| < 1e-9 Ha`, enforces pre-allocation limits (`N_det <= 200,000`, `CISD dim <= 2,000,000`), and clarifies determinant spaces are not `<L²>`-resolved LS-CSFs.
- Integrated `ElectronCorrelationState`, `pyscfCorrelationProvider`, Firebase `"electron-correlation"` schema/rules (`DeployRules` deployed), and the **Electron Correlation** tab (`ElectronCorrelationWorkspace.tsx`) with preflight dimension estimator, Matched Cross-Method Comparison table, Worker execution, IndexedDB replay, and honest offline reporting.
- Verified with `10` Python correlation `unittest` checks (`He`, `Li`, `Be`, `B`, `Ne`, and `He2/6-31G` at 100 Bohr size-extensivity test), Vitest integration tests (`correlation.test.ts`), and Playwright E2E browser tests (`correlation.spec.ts`).

## [0.7.1] — 2026-11-23 (Atomic Term Structure & LS-Coupled Multiconfiguration CI)

- Audited CompAS/academic (`ATSP2K`, `atsp`, `atsp-book`, `spmchf`, `sphf`) and PySCF modules (`docs/ATOMIC_LS_SOLVER_AUDIT.md`) and implemented **Fixed-Orbital LS-Coupled Multiconfiguration CI** (`science/ls_ci_backend.py` + `src/physics/ls/`) mounted at `GET /api/ls/capabilities` & `POST /api/ls/calculate` alongside preserved `/api/hf/*`.
- Added exact Russell–Saunders term enumeration (parity, Racah seniority $v$ on $d^q$, multi-shell Clebsch–Gordan coupling via `wigner3j`), exact $(L^2, S^2, \Pi)$ Casimir CSF projection (upgraded from `scipy.linalg.eigh` `dsyevr` to `numpy.linalg.eigh` `dsyevd` + conditional QR polish to fix 76-D nullspace non-orthogonality on `Fe`), Slater–Condon CI across `single-config` / `valence-cas` / `valence-plus-virtuals` / `custom-configs`, and `pyscf.fci.direct_spin1` oracle cross-checks (`< 1e-12 Ha`).
- Integrated `LSTermCIState`, `atoms-ls-term-ci` provider, `ls-term-ci` Worker/IndexedDB experiment ledger support, and the 10th laboratory tab (`Atomic Terms & CI`) with explicit **Fixed-Orbital CI (MCHF NOT performed)** disclosure and NIST ASD / `ATSP2K` benchmarks.
- **Verification**: 18 Vitest suites (**141 tests**), **340** C++17 native checks (Debug + Release), **27** Playwright full-stack browser scenarios (including live `C ³P` LS-CI -> IndexedDB replay and static HTML offline guard), and production `node server.ts` verification.

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
