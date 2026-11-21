# ATOMS v0.6.1 — Scientific & Software Validation Report

All verification commands reported below were executed cleanly against the final `v0.6.1` codebase (no tests were weakened, skipped, or fabricated).

---

## 1. Automated Verification Summary

| Suite / Command | Scope Covered | Result | Verified Outcome |
|---|---|---|---|
| `npm run data:build` | SHA-256 verification of `nist_asd_ie.tsv`, `lobato2026_*`, charge integral across `Z=1..118` | **PASS** | 108 NIST + 118 Dirac–Fock JSONs regenerated; max relative charge error `1.991e-07` |
| `npm run data:matrix` | 118-element observable coverage audit | **PASS** | 118 rows generated into `docs/ACCURACY_MATRIX.md` |
| `npm run typecheck` (`npm run lint`) | Strict TypeScript compilation (`tsc --noEmit -p tsconfig.json`) | **PASS** | 0 errors across all modules |
| `npm run test:native` | C++17 `native/quantum_core.hpp` Debug (`-O0 -g`) & Release (`-O2 -DNDEBUG`) | **PASS** | **340 checks, 0 failures** (both Debug & Release) |
| `npm test` (Vitest) | Unit, Domain, Schrödinger, Dirac, Transitions, Spectroscopy, Stabilization, Sampling, Visualization, Experiment Platform, C++ Parity | **PASS** | **16 test files, 126/126 tests passed** |
| `npm run build` | Vite production single-file client bundle + inline Web Workers | **PASS** | `dist/index.html` built cleanly (0 errors) |
| `npm run test:browser` (Playwright) | Chromium + SwiftShader WebGL2 (`tests/browser/core.spec.ts`, `responsive.spec.ts`, `science.spec.ts`, `laboratory.spec.ts`) | **PASS** | Executed across `v0.5` regression (13 tests) + `v0.6 / v0.6.1` Laboratory workflows (8 tests) = **21 tests passing** |
| Layer isolation audit | Grep `src/domain`, `src/physics`, `src/experiments`, `src/numerics`, `src/sampling` for `react`/`three` | **PASS** | **0 matches** |

---

## 2. Numerical & Scientific Cross-Checks Verified in Automated Tests

### 2.1 Schrödinger–Coulomb Engine (`schrodingerProvider.test.ts`, `stabilization.test.ts`, `hydrogenic.test.ts`, `native_parity.test.ts`)
- **All Magnetic Sublevels (`m_l !== 0`)**: Verified `ok: true` and exact polar-cone (`l - |m_l|`) / azimuthal node counts across every $m_l \in [-l..+l]$ for $2p, 3d, 4f$ in both real and complex bases.
- **High-`n` Radial Nodes & Reduced Mass**: Verified all $n - 1$ radial zeros for $n = 1..12$ ($s$-states) to $|L_{n-1}^1| < 10^{-5}$ via non-uniform quadratic-grid scanning, plus reduced-mass `integrateRadialMass` for $^1\text{H}$ and $^2\text{H}$.
- **Quadrature Grid Refinement**: Verified monotonic error decay across $N \in \{400, 1600, 6400\}$ reaching relative $\langle r \rangle$ error $< 10^{-8}$.
- **C++17 Native Parity (`native_parity.test.ts`)**: `quantum_reference_dump` matches TypeScript radial $R_{nl}(r)$, complex $Y_l^m$, real tesseral harmonics, energy levels, and probability currents to `< 1e-12` relative error.

### 2.2 Dirac–Coulomb Relativistic Engine (`diracProvider.test.ts`, `stabilization.test.ts`)
- **Fine Structure & Exact $(n,j)$ Degeneracy**: $^1\text{H}$ $2p_{3/2} - 2p_{1/2}$ splitting evaluates to $4.5283\times 10^{-5}\text{ eV}$ ($0.3652\text{ cm}^{-1}$); $2s_{1/2} = 2p_{1/2}$ and $3p_{3/2} = 3d_{3/2}$ degeneracies hold to $< 10^{-11}\text{ eV}$ for $Z \in \{1, 29, 79\}$.
- **Near-Origin Cusp & 2D Spin-Angular Orthonormality**: Verified log-slope $P, Q \propto r^\gamma$ at $r \in [10^{-6}, 2\times 10^{-6}]\,a_0$ for $Z=79$ and 2D spherical integration $\int |\Omega|^2 d\Omega = 1$ / orthogonality across $\kappa \in [-3..+2]$.
- **Grid Refinement & Singularity Rejection**: Monotonic `<r^-1>` convergence across $N \in \{400, 1600, 6400\}$; $Z = 138, \kappa = -1$ rejected cleanly by `checkDiracCoulombDomain`.

### 2.3 E1 Transitions & Spectroscopy (`transitionsSpectroscopy.test.ts`, `stabilization.test.ts`)
- **Closed-Form Gordon Benchmarks**: Verified numerical dipole integrals against exact analytic Gordon values for $1s\text{–}2p$ ($\frac{128\sqrt{6}}{243}\,a_0$), $2s\text{–}3p$ ($\frac{27648\sqrt{3}}{15625}\,a_0$), and $2p\text{–}3d$ ($\frac{165888\sqrt{5}}{78125}\,a_0$).
- **2D Spherical Quadrature Cross-Check**: Independently verified `nonrelativisticAngularC1` and `relativisticSpinAngularC1` against direct 2D $(\theta, \phi)$ integration, confirming exact $(-1)^{m_f}$ phase.
- **Sublevel Sum Rule & Forbidden Transition Zeroing**: Verified $\sum_{m_f} A_{i \to f} = A_{\text{level}}$ and confirmed zero `oscillatorStrength`, `einsteinA_s1`, `sublevelEinsteinA_s1`, and reduced strengths when spin or $|\Delta m| > 1$ selection rules forbid the transition.
- **Custom & NIST $^1\text{H}$ Spectroscopy**: Verified Lyman/Balmer/Paschen vacuum lines (`< 0.05 nm` vs NIST) and `customLowerN = 4` Brackett lines (`~4052 nm`).

### 2.4 Visualization & Experiment Platform (`visualization.test.ts`, `lifecycle.test.ts`, `stabilization.test.ts`, `laboratory.spec.ts`)
- Verified 2D slice symmetries (XY nodal plane for $2p_z$, XZ/YZ equality for complex $m=+1$), 6-tetrahedra 3D isosurfaces, CODATA-2018 internal self-consistency, nuclear vs neutral mass separation, cancellation, replay (`loaded-from-store`) vs recompute (`computed`), and malformed JSON bundle rejection.
