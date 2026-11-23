# ATOMS v0.7.1 — Release Notes (Atomic Term Structure & LS-Coupled CI)

**Release Date:** 2026-11-23  
**Project:** ATOMS — General Atomic Quantum Laboratory  
**Target Version:** `0.7.1` (extending `v0.7.0` Multi-Electron HF & `v0.6.1` Analytical Laboratory)

---

## Release Highlights

1. **Exact Russell–Saunders $LS$ Term Structure & Configuration Coupling (`src/physics/ls/`)**:
   - Real-time client-side configuration parser (`[He]`/`[Ne]`/`[Ar]` shorthands), exact equivalent-electron term decomposition ($s,p,d,f,g,h$), parity $\Pi$, Racah seniority $v$ for repeated $d^q$ terms, Clebsch–Gordan multi-shell coupling (reusing `wigner3j`), and unsplit allowed $J$ ranges.
2. **Fixed-Orbital $LS$-Coupled Multiconfiguration CI (`science/ls_ci_backend.py`, `/api/ls/*`)**:
   - Constructs $SO(3)$-symmetric complex spherical orbitals from `AtomSphAverageRHF` (`sph_pure2real`), projects configuration determinants onto exact orthonormal $(L^2, S^2, \Pi)$ CSFs (`np.linalg.eigh` `dsyevd`, orthonormality error `< 3e-15`, $\langle L^2 \rangle$/$\langle S^2 \rangle$ error `< 6e-15`), diagonalizes dense/sparse Slater–Condon Hamiltonians across `single-config`, `valence-cas`, `valence-plus-virtuals` (`CIS`/`CISD`/CAS), and `custom-configs`, and cross-checks CAS eigenvalues against `pyscf.fci.direct_spin1` to `< 1e-12 Ha`.
3. **10th Workspace (`Atomic Terms & CI`) & Preserved Regression Baseline**:
   - Full `ExperimentRunner` / Web Worker / IndexedDB persistence, NIST ASD $(2J+1)$-weighted term centroids + `ATSP2K` published MCHF literature comparisons, and **100% preserved** `v0.5.0`–`v0.7.0` solvers & endpoints (`/api/hf/*`, Schrödinger, Dirac, E1 transitions, spectroscopy, WebGL2).
   - **Verified Checks**: `141/141` Vitest tests (`18` files), `340/340` C++17 Debug & Release checks, `27/27` Playwright browser tests, and `NODE_ENV=production node server.ts` verification.

---

## Known Limitations & Explicit Out-of-Scope Boundaries

- **Fixed Radial Orbitals (No MCHF in `v0.7.1`)**: Radial orbitals originate from ground-state `AtomSphAverageRHF` and are **not** self-consistently re-optimized per CI root (`orbitalOptimizationSupported: false`; deferred to `v0.7.2`/`v0.8.x`).
- **No Spin–Orbit $J$ Splittings or Post-CI Dynamical Correlation**: Russell–Saunders multiplets remain $J$-degenerate (unsplit $J$ ranges only); `MP2`, `CCSD`, `NEVPT2`, and multi-electron Dirac–Fock / MCDHF (`GRASP2018`/`Datatoms`) are not implemented.
- **LS-CI Domain & Resource Limits**: Supported for `Z = 1..30`, `N >= 2`, `point-infinite-mass` nucleus, BSE v1 all-electron bases (`K=19`/`Ca=20` omitted in standard Dunning sets), and pre-allocation limits (`maxDeterminants = 12,000`, `maxCsfs = 2,500`).
- **Docker CLI Verification**: Container `Dockerfile` and `.dockerignore` are present and verified by inspection; local `docker` CLI build is `BLOCKED` in this runtime because `docker` is not installed inside the container.
- **Full Local vs. Static Mode**: Live HF and LS-CI execution require `.venv` / `ATOMS_PYTHON` (`PySCF 2.15.1` + `BSE 0.12`) served behind `server.ts`. Standalone static HTML reports `Offline / Unavailable` honestly.
