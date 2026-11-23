# ATOMS v0.7.0 — Release Notes (Multi-Electron Atomic Structure)

**Release Date:** 2026-11-21  
**Project:** ATOMS — General Atomic Quantum Laboratory  
**Target Version:** `0.7.0` (built upon stabilized `v0.6.1`)

---

## Release Highlights

1. **Genuine Live Multi-Electron Hartree–Fock Engine (`PySCF 2.15.1` + `libcint` + `BSE 0.12`)**:
   - Hardened local Express 5 backend (`server.ts` + `science/hf_backend.py` using `.venv`) binding `127.0.0.1` by default (with `--host`/`--port` container overrides), Host/Origin `403` guard, `EADDRINUSE` owner diagnostics, and clean child reaping.
   - Distinct computational modes (`RHF (det)`, `UHF (det)`, `ROHF (det)`, `AtomSphAvg (ensemble)` with `atomic_configuration` override for ions and curated ground states), true AO orbitals, `<Fα>`/`<Fβ>`, `T + V + J + K`, `<S²>` (or explicit `available: false` on spherical ensembles), 110-point Lebedev angular isotropy & radial density profiles, and SCF histories.
2. **Direct Independent `compas/sphf` Validation & Open-Shell Matrix**:
   - Built unmodified upstream `compas/sphf` (`commit 913991f`, MIT) with `gfortran 12.3.0`, verified `test_all/run1..8`, and produced matched basis-sequence comparisons across `He..Ne`, `V 4F`, and `Cr 7S`, plus an open-shell validation matrix covering `Li, B, C, N, O, F, Cr, C+`.
3. **Full Preservation of `v0.5.0` and `v0.6.1`**:
   - Analytical Schrödinger–Coulomb and 4-component Dirac–Coulomb solvers, E1 transitions, discrete vacuum spectroscopy, 118-element Lobato Dirac–Fock datasets, native C++17 checks (`340/340` Debug & Release), `134` Vitest tests, and `25` Playwright browser tests pass cleanly.

---

## Known Limitations & Explicit Out-of-Scope Boundaries

- **Unavailable State Quantities**: Term-resolved $LS$ multiplets ($^{2S+1}L$), relativistic total $J$, and 2-particle $\langle \hat{L}^2 \rangle$ are **not implemented in `v0.7.0`** and are reported explicitly as unavailable (`null`).
- **All-Electron Basis Coverage (`BSE v1`)**: `def2-SVP` and `def2-TZVP` are capped at `Z <= 36` (H–Kr) because BSE marks `Z >= 37` with Effective Core Potentials (`has_ecp = True`); `cc-pVDZ`/`cc-pVTZ` omit `K (19)` and `aug-cc-pVTZ` omits `K (19), Ca (20)` per BSE v1.
- **Physical Scope**: Fixed point-infinite-mass non-relativistic HF only (`point-finite-mass`, `finite-uniform`, `finite-fermi` rejected honestly); omits electron correlation (`MP2`/`UMP2`/`CISD`/`FCI`/`CCSD`), multi-electron Dirac–Fock / MCDHF (`v0.8.0`/`v0.8.1`), QED, Breit, and external fields.
- **Full Local vs. Static Mode**: Multi-electron HF execution requires the local Express+PySCF runtime (`.venv` via `bash scripts/setup_python_backend.sh`, verified on Ubuntu 22.04 `x86_64`). Static HTML previews without Express report `backend offline` honestly rather than simulating HF results.
