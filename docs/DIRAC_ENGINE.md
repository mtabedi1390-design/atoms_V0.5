# ATOMS v0.6.1 — Relativistic Point-Coulomb Dirac Engine

Module: [`src/physics/providers/dirac/index.ts`](../src/physics/providers/dirac/index.ts)

---

## 1. Governing Equations

1. **Stationary Dirac–Coulomb Equation (Point Nucleus, Natural Atomic Units $m_e = 1, c = 1/\alpha$)**:
   $$\hat{H}_D \Psi = \left( c\,\boldsymbol{\alpha}\cdot\hat{\mathbf{p}} + \beta m_e c^2 - \frac{Z}{r} \right) \Psi_{n\kappa m_j} = E_{n\kappa} \Psi_{n\kappa m_j}$$
2. **Sommerfeld–Dirac Exact Fine-Structure Energy Spectrum**:
   Let $n_r = n - |\kappa| \ge 0$ be the radial quantum number and $\gamma = \sqrt{\kappa^2 - (Z\alpha)^2}$. Then:
   $$E_{n\kappa}^{\text{total}} = m_e c^2 \left[ 1 + \left( \frac{Z\alpha}{n_r + \gamma} \right)^2 \right]^{-1/2}, \qquad E_{n\kappa}^{\text{bind}} = \left(\frac{\mu}{m_e}\right)\left( E_{n\kappa}^{\text{total}} - m_e c^2 \right)$$
3. **4-Component Bispinor Wavefunction**:
   $$\Psi_{n\kappa m_j}(r,\theta,\phi) = \frac{1}{r} \begin{pmatrix} P_{n\kappa}(r) \, \Omega_{\kappa m_j}(\theta, \phi) \\ i Q_{n\kappa}(r) \, \Omega_{-\kappa m_j}(\theta, \phi) \end{pmatrix}$$
   with coupled large ($P_{n\kappa}$) and small ($Q_{n\kappa}$) radial functions normalized as:
   $$\int_0^\infty \left( |P_{n\kappa}(r)|^2 + |Q_{n\kappa}(r)|^2 \right) dr = 1$$
4. **Closed-Form Confluent Hypergeometric Radial Bispinor Components** ($\zeta = Z(\mu/m_e)$):
   Let $N = \sqrt{n^2 - 2 n_r (|\kappa| - \gamma)}$ (effective apparent principal quantum number), $\lambda = \zeta / N$, $\rho = 2\lambda r$, and $\varepsilon = (1 + (Z\alpha/(n_r+\gamma))^2)^{-1/2} = E^{\text{total}}/(m_e c^2)$. Then up to exact overall normalization $C_{n\kappa}$:
   $$\begin{pmatrix} P_{n\kappa}(r) \\ Q_{n\kappa}(r) \end{pmatrix} = C_{n\kappa}\, \rho^\gamma e^{-\rho/2} \begin{pmatrix} \sqrt{1+\varepsilon} \left[ -n_r \, {}_1F_1(1 - n_r;\, 2\gamma + 1;\, \rho) + (N - \kappa) \, {}_1F_1(-n_r;\, 2\gamma + 1;\, \rho) \right] \\ -\sqrt{1-\varepsilon} \left[ n_r \, {}_1F_1(1 - n_r;\, 2\gamma + 1;\, \rho) + (N - \kappa) \, {}_1F_1(-n_r;\, 2\gamma + 1;\, \rho) \right] \end{pmatrix}$$
   where for $n_r = 0$, only the $k=0$ constant term survives with zero hypergeometric series!
5. **Spherical Spinor Harmonics $\Omega_{\kappa m_j}(\theta,\phi)$**:
   Exact Clebsch–Gordan coupling $\chi_{1/2, m_s} \otimes Y_l^{m_l}(\theta,\phi)$ for $(l, 1/2 \to j, m_j)$ via exact $l(\kappa), j(\kappa)$ relations.

---

## 2. Definitions

- `diracCoulombV6Provider`: `PhysicsProvider` (`id: "dirac-coulomb"`, `version: "0.6.1"`).
- `checkDiracCoulombDomain(Z, kappa)`: enforces real radical $\kappa^2 - (Z\alpha)^2 > 0$.
- `computeDiracEnergy(n, kappa, Z, reducedMassRatio)`: returns `bindingEnergy_Ha`, `bindingEnergy_eV`, `totalEnergy_Ha`, `totalEnergy_eV`, `restEnergy_eV`, `gamma`, `apparentN`, and `nonRelativisticLimit_eV`.
- `diracRadialPQ(n, kappa, rBohr, Z, reducedMassRatio)`: returns `{ P, Q, density }`.
- `evaluateDiracSpinor(state, Z, reducedMassRatio, rBohr, theta, phi)`: returns all 4 complex spinor components (`psi0`..`psi3`), `largeDensity`, `smallDensity`, and total probability density $|\Psi|^2 = \sum_{a=0}^3 |\psi_a|^2$.

---

## 3. Units

Radial distance `rBohr` is in $a_0$; total probability density $|\Psi|^2$ has units $a_0^{-3}$; binding and total energies are reported in both $\text{Ha}$ and $\text{eV}$ using `EXTENDED_CONSTANTS.alpha` and `m_e_c2_eV` (`CODATA-2018`).

---

## 4. Assumptions

- Point-Coulomb electrostatic central field $V(r) = -Ze^2/(4\pi\varepsilon_0 r)$ with zero nuclear charge radius.
- Strictly one bound electron ($N = 1$).
- **Physical interpretation rule**: $P_{n\kappa}$ and $Q_{n\kappa}$ are coupled components of a single 4-spinor eigenstate—never independent spatial orbitals.
- Finite nuclear mass reduces binding via leading reduced-mass scaling $(\mu/m_e)(E_D - m_e c^2)$ (exact two-body Breit/Dirac recoil terms at order $(m_e/M_{\text{nuc}})(Z\alpha)^4$ are omitted and documented).

---

## 5. Numerical Method

- Terminating confluent hypergeometric polynomials ${}_1F_1(-n_r; 2\gamma+1; \rho)$ (finite degree $n_r = n - |\kappa|$) are summed via exact recurrence term ratio and normalized using analytical $\Gamma$-ratio formula verified against composite Simpson radial quadrature ($N_{\text{grid}} = 2000\text{–}4000$).
- Note that for $s_{1/2}$ ($\kappa = -1$) and $p_{1/2}$ ($\kappa = +1$), $\gamma = \sqrt{1 - (Z\alpha)^2} < 1$, causing a weak $r^{\gamma - 1}$ cusp at $r \to 0$ in $P/r$ while $P^2 + Q^2 \propto r^{2\gamma}$ remains smoothly integrable.

---

## 6. Validity Domain

- $N = 1$ ($q = Z - 1$), point nuclear model (`point-infinite-mass` or `point-finite-mass`).
- Relativistic quantum state $1 \le n$, $\kappa \neq 0$, $l(\kappa) < n$, $|m_j| \le j$.
- Real $\gamma > 0$ requirement: $(Z\alpha)^2 < \kappa^2$ (for $|\kappa|=1$, $Z \le 137$; for $Z > 137$, point-Coulomb Dirac eigenstates collapse and are rejected explicitly).

---

## 7. Known Limitations

- Omits QED radiative corrections (Lamb shift: vacuum polarization + electron self-energy, e.g., $2s_{1/2}\text{–}2p_{1/2}$ degeneracy remains exact in pure point-Coulomb Dirac theory!).
- Omits finite nuclear charge radius effects (`finite-fermi`, `finite-uniform` rejected).
- Omits nuclear magnetic dipole hyperfine structure and exact two-body relativistic recoil beyond leading $\mu/m_e$ scaling.

---

## 8. Reference Sources

- Bethe, H. A. & Salpeter, E. E. (1957), *Quantum Mechanics of One- and Two-Electron Atoms*, §14.
- Grant, I. P. (2007), *Relativistic Quantum Theory of Atoms and Molecules*, Springer.
- Burke, V. M. & Grant, I. P. (1967), *Proc. Phys. Soc.* 90, 297 (Dirac hydrogenic radial formulas).

---

## 9. Validation Procedures

- `src/physics/__tests__/diracProvider.test.ts` (7 tests):
  1. Verifies exact Hydrogen $2p_{3/2}\text{–}2p_{1/2}$ fine-structure splitting ($\approx 4.528\times 10^{-5}\text{ eV}$, $0.365\text{ cm}^{-1}$).
  2. Checks combined spinor norm $\int_0^\infty (|P|^2 + |Q|^2)\,dr = 1$ within $< 10^{-7}$ across $1s_{1/2}, 2p_{1/2}, 2p_{3/2}, 3d_{5/2}$ up to $\text{Au}^{78+}$ ($Z=79$) and $\text{Og}^{117+}$ ($Z=118$).
  3. Demonstrates nonrelativistic $\alpha \to 0$ convergence (small component $Q \propto Z\alpha \to 0$, $E_{n\kappa}^{\text{bind}} \to E_n^{\text{Schrödinger}}$).
  4. Enforces $(Z\alpha)^2 < \kappa^2$ domain check (rejects $Z = 138$ for $\kappa = -1$).
- `src/physics/__tests__/stabilization.test.ts`: additionally verifies exact $(n, j)$ degeneracy across $Z \in \{1, 29, 79\}$, near-origin power-law cusp slope $P,Q \propto r^\gamma$ at $Z=79$, 2D spherical spin-angular normalization/orthogonality across $\kappa \in [-3..+2]$, and monotonic grid refinement convergence.
