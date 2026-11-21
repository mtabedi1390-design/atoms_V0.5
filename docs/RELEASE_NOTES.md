# ATOMS v0.6.0 — Release Notes

**Release Date:** 2026-11-21  
**Project:** ATOMS — General Atomic Quantum Laboratory  
**Target Branch:** `development/v0.6.0` (from `v0.5.0`)

---

## Highlights

1. **Dual Analytical Quantum Solvers (Schrödinger + Dirac 4-Spinor)**:
   Evaluate bound eigenstates for Hydrogen and arbitrary one-electron hydrogen-like ions ($N = 1$, $Z = 1..118$ Schrödinger; $1 \le Z \le 137$ Dirac) with exact bare-nuclear reduced-mass scaling, Sommerfeld–Dirac fine structure, spinor $P/Q$ radial components, $\langle r^k \rangle$ expectation values, and strict $(Z\alpha)^2 < \kappa^2$ domain enforcement.
2. **Ab Initio Electric-Dipole (E1) Transitions & Vacuum Spectroscopy**:
   Compute NR and Relativistic E1 selection rules, polarization channels, oscillator strengths, and Einstein $A$ spontaneous emission rates from radial + Wigner 3-$j$/6-$j$ angular matrix elements. Synthesize discrete vacuum emission/absorption spectra (`Lyman`, `Balmer`, `Paschen`, `Custom`) verified to `< 0.05 nm` against NIST $^1\text{H}$ vacuum centroids.
3. **Browser-Local Reproducible Experiment Platform**:
   Run calculations off-thread in Web Workers with structured-clone validation, cancellation, monotonic stale-result protection, IndexedDB history (`atoms_laboratory_db`), clear distinction between cached result replay (`loaded-from-store`) and fresh recalculation (`computed`), and schema-validated JSON import/export (`atoms-experiment-bundle`).
4. **3D Marching Tetrahedra Isosurfaces & 2D Slices**:
   Visualize exact signed wavefunction lobes, orbital probability densities, and Dirac 4-spinor large/small/total densities on 3D triangle meshes and 2D XY/XZ/YZ heatmaps inside the 8-workspace ATOMS Laboratory UI.
5. **100% `v0.5.0` Preservation**:
   All 118-element Lobato 2026 Dirac–Fock total densities, PySCF `aug-cc-pVTZ` datasets, Slater qualitative subshell visualizations, SHA-256 NIST snapshots, C++17 native reference parity checks, and all 13 `v0.5` Playwright tests remain intact and passing.

---

## Known Limitations & Explicit Out-of-Scope Boundaries

- **One-Electron Analytical Scope**: Exact Schrödinger/Dirac solvers cover strictly $N = 1$ systems and point-Coulomb nuclei. General multi-electron ions ($1 < N < Z$) and anions ($N > Z$) are representable in `AtomicSystem` and intentionally flagged `unsupported` rather than approximated with silent surrogates.
- **No Finite-Nucleus Radial Solver**: `finite-uniform` and `finite-fermi` nuclear models are typed schemas flagged `unsupported solver` in providers until a numerical finite-nucleus radial solver is implemented.
- **Omitted Higher-Order Effects**: Point-Coulomb Dirac eigenstates omit QED Lamb shifts (vacuum polarization & self-energy), Breit magnetic interactions, hyperfine structure, and M1/E2 radiative channels; generated spectra are ideal zero-broadening discrete lines.
- **Workstation Git Delivery**: `.git` metadata is omitted in this container environment; exact local Git branch/commit/push instructions for `development/v0.6.0` are provided in `docs/DEVELOPER_GUIDE.md`.
