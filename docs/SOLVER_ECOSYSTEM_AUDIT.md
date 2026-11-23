# Solver Ecosystem Audit & Capability Matrix (`ATOMS v0.7.0`)

**Principle:** *Search before coding. Measure before replacing. Reuse before reimplementing. Improve before duplicating. Validate before claiming superiority.*

This document records the mandatory Phase 1–2 codebase & environment discovery, full solver capability and quality matrix, license/supply-chain audit, comparison evidence, and architectural selection rationale for **ATOMS v0.7.0 — Multi-Electron Atomic Structure**.

---

## 1. Existing ATOMS Codebase Inventory (`v0.6.1` Baseline)

Every computational file in the `v0.6.1` baseline was inspected and classified by actual function:

| Component | Location | Classification | Actual Role & Limitation |
|---|---|---|---|
| Analytic Schrödinger–Coulomb engine | `src/physics/hydrogenic.ts`, `src/physics/providers/schrodinger/index.ts`, `native/quantum_core.hpp` | **True Calculation Engine** | Exact analytic non-relativistic $N=1$ Coulomb bound states ($E_n, R_{nl}, Y_l^m$, reduced mass). Strictly $N=1$; cannot treat $e^-$-$e^-$ interactions. |
| Analytic Dirac–Coulomb engine | `src/physics/providers/dirac/index.ts` | **True Calculation Engine** | Exact 4-component point-Coulomb Dirac bispinors ($P_{n\kappa}, Q_{n\kappa}, \Omega_{\kappa m_j}$) for $N=1$, $(Z\alpha)^2 < \kappa^2$. Strictly $N=1$. |
| E1 Transitions & Spectroscopy | `src/physics/transitions/`, `src/physics/spectroscopy/` | **True Calculation Engine** | Length-gauge NR & Dirac E1 dipole matrix elements + Wigner 3-j/6-j (`src/numerics/specialFunctions/wigner.ts`). Strictly $N=1$. |
| Lobato 2026 Dirac–Fock evaluator | `src/physics/diracFock.ts`, `src/data/df/lobato2026.json` | **Dataset + Evaluator** | Analytic Dirac–Padé parameterization of `atomx` B-spline Dirac–Fock neutral spherical total densities (`Z=1..118`). Not a self-consistent solver; no subshell orbitals or ions. |
| Static `v0.5` PySCF HF JSON datasets | `src/data/hf/*.json`, `science/export_hf_datasets.py` | **Dataset + Offline Export Script** | Precomputed static `aug-cc-pVTZ` total spherical $\rho(r)$ and scalar $E_{\text{HF}}$ for neutral `H, He, C, N, O, Ne` only. Does not return orbitals or run interactively. |
| Slater empirical screening model | `src/physics/models.ts` | **Qualitative Surrogate** | $Z_{\text{eff}} = Z - S$ independent-electron hydrogenic approximation (`Model B`). Non-self-consistent; no two-electron integrals or exchange. |
| 3D Marching Tetrahedra & MC Samplers | `src/numerics/isosurface/marchingTetrahedra.ts`, `src/sampling/` | **Numerical Utilities** | Watertight 6-tetrahedra isosurface extractor, 2D slice evaluator, `xoshiro128**` Monte Carlo inverse-CDF samplers. |
| Experiment & Worker Infrastructure | `src/experiments/`, `src/workers/` | **Application Infrastructure** | Versioned definitions/executions/results, IndexedDB persistence, cancellation, replay vs recompute tracking. |
| Legacy `datatoms-2026-mcdf` / `grasp-mcdhf` adapters | `src/physics/providers/legacyAdapters.ts` | **Unavailable Stub Adapters** | Honestly report `available: false` (no external package installed or bundled). |

**Conclusion:** Zero self-consistent multi-electron Hartree–Fock solver ran live inside `v0.6.1`.

---

## 2. Execution Environment & Installed Library Inventory

Verified in `/app/applet` at execution time:

- **OS / Runtime Tools**: Linux container (`x86_64`); Node `v22.23.2`, `npm 10.9.8`, `g++ 12.2.0` (`-std=c++17`), `gfortran 12.3.0` (`GNU Fortran (Ubuntu 12.3.0-1ubuntu1~22.04.3)`), `liblapack-dev` / `libblas-dev` (`3.11.0-2`), `python3 3.11.2`, `/usr/bin/git`.
- **Python Scientific Virtual Environment (`.venv` / isolated `ATOMS_VENV` verified)**:
  - `pyscf==2.15.1` (`Apache-2.0`), dynamically linked against bundled `libcint` (`pyscf/lib/libcgto.so`, `BSD-2-Clause` / `Apache-2.0`)
  - `basis-set-exchange==0.12` (`BSD-3-Clause`)
  - `numpy==2.4.6` (`BSD-3-Clause` / `MIT` / `0BSD`)
  - `scipy==1.17.1` (`BSD-3-Clause`; `scipy.libs/libquadmath*.so` bundled under `LGPL-2.1-or-later`)
  - `h5py==3.16.0` (`BSD-3-Clause`)
  - Runtime dependencies of `science/hf_backend.py` use only `pyscf`, `numpy`, `scipy`, `h5py`, and `basis_set_exchange`.

---

## 3. Installed PySCF `2.15.1` Source Audit (Open Shells, `SO(3)`, & `AtomSphAverageRHF`)

Direct inspection of `.venv/lib/python3.11/site-packages/pyscf/scf/{atom_hf.py,hf_symm.py,rohf.py,uhf.py,uhf_symm.py,hf.py}` and `pyscf/symm/basis.py` establishes:

1. **`atom_hf.py` (`AtomSphAverageRHF`)**:
   - Line 34 still carries `atm_template.symmetry = False  # TODO: enable SO3 symmetry here` (runs in `C1`).
   - `AtomSphAverageRHF` subclasses `hf.RHF` (`N_alpha == N_beta` spin-unpolarized fractional shell occupations), so it does **not** carry a well-defined `<S^2>` spin-squared expectation value (ATOMS therefore reports `spinDiagnostics.available = false, sSquared = null, multiplicity = null`).
   - Line 152 uses `elements.NRSRHF_CONFIGURATION[nuc]` ignoring `mol.charge` and defaulting `Cr` to `3d4 4s2`. ATOMS fixes this by setting `mf.atomic_configuration = {sym_or_Z: [s_count, p_count, d_count, f_count]}` explicitly from `subshellOccupations`, restoring exact ion electron counts (`C+ tracePS = 5.000000`) and curated ground `Cr 3d5 4s1`.
2. **`hf_symm.py` & `uhf_symm.py` (`SO3` Symmetry)**:
   - `hf_symm.py` line 296 carries `#TODO: force SO3 orbitals p+0,p-1,p+1, ... using the same coefficients`, and `get_wfnsym` maps `SO3 -> D2h/C2v` with a warning (`uhf_symm.py` line 68 also notes `TODO: total wave-function symmetry for SO3`).
   - Numerical tests verify that equally occupied subshells (`C, N, Cr` under `SO3`) preserve degeneracy to `< 1.5e-14 Ha`, while open $d$ determinants (e.g., `V 3d3`) depend strongly on explicit `m_l` occupation choices (`[0,+1,-1]` vs `t2g [-2,-1,+1]` differ by `~51 mHa`).
3. **Term Resolution Unavailable in `v0.7.0`**:
   - Neither `RHF`, `UHF`, `ROHF`, nor `AtomSphAverageRHF` performs multi-determinant CSF coupling into `^{2S+1}L` or relativistic `J`. ATOMS sets `termResolution.supported = false`, `termSymbol = null`, `totalJ = null`, and `lSquaredAvailable = false`.

---

## 4. Solver Capability and Quality Matrix

| Dimension | **PySCF (`pyscf==2.15.1`)** | **libcint (`pyscf` bundled `libcgto.so`)** | **Basis Set Exchange (`0.12`)** | **`compas/sphf` (`commit 913991f`)** | **`compas/grasp` (`GRASP2018`)** | **`compas/atsp` (`ATSP2K`)** | **`flexible-atomic-code/fac`** | **`drjuls/AMBiT`** | **`dirac` (rel. quantum chemistry)** |
|---|---|---|---|---|---|---|---|---|---|
| **Authoritative Source** | `github.com/pyscf/pyscf` (`v2.15.1`) | `github.com/sunqm/libcint` (via `pyscf`) | `github.com/MolSSI-BSE/basis_set_exchange` (`v0.12`) | `github.com/compas/sphf` (`913991ff361ddb52f05d207c23fd1932d0c960e3`) | `github.com/compas/grasp` | `github.com/compas/atsp` | `github.com/flexible-atomic-code/fac` | `github.com/drjuls/AMBiT` | `gitlab.com/dirac/dirac` |
| **Actual Role** | Complete Gaussian GTO SCF / electronic-structure engine | C Gaussian integral library (AO 1e & 2e ERIs) | Standardized GTO & ECP basis repository + format exporter | Standalone numerical B-spline atomic HF solver | Relativistic MCDHF / RCI atomic structure package | Nonrelativistic MCHF / Breit–Pauli atomic package | Relativistic atomic structure, spectra, collisional/plasma code | Relativistic CI + MBPT atomic structure solver | Relativistic 4c / 2c Dirac–Fock / CCSD / CI code |
| **Physical Methods** | `RHF`, `UHF`, `ROHF`, `AtomSphAverageRHF` (HF methods used in `v0.7.0`) | Integral backend only (overlap, kinetic, nuclear, 2e ERIs) | Basis parameters only (no SCF/integrals) | Non-relativistic spherical B-spline HF (term-specific + config avg) | Dirac–Hartree–Fock (MCDHF), RCI, Breit, QED | Non-relativistic MCHF, Breit–Pauli CI, E1/E2/M1 | Dirac–Fock–Slater / configuration average, RCI | Relativistic DHF + CI + MBPT | 4-comp Dirac–Hartree–Fock (`DHF`) |
| **Physical Domain** | Atoms & ions (`STO-3G` `1..54`, `6-31G`/`def2` `1..36`, Dunning subset) | Gaussian orbital integrals | Periodic table basis sets | Isolated nonrelativistic atoms ($Z=1..100+$, single-conf) | All $Z$, relativistic multi-electron ions/atoms | Multi-electron light/medium-$Z$ atoms | Multi-electron ions, plasma/astrophysics | Heavy/superheavy open-shell atoms & ions | Molecules & atoms, relativistic multi-electron |
| **Verification Evidence** | Verified live in ATOMS `v0.7.0` (`hartreeFock.test.ts`, Playwright, open-shell matrix) | Verified via `pyscf==2.15.1` consistency `\|E - (T+V+J+K)\| < 2e-12 Ha` | Verified `v0.12` element masks directly in Python (`K=19, Ca=20`, `def2 Z>=37` ECP boundary) | **Directly built with `gfortran 12.3.0` & executed** (`test_all/run1..8` + `B, C 3P/AV, N, O 3P, Ne, V 4F, Cr 7S`) | Deferred to `v0.8.x` | Deferred to `v0.7.1+` | Deferred to `v0.9.2` | Deferred to `v0.7.1/v0.8.1` | Deferred to `v0.8.0` |
| **License** | `Apache-2.0` | `BSD-2-Clause` / `Apache-2.0` | `BSD-3-Clause` | `MIT` | `MIT` | `MIT` | `GPL-2.0` | `GPL-3.0` | `LGPL-2.1` |
| **Recommendation** | **SELECT & REUSE DIRECTLY** | **REUSE VIA PYSCF** | **REUSE DIRECTLY** | **INDEPENDENTLY BUILT & RUN AS VALIDATION BENCHMARK** | **DEFER (`v0.8.x`)** | **DEFER (`v0.7.1`)** | **DEFER (`v0.9.2`)** | **DEFER (`v0.7.1+`)** | **DEFER (`v0.8.0`)** |

---

## 5. Architectural Decision & Execution Modes

1. **Full Local Scientific Mode**: Express 5 (`server.ts`) serves the SPA and `/api/hf/*` on the same local origin, bound to **`127.0.0.1` by default** (overridable via `--host` / `ATOMS_HOST` for managed containers), validating Host/Origin headers (`403 FORBIDDEN_ORIGIN` on cross-origin requests), invoking `.venv/bin/python science/hf_backend.py`, propagating client aborts via `SIGTERM -> SIGKILL`, diagnosing `EADDRINUSE` without killing unrelated processes, and reaping active children + Vite cleanly on `SIGINT`/`SIGTERM`.
2. **Static / Viewer Mode**: Serving `dist/index.html` statically (`vite preview` or standalone file/static CDN) cannot execute PySCF/libcint. `transport.ts` detects non-JSON/503 capability responses, marks the HF backend offline, and disables live HF runs rather than simulating results.
3. **Genuine ATOMS Layer**: `SO(3)` subshell-to-irrep occupation mapper + explicit `atomic_configuration` override for `AtomSphAverageRHF`, 110-point Lebedev angular quadrature + angular isotropy check, ECP/element gating, structured-clone-safe Worker transport, and Marching Tetrahedra / 2D slice visualizers.
