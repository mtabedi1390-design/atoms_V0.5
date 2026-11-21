# Scientific Scope — ATOMS v0.6.1

**ATOMS** is a browser-local computational atomic-physics laboratory focused on isolated atoms and ions (`Z = 1..118`, $N \ge 0$, $q = Z - N$) with exact analytical one-electron quantum solvers and audited multi-electron reference density datasets.

## In Scope (`v0.6.1`)

1. **Exact Nonrelativistic One-Electron Hydrogenic Solvers (`schrodinger-coulomb`)**:
   - Point-nucleus Coulomb Hamiltonian with both `point-infinite-mass` and isotope bare-nuclear `point-finite-mass` reduced-mass scaling ($\psi_{nlm}(r,\theta,\phi) = R_{nl}(r) Y_l^m(\theta,\phi)$ in complex and real tesseral bases).
   - Valid physically **only** for $N = 1$ systems ($^1\text{H}$, $^2\text{H}$, $\text{He}^+$, $\text{Li}^{2+}$, ..., $1 \le Z \le 118$).
   - Radial and angular nodes, analytic $E_n$, analytic and numeric $\langle r^k \rangle$ ($k = -3..-1, 1, 2$), coherent superpositions, and azimuthal probability current $\mathbf{j}$.
2. **Exact Relativistic 4-Component Dirac–Coulomb Solvers (`dirac-coulomb`)**:
   - Point-Coulomb Sommerfeld–Dirac energy levels ($E_{\text{bind}} = E_{\text{total}} - m_e c^2$), coupled large $P_{n\kappa}(r)$ and small $Q_{n\kappa}(r)$ bispinor components, spin-angular $\Omega_{\kappa m_j}(\theta,\phi)$, Hellmann–Feynman $\langle r^{-1}\rangle$ verification, and strict $(Z\alpha)^2 < \kappa^2$ domain gating.
3. **Ab Initio Electric-Dipole (E1) Transitions & Discrete Vacuum Spectroscopy ($N = 1$)**:
   - Nonrelativistic Schrödinger and 4-component Dirac length-gauge E1 selection rules, polarization channels $q \in \{-1, 0, +1\}$, oscillator strengths $f_{if}$, multiplet and sublevel Einstein $A$ spontaneous emission rates, and discrete vacuum spectral series (`Lyman`, `Balmer`, `Paschen`, `Custom`) with NIST $^1\text{H}$ vacuum comparison (explicitly zero-broadening).
4. **All-Electron Relativistic Total Spherical Electron Densities (`Z = 1..118`, `v0.5.0` preserved)**:
   - Lobato et al. (2026) adaptive Dirac–Padé parameterization of B-spline Dirac–Fock (`atomx`, finite nucleus, spherical occupation average for open shells; exact Dirac 1s for `Z = 1`), reproducing $\int_0^\infty 4\pi r^2\rho(r)\,dr = Z$ within `< 2e-7` across all 118 elements.
   - Explicitly labelled as **total spherically averaged electron density only** (no subshell $R_{nl}(r)$ decomposition or phase).
5. **Non-Relativistic Hartree–Fock Total Densities & Energies (`Z ∈ {1, 2, 6, 7, 8, 10}`) & Qualitative Slater Subshells**:
   - Bundled PySCF `aug-cc-pVTZ` RHF/ROHF exports (`src/data/hf/*.json`) and independent-electron Slater-screened orbitals (`Model B`).
6. **Pinned Atomic Reference Metadata (`Z = 1..118`)**:
   - Ground configurations, ground terms/$J$, and 1st ionization energies from NIST ASD (`Z = 1..108`, with `Z = 104..108` marked `predicted` and `Z = 109..118` marked `unavailable`), CIAAW 2021 atomic weights, and Cordero 2008 covalent radii (`Z ≤ 96`).

## Explicitly Out of Scope (Not Implemented)

ATOMS does **not** implement or fabricate:
- Finite-nucleus numerical radial solvers (`finite-uniform` and `finite-fermi` remain explicitly `unsupported solver`).
- In-browser multi-electron SCF/HF/DFT/MCDHF/CI/CC solvers or multi-electron optical spectra (`1 < N < Z`, $N > Z$ anions flagged `unsupported` in `N = 1` solvers; `GRASP2018` / `Datatoms` registered as unavailable).
- Higher-order QED radiative corrections (Lamb shift, Breit interaction), hyperfine splitting, M1/E2/two-photon transitions, line-shape broadening (natural/Doppler/collisional), or NLTE population modeling.
- External fields (Zeeman/Stark), molecular orbitals, solid-state band structures, or multi-user backend databases.
