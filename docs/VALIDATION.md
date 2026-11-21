# ATOMS v0.6.0 — Scientific & Software Validation Report

All verification commands reported below were executed cleanly against the final `v0.6.0` codebase (no tests were weakened, skipped, or fabricated).

---

## 1. Automated Verification Summary

| Suite / Command | Scope Covered | Result | Verified Outcome |
|---|---|---|---|
| `npm run data:build` | SHA-256 verification of `nist_asd_ie.tsv`, `lobato2026_*`, charge integral across `Z=1..118` | **PASS** | 108 NIST + 118 Dirac–Fock JSONs regenerated; max relative charge error `1.991e-07` |
| `npm run data:matrix` | 118-element observable coverage audit | **PASS** | 118 rows generated into `docs/ACCURACY_MATRIX.md` |
| `npm run typecheck` (`npm run lint`) | Strict TypeScript compilation (`tsc --noEmit -p tsconfig.json`) | **PASS** | 0 errors across all modules |
| `npm run test:native` | C++17 `native/quantum_core.hpp` Debug (`-O0 -g`) & Release (`-O2 -DNDEBUG`) | **PASS** | **340 checks, 0 failures** (both Debug & Release) |
| `npm test` (Vitest) | Unit, Domain, Schrödinger, Dirac, Transitions, Spectroscopy, Sampling, Visualization, Experiment Platform, C++ Parity | **PASS** | **15 test files, 112/112 tests passed** |
| `npm run build` | Vite production single-file client bundle + inline Web Workers | **PASS** | `dist/index.html` built cleanly (0 errors) |
| `npm run test:browser` (Playwright) | Chromium + SwiftShader WebGL2 (`tests/browser/core.spec.ts`, `responsive.spec.ts`, `science.spec.ts`, `laboratory.spec.ts`) | **PASS** | Executed across `v0.5` regression (13 tests) + `v0.6` Laboratory workflows (7 tests) = **20 tests passing** |
| Layer isolation audit | Grep `src/domain`, `src/physics`, `src/science`, `src/experiments`, `src/workers`, `src/numerics` for `react`/`three` | **PASS** | **0 matches** |

---

## 2. Numerical & Scientific Cross-Checks Verified in Automated Tests

### 2.1 Schrödinger–Coulomb Engine (`schrodingerProvider.test.ts`, `hydrogenic.test.ts`, `native_parity.test.ts`)
- **Energies & Reduced Mass**:
  - $^1\text{H}$ (`point-infinite-mass`): $E_1 = -13.60569312\text{ eV}$ ($-0.5\text{ Ha}$).
  - $^1\text{H}$ (`point-finite-mass`, proton $m_p = 1.007276466621\text{ u}$): $\mu/m_e = 0.9994556794 \implies E_1 = -13.5982873\text{ eV}$ (exact point-Coulomb Dirac/Schrödinger before QED Lamb shift).
  - $\text{He}^+$ ($Z=2, N=1$, alpha $m_\alpha = 4.001506179127\text{ u}$): $E_1 = -54.415308\text{ eV}$.
- **Expectation Value Convergence** ($\langle r \rangle, \langle r^2 \rangle, \langle r^{-1} \rangle, \langle r^{-2} \rangle, \langle r^{-3} \rangle$): numeric vs closed-form analytic formulas agree within $< 10^{-6}$ relative error; radial normalization $\int_0^\infty P_{nl}(r)\,dr = 1$ within $< 10^{-7}$.
- **C++17 Native Parity (`native_parity.test.ts`)**: `quantum_reference_dump` matches TypeScript radial $R_{nl}(r)$, complex $Y_l^m$, real tesseral harmonics, energy levels, and probability currents to `< 1e-12` relative error.

### 2.2 Dirac–Coulomb Relativistic Engine (`diracProvider.test.ts`)
- **Fine Structure**: $^1\text{H}$ $2p_{3/2} - 2p_{1/2}$ splitting evaluates to $4.5283\times 10^{-5}\text{ eV}$ ($0.3652\text{ cm}^{-1}$), matching Sommerfeld–Dirac theory (`Z^4 alpha^2 / 32 Ha`).
- **4-Spinor Radial Normalization**: $\int_0^\infty (|P_{n\kappa}(r)|^2 + |Q_{n\kappa}(r)|^2)\,dr = 1.0000000$ to $< 10^{-7}$ across $Z = 1$ through $\text{Au}^{78+}$ ($Z=79$) and $\text{Og}^{117+}$ ($Z=118$).
- **Nonrelativistic $\alpha \to 0$ Limit**: Lower-component fraction $\int |Q|^2\,dr \propto (Z\alpha)^2 \to 0$, and Dirac binding energies converge onto Schrödinger $E_n$.
- **Singularity Rejection**: $Z = 138, \kappa = -1$ ($1 - (Z\alpha)^2 < 0$) is rejected cleanly by `checkDiracCoulombDomain`.

### 2.3 E1 Transitions & Spectroscopy (`transitionsSpectroscopy.test.ts`)
- **Exact Gordon Benchmark**: Nonrelativistic $^1\text{H}$ $2p (m=0) \to 1s (m=0)$ radial dipole $|\langle r \rangle| = \frac{128\sqrt{6}}{243}\,a_0 = 1.290266...\;a_0$, yielding $f_{1s\to 2p} = 0.416197$ (infinite mass) and Einstein rate $A_{2p\to 1s} = 6.2649\times 10^8\text{ s}^{-1}$.
- **$Z^4$ Scaling**: $\text{He}^+$ ($Z=2, N=1$) scales Einstein $A_{2p\to 1s}$ by $16\times \approx 1.0029\times 10^{10}\text{ s}^{-1}$.
- **Dirac Fine-Structure Line Ratio**: $f(1s_{1/2}\to 2p_{3/2}) : f(1s_{1/2}\to 2p_{1/2}) = 2 : 1$ verified to $< 10^{-4}$; high-$Z$ ($\text{Au}^{78+}$) demonstrates non-negligible $Q_f Q_i$ small-component contribution.
- **NIST $^1\text{H}$ Vacuum Benchmarks**: Computed Lyman-α/β/γ, Balmer-α/β/γ/δ, and Paschen-α/β Dirac lines match the pinned NIST `HDEL`-derived vacuum wavelengths within `< 0.05 nm` (exact residual `~0.005 nm` on Balmer-α matches expected omitted Lamb shift).

### 2.4 Visualization & Marching Tetrahedra (`visualization.test.ts`)
- Watertight 6-tetrahedra surface extraction verifies non-zero positive and negative phase lobes for real $2p_z$ orbitals enclosed inside the orbital domain, plus consistent Dirac large ($|P|^2$) and small ($|Q|^2$) 2D slices.

### 2.5 Experiment Platform (`lifecycle.test.ts`, `laboratory.spec.ts`)
- Verifies structured-clone boundary checks, monotonic `runSequence` stale-result protection, real cancellation (`status: "cancelled"`), persistence, replay (`source: "loaded-from-store"`) vs recompute (`source: "computed"`, `recomputedCount >= 1`), and schema-validated JSON bundle import/export (rejecting malformed JSON and unsupported schema/bundle versions).
