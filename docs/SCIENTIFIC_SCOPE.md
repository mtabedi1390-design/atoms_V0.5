# Scientific Scope — ATOMS v0.7.0

**ATOMS** is a computational atomic-physics laboratory focused on isolated atoms and ions (`Z = 1..118`, $N \ge 0$, $q = Z - N$) combining exact analytical one-electron quantum solvers, **live non-relativistic multi-electron Hartree–Fock (`PySCF 2.15.1` + `libcint` + `BSE 0.12`)**, and audited 118-element reference density datasets.

## In Scope (`v0.7.0`)

1. **Live Nonrelativistic Multi-Electron Hartree–Fock (`pyscf-hf-live`, `v0.7.0`)**:
   - Fixed clamped point-infinite-mass non-relativistic $N$-electron Hamiltonian ($\sum_i (-\frac{1}{2}\nabla_i^2 - Z/r_i) + \sum_{i<j} r_{ij}^{-1}$).
   - Independent formalisms: `RHF` (strictly `2S=0`), `UHF` (spin-resolved $\alpha/\beta$, $\rho_s$, $\langle S^2 \rangle$), `ROHF` (Roothaan effective Fock + explicit Koopmans $\langle F^\alpha \rangle, \langle F^\beta \rangle$), and `AtomSphAverageRHF` (spherical fractional configuration average).
   - Explicit neutral/ionic configurations (`Curated NIST Ground`, `Aufbau + Hund`, `User Custom`), verified all-electron `BSE v1` basis coverage (`STO-3G` `1..54`, `6-31G`/`def2-SVP`/`def2-TZVP` `1..36`, `cc-pVDZ`/`cc-pVTZ` `1..36 \ {19}`, `aug-cc-pVTZ` `1..36 \ {19,20}`), `110`-point Lebedev radial total/spin integration, and genuine 3D GTO spatial orbital/density grids (`mo-signed`, `mo-density`, `total-density`, `spin-density`).
2. **Exact Nonrelativistic One-Electron Hydrogenic Solvers (`schrodinger-coulomb`)**:
   - Point-nucleus Coulomb Hamiltonian with `point-infinite-mass` and isotope bare-nuclear `point-finite-mass` reduced-mass scaling ($N = 1$, $1 \le Z \le 118$), nodes, analytic $\langle r^k \rangle$, superpositions, and probability current $\mathbf{j}$.
3. **Exact Relativistic 4-Component Dirac–Coulomb Solvers (`dirac-coulomb`)**:
   - Point-Coulomb Sommerfeld–Dirac eigenvalues, coupled $(P_{n\kappa}, Q_{n\kappa}) \Omega_{\kappa m_j}$ spinors, and $(Z\alpha)^2 < \kappa^2$ domain gating ($N = 1$).
4. **Ab Initio Electric-Dipole (E1) Transitions & Discrete Vacuum Spectroscopy ($N = 1$)**:
   - NR and Dirac length-gauge E1 selection rules, polarization channels, oscillator strengths, Einstein $A$, and discrete vacuum series compared against NIST $^1\text{H}$ (zero broadening).
5. **All-Electron Relativistic Total Spherical Electron Densities (`Z = 1..118`) & Bundled Snapshots**:
   - Lobato et al. (2026) Dirac–Padé total spherical density parameterization (`< 2e-7` norm error) and `v0.5` `aug-cc-pVTZ` total density exports, alongside qualitative Slater subshells (`Model B`).
6. **Pinned Atomic Reference Metadata (`Z = 1..118`)**:
   - NIST ASD (`Z = 1..108`, `Z = 109..118` `unavailable`), CIAAW 2021 atomic weights, Cordero 2008 covalent radii (`Z ≤ 96`), and pinned HF limits (`compas/sphf`, Koga–Thakkar 1999).

## Explicitly Out of Scope (Not Implemented in `v0.7.0`)

ATOMS does **not** implement or fabricate:
- Electron correlation methods (`MP2`, `CCSD`, `CISD`, `MCHF` — planned `v0.7.1`) or Effective Core Potentials (`def2-*` for `Z >= 37` is excluded rather than miscalculated without ECPs).
- Multi-electron relativistic Dirac–Fock / MCDHF / RCI (`v0.8.0`/`v0.8.1`; `GRASP2018` and `Datatoms` remain registered `unavailable`).
- Finite-nucleus numerical radial solvers (`finite-uniform` and `finite-fermi` remain `unsupported solver`).
- Multi-electron optical spectra (`A_fi` transitions cover $N = 1$ only), higher-order QED Lamb shift, Breit interaction, hyperfine splitting, Stark/Zeeman external fields, or collisional-radiative plasma modeling.
