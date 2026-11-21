# ATOMS v0.6.1 — Analytical Schrödinger–Coulomb Engine

Module: [`src/physics/providers/schrodinger/index.ts`](../src/physics/providers/schrodinger/index.ts) (built atop [`src/physics/hydrogenic.ts`](../src/physics/hydrogenic.ts) and [`native/quantum_core.hpp`](../native/quantum_core.hpp)).

---

## 1. Governing Equations

1. **Time-Independent Schrödinger Equation (Point-Coulomb One-Electron)**:
   $$\left[ -\frac{\hbar^2}{2\mu} \nabla^2 - \frac{Z e^2}{4\pi \varepsilon_0 r} \right] \psi_{nlm_l}(\mathbf{r}) = E_n \psi_{nlm_l}(\mathbf{r}), \qquad \mu = \frac{m_e M_{\text{nuc}}}{m_e + M_{\text{nuc}}}$$
2. **Reduced-Mass Bohr Length & Energy Eigenvalues**:
   $$a_\mu = \frac{a_0}{\mu / m_e}, \qquad E_n = -\frac{\mu}{m_e} \frac{Z^2}{2 n^2}\; E_h = -13.605693122994 \left(\frac{\mu}{m_e}\right) \frac{Z^2}{n^2}\;\text{eV}$$
3. **Hydrogenic Wavefunction** $\psi_{nlm_l}(r, \theta, \phi) = R_{nl}(r) \, \Phi_{lm_l}(\theta, \phi)$:
   $$R_{nl}(r) = \left(\frac{Z \mu}{a_0 m_e}\right)^{3/2} \sqrt{\left(\frac{2}{n}\right)^3 \frac{(n-l-1)!}{2n\,(n+l)!}} \; e^{-\rho/2} \rho^l L_{n-l-1}^{2l+1}(\rho), \qquad \rho = \frac{2 Z r}{n a_\mu}$$
4. **Closed-Form Analytic Expectation Values**:
   $$\langle r \rangle_{nl} = \frac{a_\mu}{2Z} \left[3n^2 - l(l+1)\right], \qquad \langle r^2 \rangle_{nl} = \frac{a_\mu^2 n^2}{2Z^2} \left[5n^2 + 1 - 3l(l+1)\right]$$
   $$\langle r^{-1} \rangle_{nl} = \frac{Z}{a_\mu n^2}, \qquad \langle r^{-2} \rangle_{nl} = \frac{Z^2}{a_\mu^2 n^3 (l + \tfrac{1}{2})}, \qquad \langle r^{-3} \rangle_{nl} = \frac{Z^3}{a_\mu^3 n^3 l(l + \tfrac{1}{2})(l+1)}\; (l > 0)$$

---

## 2. Definitions

- `schrodingerCoulombV6Provider`: `PhysicsProvider` (`id: "schrodinger-coulomb"`, `version: "0.6.1"`, capabilities: `bound-energy`, `total-energy`, `radial-wavefunction`, `spatial-density`, `radial-probability`, `expectation-values`, `e1-transitions`, `spectroscopy`).
- `evaluateSchrodingerState(state, Z, reducedMassRatio, rBohr, theta, phi)`: returns complex amplitude `{ re, im, radialR, density }`.
- Radial probability distribution: $P_{nl}(r) = r^2 |R_{nl}(r)|^2$ normalized to $\int_0^\infty P_{nl}(r)\,dr = 1$.

---

## 3. Units

- Radial argument `rBohr` is in $a_0$ (converted internally using `zeta = Z * reducedMassRatio` so `rho = 2 * zeta * rBohr / n` matches reduced Bohr length scaling).
- Outputs report paired Hartree ($\text{Ha}$) and electronvolts ($\text{eV}$) for energies, $a_0^k$ for $\langle r^k \rangle$, and $e / a_0^3$ ($= 1/a_0^3$ for 1 electron) for probability densities.

---

## 4. Assumptions

- Strictly one electron ($N = 1$, $q = Z - 1$).
- Spinless Coulomb Hamiltonian (spin $m_s = \pm 1/2$ enters only state multiplicity and conservation in E1 transitions; fine structure, spin-orbit, and Darwin corrections are absent).
- Point nuclear charge ($R_{\text{nuc}} = 0$); `point-infinite-mass` sets $\mu / m_e = 1$, while `point-finite-mass` computes $\mu/m_e$ from bare nuclear mass $M_{\text{nuc}}$ (never neutral atomic mass).

---

## 5. Numerical Method

- Generalized Laguerre polynomials $L_{n-l-1}^{2l+1}(\rho)$ evaluated via stable three-term recurrence; factorial ratios computed in log-$\Gamma$ space (`lgamma`) in double precision to avoid overflow up to high $(n, l)$.
- Radial nodes ($n - l - 1$ distinct zeros of $L_{n-l-1}^{2l+1}(\rho)$) bracketed on a non-uniform quadratic-coordinate grid ($r_i = r_{\max}(i/N)^2$, $N = 6000$) and refined via 64-step bisection to $< 10^{-11}\,a_0$, preventing skipped inner zeros at high $n$.
- `node-counts` provider check explicitly validates polar cones ($l - |m_l|$) and azimuthal nodes / winding order ($|m_l|$) across all $m_l \in [-l..+l]$ in both real and complex bases.
- Identical mathematical recurrence in `native/quantum_core.hpp` allows deterministic cross-language verification.

---

## 6. Validity Domain

- Atomic number $1 \le Z \le 118$, electron count $N = 1$ ($q = Z - 1$).
- Nuclear model in `["point-infinite-mass", "point-finite-mass"]`. (`finite-uniform` and `finite-fermi` are explicitly rejected by `supports()`.)
- Quantum state `kind === "nonrelativistic"` with $n \ge 1$, $0 \le l < n$, $|m_l| \le l$.

---

## 7. Known Limitations

- Omits relativistic kinetic corrections ($p^4$), spin-orbit coupling, Darwin term, Lamb shift/QED, hyperfine coupling, and finite nuclear volume effects.
- Cannot model $N \ge 2$ multi-electron correlation or neutral multi-electron atoms beyond one-electron ions.

---

## 8. Reference Sources

- Bethe, H. A. & Salpeter, E. E. (1957), *Quantum Mechanics of One- and Two-Electron Atoms*, Academic Press.
- Pauling, L. & Wilson, E. B. (1935), *Introduction to Quantum Mechanics*.
- CODATA 2018 fundamental physical constants (NIST).

---

## 9. Validation Procedures

- `src/physics/__tests__/hydrogenic.test.ts` (26 tests): verifies $L_k^\alpha$, $Y_l^m$ orthonormality ($l \le 4$), tesseral orthonormality, $E_n = -13.605693\,Z^2/n^2\text{ eV}$, full 3D normalization $\int |\psi|^2\,d^3r = 1$, radial node counts $n-l-1$, and azimuthal current $\mathbf{j}$.
- `src/physics/__tests__/schrodingerProvider.test.ts` (4 tests): verifies $^1\text{H}$ and $\text{He}^+$ ($Z=2, N=1$) reduced-mass energies ($-13.598287\text{ eV}$ before QED/Lamb shift), $<r^{-3}>$, analytic vs numerical expectation values ($\Delta < 10^{-6}$), rejection of multi-electron / anion / finite-nucleus inputs, and `Worker` execution.
- `src/physics/__tests__/native_parity.test.ts` (5 tests) + `npm run test:native` (340 C++ checks Debug + Release): cross-checks TypeScript values against compiled C++17 reference binary `quantum_reference_dump`.
