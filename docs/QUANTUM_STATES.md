# ATOMS v0.6.0 — Quantum State Representations

Module: [`src/domain/quantum/index.ts`](../src/domain/quantum/index.ts)

---

## 1. Governing Equations & Algebraic Relations

1. **Nonrelativistic Hydrogenic Spin-Orbital Basis**:
   $$|n, l, m_l, m_s\rangle, \qquad \langle \mathbf{r} | n, l, m_l \rangle = R_{nl}(r) \, \Phi_{lm_l}(\theta, \phi)$$
   where $\Phi_{lm_l}$ is either a complex spherical harmonic $Y_l^{m_l}(\theta,\phi)$ (eigenstate of $\hat{L}_z$) or an orthonormal real tesseral harmonic.
2. **Relativistic Dirac Bispinor Basis** (simultaneous eigenstates of $\hat{H}_D, \hat{K}, \hat{J}^2, \hat{J}_z$):
   $$\Psi_{n\kappa m_j}(r,\theta,\phi) = \frac{1}{r} \begin{pmatrix} P_{n\kappa}(r) \, \Omega_{\kappa m_j}(\theta, \phi) \\ i Q_{n\kappa}(r) \, \Omega_{-\kappa m_j}(\theta, \phi) \end{pmatrix}$$
   with spin-orbit eigenvalue $-\kappa = -(l - j)(2j + 1)$ satisfying exact quantum-number bijections:
   $$j(\kappa) = |\kappa| - \frac{1}{2}, \qquad l_{\text{large}}(\kappa) = \begin{cases} \kappa, & \kappa > 0 \\ -\kappa - 1, & \kappa < 0 \end{cases}, \qquad l_{\text{small}}(\kappa) = l_{\text{large}}(-\kappa), \qquad \pi = (-1)^{l_{\text{large}}(\kappa)}$$

---

## 2. Definitions

`QuantumState` is a strictly discriminated TypeScript union (`kind`):
1. `NonRelativisticState` (`kind: "nonrelativistic"`): `{ n, l, m_l, m_s, basis: "real" | "complex" }`
2. `RelativisticState` (`kind: "relativistic"`): `{ n, kappa, j, m_j }`
3. `SuperpositionState` (`kind: "superposition"`): normalized weighted linear combination $\sum_k c_k |\psi_k\rangle$ with complex coefficients $\{ \text{re}, \text{im} \}$ over homogeneous NR or Dirac basis states.
4. `ConfigurationAverageState` (`kind: "configuration-average"`): neutral multi-electron configuration state (`elementZ`, `subshells[]`, `isOpenShell`, `groundTerm`) consumed by `lobato2026-df`, `pyscf-hf`, and `browser-slater`.

Helper bijections in `src/domain/quantum/index.ts`:
- `jFromKappa(kappa)`, `lFromKappa(kappa)`, `lSmallFromKappa(kappa)`, `parityFromKappa(kappa)`, `kappaFromLJ(l, j)`
- `validateQuantumState(state)`

---

## 3. Units

Quantum numbers ($n, l, m_l, m_s, \kappa, j, m_j$) and superposition amplitudes are dimensionless. Spatial coordinates used with state evaluators are expressed in atomic units ($a_0$) unless converted via `convertLength`.

---

## 4. Assumptions

- Bound discrete eigenstates have integer $n \ge 1$. Continuum scattering states ($E > 0$) are out of scope for bound-state constructors.
- Nonrelativistic `basis: "real"` states represent orthonormal real tesseral superpositions of $\pm m_l$ and are therefore not eigenstates of $\hat{L}_z$ when $m_l \neq 0$ (probability current $\mathbf{j} \equiv 0$).
- Dirac states couple upper ($\Omega_{\kappa m_j}$) and lower ($\Omega_{-\kappa m_j}$) 2-spinor spherical harmonics of opposite parity $(-1)^{l_{\text{small}}} = -(-1)^{l_{\text{large}}}$.

---

## 5. Numerical Method

State constructors compute `jFromKappa`, verify half-integer $m_j + 1/2 \in \mathbb{Z}$, and check integer / triangle constraints at construction (`createNonRelativisticState`, `createRelativisticState`, `createSuperpositionState`) throwing explicit `RangeError` or returning structured `ValidationResult` issues in `validateQuantumState`.

---

## 6. Validity Domain

- Nonrelativistic: $n \in \mathbb{Z}_{\ge 1}$, $0 \le l \le n - 1$, $m_l \in \{-l, \dots, +l\}$, $m_s \in \{-0.5, +0.5\}$.
- Relativistic Dirac: $n \in \mathbb{Z}_{\ge 1}$, $\kappa \in \mathbb{Z} \setminus \{0\}$, $l(\kappa) \le n - 1$ (note: for $l = n - 1$, $\kappa = +n$ is **forbidden** because it would correspond to $l = n$! Only $\kappa = -n$ gives $j = n - 1/2, l = n - 1$), $m_j \in \{-j, -j+1, \dots, +j\}$.

---

## 7. Known Limitations

- Superposition time-evolution $c_k(t) = c_k(0)e^{-iE_k t/\hbar}$ is not exposed as an animated simulation runner in the v0.6 UI (though static `SuperpositionState` schema and validation are implemented).
- Multi-electron configuration state representation (`ConfigurationAverageState`) uses spherical shell averages rather than full $LS$ / $jj$ Slater determinant coupled microstates.

---

## 8. Reference Sources

- Condon & Shortley (1935), *The Theory of Atomic Spectra* (spherical harmonic phase convention).
- Grant, I. P. (2007), *Relativistic Quantum Theory of Atoms and Molecules* ($\kappa$-convention and $\Omega_{\kappa m_j}$).
- Varshalovich, Moskalev & Khersonskii (1988), *Quantum Theory of Angular Momentum*.

---

## 9. Validation Procedures

- `src/domain/__tests__/quantum.test.ts`: verifies $\kappa \leftrightarrow (l, j)$ bijections, exclusion of invalid $\kappa = +n$, invalid half-integer $m_j$, and out-of-range $(n, l, m_l)$ rejection.
- UI editing constraints enforced via `clampKappaForN` and `clampMjForKappa` in `src/app/useAtomsLaboratory.ts`.
