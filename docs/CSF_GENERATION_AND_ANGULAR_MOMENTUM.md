# CSF Generation & Exact Angular Momentum Projection (`ATOMS v0.7.1`)

## 1. $SO(3)$-Symmetric Complex Spherical Spin-Orbital Basis

To construct true eigenstates of $\hat{L}^2$, $\hat{S}^2$, $\hat{L}_z$, $\hat{S}_z$, and spatial parity $\hat{\Pi}$ in a Gaussian basis, `science/ls_ci_backend.py` (`build_so3_complex_shells`) first runs PySCF's spherically averaged solver `scf.atom_hf.AtomSphAverageRHF` (with explicit `atomic_configuration` handling for neutral atoms and ions). This yields variationally averaged real AO radial shells $R_{n\ell}(r)$ whose $(2\ell+1)$ real spherical-harmonic components $(m_x, \dots)$ are exact eigenvectors of the spherical Fock operator.

Each radial shell $(n, \ell)$ is transformed via PySCF's Condon–Shortley unitary matrix `pyscf.symm.sph.sph_pure2real(l, reorder_p=True)` into complex spherical harmonic MOs $\psi_{n\ell m_\ell}(\mathbf{r}) = R_{n\ell}(r) Y_\ell^{m_\ell}(\theta, \phi)$ ($m_\ell = -\ell, \dots, +\ell$):
- **Complex Orthonormality Error:** $\max |C_{\mathbb{C}}^\dagger S_{\text{AO}} C_{\mathbb{C}} - I| \sim 10^{-16}$ (verified across `He`–`Fe`).
- **Angular Purity:** Cross-$\ell$ mixing and radial shell alignment errors vanish to machine precision ($0$ to $6.66 \times 10^{-16}$).
- **AO $\to$ MO Integrals:** One-electron $h_{pq}$ and two-electron electron-repulsion integrals $(pq|rs)$ (chemist's notation, transformed directly in complex spherical orbitals) are contracted cleanly from `libcint` integrals `int1e_kin + int1e_nuc` and `int2e` via four-index complex unitary transformations.

---

## 2. Exact Second-Quantized $(L^2, S^2, L_z, S_z, \Pi)$ CSF Construction

Rather than diagonalizing an unstructured determinant space, `science/ls_ci_backend.py` constructs configuration-pure **Configuration State Functions (CSFs)** per electronic configuration $\mathbf{n} = \{n_1\ell_1^{q_1}, \dots\}$:

1. **Bitmask Determinant Enumeration (`_enumerate_config_dets`):**
   Determinants within configuration $\mathbf{n}$ are filtered strictly to the target magnetic projections $M_L = L$ and $M_S = S$ (since every $(L, S)$ multiplet has a unique highest-weight ladder top $|L, S; M_L=L, M_S=S\rangle$ where $\hat{L}_+|\Psi\rangle = 0$ and $\hat{S}_+|\Psi\rangle = 0$).
2. **Exact Second-Quantized Ladder Operators (`_build_ladder_operators`):**
   In the complex spherical spin-orbital basis $|n\ell m_\ell \sigma\rangle$:
   $$\hat{L}_+ = \sum_{n,\ell,m_\ell,\sigma} \sqrt{\ell(\ell+1) - m_\ell(m_\ell+1)}\, a^\dagger_{n\ell, m_\ell+1, \sigma} a_{n\ell m_\ell \sigma}$$
   $$\hat{S}_+ = \sum_{n,\ell,m_\ell} a^\dagger_{n\ell m_\ell \alpha} a_{n\ell m_\ell \beta}$$
   with fermion anticommutation phase $\mathrm{sgn}$ computed directly from binary popcount parity (`_bit_sign`).
3. **Exact Casimir Operators (`_build_l2_s2_operators_same_ml_ms`):**
   Using the Casimir identities on the $M_L = L, M_S = S$ subspace:
   $$\hat{L}^2 = \hat{L}_-\hat{L}_+ + \hat{L}_z^2 + \hat{L}_z, \qquad \hat{S}^2 = \hat{S}_-\hat{S}_+ + \hat{S}_z^2 + \hat{S}_z$$
   Because $\hat{L}_+$ maps $(M_L=L, M_S=S)$ to the adjacent $(M_L=L+1, M_S=S)$ determinant list (and $\hat{S}_+$ maps to $(M_L=L, M_S=S+1)$), forming $\hat{L}_+^\dagger \hat{L}_+ + L(L+1)I$ and $\hat{S}_+^\dagger \hat{S}_+ + S(S+1)I$ constructs **exact sparse real-symmetric positive-semidefinite matrices** within each configuration!
4. **Simultaneous Nullspace Projection (`np.linalg.eigh`):**
   The target $(L, S)$ CSFs inside configuration $\mathbf{n}$ are identically the simultaneous zero-eigenvalue nullspace of:
   $$\hat{K} = (\hat{L}^2 - L(L+1)\hat{I})^2 + (\hat{S}^2 - S(S+1)\hat{I})^2$$
   More accurately, $\hat{K} = \hat{L}_+^\dagger \hat{L}_+ + \hat{S}_+^\dagger \hat{S}_+$, since $\hat{L}_+\Psi = 0$ and $\hat{S}_+\Psi = 0$ are necessary and sufficient for $(M_L=L, M_S=S)$ highest weight!

---

## 3. Numerical Discovery: LAPACK `dsyevr` (`scipy.linalg.eigh`) vs `dsyevd` (`np.linalg.eigh`)

During validation on transition-metal `Fe 3d6 4s2 + 3d3 4p3 5s1 5p1` (which exhibits a **76-dimensional degenerate zero-eigenvalue nullspace** of $\hat{K}$), `scipy.linalg.eigh` (which defaults to LAPACK's MRRR driver `dsyevr`) produced non-orthogonal eigenvectors (`||Q^T Q - I||_∞ = 0.537`), corrupting the projected CI energy by `~12.7 Ha`.

Replacing all dense symmetric eigensolvers in `science/ls_ci_backend.py` with **`numpy.linalg.eigh` (`LAPACK dsyevd` divide-and-conquer)** plus a conditional QR orthonormalization polish (`if ortho_err > 1e-11: np.linalg.qr`) and a strict runtime assertion (`if csf_ortho_err > 1e-8: raise RuntimeError(...)`) eliminated the defect completely:
- `Fe` nullspace and CI CSF basis now satisfy $\max |C_{\text{CSF}}^T C_{\text{CSF}} - I| = 1.78 \times 10^{-15}$.
- Across all tested systems (`He`, `Be`, `B`, `C`, `N`, `O`, `F`, `Ne`, `Si`, `V2+`, `Fe`), every CSF root achieves:
  - **CSF orthonormality error:** $\le 2.9 \times 10^{-15}$
  - **$\langle \hat{L}^2 \rangle - L(L+1)$ and $\langle \hat{S}^2 \rangle - S(S+1)$ error:** $< 6 \times 10^{-15}$
  - **Operator variance $\mathrm{Var}(\hat{L}^2), \mathrm{Var}(\hat{S}^2)$:** $< 10^{-14}$ (`statePurity: "pure-ls-eigenstate"`).

---

## 4. Clebsch–Gordan (`wigner3j`/`wigner6j`) Reuse in TypeScript

In TypeScript (`src/physics/ls/terms.ts`), `clebschGordan(j1, m1, j2, m2, J, M)` directly wraps ATOMS's `BigInt`-stabilized `wigner3j` from `src/numerics/specialFunctions/wigner.ts` using:
$$\langle j_1 m_1;\, j_2 m_2 \mid J M \rangle = (-1)^{j_1 - j_2 + M} \sqrt{2J+1} \begin{pmatrix} j_1 & j_2 & J \\ m_1 & m_2 & -M \end{pmatrix}$$
avoiding any duplicated angular-momentum factorial code.
