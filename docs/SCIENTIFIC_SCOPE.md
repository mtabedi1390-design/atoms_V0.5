# Scientific Scope — ATOMS v0.5.0

**ATOMS** is an **atomic-structure visualization and analysis workstation** focused strictly on isolated neutral atoms (`Z = 1..118`) and hydrogen-like one-electron ions (`X^(Z-1)+`).

## In Scope (`v0.5.0`)

1. **Exact Non-Relativistic One-Electron Hydrogenic Orbitals (`Model A`)**:
   - Point-nucleus Coulomb Hamiltonian, infinite nuclear mass, non-relativistic Schrödinger solutions $\psi_{nlm}(r,\theta,\phi) = R_{nl}(r) Y_l^m(\theta,\phi)$ (both complex spherical harmonics and real tesseral harmonics).
   - Valid physically **only** for neutral Hydrogen (`Z = 1`) and bare-nucleus one-electron ions `X^(Z-1)+`.
   - Radial and angular nodes, analytic energy eigenvalues $E_n$, analytic and numeric $\langle r \rangle$, and azimuthal probability current density $\mathbf{j} = (\hbar/m_e)\,\text{Im}(\psi^*\nabla\psi)$.
2. **All-Electron Relativistic Total Spherical Electron Densities (`Z = 1..118`)**:
   - Lobato et al. (2026) adaptive Dirac–Padé parameterization of B-spline Dirac–Fock (`atomx`, finite nucleus, spherical occupation average for open shells; exact Dirac 1s for `Z = 1`).
   - Reproduces total charge $\int_0^\infty 4\pi r^2\rho(r)\,dr = Z$ within `< 2e-7` relative error across all 118 elements.
   - Explicitly labelled as **total spherically averaged electron density only** (no subshell $R_{nl}(r)$ decomposition, no orbital eigenvalues, no wavefunction phase).
3. **Non-Relativistic Hartree–Fock Total Densities & Energies (`Z ∈ {1, 2, 6, 7, 8, 10}`)**:
   - Bundled PySCF `aug-cc-pVTZ` RHF/ROHF exports (`src/data/hf/*.json`) with variational basis-error comparison against numerical HF limits.
4. **Qualitative Multi-Electron Subshell Shapes (`Model B`)**:
   - Independent-electron Slater-screened orbitals (`Z_eff = Z - S`, Slater 1930) for inspecting qualitative nodal topology and configuration-average subshell contributions $\rho_{\text{Slater}}(r) = \sum_i N_i |R_{n_i l_i}(r)|^2 / (4\pi)$.
5. **Pinned Atomic Reference Metadata (`Z = 1..118`)**:
   - Ground configurations, ground terms/$J$, and 1st ionization energies from NIST ASD (`Z = 1..108`, with `Z = 104..108` marked `predicted` and `Z = 109..118` marked `unavailable`), CIAAW 2021 standard atomic weights / longest-lived mass numbers, and Cordero 2008 covalent radii (`Z ≤ 96`).

## Explicitly Out of Scope (Not Implemented)

ATOMS does **not** implement or fabricate:
- Radiative transitions, oscillator strengths, Einstein $A/B$ coefficients, or spectral line synthesis.
- External fields (Zeeman/Stark splitting), magneto-optical trapping, laser cooling, or scattering/collision dynamics.
- Molecular orbitals, chemical bonding, solid-state band structures, or periodic crystal fields.
- In-browser SCF/Hartree–Fock/DFT/MCDHF/QED solvers for arbitrary `Z`, relativistic spin–orbit $R_{nlj}(r)$ subshells (`GRASP2018` is registered as unavailable), or electron-correlation CI/CC wavefunctions.
- Multi-user backend databases, accounts, or hardware/laboratory integrations.
