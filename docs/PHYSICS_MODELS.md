# ATOMS v0.7.0 — Physics Models Overview

This document catalogs every computational model and dataset registered in `PhysicsProviderRegistry` (`src/physics/providers/registry.ts`), establishing strict physical distinctions between one-electron solvers, live multi-electron Hartree–Fock SCF, neutral all-electron reference density datasets, qualitative surrogates, and unavailable packages.

---

## 1. Governing Equations

1. **Nonrelativistic Point-Coulomb Hamiltonian** (`schrodinger-coulomb`):
   $$\hat{H}_{\text{NR}} = -\frac{\hbar^2}{2\mu} \nabla^2 - \frac{Z e^2}{4\pi \varepsilon_0 r}, \qquad \mu = \frac{m_e M_{\text{nuc}}}{m_e + M_{\text{nuc}}}$$
2. **Relativistic Point-Coulomb Dirac Hamiltonian** (`dirac-coulomb`):
   $$\hat{H}_D = c\,\boldsymbol{\alpha}\cdot\hat{\mathbf{p}} + \beta m_e c^2 - \frac{Z e^2}{4\pi \varepsilon_0 r}$$
   with reduced-mass recoil correction at leading linear factor $\mu/m_e$ (documented in [DIRAC_ENGINE.md](./DIRAC_ENGINE.md)).
3. **Live Multi-Electron Nonrelativistic Hartree–Fock SCF** (`pyscf-hf-live`, `0.7.0`):
   $$\hat{H} = \sum_{i=1}^{N}\left(-\frac{1}{2}\nabla_i^2 - \frac{Z}{r_i}\right) + \sum_{1 \le i < j \le N}\frac{1}{r_{ij}}$$
   Solved self-consistently in contracted spherical GTO bases from **Basis Set Exchange `0.12`** via **PySCF `2.15.1` + `libcint`** under `RHF`, `UHF`, `ROHF`, or `AtomSphAverageRHF` (fixed `point-infinite-mass` nucleus; see [MULTI_ELECTRON_HARTREE_FOCK.md](./MULTI_ELECTRON_HARTREE_FOCK.md)).
4. **All-Electron Relativistic Dirac–Fock Total Spherical Density** (`lobato2026-df`, neutral `Z = 1..118`):
   Parameterized self-consistent field B-spline Dirac–Fock (`atomx`, finite nuclear charge, spherical average of open-shell occupations) using guaranteed non-negative Dirac–Padé basis terms ([`diracFock.ts`](../src/physics/diracFock.ts)).
5. **Static `v0.5` PySCF HF Snapshots** (`pyscf-hf`, neutral `H, He, C, N, O, Ne`):
   Bundled static `aug-cc-pVTZ` total spherical $\rho(r)$ and scalar $E_{\text{HF}}$ exports preserved for `v0.5` backward compatibility.
6. **Slater Empirical Screening Model** (`browser-slater`, neutral `Z = 2..118`):
   Independent-electron hydrogenic orbitals evaluated at effective nuclear charge $Z_{\text{eff}} = Z - S$ and effective quantum number $n^*(n)$ per Slater (1930) ([`models.ts`](../src/physics/models.ts)).

---

## 2. Definitions & Model Registry Matrix

| Provider ID | Version | Scope | Evidence Class | Electron Correlation | Relativistic Effects | Spin / Orbital Output |
|---|---|---|---|---|---|---|
| `schrodinger-coulomb` | `0.6.0` | $N = 1$, $Z = 1..118$, point nucleus | `analytic-exact-within-stated-Hamiltonian` | N/A (1-electron) | None (NR) | Spinor-trivial ($m_s = \pm 1/2$) |
| `dirac-coulomb` | `0.6.0` | $N = 1$, $1 \le Z \le 137$, point nucleus | `analytic-exact-within-stated-Hamiltonian` | N/A (1-electron) | Exact $H_D$ fine structure & spin-orbit | Yes ($\kappa, j, m_j$) |
| `pyscf-hf-live` | `0.7.0` | Neutral & ionic atoms ($Z \le 54$ STO-3G; $Z \le 36$ polarized bases), `point-infinite-mass` | `computed-and-validated` | Single-determinant HF mean-field (omits Coulomb correlation) | None (NR) | Genuine MO energies/irreps, `<Fα>/<Fβ>`, spin density, 3D GTO fields, SCF history |
| `lobato2026-df` | `arXiv:2608.14934` | Neutral atoms ($N = Z = 1..118$) | `computed-and-validated` | Mean-field DF | All-electron 4-component DF | Total spherical density only |
| `pyscf-hf` | `2.15.1` | Static neutral `H, He, C, N, O, Ne` (`v0.5` bundle) | `computed-basis-limited` | Mean-field HF | None (NR) | Total spherical density & scalar $E_{\text{HF}}$ only |
| `browser-slater` | `0.5.0` | Qualitative neutral shapes `Z = 2..118` | `qualitative-approximation` | Empirical screening | None | Qualitative subshells only |
| `datatoms-2026-mcdf` | `2026-1z118-1n10` | Registered unavailable (`1 <= N <= 10` ions only) | `unavailable` | — | — | Not bundled |
| `grasp-mcdhf` | `GRASP2018` | Registered unavailable (not installed) | `unavailable` | — | — | Not bundled |

---

## 3. Units, Assumptions, & Numerical Methods

- All core calculations operate internally in Hartree atomic units ($\hbar = e = m_e = 4\pi\varepsilon_0 = 1$, energy in $\text{Ha}$, length in $a_0$), with conversions to SI/spectroscopic units tagged via pinned `CONSTANTS_VERSION = "CODATA-2018"` ([UNITS_AND_CONSTANTS.md](./UNITS_AND_CONSTANTS.md)).
- Point-nucleus Coulomb 1-electron solvers use bare nuclear mass $M_{\text{nuc}}$ for reduced mass $\mu$; multi-electron Hartree–Fock (`pyscf-hf-live`) enforces `point-infinite-mass` strictly to avoid misapplying hydrogenic 2-body reduced-mass scaling without mass polarization.
- Analytic hydrogenic wavefunctions use log-$\Gamma$ stabilized Laguerre recurrences; Dirac–Coulomb bispinors evaluate ${}_1F_1$; live multi-electron HF evaluates contracted spherical GTO integrals via `libcint`, SCF via PySCF CDIIS/EDIIS/ADIIS, overlap orthonormality $\mathbf{C}^T\mathbf{S}\mathbf{C}=\mathbf{I}$, and radial profiles via 110-pt Lebedev quadrature.

---

## 4. Validity Domain & Known Limitations

- **One-electron solvers**: Strictly $N = 1$ ($q = Z - 1$) and point nucleus; Dirac enforces $(Z\alpha)^2 < \kappa^2$ (`Z <= 137` for $|\kappa|=1$).
- **Live Multi-Electron HF (`pyscf-hf-live`)**: Restricted to elements present in each BSE v1 all-electron basis (`def2-*` capped at `Z <= 36` to avoid missing ECPs; `cc-pVDZ/TZ` omit `K=19`; `aug-cc-pVTZ` omits `K=19, Ca=20`). Requires local Express+PySCF runtime.
- **Unimplemented**: Correlated post-HF (`MP2`/`CCSD`/`CI`), multi-electron Dirac–Fock (`GRASP2018`/`MCDHF`), finite-nucleus radial ODE solvers, QED/Lamb shift, Breit/hyperfine, and external fields.

---

## 5. Reference Sources & Validation Procedures

- CODATA 2018 (Tiesinga et al., *Rev. Mod. Phys.* 93, 025010), Bethe & Salpeter (1957), Grant (2007), Lobato et al. (2026), NIST ASD, PySCF 2.15.1 (Sun et al., *J. Chem. Phys.* 153, 024109), Basis Set Exchange 0.12 (Pritchard et al., 2019), `compas/sphf` (MIT), Koga et al. (*Int. J. Quantum Chem.* 71, 491, 1999).
- Verified via `npm run typecheck`, `npm run test:native` (340 checks Debug + Release), `npm test` (17 suites, 133 tests), `npm run build`, and `npm run test:browser` (23 Playwright tests).
