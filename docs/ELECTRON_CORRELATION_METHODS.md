# Post-Hartree–Fock Electron Correlation Methods — ATOMS v0.7.2

**Engine:** Live **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`** (`science/correlation_backend.py`)  
**Hamiltonian:** Non-relativistic clamped point-infinite-mass Coulomb Hamiltonian in $C_1$ real spherical Gaussian atomic orbitals (`density_fit` disabled).  
**Energy Identity:** All correlation runs verify $|E_{\text{total}} - (E_{\text{HF}} + E_{\text{corr}})| < 10^{-9}\,\text{Ha}$ directly from PySCF outputs.

---

## 1. Method Families & Mathematical Guarantees

| Method ID | PySCF Class | Reference | Variational? | Size-Extensive? | Exact for $N=2$? |
|---|---|---|---|---|---|
| `rmp2` | `mp.MP2(rhf)` (`mp.RMP2`) | `RHF` ($2S=0$) | **No** | **Yes** | No |
| `ump2` | `mp.UMP2(uhf)` | `UHF` | **No** | **Yes** | No |
| `romp2` | `mp.ROMP2(rohf)` | `ROHF` ($2S \ge 1$) | **No** | **Yes** | No |
| `rcisd` | `ci.CISD(rhf)` (`ci.RCISD`) | `RHF` ($2S=0$) | **Yes** | **No** | **Yes** |
| `ucisd` | `ci.CISD(uhf)` (`ci.UCISD`) | `UHF` | **Yes** | **No** | **Yes** (within spin block) |
| `fci` | `fci.FCI` / `mcscf.CASCI` / `fci.direct_uhf` | `RHF`, `ROHF`, `UHF` | **Yes** | **Yes** | **Yes** |

### Why Variationality vs. Size-Extensivity Matters
- **MP2 (`RMP2`, `UMP2`, `ROMP2`)** sums second-order perturbation diagrams ($T_2$ doubles, plus $T_1$ `e_corr_singles` from semi-canonicalized orbitals in `ROMP2`). Because MP2 is linked-diagram perturbative rather than an energy expectation value of a normalized wavefunction, $E_{\text{MP2}}$ is **size-extensive** ($E(\text{A}\cdots\text{B}) = E(\text{A}) + E(\text{B})$ at infinite separation) but **non-variational** (it can dip slightly below FCI — observed in `Ne/cc-pVDZ`, where $E_{\text{corr}}(\text{RMP2}) = -0.187567\text{ Ha}$ while $E_{\text{corr}}(\text{RCISD}) = -0.186651\text{ Ha}$). `ATOMS` also evaluates minimum $1p\text{–}1h$ and $2p\text{–}2h$ orbital denominator gaps (`denominatorDiagnostics`) and warns when near-degeneracy risks perturbative divergence.
- **CISD (`RCISD`, `UCISD`)** diagonalizes the Hamiltonian in the linear space of reference + single + double excitations ($|\Psi\rangle = c_0|\Phi_0\rangle + \sum c_i^a|\Phi_i^a\rangle + \sum c_{ij}^{ab}|\Phi_{ij}^{ab}\rangle$). It provides a strict **variational upper bound** ($E_{\text{CISD}} \ge E_{\text{FCI}}$) and is exact for 2-electron singlets (`He/cc-pVDZ` $E_{\text{RCISD}} = E_{\text{FCI}} = -2.8875948311\text{ Ha}$), but is **not size-extensive** for $N \ge 4$ electrons because disconnected products of simultaneous double excitations ($T_2^2$, quadruple excitations) are omitted.
- **Direct Full CI (`fci`)** diagonalizes the exact many-electron Hamiltonian within the finite Gaussian orbital/active space:
  - **All-electron `RHF`/`ROHF`**: `pyscf.fci.FCI(mf)`
  - **Frozen-core (`noble-core`) on `RHF`/`ROHF`**: `pyscf.mcscf.CASCI(mf, n_active_orb, (n_alpha_active, n_beta_active))` without orbital re-optimization (fixed SCF orbitals). Note PySCF's `mc.kernel()` 5-tuple returns `fcivec` at index 2 (`e_tot, e_cas, fcivec, mo_coeff, mo_energy`).
  - **All-electron `UHF`**: `pyscf.fci.direct_uhf.FCISolver` on spin-unrestricted α/β MO integrals (`ao2mo.general`), measuring overlap-corrected $\langle S^2 \rangle = S_z(S_z+1) + N_\beta - \operatorname{Tr}(\Gamma_1^{\alpha\beta}\dots)$ via `solver.spin_square((c_ci,), n_orb, (n_a, n_b), mo_coeff)`.

---

## 2. Explicit Guardrails & Method Separation

1. **`AtomSphAverageRHF` Excluded**: Spin-unpolarized fractional-occupation spherical ensemble orbitals are **not** single Slater determinants and violate Brillouin/Møller–Plesset reference assumptions; both UI and server reject `atom-sph-avg` for all post-HF methods.
2. **`ROHF + CISD` Rejected**: In PySCF `2.15.1`, calling `ci.CISD(rohf_mf)` silently delegates to `UCISD` (converting the ROHF reference to unrestricted form instead of performing spin-restricted open-shell CISD). `ATOMS` strictly blocks `rohf + rcisd` and `rohf + ucisd` at the domain, UI, server, and Python layers so open-shell CISD users explicitly select `UHF + UCISD` or `ROHF + FCI`.
3. **UCISD HF-Seed Safeguard**: On open-shell `Li/cc-pVDZ` (`UHF`), PySCF's default `UCISD` Davidson initial guess can lock onto a nearly orthogonal excited root ($|c_0|^2 = 1.59 \times 10^{-13}, E_{\text{corr}} = +0.0676\text{ Ha}$). `_solve_cisd` detects $|c_0|^2 < 0.25$ or $E_{\text{corr}} > 10^{-10}$ and re-runs `myci.kernel(ci0=hf_unit_vector)`, cleanly recovering the variational ground correlation ($|c_0|^2 = 0.999925, E_{\text{corr}} = -0.00021677\text{ Ha}$).
4. **Distinction from `Atomic Terms & CI` (`v0.7.1`)**: Determinant MP2, CISD, and FCI operate in $C_1$ orbital space with $\hat{S}^2$ / $M_S$ diagnostics (`spin_square`, optional `fix_spin_` for RHF/ROHF FCI), **not** spherical $\hat{L}^2$ Russell–Saunders LS-CSFs (`isLsTermResolved: false`, `lSquared: null`). Use **Atomic Terms & CI** for $^{2S+1}L^\pi$ multiplet spectroscopy.
5. **Pre-Allocation Resource Ceilings**: Before allocating integrals or CI vectors, client preflight, Express server, and Python calculate exact binomial determinant counts $N_{\text{det}} = \binom{M_{\text{act}}}{N_{\alpha,\text{act}}} \binom{M_{\text{act}}}{N_{\beta,\text{act}}}$ and CISD excitation dimensions, rejecting oversized requests (`N_det > 200,000`, `CISD dim > 2,000,000`, `nRoots > 5`) with HTTP `422 RESOURCE_LIMIT_EXCEEDED`.

---

## 3. References

- **PySCF Official Documentation**:
  - Møller–Plesset Perturbation Theory (`MP2` / `RMP2` / `UMP2` / `ROMP2`): <https://pyscf.org/user/mp.html>
  - Configuration Interaction (`CISD` / `RCISD` / `UCISD`): <https://pyscf.org/user/ci.html>
  - Full Configuration Interaction (`fci.FCI` / `direct_spin1` / `direct_uhf`): <https://pyscf.org/user/fci.html>
  - Complete Active Space CI (`mcscf.CASCI` & `fix_spin_`): <https://pyscf.org/user/mcscf.html>
  - Self-Consistent Field (`RHF` / `UHF` / `ROHF`): <https://pyscf.org/user/scf.html>
- **Software Citations**: Q. Sun et al., *WIREs Comput. Mol. Sci.* **8**, e1340 (2018); *J. Chem. Phys.* **153**, 024109 (2020); B. P. Pritchard et al., *J. Chem. Inf. Model.* **59**, 4814 (2019).
