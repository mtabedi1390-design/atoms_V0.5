# ATOMS v0.7.0 — Release Notes (Multi-Electron Atomic Structure)

**Release Date:** 2026-11-21  
**Project:** ATOMS — General Atomic Quantum Laboratory  
**Target Version:** `0.7.0` (built upon stabilized `v0.6.1`)

---

## Release Highlights

1. **Genuine Live Multi-Electron Hartree–Fock Engine (`PySCF 2.15.1` + `libcint` + `BSE 0.12`)**:
   - Local full-stack Express 5 backend (`server.ts` + `science/hf_backend.py` running in `/opt/atoms-py`) delivering real ab initio `RHF`, `UHF`, `ROHF`, and `AtomSphAverageRHF` calculations.
   - True AO-basis orbitals, symmetry irreps, `T + V + J + K` energy breakdown, overlap-metric orthonormality ($\max|C^TSC-I| < 10^{-8}$), $\langle S^2 \rangle$ spin diagnostics, 110-point Lebedev sphericalized radial total/spin densities, and SCF iteration histories.
2. **Domain, Experiment Platform & 3D/2D Visualization Integration**:
   - `MultiElectronHFState`, `pyscf-hf-live` (`0.7.0`) registered in `PhysicsProviderRegistry`, `"multi-electron-hf"` experiment schema/registry, `blob:`-Worker-safe `HFTransport`, IndexedDB replay (`loaded-from-store`) vs fresh recompute (`computed`), and real GTO volumetric 3D Marching Tetrahedra & 2D slices.
   - `HartreeFockWorkspace` with `Curated NIST Ground`, `Aufbau + Hund`, and `User Custom` subshell occupations plus pinned `compas/sphf` / Koga–Thakkar 1999 / exact `-Z²/2` references.
3. **Full Preservation of `v0.5.0` and `v0.6.1`**:
   - Analytical Schrödinger–Coulomb and 4-component Dirac–Coulomb solvers, E1 transitions, discrete vacuum spectroscopy, 118-element Lobato Dirac–Fock datasets, native C++17 checks (`340/340` Debug & Release), and all prior regression tests remain intact and passing.

---

## Known Limitations & Explicit Out-of-Scope Boundaries

- **All-Electron Basis Coverage (`BSE v1`)**: `def2-SVP` and `def2-TZVP` are capped at `Z <= 36` (H–Kr) because BSE marks `Z >= 37` with Effective Core Potentials (`has_ecp = True`); `cc-pVDZ`/`cc-pVTZ` omit `K (19)` and `aug-cc-pVTZ` omits `K (19), Ca (20)` per BSE v1.
- **Physical Scope**: Fixed point-infinite-mass non-relativistic HF only (`point-finite-mass`, `finite-uniform`, `finite-fermi` rejected honestly); omits electron correlation (`MP2`/`CCSD` planned for `v0.7.1`), multi-electron Dirac–Fock / MCDHF (`v0.8.0`/`v0.8.1`), QED, Breit, and external fields.
- **Local Python Requirement**: Multi-electron HF execution requires the local Express+PySCF runtime (`/opt/atoms-py` or `bash scripts/setup_python_backend.sh`). Static HTML-only previews without Express report `backend offline` honestly rather than simulating HF results.
- **Container Git State**: Local container workspace contains no `.git` metadata directory; prior `v0.5.0`/`v0.6.0`/`v0.6.1` commit hashes are retained verbatim from baseline docs, and `v0.7.0` Git delivery steps are documented in [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md).
