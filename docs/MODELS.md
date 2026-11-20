# Models, Hamiltonians, and Selection Policy (`v0.5.0`)

## 1. Implemented and Runnable Providers

| Model / Provider ID | Physical Scope | Mathematical / Computational Formulation | Correlation | Relativistic | Evidence Class |
|---|---|---|---|---|---|
| **Lobato 2026 Dirac–Fock** (`lobato2026-df`) | Neutral atoms `Z = 1..118` (total density) | Element-adaptive Dirac–Padé fit (`n_t = 2..15`) to B-spline Dirac–Fock (`atomx`, finite nuclear charge, spherical average of open-shell occupations; exact Dirac 1s for `Z = 1`) | None (mean-field Dirac–Fock) | **All-electron 4-component Dirac–Fock** | `computed-and-validated` |
| **PySCF HF** (`pyscf-hf`) | Neutral `H, He, C, N, O, Ne` (`Z ∈ {1,2,6,7,8,10}`) | Non-relativistic RHF/ROHF in `aug-cc-pVTZ`, point nucleus, spherically averaged total density & total electronic energy | None (Hartree–Fock) | None | `computed-basis-limited` |
| **Model A** (`hydrogenic-exact`) | `H` and one-electron ions `X^(Z-1)+` (`Z = 1..118`) | Exact analytic non-relativistic Coulomb Schrödinger $\psi_{nlm}(r,\theta,\phi)$ with point nucleus ($M\to\infty$, CODATA 2018) | None (1-electron) | None | `analytic-exact-within-stated-Hamiltonian` |
| **Model B** (`slater-screened-hydrogenic` / `browser-slater`) | Qualitative subshell shapes (`Z = 2..118`) | Independent-electron hydrogenic radial functions at $Z_{\text{eff}} = Z - S$ (Slater 1930) with $n^* = 1, 2, 3, 3.7, 4.0, 4.2, 4.3$ ($\ge 7$ extrapolated) | None (screening surrogate) | None | `qualitative-approximation` |

## 2. Registered Scope-Limited / Unavailable Providers

| Provider ID | Declared Scope | Blocker / Boundary | Silent Fallback? |
|---|---|---|---|
| `datatoms-2026-mcdf` | `doi:10.57745/5RV42G` (Datatoms `2026-1z118-1n10`, CC BY 4.0) | Upstream dataset covers **1 ≤ N ≤ 10 electrons only** (H-like through Ne-like ions across `Z = 1..118`); does **not** supply neutral ground atoms for `Z > 10` or radial density grids. | Never |
| `grasp-mcdhf` | GRASP2018 MCDHF/RCI | `GRASP2018` is not installed/bundled in this environment; spin–orbit split subshell orbitals $R_{nlj}(r)$ and fine-structure splittings are unavailable. | Never |

---

## 3. Mathematical Formulations

### Model A — Exact Hydrogenic Orbitals
In Bohr radii ($a_0 = 52.9177210903\text{ pm}$):
$$R_{nl}(r) = \sqrt{\left(\frac{2Z}{n}\right)^3 \frac{(n-l-1)!}{2n\,(n+l)!}} \; e^{-\rho/2} \rho^l L_{n-l-1}^{2l+1}(\rho), \qquad \rho = \frac{2Zr}{n}$$
with normalization $\int_0^\infty r^2 |R_{nl}(r)|^2 \, dr = 1$ and radial PDF $P_r(r) = r^2 |R_{nl}(r)|^2$.
Complex spherical harmonics $Y_l^m(\theta,\phi)$ follow the Condon–Shortley sign convention with $z$ as the polar axis; real tesseral harmonics follow standard cosine ($m > 0$), $m = 0$, and sine ($m < 0$) orthonormal linear combinations.

Probability current density in atomic units:
$$\mathbf{j} = \frac{\hbar}{m_e} \operatorname{Im}\!\left(\psi^* \nabla \psi\right) = \frac{m |\psi_{nlm}|^2}{r \sin\theta} \hat{\boldsymbol{\phi}}$$
which vanishes identically for all real stationary orbitals, for $m = 0$, and along the $z$-axis ($\sin\theta = 0$).

### Lobato et al. (2026) Adaptive Dirac–Padé Density (`lobato2026-df`)
For every neutral atom `Z = 1..118`, the spherically averaged electron density $\rho(r)$ (converted from $\text{\AA}^{-3}$ to $e^-/a_0^3$ via $a_0 = 0.529177210903\text{ \AA}$) is evaluated in closed form from $n_t(Z) \in [2, 15]$ guaranteed-positive basis terms:
$$\rho(r) = a_0^3 \sum_{i=1}^{n_t} \rho_i(r_{\text{\AA}}), \qquad \lambda_i = \frac{2\pi}{\sqrt{b_i}}, \qquad A_i = \frac{2\pi^4 a_0 a_i}{b_i^{5/2}}, \qquad x_i = \lambda_i r_{\text{\AA}}$$
$$\rho_i^{\text{NR}}(r_{\text{\AA}}) = A_i e^{-x_i}, \qquad \rho_i^{\text{DP}}(r_{\text{\AA}}) = \frac{1}{4} A_i (1 + x_i) e^{-x_i}$$
where all terms satisfy global non-negativity ($\rho(r) \ge 0$ for $r \ge 0$) verified against `lobato2026_positivity_certificate.json` and integrate via 4$\pi r^2\rho(r)$ to $Z$ within `< 2e-7` relative error.

### Open-Shell Neutral Atoms (Full-Atom View)
For open-shell neutral atoms (e.g., `C` `[He] 2s² 2p²`, `Fe` `[Ar] 3d⁶ 4s²`, `U` `[Rn] 5f³ 6d¹ 7s²`):
- **Dirac–Fock (`dirac-fock`)**: uses the spherical average over open-shell relativistic orbital occupations (`atomx`).
- **PySCF HF (`hf`)**: uses the spherically averaged total density from the converged ROHF ground-state term (`³P` for C/O, `⁴S` for N).
- **Slater Subshells (`model`)**: sums Unsöld spherical configuration averages $\rho(r) = \sum_i N_i |R_{n_i l_i}(r)|^2 / (4\pi)$.

In all three full-atom modes, the displayed cloud is an **isotropic / configuration-averaged total density**, not a single broken-symmetry magnetic substate.

---

## 4. Observable-Dependent Provider Policy (`src/science/providers.ts`)

- `electron-density` (`quantitative` / `high`) $\to$ `lobato2026-df` (`Z = 1..118`), with explicit metadata, charge-conservation validation, and limitations. PySCF `pyscf-hf` remains explicitly selectable for `Z ∈ {1, 2, 6, 7, 8, 10}`.
- `relativistic-density` $\to$ `lobato2026-df` (`Z = 1..118`).
- `electron-density` (`interactive`) $\to$ `browser-slater` when fast subshell-resolved decomposition is requested.
- `total-energy` $\to$ `pyscf-hf` where bundled (`Z ∈ {1, 2, 6, 7, 8, 10}`); `null` elsewhere (never fabricated from Slater surrogates).
- `fine-structure`, `subshell-orbitals-ab-initio` $\to$ `null` (neither `datatoms-2026-mcdf` nor `grasp-mcdhf` covers arbitrary neutral atoms here).

## 5. Strict Separation of Energy Quantities

The Level Diagram (`EnergyDiagram.tsx`) and Inspector keep four physically distinct energy quantities clearly separated:
1. **Exact 1-electron eigenvalue** $E_n = -13.605693\,Z^2/n^2\text{ eV}$ (hydrogenic ion only).
2. **Slater surrogate energy** $-13.605693\,Z_{\text{eff}}^2/(n^*)^2\text{ eV}$ (qualitative empirical estimate, *not* an orbital eigenvalue or ionization potential).
3. **PySCF total HF electronic energy** $E_{\text{HF}}\text{ (Hartree)}$ (total multi-electron energy for `H, He, C, N, O, Ne`).
4. **NIST ASD 1st ionization energy** $\text{IE}_1\text{ (eV)}$ (experimental/evaluated for `Z = 1..103`, predicted/interpolated for `Z = 104..108`, `unavailable` for `Z = 109..118`).
