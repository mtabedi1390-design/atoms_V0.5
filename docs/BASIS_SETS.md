# Gaussian Basis Sets, Integrals, and Data Provenance (`ATOMS v0.7.0`)

ATOMS v0.7.0 sources all contracted Gaussian-Type Orbital (GTO) basis definitions from **Basis Set Exchange (`basis-set-exchange==0.12`, `BSD-3-Clause`)** — with exact element-mask verification against PySCF `2.15.1` (`Apache-2.0`) — and evaluates one- and two-electron integrals through **`libcint` (`pyscf/lib/libcgto.so`)**.

---

## 1. Integral Engine & Conventions (`libcint`)

All integrals are computed natively in C via `libcint` using standard **spherical harmonic** Gaussian contractions (`5d, 7f, 9g`, `mol.cart = False`):

- **Normalization**: Standard primitive and contracted GTO spherical normalization as specified by Basis Set Exchange and `libcint` (`S_{\mu\mu} = 1`).
- **One-Electron Integrals**:
  - Overlap matrix: $S_{\mu\nu} = \int \chi_\mu(\mathbf{r}) \chi_\nu(\mathbf{r})\,d^3\mathbf{r}$ (`int1e_ovlp`)
  - Kinetic energy: $T_{\mu\nu} = -\frac{1}{2}\int \chi_\mu(\mathbf{r}) \nabla^2 \chi_\nu(\mathbf{r})\,d^3\mathbf{r}$ (`int1e_kin`)
  - Nuclear attraction: $V_{\mu\nu} = -Z\int \chi_\mu(\mathbf{r})\frac{1}{r}\chi_\nu(\mathbf{r})\,d^3\mathbf{r}$ (`int1e_nuc`)
- **Two-Electron Repulsion Integrals (Chemists' Notation)**:
  $$(\mu\nu|\lambda\sigma) = \iint \frac{\chi_\mu(\mathbf{r}_1)\chi_\nu(\mathbf{r}_1)\chi_\lambda(\mathbf{r}_2)\chi_\sigma(\mathbf{r}_2)}{|\mathbf{r}_1 - \mathbf{r}_2|}\,d^3\mathbf{r}_1\,d^3\mathbf{r}_2$$
- **Basis Orthogonality Check**: Every calculation verifies MO coefficient orthonormality under the true overlap metric, $\max_{i,j} |(C^T S C - I)_{ij}| < 10^{-8}$, alongside the overlap condition number $\kappa(S) = \sigma_{\max}(S)/\sigma_{\min}(S)$.

---

## 2. Supported Basis Set Catalog (Pinned `BSE v1`)

Every element coverage limit below was **verified directly against `basis_set_exchange.api.get_metadata(name)` in BSE `0.12`**, ensuring no basis is advertised where BSE lacks an element or substitutes an Effective Core Potential (ECP).

| Basis ID | Label | BSE `version` | Harmonics | All-Electron `Z` Range | Excluded Elements in Range | ECP Exclusion Boundary | Primary Literature Citation |
|---|---|---|---|---|---|---|---|
| `sto-3g` | STO-3G | `1` | Spherical | `1..54` (H–Xe) | None | None in `1..54` | Hehre, Stewart & Pople, *J. Chem. Phys.* **51**, 2657 (1969) |
| `6-31g` | 6-31G | `1` | Spherical | `1..36` (H–Kr) | None | None in `1..36` | Ditchfield, Hehre & Pople (1971); Rassolov et al. (2001) |
| `cc-pvdz` | cc-pVDZ | `1` | Spherical | `1..36` | **`Z = 19` (K)** | None in supported `Z` | Dunning (1989); Woon & Dunning (1993); Balabanov & Peterson (2005) |
| `cc-pvtz` | cc-pVTZ | `1` | Spherical | `1..36` | **`Z = 19` (K)** | None in supported `Z` | Dunning (1989); Kendall, Dunning, Harrison (1992) |
| `aug-cc-pvtz` | aug-cc-pVTZ | `1` | Spherical | `1..36` | **`Z = 19` (K), `Z = 20` (Ca)** | None in supported `Z` | Kendall, Dunning, Harrison, *J. Chem. Phys.* **96**, 6796 (1992) |
| `def2-svp` | def2-SVP | `1` | Spherical | `1..36` (H–Kr) | None | **`Z >= 37` (Rb–Rn)** carries ECPs in BSE; blocked | Weigend & Ahlrichs, *PCCP* **7**, 3297 (2005) |
| `def2-tzvp` | def2-TZVP | `1` | Spherical | `1..36` (H–Kr) | None | **`Z >= 37` (Rb–Rn)** carries ECPs in BSE; blocked | Weigend & Ahlrichs, *PCCP* **7**, 3297 (2005) |

### Why `def2-*` is Strictly Capped at `Z = 36`
Direct inspection of `basis_set_exchange.get_basis(name, elements=[Z], fmt="json")` in BSE `0.12` shows `ecp_potentials` appearing at $Z = 37$ (`Rb`) through $Z = 86$ (`Rn`) for `def2-svp` and `def2-tzvp`. Loading BSE/PySCF Gaussian valence basis functions for $Z \ge 37$ without attaching their accompanying ECPs produces unphysical all-electron variational collapse. Both `science/hf_backend.py` and `src/physics/hf/basisCatalog.ts` enforce `allElectronMaxZ = 36` on `def2-*`.

---

## 3. Provenance Recorded Per Calculation

Every stored `ExperimentResultRecord` captures:
- Exact basis identifier (`basis`) and BSE provenance string (`BSE v0.12 (<bseName> v1)`),
- Spherical harmonic convention and AO basis count (`aoCount`),
- PySCF `2.15.1` (`Apache-2.0`) + `libcint` + `basis-set-exchange 0.12` (`BSD-3-Clause`) provenance metadata,
- Pinned `CODATA-2018` conversion constants (`1 Ha = 27.211386245988 eV`).
