# MCHF & Radial Orbital Optimization — Architectural Boundary (`ATOMS v0.7.1`)

## 1. Current Status in `v0.7.1`: Not Implemented

**Self-consistent Multiconfiguration Hartree–Fock (MCHF) radial orbital optimization is NOT implemented in ATOMS `v0.7.1`.**

In `v0.7.1`:
- All radial orbitals $\{P_{n\ell}(r)\}$ are computed **once** from PySCF's spherically averaged single-configuration Hartree–Fock solver (`AtomSphAverageRHF`) in a fixed contracted Gaussian basis (`BSE 0.12`).
- Multiconfiguration Mixing (`ls-term-ci`) optimizes only the **linear CI expansion coefficients $\{c_\alpha\}$** over the orthonormal $(L^2, S^2, \Pi)$ CSFs for that fixed radial basis.
- Every API field (`orbitalOptimizationSupported: false`, `orbitalOptimizationPerformed: false`), TypeScript provider metadata, and `AtomicTermsWorkspace` banner states this explicitly.

---

## 2. Physical Consequences of Fixed Orbitals vs. True MCHF

Because radial orbitals are frozen to the ground-state `AtomSphAverageRHF` average rather than variationally relaxed per $(L, S, \pi)$ term:
1. **Excited-State & Rydberg Relaxation Error:** Radial expansion of diffuse valence orbitals (e.g., $\text{Be } 2s2p\;^{1}P^\circ$ vs $^{3}P^\circ$) or core-polarization contractions in compact singlet/triplet terms cannot occur unless spanned by virtual orbitals in `valence-plus-virtuals` mode.
2. **Term-Dependence of Radial Orbitals:** Exact single-configuration Hartree–Fock for $\text{C } 2p^2$ assigns slightly different radial $2p(r)$ shapes to $^3P$, $^1D$, and $^1S$. Fixed spherical-average orbitals yield a slightly higher total energy (`Si 3P` fixed-orbital valence-CAS `cc-pVTZ`: `-288.851272 Ha` vs published `ATSP2K` single/valence-MCHF `-288.935678 Ha`).
3. **Variational Upper Bound & Exact Active-Space FCI:** Within the fixed $SO(3)$ active MO subspace, our eigenvalues still provide a strict variational upper bound to exact nonrelativistic eigenstates and match PySCF determinant FCI (`direct_spin1`) to `< 10^{-10}` Ha.

---

## 3. Roadmap (`v0.7.2` / `v0.8.0` Architecture)

To introduce true orbital optimization in future milestones without violating `v0.7.1` abstractions:
1. **State-Specific / State-Averaged CASSCF (`v0.7.2`):** Couple `ls_ci_backend.py` CSF 1- and 2-particle reduced density matrices ($\Gamma^{(1)}, \Gamma^{(2)}$) into symmetry-restricted $SO(3)$ orbital-rotation gradients ($U = e^{-\kappa}$, keeping $(n,\ell)$ radial shells unmixed across $\ell, m_\ell$), or interface PySCF `CASSCF` constrained to spherical shell rotations, plus optional dynamical correlation (`MP2` / `NEVPT2` / `CCSD`).
2. **Numerical Radial B-Spline / Finite-Difference MCHF (`v0.8+`):** Combine ATOMS's radial solvers with numerical radial MCHF radial-equation iterations (comparable to `ATSP2K` `mchf` / numerical spline `compas/sphf` multiconfiguration extensions under clean OSI licensing), followed by relativistic Breit–Pauli or Dirac–Coulomb–Breit MCDHF (`v0.8.x`) for true $J$-resolved fine structure.
