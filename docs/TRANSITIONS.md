# ATOMS v0.6.0 — Electric-Dipole (E1) Transition Matrix Elements & Rates

Modules:
- [`src/numerics/specialFunctions/wigner.ts`](../src/numerics/specialFunctions/wigner.ts) (`wigner3j`, `wigner6j`)
- [`src/physics/transitions/nonrelativisticE1.ts`](../src/physics/transitions/nonrelativisticE1.ts)
- [`src/physics/transitions/relativisticE1.ts`](../src/physics/transitions/relativisticE1.ts)

---

## 1. Governing Equations

1. **Nonrelativistic Electric-Dipole Matrix Elements (Length Gauge)**:
   For spherical rank-1 tensor components $r C_q^{(1)}(\theta,\phi) = \sqrt{\frac{4\pi}{3}} r Y_1^q(\theta,\phi)$ ($q \in \{-1, 0, +1\}$):
   $$\langle n_f l_f m_f m_{sf} | r C_q^{(1)} | n_i l_i m_i m_{si} \rangle = \delta_{m_{sf}, m_{si}} \, (-1)^{l_f - m_f} \sqrt{(2l_f + 1)(2l_i + 1)} \begin{pmatrix} l_f & 1 & l_i \\ 0 & 0 & 0 \end{pmatrix} \begin{pmatrix} l_f & 1 & l_i \\ -m_f & q & m_i \end{pmatrix} R_{fi}$$
   where $R_{fi} = \int_0^\infty r^3 R_{n_f l_f}(r) R_{n_i l_i}(r)\,dr$ (converted consistently for real tesseral orbitals via unitary $Y_l^m$ expansion).
2. **Relativistic Dirac E1 Transition Matrix Element (Length Gauge)**:
   In the long-wavelength dipole approximation ($\hat{O}_q^{(1)} = -e r C_q^{(1)} \mathbf{I}_4$, spin-diagonal on large and small bispinor radial components), the Wigner–Eckart factorization gives:
   $$\langle f | r C_q^{(1)} | i \rangle = (-1)^{j_f - m_{jf}} \begin{pmatrix} j_f & 1 & j_i \\ -m_{jf} & q & m_{ji} \end{pmatrix} \langle \kappa_f || C^{(1)} || \kappa_i \rangle \int_0^\infty r \left( P_f(r) P_i(r) + Q_f(r) Q_i(r) \right) dr$$
   with spin-angular reduced matrix element:
   $$\langle \kappa_f || C^{(1)} || \kappa_i \rangle = (-1)^{j_i + 1/2} \sqrt{(2j_f+1)(2j_i+1)} \begin{pmatrix} j_f & 1 & j_i \\ -1/2 & 0 & 1/2 \end{pmatrix} \Pi_{\text{E1}}(\kappa_f, \kappa_i)$$
   where $\Pi_{\text{E1}} = 1$ iff $(-1)^{l(\kappa_f) + l(\kappa_i)} = -1$ (exact opposite parity, equivalent to Wigner 6-$j$ recoupling over $l, s=1/2, j$).
3. **Oscillator Strength & Spontaneous Emission Rate (Ladenburg Identity)**:
   For transition energy $\Delta E_{\text{Ha}} = |E_{\text{upper}} - E_{\text{lower}}|$ in Hartrees (using atomic reduced-mass energies while dipole elements carry units $e a_0$):
   $$f_{i\to f} = \frac{2}{3} \Delta E_{\text{Ha}} \sum_q |\langle f | r C_q^{(1)} | i \rangle|^2, \qquad S_{fi} = |\langle f || \mathbf{d} || i \rangle|^2$$
   $$A_{u\to l} = \frac{4 \alpha^3}{3} \frac{(\Delta E_{\text{Ha}})^3}{\tau_0} \sum_{q, \text{final degenerate } m} |\langle l | r C_q^{(1)} | u \rangle|^2 = \frac{2\pi e^2 \nu^2}{\varepsilon_0 m_e c^3} \frac{g_l}{g_u} f_{l\to u} \quad [\text{s}^{-1}]$$
   Notice both `nonrelativisticE1.ts` and `relativisticE1.ts` verify the exact NIST/Ladenburg $f \leftrightarrow A$ conversion to full floating-point accuracy.

---

## 2. Definitions

- **Selection rules enforced explicitly**:
  - Nonrelativistic: $\Delta l = \pm 1$, $\Delta m_l \in \{-1, 0, +1\}$, $\Delta m_s = 0$, parity flips $(-1)^{l_f + l_i} = -1$.
  - Relativistic Dirac: $\Delta j \in \{-1, 0, +1\}$ (no $0 \to 0$, though all half-integer hydrogenic states have $j \ge 1/2$), $\Delta m_j \in \{-1, 0, +1\}$, parity flips $(-1)^{l_f + l_i} = -1$.
- **Spherical polarization channels**: $q = -1, 0, +1$ returned individually alongside total dipole squared $|\langle f | \mathbf{d} | i \rangle|^2$.

---

## 3. Units

- Radial matrix elements: $a_0$ (Bohr radii)
- Dipole matrix elements & line strength $S_{fi}$: $e a_0$ and $(e a_0)^2$
- Transition energy $\Delta E$: $\text{eV}$ and $\text{Ha}$
- Vacuum wavelength $\lambda_{\text{vac}}$: $\text{nm}$ ($hc / \Delta E$)
- Oscillator strength $f$: dimensionless
- Einstein $A$: $\text{s}^{-1}$

---

## 4. Assumptions

- Electric-dipole (E1) long-wavelength limit ($k r \ll 1$; exact multipole retardation $j_1(kr)$ omitted).
- Length gauge ($-e \mathbf{r}$) with exact point-Coulomb eigenstates (velocity/acceleration gauge equivalence holds identically for exact point-Coulomb eigenstates).
- Emission rates report zero for exact degenerate transitions ($\Delta E = 0$, e.g., $2s \leftrightarrow 2p$ in Schrödinger theory or $2s_{1/2} \leftrightarrow 2p_{1/2}$ in pure point-Coulomb Dirac theory without Lamb shift).

---

## 5. Numerical Method

- Racah closed-form formula for `wigner3j` and `wigner6j` implemented using exact JavaScript `BigInt` factorials before converting to IEEE-754 double precision, eliminating factorial overflow/cancellation up to high $j$.
- Radial integrals evaluated using composite Simpson quadrature with $N \ge 4000$ intervals (converged residual between $N/2$ and $N$ reported in `numericalQuality.convergenceResidual`, typically $< 10^{-11}\text{–}10^{-14}$).

---

## 6. Validity Domain

- Strictly one-electron hydrogenic systems ($N = 1$, $1 \le Z \le 118$ NR; $1 \le Z \le 137$ Dirac), point-nucleus models (`point-infinite-mass` or `point-finite-mass`). Multi-electron or finite-nucleus transitions are explicitly rejected (`unsupported`).

---

## 7. Known Limitations

- Higher multipoles (M1, E2, two-photon $2s_{1/2} \to 1s_{1/2}$) are not implemented.
- Bound-to-continuum photoionization cross sections are not implemented.
- Length-gauge retarded relativistic retardation ($j_1(\omega r / c)$) becomes non-negligible at very high $Z$ ($Z \gtrsim 70$); ATOMS evaluates the standard E1 dipole operator $-e r C_q^{(1)}$.

---

## 8. Reference Sources

- Gordon, W. (1929), *Ann. Phys.* 394, 1031 (exact analytical NR hydrogenic radial integral $\langle n' l' | r | n l \rangle$).
- Drake, G. W. F. (Ed.) (2006), *Springer Handbook of Atomic, Molecular, and Optical Physics*.
- Johnson, W. R. (2007), *Atomic Structure Theory* (relativistic E1 spin-angular reduced matrix elements).
- Grant, I. P. (2007), *Relativistic Quantum Theory of Atoms and Molecules*.

---

## 9. Validation Procedures

Executed in `src/physics/__tests__/transitionsSpectroscopy.test.ts` (10 tests passing):
- Wigner 3-$j$ orthogonality sums & 6-$j$ triangle zeroing.
- Exact Gordon analytical value: $|\langle 2p, 0 | r C_0^{(1)} | 1s, 0 \rangle| = \frac{128\sqrt{2}}{243}\,a_0$ (`0.744935...`), $A_{2p \to 1s} = 6.2649\times 10^8\text{ s}^{-1}$ for $^1\text{H}$ (`f = 0.416197`).
- $Z^4$ Einstein-$A$ scaling check between $^1\text{H}$ and $\text{He}^+$ ($Z=2$).
- Forbidden channel zeroing ($1s \to 2s$, $\Delta l = 0$, $\Delta m_s \neq 0$).
- Dirac relativistic doublet ratio $A(2p_{3/2} \to 1s_{1/2}) \approx A(2p_{1/2} \to 1s_{1/2})$ and fine-structure oscillator strength ratio $f(1s_{1/2}\to 2p_{3/2}) : f(1s_{1/2}\to 2p_{1/2}) \approx 2 : 1$.
- Nonrelativistic $\alpha \to 0$ agreement and high-$Z$ (`Z = 79`) small-component $Q_f Q_i$ non-negligible contribution check.
