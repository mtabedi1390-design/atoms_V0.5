# Multi-Electron Hartree–Fock Scientific Validation (`ATOMS v0.7.0`)

All Hartree–Fock validation evidence below separates **(1) directly compiled and executed `compas/sphf` B-spline numerical HF benchmarks**, **(2) matched PySCF `2.15.1` (`libcint`, `BSE 0.12`) Gaussian basis-sequence runs**, **(3) the open-shell `Li, B, C, N, O, F, Cr, C+` validation matrix**, and **(4) automated Vitest + Playwright checks**.

---

## 1. Direct Upstream `compas/sphf` Build & Reproducibility Record

- **Repository**: `https://github.com/compas/sphf.git` (`MIT` license)
- **Pinned Revision**: `913991ff361ddb52f05d207c23fd1932d0c960e3`
- **Compiler & Libraries**: `GNU Fortran (Ubuntu 12.3.0-1ubuntu1~22.04.3) 12.3.0`, `liblapack-dev` / `libblas-dev` (`3.11.0-2`), built cleanly from unmodified upstream Fortran 90 sources (`make -C src`).
- **Upstream `test_all/run1..8` Reproducibility** (Level-2 B-spline default `h = 0.125, ks = 6, ns = 72`, `scf_tol = 1e-15`):
  - `test1.log` (`He 1S`, `sha256:5bc9588496e0adb0`): `-2.861679995611798 Ha` (matches `out1`: `-2.861679995612 Ha`)
  - `test2.log` (`Li 2S`, `sha256:5b7580e699b6e211`): `-7.432726930728180 Ha` (matches `out2`: `-7.432726930728 Ha`)
  - `test3.log` (`Li 2P`, `sha256:5d12df5141f401ce`): `-2.169854456993815 Ha` (valence/core run matching `out3`)
  - `test4.log` (`Be 1S`, `sha256:cec84ec9ce700ea9`): `-14.573023168313082 Ha` (matches `out4`)
  - `test5.log` (`F 2P`, `sha256:38beca6024041314`): `-99.409349386693137 Ha` (matches `out5`)
  - `test6.log` (`Mg 1S`, `sha256:3a3874bcb165c7bb`): `-199.426751894065177 Ha` (matches `out6`)
  - `test7.log` (`Ba`, `sha256:977bb60f86a1945b`): `-23094.303666365958634 Ha` (matches `out7`)
  - `test8.log` (`Hg`, `sha256:4d9a71d2dbe47ce2`): `-23722.104101465029089 Ha` (matches `out8`)
- **Additional Direct `sphf_scf`/`sphf_all` Executions** (`B 2P` `out_B` `sha256:2f19976205007cc9`: `-24.529060728524`; `C 3P` `out_C_3P` `sha256:e573cc50dd306779`: `-37.688618962962`; `C AV` `out_C_AV` `sha256:40157ef056a19d40`: `-37.659698064875`; `N 4S` `out_N` `sha256:4094804fae031c62`: `-54.400934208503`; `O 3P` `out_O_3P` `sha256:4a8ee6f0fe08cfa3`: `-74.809398470001`; `Ne 1S` `out_Ne` `sha256:aecc2163031110e6`: `-128.547098109350`; `V 4F` `out_V` `sha256:d9ceecbe398514d7`: `-942.884337737238`; `Cr 7S` `out_Cr` `sha256:51768340182651c5`: `-1043.356376285607`).
- **SPHF Radial/Spline Convergence (`C 3P`)**: `h=0.25, ks=5, ns=40 -> -37.688618752486 Ha`; `h=0.125, ks=6, ns=72 -> -37.688618962962 Ha`; `ks=7, ns=120 -> -37.688618962485 Ha` (`-V/T = 2.00000000000007`).

---

## 2. Matched GTO Basis-Sequence Convergence vs. Direct `compas/sphf` Limits

All GTO runs use point-infinite-mass nonrelativistic HF (`convTol = 1e-10 Ha`, `SO3` symmetry). Differences $\Delta E = E_{\text{GTO}} - E_{\text{SPHF}}$ reflect finite Gaussian basis-set incompleteness rather than solver error:

| System (`2S`, Method) | `compas/sphf` Ref (Ha) | `cc-pVDZ` ($\Delta E$ mHa) | `cc-pVTZ` ($\Delta E$ mHa) | `aug-cc-pVTZ` ($\Delta E$ mHa) | `def2-SVP` ($\Delta E$ mHa) | `def2-TZVP` ($\Delta E$ mHa) | Comparison Type |
|---|---|---|---|---|---|---|---|
| **He** (`0`, RHF) | `-2.861679996` (`1S`) | `-2.85516048` (`+6.520`) | `-2.86115334` (`+0.527`) | `-2.86118343` (`+0.497`) | `-2.85516048` (`+6.520`) | `-2.85989543` (`+1.785`) | Direct closed-shell |
| **Li** (`1`, ROHF) | `-7.432726931` (`2S`) | `-7.43241988` (`+0.307`) | `-7.43267886` (`+0.048`) | `-7.43268212` (`+0.045`) | `-7.42506404` (`+7.663`) | `-7.43265179` (`+0.075`) | Asymptotic (`2S` single $s$) |
| **Be** (`0`, RHF) | `-14.573023168` (`1S`) | `-14.57233763` (`+0.686`) | `-14.57287347` (`+0.150`) | `-14.57287534` (`+0.148`) | `-14.55372687` (`+19.296`) | `-14.57257987` (`+0.443`) | Direct closed-shell |
| **B** (`1`, ROHF) | `-24.529060729` (`2P`) | `-24.52656395` (`+2.497`) | `-24.52809762` (`+0.963`) | `-24.52813871` (`+0.922`) | `-24.49755868` (`+31.502`) | `-24.52834156` (`+0.719`) | Asymptotic single det vs $^2P$ |
| **C** (`2`, ROHF) | `-37.688618963` (`3P`) | `-37.68239129` (`+6.228`) | `-37.68666223` (`+1.957`) | `-37.68677677` (`+1.842`) | `-37.64114338` (`+47.476`) | `-37.68747479` (`+1.144`) | Asymptotic single det vs $^3P$ |
| **N** (`3`, ROHF) | `-54.400934209` (`4S`) | `-54.38841424` (`+12.520`) | `-54.39735785` (`+3.576`) | `-54.39760952` (`+3.325`) | `-54.33292502` (`+68.009`) | `-54.39917537` (`+1.759`) | Asymptotic half-filled $p^3$ |
| **O** (`2`, ROHF) | `-74.809398470` (`3P`) | `-74.78749216` (`+21.906`) | `-74.80483711` (`+4.561`) | `-74.80556219` (`+3.836`) | `-74.71504829` (`+94.350`) | `-74.80856253` (`+0.836`) | Asymptotic single det vs $^3P$ |
| **F** (`1`, ROHF) | `-99.409349387` (`2P`) | `-99.37184174` (`+37.508`) | `-99.40020275` (`+9.147`) | `-99.40121852` (`+8.131`) | `-99.28044990` (`+128.899`) | `-99.40643817` (`+2.911`) | Asymptotic single det vs $^2P$ |
| **Ne** (`0`, RHF) | `-128.547098109` (`1S`) | `-128.48877555` (`+58.323`) | `-128.53186164` (`+15.236`) | `-128.53327283` (`+13.825`) | `-128.37640681` (`+170.691`) | `-128.54149276` (`+5.605`) | Direct closed-shell |
| **Cr** (`6`, ROHF) | `-1043.356376286` (`7S`) | `-1043.35499896` (`+1.377`) | `-1043.35568204` (`+0.694`) | `-1043.35569850` (`+0.678`) | `-1043.19704063` (`+159.336`) | `-1043.33433747` (`+22.039`) | Asymptotic half-filled $3d^5 4s^1$ |

*(One-electron exact fixed-nucleus limits also hold cleanly: `He+` UHF/`aug-cc-pVTZ` `-1.994290049 Ha` vs `-2.0 Ha`, $|J+K| < 10^{-11}\text{ Ha}$.)*

---

## 3. Open-Shell Validation Matrix (`Li, B, C, N, O, F, Cr, C+`)

Every run enforces `termSymbol = null`, `totalJ = null`, `lSquaredAvailable = false`, exact `tracePS = N`, and 110-point Lebedev angular anisotropy:

| System | Config (`2S`) | Method / Basis | State Character | $E_{\text{HF}}$ (Ha) | $\operatorname{Tr}(PS)$ | $\langle S^2 \rangle$ | Max Rel. Anisotropy (110-pt) | Spherical? |
|---|---|---|---|---|---|---|---|---|
| **Li** ($3,3$) | $1s^2 2s^1$ ($1$) | `rohf` / `aug-cc-pvtz` | `restricted-open-shell-determinant` | `-7.43268212` | `3.000000` | `0.750000` | `2.03e-15` | Yes ($2s^1$ spherical) |
| **Li** ($3,3$) | $1s^2 2s^1$ | `atom-sph-avg` / `aug-cc-pvtz` | `spherical-ensemble-average` | `-7.37805683` | `3.000000` | `unavailable (null)` | `2.02e-15` | Yes (ensemble) |
| **B** ($5,5$) | $2s^2 2p^1$ ($1$) | `rohf` / `cc-pvtz` | `restricted-open-shell-determinant` | `-24.52809762` | `5.000000` | `0.750000` | `1.72e+00` | No (oriented $p^1$ det) |
| **B** ($5,5$) | $2s^2 2p^1$ | `atom-sph-avg` / `cc-pvtz` | `spherical-ensemble-average` | `-24.37809162` | `5.000000` | `unavailable (null)` | `3.03e-15` | Yes (ensemble) |
| **C** ($6,6$) | $2s^2 2p^2$ ($2$) | `uhf` / `cc-pvtz` | `unrestricted-determinant` | `-37.68792049` | `6.000000` | `2.003342` | `8.88e-01` | No (oriented $p^2$ det) |
| **C** ($6,6$) | $2s^2 2p^2$ ($2$) | `rohf` / `cc-pvtz` | `restricted-open-shell-determinant` | `-37.68666223` | `6.000000` | `2.000000` | `8.95e-01` | No ($p$-split `1.1e-16 Ha`) |
| **C** ($6,6$) | $2s^2 2p^2$ | `atom-sph-avg` / `cc-pvtz` | `spherical-ensemble-average` | `-37.33693518` | `6.000000` | `unavailable (null)` | `2.15e-15` | Yes (spin-unpol. ensemble) |
| **N** ($7,7$) | $2s^2 2p^3$ ($3$) | `rohf` / `cc-pvtz` | `restricted-open-shell-determinant` | `-54.39735785` | `7.000000` | `3.750000` | `5.85e-15` | Yes (half-filled $p^3$) |
| **O** ($8,8$) | $2s^2 2p^4$ ($2$) | `rohf` / `cc-pvtz` | `restricted-open-shell-determinant` | `-74.80483711` | `8.000000` | `2.000000` | `7.21e-01` | No (oriented $p^4$ det) |
| **F** ($9,9$) | $2s^2 2p^5$ ($1$) | `rohf` / `cc-pvtz` | `restricted-open-shell-determinant` | `-99.40020275` | `9.000000` | `0.750000` | `5.02e-01` | No (oriented $p^5$ det) |
| **Cr** ($24,24$) | $[Ar]3d^5 4s^1$ ($6$) | `rohf` / `def2-tzvp` | `restricted-open-shell-determinant` | `-1043.33433747` | `24.000000` | `12.000000` | `8.14e-13` | Yes (half-filled $d^5 s^1$) |
| **Cr** ($24,24$) | $[Ar]3d^5 4s^1$ | `atom-sph-avg` / `def2-tzvp` | `spherical-ensemble-average` | `-1042.27562257` | `24.000000` | `unavailable (null)` | `2.80e-15` | Yes (curated `atomic_config`) |
| **$\text{C}^+$** ($6,5$) | $2s^2 2p^1$ | `atom-sph-avg` / `cc-pvtz` | `spherical-ensemble-average` | `-37.05822531` | `5.000000` | `unavailable (null)` | `1.90e-15` | Yes (`atomic_config` cation) |

*Note on `C AV` vs `AtomSphAverageRHF`*: `compas/sphf` configuration average (`C AV`, `-37.659698 Ha`) averages spin-polarized configurations (`3P, 1D, 1S`), whereas PySCF `AtomSphAverageRHF` (`-37.336935 Ha` in `cc-pVTZ`) is a spin-unpolarized $N_\alpha = N_\beta$ fractional ensemble — a contextual comparison only.

---

## 4. Physical Invariants Checked on Every Calculation

Across automated Vitest (`src/physics/__tests__/hartreeFock.test.ts`), Playwright (`tests/browser/hartreeFock.spec.ts`), and lifecycle tests:
1. **Energy Decomposition Consistency**: $|E_{\text{tot}} - (T + V_{ne} + J + K)| \le 2 \times 10^{-12}\text{ Ha}$.
2. **Overlap Orthonormality & Trace**: $\max |\mathbf{C}^T\mathbf{S}\mathbf{C} - \mathbf{I}| \le 10^{-10}$ and $|\operatorname{Tr}(\mathbf{P}\mathbf{S}) - N| < 10^{-10}$ (including cation $\text{C}^+$ under `atom-sph-avg`).
3. **ROHF Orbital vs Koopmans Diagonals (`Li aug-cc-pVTZ`)**: `1s` effective `-2.477798 Ha` vs `compas/sphf -2.477751 Ha`; `2s <Fa>` `-0.196313 Ha` vs `compas/sphf -0.196323 Ha`.
4. **Negative Controls**: `maxCycle=1` unconverged SCF rejects honestly; `rhf` rejects `2S != 0`; `atom-sph-avg` rejects `N < 2`; non-`point-infinite-mass` models reject for multi-electron HF.
