# Multi-Electron Hartree–Fock Scientific Validation (`ATOMS v0.7.0`)

All Hartree–Fock validation evidence below separates **independent pinned references**, **live PySCF/libcint/BSE measurements**, and **automated ATOMS tests**. Note that direct local compilation of `compas/sphf` Fortran sources could not be run because `gfortran` is not installed in the execution container; published `compas/sphf` (`MIT`, `test_all/out1..out5`) and Koga, Kanayama, Watanabe & Thakkar (*Int. J. Quantum Chem.* **71**, 491, 1999) HF limits serve as the independent numerical references.

---

## 1. Independent Numerical Benchmarks vs Live PySCF `2.15.1` (`BSE v0.12`)

Measured directly with `/opt/atoms-py/bin/python science/hf_backend.py` (`convTol = 1e-10 Ha`, `SO(3)` symmetry unless noted):

| System | Config (`2S`) | Method / Basis | $N_{\text{AO}}$ | SCF Cycles | $E_{\text{HF}}$ (Ha) | Independent Limit (Ha) & Source | $\Delta E = E_{\text{GTO}} - E_{\text{lim}}$ (mHa) | $\langle S^2 \rangle$ (Exact) | Virial $-V/T$ | Total / Peak Mem |
|---|---|---|---|---|---|---|---|---|---|---|
| **H** ($Z=1,N=1$) | $1s^1$ ($1$) | UHF / `aug-cc-pVTZ` | 23 | 0 | `-0.499821176` | `-0.500000000` (Analytic $-Z^2/2$) | `+0.1788` (basis bound) | `0.750000` (`0.75`) | `2.001032` | `110.4 ms` / `8.9 MB` |
| **$\text{He}^+$** ($Z=2,N=1$) | $1s^1$ ($1$) | UHF / `aug-cc-pVTZ` | 23 | 0 | `-1.994290049` | `-2.000000000` (Analytic $-Z^2/2$) | `+5.7100` (basis bound) | `0.750000` (`0.75`) | — | verified in Vitest |
| **He** ($Z=2,N=2$) | $1s^2$ ($0$) | RHF / `STO-3G` | 1 | 2 | `-2.807783958` | `-2.861679996` (`compas/sphf out1`) | `+53.8960` | `0.000000` (`0`) | `1.994425` | `517.2 ms` / `17.3 MB` |
| **He** ($Z=2,N=2$) | $1s^2$ ($0$) | RHF / `cc-pVTZ` | 14 | 4 | `-2.861153345` | `-2.861679996` (`compas/sphf out1`) | `+0.5267` | `0.000000` (`0`) | `2.000001` | `141.0 ms` / `6.1 MB` |
| **He** ($Z=2,N=2$) | $1s^2$ ($0$) | RHF / `aug-cc-pVTZ` | 23 | 5 | `-2.861183426` | `-2.861679996` (`compas/sphf out1`) | `+0.4966` | `0.000000` (`0`) | `2.000512` | `249.0 ms` / `8.9 MB` |
| **Li** ($Z=3,N=3$) | $1s^2 2s^1$ ($1$) | UHF / `aug-cc-pVTZ` | 46 | 6 | `-7.432705327` | `-7.432726931` (`compas/sphf out2`, ROHF) | `+0.0216` (with spin pol.) | `0.750014` (`0.75`) | `2.000003` | `570.3 ms` / `20.1 MB` |
| **Li** ($Z=3,N=3$) | $1s^2 2s^1$ ($1$) | ROHF / `aug-cc-pVTZ` | 46 | 7 | `-7.432682118` | `-7.432726931` (`compas/sphf out2`, ROHF) | `+0.0448` | `0.750000` (`0.75`) | `2.000002` | `503.2 ms` / `20.1 MB` |
| **Be** ($Z=4,N=4$) | $1s^2 2s^2$ ($0$) | RHF / `aug-cc-pVTZ` | 46 | 6 | `-14.572875342` | `-14.573023168` (`compas/sphf out4`) | `+0.1478` | `0.000000` (`0`) | `2.000122` | `434.3 ms` / `20.0 MB` |
| **C** ($Z=6,N=6$) | $2s^2 2p^2$ ($2$) | UHF / `cc-pVDZ` | 14 | 7 | `-37.683404661` | `-37.6886190` (Koga 1999, $^3P$ ROHF) | `+5.2143` | `2.002212` (`2.0`) | `1.999874` | `282.5 ms` / `8.6 MB` |
| **C** ($Z=6,N=6$) | $2s^2 2p^2$ ($2$) | UHF / `aug-cc-pVTZ` | 46 | 9 | `-37.688126130` | `-37.6886190` (Koga 1999, $^3P$ ROHF) | `+0.4929` | `2.004193` (`2.0`) | `2.000213` | `616.9 ms` / `21.7 MB` |
| **C** ($Z=6,N=6$) | $2s^2 2p^2$ | AtomSphAvg / `aug-cc-pVTZ` | 46 | 7 | `-37.342615461` | Distinct spherical-avg formalism | (higher by ~346 mHa) | `0.000000` | `2.000178` | `301.7 ms` / `22.4 MB` |
| **N** ($Z=7,N=7$) | $2s^2 2p^3$ ($3$) | UHF / `aug-cc-pVTZ` | 46 | 8 | `-54.401162240` | `-54.4009342` (Koga 1999, $^4S$ ROHF) | `-0.2280` (UHF < ROHF var.) | `3.757615` (`3.75`) | `2.000220` | `577.7 ms` / `22.5 MB` |
| **N** ($Z=7,N=7$) | $2s^2 2p^3$ ($3$) | ROHF / `aug-cc-pVTZ` | 46 | 9 | `-54.397609523` | `-54.4009342` (Koga 1999, $^4S$ ROHF) | `+3.3247` | `3.750000` (`3.75`) | `2.000266` | `493.4 ms` / `22.6 MB` |
| **Ne** ($Z=10,N=10$) | $2s^2 2p^6$ ($0$) | RHF / `STO-3G` | 5 | 2 | `-126.604524997` | `-128.5470981` (Koga 1999) | `+1942.6` | `0.000000` (`0`) | `2.008303` | `107.9 ms` / `6.9 MB` |
| **Ne** ($Z=10,N=10$) | $2s^2 2p^6$ ($0$) | RHF / `def2-SVP` | 14 | 5 | `-128.376406810` | `-128.5470981` (Koga 1999) | `+170.7` | `0.000000` (`0`) | `2.000000` | `167.9 ms` / `9.3 MB` |
| **Ne** ($Z=10,N=10$) | $2s^2 2p^6$ ($0$) | RHF / `def2-TZVP` | 31 | 6 | `-128.541492759` | `-128.5470981` (Koga 1999) | `+5.605` | `0.000000` (`0`) | `2.000000` | `299.6 ms` / `14.8 MB` |
| **Ne** ($Z=10,N=10$) | $2s^2 2p^6$ ($0$) | RHF / `aug-cc-pVTZ` | 46 | 6 | `-128.533272825` | `-128.5470981` (Koga 1999) | `+13.825` | `0.000000` (`0`) | `2.000378` | `415.2 ms` / `22.5 MB` |
| **Cr** ($Z=24,N=24$) | $[Ar]3d^5 4s^1$ ($6$) | UHF / `def2-SVP` | 31 | 8 | `-1043.197071970` | `-1043.3563760` (Koga 1999 $^7S$) | `+159.3` | `12.000015` (`12.0`) | `2.000203` | `488.9 ms` / `19.0 MB` |
| **Cr** ($Z=24,N=24$) | $[Ar]3d^5 4s^1$ ($6$) | ROHF / `def2-TZVP` | 45 | 11 | `-1043.334337466` | `-1043.3563760` (Koga 1999 $^7S$) | `+22.0` | `12.000000` (`12.0`) | `2.000017` | `667.0 ms` / `26.0 MB` |

---

## 2. Physical Invariants Checked on Every Calculation

Across all 18 profiled systems above and automated Vitest cases (`src/physics/__tests__/hartreeFock.test.ts`):
1. **Energy Decomposition Consistency**: $|E_{\text{tot}} - (T + V_{ne} + J + K)| \le 1.6 \times 10^{-12}\text{ Ha}$ (no double counting).
2. **One-Electron Self-Interaction Cancellation**: On $\text{H}$ and $\text{He}^+$ ($N=1$), individual $J$ and $K$ satisfy $|J + K| < 10^{-11}\text{ Ha}$, giving $E_{\text{tot}} = \langle \hat{h}_{\text{core}} \rangle \ge -Z^2/2$.
3. **Overlap Orthonormality & Trace**: $\max |\mathbf{C}^T\mathbf{S}\mathbf{C} - \mathbf{I}| \le 1.6 \times 10^{-14}$ and $|\operatorname{Tr}(\mathbf{P}\mathbf{S}) - N| < 10^{-12}$.
4. **110-Pt Lebedev Spherical Radial Normalization**: $|\int 4\pi r^2\rho\,dr - N| < 10^{-6}\,e$ and $|\int 4\pi r^2(\rho_\alpha-\rho_\beta)\,dr - 2S| < 10^{-6}\,e$ across every closed and open shell.
5. **ROHF Orbital vs Koopmans Diagonals (`Li aug-cc-pVTZ`)**: Closed-shell `1s` effective eigenvalue `-2.477798 Ha` matches `compas/sphf` (`-2.477751 Ha`, $\Delta = 4.7 \times 10^{-5}\text{ Ha}$); open-shell `2s` Koopmans diagonal $\langle 2s|\hat{F}^\alpha|2s\rangle = -0.196313\text{ Ha}$ matches `compas/sphf` (`-0.196323 Ha`, $\Delta = 1.0 \times 10^{-5}\text{ Ha}$).
6. **Negative Control & Error Classifications**:
   - **Basis incompleteness** (dominant positive $\Delta E$ vs radial CBS limits on `STO-3G` -> `aug-cc-pVTZ` / `def2-TZVP`),
   - **Spin polarization vs contamination**: UHF allows slight spin polarization ($E_{\text{UHF}}(\text{N}) < E_{\text{ROHF,lim}}(\text{N})$ by `0.23 mHa` with $\langle S^2 \rangle = 3.7576$), whereas ROHF enforces exact $\langle S^2 \rangle = S(S+1)$,
   - **Hartree–Fock correlation error**: Single-determinant HF inherently omits Coulomb correlation ($\approx 42\text{ mHa}$ in He, $\approx 390\text{ mHa}$ in Ne) — HF energy is variational upper bound on exact non-relativistic single-determinant energy, never exact total atomic energy.
