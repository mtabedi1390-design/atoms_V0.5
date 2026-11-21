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

- **OS / Runtime Tools**: Linux container; Node `v22.23.2`, `npm 10.9.8`, `g++ 12.2.0` (`-std=c++17`), `python3 3.11.2`, `/usr/bin/git` (`git` client installed; container workspace `.git` repository metadata absent). `cmake` and `gfortran` are **not** installed.
- **Python Scientific Virtual Environment (`/opt/atoms-py`)**:
  - `pyscf==2.15.1` (`Apache-2.0`), dynamically linked against bundled `libcint` (`pyscf/lib/libcgto.so`, `BSD-2-Clause` / `Apache-2.0`)
  - `basis-set-exchange==0.12` (`BSD-3-Clause`)
  - `numpy==2.4.6` (`BSD-3-Clause` / `MIT` / `0BSD`)
  - `scipy==1.17.1` (`BSD-3-Clause`; `scipy.libs/libquadmath*.so` bundled under `LGPL-2.1-or-later`)
  - `h5py==3.16.0` (`BSD-3-Clause`)
  - Note: `Unidecode==1.4.0` (`GPL`) is present in `/opt/atoms-py` as an unrelated environment wheel and is **not** imported or required by `science/hf_backend.py` (core `pyscf` runtime requires only `numpy`, `scipy`, `h5py`, and `basis-set-exchange` pulls `argcomplete`, `attrs`, `jsonschema`, `referencing`, `regex`, `rpds-py`, `typing_extensions` — all permissive Apache/BSD/MIT/PSF).

---

## 3. Solver Capability and Quality Matrix

| Dimension | **PySCF (`pyscf==2.15.1`)** | **libcint (`pyscf` bundled `libcgto.so`)** | **Basis Set Exchange (`0.12`)** | **`compas/sphf`** | **`compas/grasp` (`GRASP2018`)** | **`compas/atsp` (`ATSP2K`)** | **`flexible-atomic-code/fac`** | **`drjuls/AMBiT`** | **`dirac` (rel. quantum chemistry)** |
|---|---|---|---|---|---|---|---|---|---|
| **Authoritative Source** | `github.com/pyscf/pyscf` (`v2.15.1`) | `github.com/sunqm/libcint` (via `pyscf`) | `github.com/MolSSI-BSE/basis_set_exchange` (`v0.12`) | `github.com/compas/sphf` | `github.com/compas/grasp` | `github.com/compas/atsp` | `github.com/flexible-atomic-code/fac` | `github.com/drjuls/AMBiT` | `gitlab.com/dirac/dirac` (archived `github.com/-dirac/dirac` note) |
| **Actual Role** | Complete Gaussian GTO SCF / electronic-structure engine | C Gaussian integral library (AO 1e & 2e ERIs) | Standardized GTO & ECP basis repository + format exporter | Standalone numerical B-spline atomic HF solver | Relativistic MCDHF / RCI atomic structure package | Nonrelativistic MCHF / Breit–Pauli atomic package | Relativistic atomic structure, spectra, collisional/plasma code | Relativistic CI + MBPT atomic structure solver | Relativistic 4c / 2c Dirac–Fock / CCSD / CI code |
| **Physical Methods** | `RHF`, `UHF`, `ROHF`, `AtomSphAverageRHF`, DFT, MP2/CCSD (later) | Integral backend only (overlap, kinetic, nuclear, 2e ERIs, spinor) | Basis parameters only (no SCF/integrals) | Non-relativistic spherical B-spline HF (`NRHF` / `ROHF`-like) | Dirac–Hartree–Fock (MCDHF), RCI, Breit, QED estimates | Non-relativistic MCHF, Breit–Pauli CI, E1/E2/M1 | Dirac–Fock–Slater / configuration average, RCI, collisional rates | Relativistic DHF + CI + MBPT (particle-hole) | 4-comp Dirac–Hartree–Fock (`DHF`), Kramers-restricted/unrestricted |
| **Physical Domain** | Atoms & ions ($Z=1..86+$ finite-basis nonrel.), molecules | Gaussian orbital integrals | Periodic table basis sets | Isolated nonrelativistic atoms ($Z=1..100+$, single-conf) | All $Z$, relativistic multi-electron ions/atoms | Multi-electron light/medium-$Z$ atoms | Multi-electron ions, plasma/astrophysics | Heavy/superheavy open-shell atoms & ions | Molecules & atoms, relativistic multi-electron |
| **Atomic Treatment** | Optional `SO(3)` spherical symmetry + explicit `irrep_nelec` $(\alpha,\beta)$ or integer RHF + `atom_hf.AtomSphAverageRHF` | Pure spherical $(5d,7f,9g)$ or Cartesian GTOs | Atom-specific contracted shells & ECP markers | Pure 1D radial B-spline grid; exact angular $F^k, G^k$ couplings | Numerical radial $P_{n\kappa}(r), Q_{n\kappa}(r)$ with $jj$-coupled CSFs | Numerical radial $P_{nl}(r)$ with LSJ CSFs | Radial Dirac orbitals + configuration average | Radial DHF B-spline + CI+MBPT | 4-component spinor GTO basis |
| **Numerical Methods** | DIIS/CDIIS/EDIIS/ADIIS, damping, level shift, stability (`uhf_internal` / `rhf_internal`), Lebedev DFT/density grids | Rys quadrature & Obara–Saika GTO recurrence in C | JSON/NWChem/Gaussian94 schema validation | B-spline Galerkin radial equations + SCF | Numerov/spline radial ODE + SCF angular coefficients | Finite-difference radial ODE + angular package | Radial Dirac finite-difference + central potential | B-spline Dirac + second-order MBPT | 4-component quaternionic SCF + libcint-style / DIRAC integrals |
| **Outputs Available** | `e_tot`, $T, V_{ne}, J, K$, MO $\varepsilon_i$, $C_{\mu i}$, $S_{\mu\nu}$, $P_{\mu\nu}$, $\langle S^2 \rangle$, $\rho(\mathbf{r}), \rho_s(\mathbf{r})$ | AO integral tensors | Exponents, contractions, citations, element masks | Numerical radial HF limits & orbital $\varepsilon$ (`test_all/out*`) | $jj$-CSF levels, $g_J$, HFS, $A_{ki}$, lifetimes | Term energies, oscillator strengths | Level energies, cross sections, $A_{ki}$ | Energy levels, hyperfine, isotope shifts, E1 | 4c spinors, DHF energies, properties |
| **Verification Evidence** | Verified live in ATOMS `v0.7.0` (`hartreeFock.test.ts` + 18-run profiler vs `compas/sphf`, Koga 1999, analytic `-Z²/2`) | Verified via `pyscf==2.15.1` internal consistency `\|E - (T+V+J+K)\| < 2e-12 Ha` | Verified `v0.12` element masks directly in Python (caught `Z=19,20` Dunning gaps & `def2` ECP `Z>=37`) | Pinned published benchmark outputs (`test_all/out1..5`) cross-checked in `benchmarks.ts` | Published literature standard for `v0.8.x` | Published literature standard | Widely used astrophysics/plasma package | Published heavy-atom standard | Published relativistic molecular/atomic standard |
| **Coverage (`v0.7.0`)** | $Z=1..54$ (`sto-3g`), $1..36$ (`6-31g`, `def2-*`), $1..36\setminus\{19\}$ (`cc-pV*Z`), $1..36\setminus\{19,20\}$ (`aug-cc-pVTZ`) | All GTO angular momenta supported by BSE bases | Audited per basis in `basisCatalog.ts` | Selected radial benchmarks (`He, Li, Be, F`, etc.) | Multi-electron Dirac (`v0.8.0/v0.8.1`) | Multi-electron NR CI (`v0.7.1`) | Relativistic plasma (`v0.9.x`) | CI+MBPT (`v0.7.1/v0.8.1`) | 4c DHF (`v0.8.0`) |
| **Performance** | `0.11–0.67 s` total, `6–26 MB` peak RAM across `H..Cr` (`1–46` AOs, 110-pt Lebedev radial + optional 3D grid) | Sub-millisecond–~400 ms per atom SCF in `H..Cr` | `< 10 ms` lookup | Fast 1D radial (`< 100 ms`), not installed locally | Heavy multi-CSF compiles via Fortran/MPI | Heavy Fortran build | C/Fortran build | C++/MPI build (hours on heavy CI) | Heavy Fortran/C++ CMake build |
| **Dependencies** | Python 3.11, NumPy, SciPy, h5py (`libcint` wheel bundled) | Bundled inside `pyscf` wheel | Pure Python (`jsonschema`, `regex`) | Fortran compiler (`gfortran` — **absent locally**) | Fortran + MPI + OpenMP (`gfortran` absent) | Fortran (`gfortran` absent) | C + Fortran + Python | C++ + Boost/Eigen/GSL + BLAS/LAPACK | Fortran + C++ + CMake + MPI |
| **License** | `Apache-2.0` (permissive) | `BSD-2-Clause` / `Apache-2.0` | `BSD-3-Clause` | `MIT` | `MIT` | `MIT` | **`GPL-2.0`** (copyleft) | **`GPL-3.0`** (copyleft) | **`LGPL-2.1`** |
| **Maintenance** | Very active (`2.15.1` current) | Active | Active (`0.12`) | Research reference repo (low churn) | Maintained by CompAS (`grasp2018` / CMake) | Legacy research release (less active than GRASP) | Active | Active | Active (`gitlab.com/dirac/dirac`) |
| **Integration Fit** | **Optimal** — already preinstalled in `/opt/atoms-py`, Express local bridge + Web Worker `ExperimentRunner` | **Optimal** (bundled automatically with PySCF) | **Optimal** (installed in `/opt/atoms-py`) | **Reference benchmark** (`gfortran` missing blocks local build) | Defer to `v0.8.0/v0.8.1` | Defer to `v0.7.1+` | Reject/defer (`GPL-2.0` + plasma scope `v0.9.2`) | Reject/defer (`GPL-3.0` + CI+MBPT scope) | Defer to `v0.8.0` (large binary/CMake footprint) |
| **Recommendation** | **SELECT & REUSE DIRECTLY** | **REUSE VIA PYSCF** | **REUSE DIRECTLY** | **REUSE PINNED BENCHMARKS (`MIT`)** | **DEFER (`v0.8.0/v0.8.1`)** | **DEFER (`v0.7.1`)** | **DEFER (`v0.9.2`, note GPL)** | **DEFER (`v0.7.1+`, note GPL)** | **DEFER (`v0.8.0`)** |

---

## 4. Architectural Decision & Rationale

1. **Primary Multi-Electron Engine**: Reuse **PySCF `2.15.1` + bundled `libcint` + Basis Set Exchange `0.12`** executed via `/opt/atoms-py/bin/python science/hf_backend.py`.
   - Avoids writing a buggy custom GTO integral or DIIS SCF engine when a mature, Apache-2.0 / BSD-licensed suite is preinstalled and directly verified.
2. **Honest Process Boundary (`server.ts` Express API + Web Worker Transport)**:
   - Because `PySCF`/`libcint`/`SciPy` require native shared libraries (`libcgto.so`, BLAS/LAPACK) that **cannot run inside a browser bundle**, ATOMS runs a **local full-stack Express 5 server** (`tsx server.ts` in dev, `NODE_ENV=production node server.ts` in prod) exposing:
     - `GET /api/hf/capabilities`
     - `POST /api/hf/calculate` (streaming/single subprocess invocation of `science/hf_backend.py` with `AbortSignal` / `SIGTERM` cancellation propagation on request close)
   - If opened purely as static HTML without the Express+PySCF backend (`503` / non-JSON response), ATOMS **honestly reports backend unavailability** and disables HF runs instead of fabricating data.
3. **Genuine ATOMS Additions Only Where Reuse Lacked**:
   - Spherical atomic shell-to-`SO(3)` irrep mapping (`_irrep_nelec_from_subshells`) handling `RHF` integer totals vs `UHF`/`ROHF` $(\alpha, \beta)$ pairs and `AtomSphAverageRHF` fractional fallback.
   - `110`-point PySCF **Lebedev** angular quadrature combined with a log radial grid + core shell (`r < 1e-4` Bohr) for radial total & spin density integration ($\int 4\pi r^2\rho\,dr = N$ accurate to $\sim 10^{-8}\,e$ even for nonspherical open-shell atoms).
   - Strict all-electron ECP gating (`def2-SVP`/`def2-TZVP` capped at $Z \le 36$ where BSE `has_ecp == False`) and exact BSE element-mask checks (`K=19`, `Ca=20` excluded cleanly).
   - Pure TypeScript provider (`pyscfLiveProvider`), structured-clone-safe blob-Worker-aware HTTP transport (`transport.ts`), and real 3D grid Marching Tetrahedra / 2D slice adapters (`marchingTetrahedra.ts`).
