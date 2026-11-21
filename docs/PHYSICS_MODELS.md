# ATOMS v0.6.0 — Physics Models Overview

This document catalogs every computational model and dataset registered in `PhysicsProviderRegistry` (`src/physics/providers/registry.ts`), establishing strict physical distinctions between one-electron solvers, neutral all-electron total densities, qualitative surrogates, and unavailable packages.

---

## 1. Governing Equations

1. **Nonrelativistic Point-Coulomb Hamiltonian** (`schrodinger-coulomb`):
   $$\hat{H}_{\text{NR}} = -\frac{\hbar^2}{2\mu} \nabla^2 - \frac{Z e^2}{4\pi \varepsilon_0 r}, \qquad \mu = \frac{m_e M_{\text{nuc}}}{m_e + M_{\text{nuc}}}$$
2. **Relativistic Point-Coulomb Dirac Hamiltonian** (`dirac-coulomb`):
   $$\hat{H}_D = c\,\boldsymbol{\alpha}\cdot\hat{\mathbf{p}} + \beta m_e c^2 - \frac{Z e^2}{4\pi \varepsilon_0 r}$$
   with reduced-mass recoil correction at leading linear factor $\mu/m_e$ (documented in [DIRAC_ENGINE.md](./DIRAC_ENGINE.md)).
3. **All-Electron Relativistic Dirac–Fock Total Spherical Density** (`lobato2026-df`, neutral `Z = 1..118`):
   Parameterized self-consistent field B-spline Dirac–Fock (`atomx`, finite nuclear charge, spherical average of open-shell occupations) using guaranteed non-negative Dirac–Padé basis terms ([`diracFock.ts`](../src/physics/diracFock.ts)).
4. **Nonrelativistic Restricted / Restricted-Open-Shell Hartree–Fock** (`pyscf-hf`, neutral `H, He, C, N, O, Ne`):
   Gaussian `aug-cc-pVTZ` basis SCF density and total variational energy $E_{\text{HF}}$.
5. **Slater Empirical Screening Model** (`browser-slater`, neutral `Z = 2..118`):
   Independent-electron hydrogenic orbitals evaluated at effective nuclear charge $Z_{\text{eff}} = Z - S$ and effective quantum number $n^*(n)$ per Slater (1930) ([`models.ts`](../src/physics/models.ts)).

---

## 2. Definitions & Model Registry Matrix

| Provider ID | Version | Scope | Evidence Class | Electron Correlation | Relativistic Effects | Spin-Resolved? |
|---|---|---|---|---|---|---|
| `schrodinger-coulomb` | `0.6.0` | $N = 1$, $Z = 1..118$, point nucleus | `analytic-exact-within-stated-Hamiltonian` | N/A (1-electron) | None (NR) | Spinor-trivial ($m_s = \pm 1/2$) |
| `dirac-coulomb` | `0.6.0` | $N = 1$, $1 \le Z \le 137$, point nucleus | `analytic-exact-within-stated-Hamiltonian` | N/A (1-electron) | Exact $H_D$ fine structure & spin-orbit | Yes ($\kappa, j, m_j$) |
| `lobato2026-df` | `arXiv:2608.14934` | Neutral atoms ($N = Z = 1..118$) | `computed-and-validated` | Mean-field DF | All-electron 4-component DF | Total spherical density only |
| `pyscf-hf` | `2.15.1` | Neutral `H, He, C, N, O, Ne` | `computed-basis-limited` | Mean-field HF | None (NR) | Total spherical density & $E_{\text{HF}}$ |
| `browser-slater` | `0.5.0` | Qualitative neutral shapes `Z = 2..118` | `qualitative-approximation` | Empirical screening | None | Qualitative subshells only |
| `datatoms-2026-mcdf` | `2026-1z118-1n10` | Registered unavailable (`1 <= N <= 10` ions only) | `unavailable` | — | — | Not bundled |
| `grasp-mcdhf` | `GRASP2018` | Registered unavailable (not installed) | `unavailable` | — | — | Not bundled |

---

## 3. Units

All core calculations operate internally in Hartree atomic units ($\hbar = e = m_e = 4\pi\varepsilon_0 = 1$, energy in $\text{Ha}$, length in $a_0$), with conversions to SI/spectroscopic units ($\text{eV}$, $\text{pm}$, $\text{nm}$, $\text{cm}^{-1}$, $\text{s}^{-1}$, $\text{u}$) explicitly tagged via pinned `CONSTANTS_VERSION = "CODATA-2018"` ([UNITS_AND_CONSTANTS.md](./UNITS_AND_CONSTANTS.md)).

---

## 4. Assumptions

- Point-nucleus Coulomb solvers assume zero nuclear charge radius ($R_{\text{nuc}} = 0$) and stationary center-of-mass dynamics parameterized strictly by bare nuclear mass $M_{\text{nuc}}$ (never neutral atomic mass).
- Finite nuclear models (`finite-uniform`, `finite-fermi`) are represented in `NuclearModel` schemas so experiments capture nuclear geometry, and solvers without a finite-nucleus radial integrator mark them `unsupported`.
- Total spherical density providers (`lobato2026-df`, `pyscf-hf`) yield spherically averaged $\rho(r)$ only; individual subshell wavefunctions $\psi_{nlm}$ or Dirac orbitals cannot be reconstructed from $\rho(r)$.
- All generated spectra treat transitions as ideal discrete vacuum electric-dipole (E1) lines with zero empirical broadening or population weighting.

---

## 5. Numerical Method

- Analytic hydrogenic Schrödinger wavefunctions use log-$\Gamma$ stabilized generalized Laguerre recurrences (cross-checked bit-for-bit against C++17 `native/quantum_core.hpp`).
- Analytic Dirac–Coulomb bispinors evaluate confluent hypergeometric series ${}_1F_1$ in double precision with $\gamma = \sqrt{\kappa^2 - (Z\alpha)^2}$ and Simpson radial quadrature for $\langle r^k \rangle$ and normalization checks.
- Transition matrix elements evaluate Wigner 3-$j$ / 6-$j$ angular algebra (`BigInt` exact factorials) and Gordon / Simpson radial integrals.
- 3D scalar fields are sampled via seeded `xoshiro128**` inverse-CDF tables and watertight 6-tetrahedra Marching Tetrahedra in dedicated Web Workers.

---

## 6. Validity Domain

- **One-electron solvers**: Strictly $N = 1$ ($q = Z - 1$) and point nucleus (`point-infinite-mass` or `point-finite-mass`). Dirac–Coulomb enforces $(Z\alpha)^2 < \kappa^2$ (`Z <= 137` for $|\kappa| = 1$).
- **Multi-electron datasets**: Strictly neutral ground configurations ($N = Z$) matching the cited element table. Anions ($N > Z$) and partially stripped multi-electron ions ($1 < N < Z$) are representable in `AtomicSystem` and intentionally rejected (`supported: false`) by current providers.

---

## 7. Known Limitations

- No general self-consistent multi-electron radial Hartree–Fock / Dirac–Fock / MCDF solver runs inside the browser (`GRASP2018` unavailable; multi-electron ions `1 < N < Z` unsupported).
- No finite-nucleus radial solver (nuclear field shifts omitted).
- No Lamb shift / QED self-energy / vacuum polarization, Breit interaction, nuclear recoil beyond reduced mass, or hyperfine splitting.
- No magnetic dipole (M1) or electric quadrupole (E2) multipole transitions beyond E1.

---

## 8. Reference Sources

- Detailed in [DATA_PROVENANCE.md](./DATA_PROVENANCE.md) and module guides: CODATA 2018 (Tiesinga et al., *Rev. Mod. Phys.* 93, 025010), Bethe & Salpeter (1957), Grant (2007), Lobato et al. (2026, `arXiv:2608.14934`), NIST ASD, PySCF 2.15.1, Slater (1930).

---

## 9. Validation Procedures

- `npm run typecheck` (strict TypeScript domain/provider contracts)
- `npm run test:native` (340 C++17 checks Debug + Release)
- `npm test` (15 suites, 112 tests covering NR/Dirac eigenvalues, norms, expectation values, E1 rates, NIST vacuum comparisons, ExperimentRunner persistence, & native C++ parity)
- `npm run test:browser` (20 Playwright WebGL2 + Laboratory tests)
