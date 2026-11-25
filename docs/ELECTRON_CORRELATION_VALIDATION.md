# Electron Correlation Validation & Measured Benchmarks — ATOMS v0.7.2

All numerical data reported below were measured directly with **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`** via `science/correlation_backend.py` and verified automatically by `science/test_correlation_backend.py`, `src/physics/__tests__/correlation.test.ts`, and `tests/browser/correlation.spec.ts`.

---

## 1. Exact & Independent Cross-Checks

### 1.1 Closed-Shell 2-Electron Exactness (`He`, $Z=2, N=2, 2S=0$)
For a 2-electron singlet, doubles represent the entire orbital excitation manifold ($S+D = \text{Full CI}$):
- **`He / 6-31G` (`nOrb = 2`) FCI vs. Independent Explicit $4 \times 4$ Slater-Determinant Hamiltonian (`np.linalg.eigh`)**:
  - `np.linalg.eigh(H_4x4)[0]` = **`-2.870162138818... Ha`**
  - `fci.FCI(rhf).kernel()` & `ci.RCISD(rhf).kernel()` agree to **`< 1.0e-12 Ha`**.
- **`He / cc-pVDZ` (`nOrb = 5`, `N_det = 25`)**:
  - `E_HF (RHF)` = **`-2.8551604772 Ha`**
  - `RMP2 E_corr` = **`-0.0258283396 Ha`** (`E_tot = -2.8809888169 Ha`, `79.63%` of FCI correlation)
  - `RCISD E_corr` = **`-0.0324343538 Ha`** (`E_tot = -2.8875948311 Ha`, `100.00%` exact match to FCI)
  - `FCI E_corr` = **`-0.0324343538 Ha`** (`|E(RCISD) - E(FCI)| < 1e-11 Ha`, `|c0|^2 = 0.992202`)

### 1.2 Zero-Virtual & 1-Electron Limiting Cases
- **`He / STO-3G` (`nOrb = 1`, zero virtual orbitals)**: All methods (`RMP2`, `RCISD`, `FCI`) return `E_corr = 0.0 Ha` and `E_total = E_HF` cleanly with no division-by-zero errors.
- **`H / cc-pVDZ` ($Z=1, N=1, 2S=1$, single electron)**: `UMP2`, `ROMP2`, `UCISD`, `FCI` return `E_corr = 0.0 Ha` (`< 1e-12 Ha`) and pure doublet `<S²> = 0.750000`.

### 1.3 Open-Shell Doublets & Multi-Root CASCI (`Li`, `B`)
- **`Li / cc-pVDZ` ($Z=3, N=3, 2S=1$)**:
  - `ROHF`: `E_HF = -7.4324198797 Ha`; `ROMP2 E_corr = -0.0001935521 Ha` (includes `e_corr_singles ≈ -5.89e-7 Ha`).
  - `UHF`: `E_HF = -7.4324205276 Ha`; `UCISD E_corr = -0.0002167692 Ha` (`|c0|^2 = 0.999925` after HF-seed Davidson check); `UHF FCI` recovers full 3-electron determinant correlation with exact `<S²> = 0.750000`.
- **`B / cc-pVDZ` ($Z=5, N=5, 2S=1$)**:
  - `ROHF` noble-core `CASCI(3, 13)` (`nRoots = 2`, `fix_spin_ = True`): `E_HF = -24.5265909060 Ha`, Root #0 `E_corr = -0.0631666740 Ha`, `<S²> = 0.750000` (`spin-pure`).
  - `UHF` all-electron `FCI`: `E_HF = -24.5299616244 Ha`, `E_corr = -0.0606679755 Ha`, overlap-corrected `<S²> = 0.750000000012`.

### 1.4 Variational Ordering, Frozen-Core, & Non-Variational Perturbation (`Be`, `Ne`)
- **`Be / cc-pVDZ` ($Z=4, N=4, 2S=0$)**:
  - `E_HF (RHF)` = **`-14.5723376310 Ha`**
  - `RCISD (all-electron)`: `E_corr = -0.0450181567 Ha` (`E_tot = -14.6173557877 Ha`)
  - `FCI (all-electron)`: `E_corr = -0.0450718756 Ha` (`E_tot = -14.6174095066 Ha`; `E(FCI) < E(RCISD) < E(HF)`)
  - `FCI (noble-core, CASCI(2, 13))`: `E_corr = -0.0445049625 Ha` (`|E_corr(all-e)| > |E_corr(noble-core)|`, consistent with omitted $1s^2$ core-core and core-valence correlation)
- **`Ne / cc-pVDZ` ($Z=10, N=10, 2S=0$)**:
  - `E_HF (RHF)` = **`-128.4887755517 Ha`**
  - `RMP2`: `E_corr = -0.1875671856 Ha` (overshoots `RCISD` by `-0.92 mHa` — real demonstration of non-variational MP2)
  - `RCISD`: `E_corr = -0.18665139 Ha` (`E_tot = -128.67542694 Ha`)
  - `FCI`: Cleanly blocked pre-allocation (`N_det = 4,008,004 > 200,000`).

---

## 2. Explicit Size-Extensivity Theorem Proof (`He₂ / 6-31G` at `R = 100 Bohr`)

Measured directly in `science/test_correlation_backend.py::test_cisd_non_size_extensivity_vs_mp2_and_fci` for two non-interacting He atoms separated by $100\,a_0$:

| Method | $E(\text{He}_2, 100\,a_0) - 2\,E(\text{He})$ (Ha) | Theoretical Expectation |
|---|---|---|
| `RHF` | `< 1.0e-12 Ha` | Size-consistent |
| `RMP2` | `< 1.0e-10 Ha` | Size-extensive (linked diagrams) |
| `RCISD` | **`+0.00012885 Ha` (`+1.2885e-4 Ha`)** | **NOT size-extensive** (missing unlinked $T_2^A T_2^B$ quadruples!) |
| `FCI` | `< 1.0e-10 Ha` | Exact size-extensive limit |
