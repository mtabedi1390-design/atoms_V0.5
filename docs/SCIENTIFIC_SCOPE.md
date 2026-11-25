# Scientific Scope — ATOMS v0.7.2

**ATOMS** is a computational atomic-physics laboratory focused on isolated atoms and ions (`Z = 1..118`, $N \ge 0$, $q = Z - N$) combining exact analytical one-electron quantum solvers, **live non-relativistic multi-electron Hartree–Fock (`PySCF 2.15.1` + `libcint` + `BSE 0.12`)**, **Russell–Saunders $LS$ term enumeration & Fixed-Orbital $LS$-Coupled Multiconfiguration CI (`v0.7.1`)**, **Post-Hartree–Fock Electron Correlation (`MP2`, `CISD`, `FCI`/`CASCI`, `v0.7.2`)**, and audited 118-element reference density datasets.

## In Scope (`v0.7.2`)

1. **Post-Hartree–Fock Electron Correlation (`pyscf-correlation-live`, `v0.7.2`)**:
   - Real **PySCF `2.15.1`** post-HF correlation energies ($E_{\text{total}} = E_{\text{HF}} + E_{\text{corr}}$) across **MP2** (`RMP2`, `UMP2`, semi-canonical `ROMP2` with `e_corr_singles`), **CISD** (`RCISD`, `UCISD`), and bounded **Direct Full CI / CASCI** (`fci.FCI`, `mcscf.CASCI` without orbital re-optimization, `fci.direct_uhf` with overlap-corrected $\langle S^2 \rangle$).
   - Covers `Z = 1..54`, $N \ge 1$ (`none` vs `noble-core` frozen-core modes, multi-root `nRoots <= 5`, optional `fix_spin_` on RHF/ROHF FCI), explicit exclusion of `AtomSphAverageRHF` fractional ensembles and `ROHF + CISD`, MP2 orbital denominator gap warnings, and pre-allocation determinant/amplitude safety ceilings (`maxFciDeterminants = 200,000`, `maxCisdAmplitudes = 2,000,000`).
   - Determinant CI/MP2/FCI states in `Electron Correlation` explicitly disclose `isLsTermResolved = false` (`lSquared = null`); use **Atomic Terms & CI** for Russell–Saunders $^{2S+1}L^\pi$ terms.
2. **Russell–Saunders Atomic Term Structure & Fixed-Orbital $LS$-Coupled CI (`atoms-ls-term-ci`, `v0.7.1`)**:
   - Exact client-side Russell–Saunders term enumeration ($^{2S+1}L^\pi$, parity $\Pi = (-1)^{\sum q_i \ell_i}$, Racah seniority $v$ for repeated $d^q$ terms, multi-shell Clebsch–Gordan coupling, and unsplit $J$ ranges) for $s, p, d, f, g, h$ configurations (`src/physics/ls/terms.ts`).
   - Exact second-quantized $(L^2, S^2, L_z=L, S_z=S, \Pi)$ CSF projection and Slater–Condon CI diagonalization (`science/ls_ci_backend.py`) over **fixed** $SO(3)$-symmetric radial orbitals from `AtomSphAverageRHF` (`method: "fixed-orbital-ls-ci"`, `orbitalOptimizationSupported: false`).
   - Active spaces (`single-config`, `valence-cas`, `valence-plus-virtuals`, `custom-configs`, CIS/CISD/Full CAS), `Z = 1..30` ($N \ge 2$) gating, pre-allocation safety caps (`maxDeterminants = 12,000`, `maxCsfs = 2,500`), exact `pyscf.fci.direct_spin1` oracle cross-check, and NIST ASD $(2J+1)$-weighted term centroid + `ATSP2K` published MCHF comparison.
3. **Live Nonrelativistic Multi-Electron Hartree–Fock (`pyscf-hf-live`, `v0.7.0`)**:
   - Fixed clamped point-infinite-mass non-relativistic $N$-electron Hamiltonian ($\sum_i (-\frac{1}{2}\nabla_i^2 - Z/r_i) + \sum_{i<j} r_{ij}^{-1}$).
   - Distinct computational modes: `RHF` (`closed-shell-determinant`, `2S=0`), `UHF` (`unrestricted-determinant`, reports `<S²>`), `ROHF` (`restricted-open-shell-determinant`, spin-pure `<S²>=S(S+1)` + Koopmans `<Fα>/<Fβ>`), and `AtomSphAverageRHF` (`spherical-ensemble-average`, spin-unpolarized $N \ge 2$ with explicit `atomic_configuration` override for ions and curated shells, `<S²>` unavailable/`null`). Note: pure HF states in the Hartree–Fock workspace intentionally continue to report `termSymbol = null` and `lSquaredAvailable = false`; use **Atomic Terms & CI** for true $(L^2, S^2, \Pi)$ term-resolved states.
   - Explicit neutral/ionic configurations (`Curated NIST Ground`, `Aufbau + Hund`, `User Custom`), verified all-electron `BSE v1` basis coverage (`STO-3G` `1..54`, `6-31G`/`def2-SVP`/`def2-TZVP` `1..36`, `cc-pVDZ`/`cc-pVTZ` `1..36 \ {19}`, `aug-cc-pVTZ` `1..36 \ {19,20}`), `110`-point Lebedev angular isotropy & radial integration, and genuine 3D GTO spatial orbital/density grids (`mo-signed`, `mo-density`, `total-density`, `spin-density`).
   - **Full Local Scientific Mode vs. Static/Viewer Mode**: Express 5 (`127.0.0.1` default, `ATOMS_HOST` / `--host` overridable, strict Host/Origin `403` guard) bridges `/api/hf/*`, `/api/ls/*`, and `/api/correlation/*` to local Python PySCF; standalone static HTML reports `Offline / Unavailable` honestly and disables live PySCF execution.
4. **Exact Nonrelativistic One-Electron Hydrogenic Solvers (`schrodinger-coulomb`)**:
   - Point-nucleus Coulomb Hamiltonian with `point-infinite-mass` and isotope bare-nuclear `point-finite-mass` reduced-mass scaling ($N = 1$, $1 \le Z \le 118$), nodes, analytic $\langle r^k \rangle$, superpositions, and probability current $\mathbf{j}$.
5. **Exact Relativistic 4-Component Dirac–Coulomb Solvers (`dirac-coulomb`)**:
   - Point-Coulomb Sommerfeld–Dirac eigenvalues, coupled $(P_{n\kappa}, Q_{n\kappa}) \Omega_{\kappa m_j}$ spinors, and $(Z\alpha)^2 < \kappa^2$ domain gating ($N = 1$).
6. **Ab Initio Electric-Dipole (E1) Transitions & Discrete Vacuum Spectroscopy ($N = 1$)**:
   - NR and Dirac length-gauge E1 selection rules, polarization channels, oscillator strengths, Einstein $A$, and discrete vacuum series compared against NIST $^1\text{H}$ (zero broadening).
7. **All-Electron Relativistic Total Spherical Electron Densities (`Z = 1..118`) & Bundled Snapshots**:
   - Lobato et al. (2026) Dirac–Padé total spherical density parameterization (`< 2e-7` norm error) and `v0.5` `aug-cc-pVTZ` total density exports, alongside qualitative Slater subshells (`Model B`).
8. **Pinned & Directly Executed Reference Benchmarks**:
   - NIST ASD (`Z = 1..108`, `Z = 109..118` `unavailable`, plus `(2J+1)`-weighted term centroids), CIAAW 2021 atomic weights, Cordero 2008 covalent radii (`Z ≤ 96`), directly built/executed `compas/sphf` (`commit 913991f`, MIT) B-spline HF + Koga–Thakkar (1999) limits, and published `ATSP2K` (`ADLY_v2_0`) literature outputs.

## Explicitly Out of Scope (Not Implemented in `v0.7.2`)

ATOMS does **not** implement or fabricate:
- **Coupled-Cluster & Multi-Reference Perturbation Theory**: `CCSD`, `CCSD(T)`, `EOM-CCSD`, `NEVPT2`, and `CASPT2` remain out of scope for `v0.7.2`.
- **Self-consistent MCHF / CASSCF orbital re-optimization** (`orbitalOptimizationSupported = false`; LS-CI and CASCI both use fixed SCF radial orbitals).
- **Relativistic spin–orbit / Breit–Pauli fine-structure $J$ level splittings** in multi-electron terms (allowed `J` ranges are listed purely as unsplit $LS$ coupling tags).
- Effective Core Potentials (`def2-*` for `Z >= 37` is excluded).
- Multi-electron relativistic Dirac–Fock / MCDHF / RCI (`GRASP2018` and `Datatoms` remain registered `unavailable`).
- Finite-nucleus numerical radial solvers (`finite-uniform` and `finite-fermi` remain `unsupported solver`).
- Multi-electron optical spectra (`A_fi` transitions cover $N = 1$ only), QED Lamb shift, Breit interaction, hyperfine splitting, Stark/Zeeman external fields, or plasma/collision physics.
