# ATOMS v0.6.0 — Phase 0 Repository Audit

**Audit Date:** 2026-11-20  
**Workspace Path:** `/app/applet`  
**Target Release:** `ATOMS v0.6.0` (`development/v0.6.0`)  
**Baseline Release Verified:** `ATOMS v0.5.0` (`package.json` version `0.5.0`)

---

## 1. Repository Identity & Git State

- **Target Upstream Repository:** `https://github.com/mtabedi1390-design/atoms_V0.5`
- **Git Metadata Check:** Running `git status` and `git rev-parse --is-inside-work-tree` returns:
  `fatal: not a git repository (or any of the parent directories): .git`
- **GitHub / Remote Access:** No `.git` directory, branch refs, commit history, or GitHub credentials exist in this Google AI Studio workspace container.
- **Implication for Phase 0–7:** All edits occur solely on the workspace working copy. Every created, modified, and removed file will be tracked explicitly in change manifests, and safe local Git commands will be provided to integrate onto `development/v0.6.0` from the verified `v0.5.0` base without rewriting history or touching `main`.

---

## 2. Environment & Toolchain Inventory

| Tool / Dependency | Status | Version / Details | Notes |
|---|---|---|---|
| Node.js / npm | Installed | `v22.23.2` / `npm 10.9.8` | Runs Vite, TypeScript, Vitest, Playwright, tsx |
| TypeScript | Installed | `5.9.3` | Strict mode (`noUnusedLocals`, `noUnusedParameters`, `resolveJsonModule`) |
| Vite + React + Three | Installed | Vite `7.3.7`, React `19.2.6`, Three `^0.170.0`, Tailwind `4.1.17` | Single-file build via `vite-plugin-singlefile` |
| Vitest | Installed | `^2.1.8` (`v2.1.9` runtime) | Unit, statistical KS, data integrity, and C++ parity tests |
| Playwright | Installed | `@playwright/test ^1.49.1` | Uses pre-installed `/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell` (`HeadlessChrome/155`) with ANGLE/SwiftShader |
| g++ | Installed | `g++ (Debian 12.2.0-14+deb12u1) 12.2.0` | Compiles `native/` C++17 Debug & Release targets via `scripts/test_native.sh` fallback |
| CMake / CTest | **Missing** | — | `scripts/test_native.sh` automatically falls back to direct `g++ -std=c++17` |
| Python 3 | Installed | `Python 3.11.2` (stdlib only) | Runs `science/build_atomic_data.py` cleanly |
| `numpy`, `scipy`, `pyscf`, `requests`, `sympy`, `matplotlib` | **Missing** | — | Cannot re-run `science/hf_export.py` live in this container; bundled `src/data/hf/*.json` preserved intact |
| Hardware GPU / WebGPU | **Missing** | ANGLE SwiftShader CPU rasterisation | Software rendering FPS is not evidence of hardware GPU speed |
| Lockfile note | Present | `/bun.lock` exists alongside npm workspace | Unused by `npm` scripts; left untouched in Phase 0 |

---

## 3. Actual Repository Structure & Dependency Audit

### 3.1 Directory Inventory
- `data/sources/`: Pinned raw scientific snapshots (`nist_asd_ie.tsv`, `lobato2026_adaptive_dirac_pade.txt`, `lobato2026_positivity_certificate.json`) + `MANIFEST.json` (SHA-256 checksums).
- `science/`: `build_atomic_data.py` (pure Python SHA-256 verifier & JSON builder), `hf_export.py` (PySCF offline exporter).
- `native/`: Header-only C++17 reference math (`quantum_core.hpp`), 340-check test suite (`tests/quantum_core_test.cpp`), 1,020-vector reference exporter (`tests/reference_dump.cpp`).
- `scripts/`: `test_native.sh`, `generate_accuracy_matrix.ts`, `benchmark.mjs`.
- `src/data/`: `elements.ts` (118 neutral records), `sources.ts`, `nist/asd_ground_levels.json` (`108` records), `df/lobato2026.json` (`118` records), `hf/{H,He,C,N,O,Ne}.json` (`6` PySCF datasets).
- `src/physics/`: `constants.ts` (CODATA 2018), `special.ts` (lgamma, Laguerre, associated Legendre, sphNorm), `hydrogenic.ts` (Model A wavefunctions, energies, ⟨r⟩, nodes, radial domain control), `models.ts` (Model A/B descriptors & Slater 1930 screening), `density.ts` (Unsöld spherical subshell densities), `current.ts` (analytic & numeric probability current), `diracFock.ts` (Lobato 2026 Dirac–Padé evaluator + quadrature grid).
- `src/science/`: `providers.ts` (5 registered providers + `selectProvider`), `coverageMatrix.ts` (118-element $\times$ observable matrix).
- `src/sampling/`: `sampler.ts` (`xoshiro128**`, CDF builder, `SamplerCache`, `sampleOrbital`), `protocol.ts`, `sampler.worker.ts`, `client.ts` (slot cancellation & stale-result rejection).
- `src/render/`: `OrbitalScene.ts` (`THREE.Points` layers, GLSL uniforms, slice plane, axes, nucleus, probability-current line segments, WebGL2 guard), `shaders.ts` (`POINT_VERT`, `POINT_FRAG`).
- `src/state/`: `appState.ts` (`AppState`, URL query parser, reducer, valence subshell selector).
- `src/components/`: `ControlRail.tsx`, `PeriodicTable.tsx`, `TelemetryBar.tsx`, `RadialPlot.tsx`, `EnergyDiagram.tsx`, `Inspector.tsx`, `ui.tsx`, plus root `src/App.tsx`.
- `tests/browser/`: `core.spec.ts` (5), `responsive.spec.ts` (1), `science.spec.ts` (7).
- `docs/`: `ACCURACY_MATRIX.md`, `AUDIT.md`, `BENCHMARK.md`, `DATA.md`, `DEVELOPER_GUIDE.md`, `MODELS.md`, `SCIENTIFIC_SCOPE.md`, `USER_GUIDE.md`, `VERIFICATION.md`.

### 3.2 Module Dependency Graph Findings
- **Zero circular dependencies** across `src/`.
- `src/physics/*`, `src/sampling/*`, and `src/science/*` have **zero runtime dependency on React, DOM, or Three.js**. (Note: `src/physics/models.ts` imports type-only `ElementRecord`/`Subshell` from `@/data/elements`; `src/state/appState.ts` imports type-only `RenderSettings` from `@/render/OrbitalScene`.)
- **Coupling to resolve in v0.6:** `TelemetryBar.tsx`, `RadialPlot.tsx`, `EnergyDiagram.tsx`, and `ControlRail.tsx` currently invoke physics functions (`hydrogenicEnergy_eV`, `meanRadiusAnalytic`, `radialPDF`, `radialNodes`, `slaterZeff`) directly during React render rather than receiving normalized experiment/provider results from an experiment runner.

---

## 4. Existing Scientific Capabilities Preserved from v0.5.0

All existing capabilities listed below are verified working and **must remain intact** throughout v0.6.0:
1. **Model A (`hydrogenic-exact`)**: Exact non-relativistic 1-electron wavefunctions $\psi_{nlm}$ (real tesseral & complex $Y_l^m$, Condon–Shortley phase, $z$-polar), radial/angular nodes, $\langle r\rangle$, $\langle r^2\rangle$, adaptive radial tail control ($\le 10^{-8}$), probability current $\mathbf{j}$, and 1,020-vector C++17 parity.
2. **Model B (`slater-screened-hydrogenic` / `browser-slater`)**: Slater (1930) $Z_{\text{eff}} = Z - S$, independent-electron Unsöld configuration-average full-atom rendering with per-subshell visibility/opacity sliders.
3. **Lobato et al. (2026) Dirac–Fock (`lobato2026-df`)**: All-electron 4-component Dirac–Fock (`atomx`, finite nucleus) total spherical density $\rho(r)$ for `Z = 1..118`, integrating to $Z$ within `1.991e-07` relative error.
4. **PySCF HF (`pyscf-hf`)**: Bundled `aug-cc-pVTZ` RHF/ROHF total densities and electronic energies for `H, He, C, N, O, Ne` with variational HF limit comparison.
5. **118-Element Provenanced Database & Blocker Transparency**: Pinned NIST ASD configurations/terms/$J$/1st IEs (`Z = 1..108`), `predicted` flags (`Z = 104..108`), `unavailable` nulls (`Z = 109..118`), CIAAW 2021 masses, Cordero 2008 covalent radii, and explicit blockers for `datatoms-2026-mcdf` (`1 <= N <= 10`) and `grasp-mcdhf` (`GRASP2018` absent).
6. **Web-Worker Inverse-CDF Sampling & WebGL2 Renderer**: Reproducible `xoshiro128**` sampling, slot cancellation, KS-validated CDF tables, shared cross-shell brightness, XY/XZ/YZ slicing, and WebGL2 fallback UI.

---

## 5. Gap Analysis: v0.5.0 vs ATOMS v0.6.0 Specification

| Area | Current v0.5.0 State | Target v0.6.0 Requirement | Gap |
|---|---|---|---|
| **Atomic System Domain** | Neutral-atom `ElementRecord` (`Z = 1..118`, `Z = N`, `q = 0`) + implicit `X^(Z-1)+` label in Model A | Explicit `AtomicSystem` supporting neutral atoms, positive ions, **negative ions** ($N > Z$, $q = Z - N$), isotopes, nuclear mass, and nuclear charge model | Missing `domain/atomic/` model; current `elementByZ` assumes $N = Z$ |
| **Quantum State Domain** | Flat `{ n, l, m }` + `AngularBasis` (`"real" \| "complex"`) | Strictly separated `NonRelativisticState` (`n, l, m_l, m_s`), `RelativisticState` (`n, kappa, j, m_j`), spinor superpositions, initial/final transition pairs | Missing `m_s`, missing relativistic `(n, kappa, j, m_j)` & $\kappa \leftrightarrow (l, j)$ mapping |
| **Physics Provider Contract** | Synchronous `EngineProvider` keyed by `{ Z, observable, accuracy }` | Async typed `PhysicsProvider<TSystem, TState, TInput, TResult>` with capability matrix, `supports(sys, state)`, `validate`, `calculate(input, ctx)` with cancellation & progress | Need general v0.6 contract & registry bridging v0.5 providers |
| **Schrödinger–Coulomb Provider** | Scattered across `hydrogenic.ts` + UI components | Unified analytical hydrogen-like provider with consistent reduced-mass scaling $\mu/m_e$, observables, and E1 transition capability | Reduced mass helper exists in `constants.ts` (`reducedMassRatio`) but is never wired into UI/sampler (`a = 1` hardcoded); no E1 matrix elements |
| **Dirac–Coulomb Provider** | None (only tabulated total neutral density `lobato2026-df`) | Full 1-electron relativistic Dirac–Coulomb solver: analytical energies $E_{n\kappa}$, large/small spinor components $P_{n\kappa}(r), Q_{n\kappa}(r)$, spin-angular $\Omega_{\kappa m}$, normalization $\int(|P|^2+|Q|^2)dr=1$, fine-structure splitting, domain enforcement | Entire Dirac–Coulomb spinor engine & spin-angular algebra missing |
| **Experiment Platform** | Ephemeral `useReducer` (`appState.ts`) + single sampling worker | UI-independent `ExperimentRegistry`, `ExperimentSchema`, `ExperimentValidator`, `ExperimentRunner`, `ExperimentScheduler`, `ExperimentStore` (IndexedDB), `ExperimentSerializer` (versioned JSON), `ResultRegistry` | No experiment lifecycle states, no persistence, no JSON export/re-run |
| **E1 Transitions & Spectroscopy** | Explicitly excluded in v0.5 | Nonrelativistic E1 & Relativistic E1 dipole matrix elements, selection rules, radial/angular/polarization decomposition, oscillator strengths, Einstein $A$, emission/absorption/Lyman/Balmer/Paschen/custom spectra + NIST comparison | Entire transition & spectroscopy layer missing |
| **Visualization** | `THREE.Points` density/phase clouds, slice slab, current segments | Add 3D probability-density **isosurfaces**, Dirac large ($P$) / small ($Q$) / total spinor ($|P|^2+|Q|^2$) views, node inspection, while keeping `THREE.Points` and non-blocking workers | No marching-cubes isosurface mesh generator; no Dirac spinor component buffers |
| **Units & Constants** | `constants.ts` has `CODATA_2018` numbers (`a0_pm`, `rydberg_eV`, etc.); conversions ad-hoc | Typed unit system (`Hartree`, `eV`, `a0`, `m`, `Å`, `nm`, `s`, `Hz`, `C`, `u`), pinned constants version in every experiment, explicit error/uncertainty separation | Missing centralized conversion module (`nm` / `Hz` / `Hartree` / `C`) |
| **UI Workspaces** | Single 3-column workstation (`ControlRail`, `Canvas`, `Radial/Levels/Inspector`) | **ATOMS Laboratory** with 8 integrated views: Workbench, Atomic Systems, Quantum States, Energy Structure, Transitions, Spectroscopy, Analysis, Experiment History | Need tabbed/workspace navigation preserving v0.5 Workbench ergonomics |

---

## 6. Identified Scientific & Numerical Risks

1. **Dirac–Coulomb Domain & Singularity Boundaries:** Point-Coulomb Dirac solutions require $(Z\alpha)^2 < \kappa^2$ (breaking down at $Z \ge 137$ for $|\kappa|=1$, and demanding careful $\gamma = \sqrt{\kappa^2 - (Z\alpha)^2}$ precision near $r \to 0$ where $P, Q \propto r^\gamma$). Invalid $(Z, \kappa)$ pairs and unimplemented finite-nucleus Dirac requests must be rejected explicitly—never silently fallen back to point nucleus or Schrödinger.
2. **Dirac Spinor Large/Small Normalization & Hypergeometric Stability:** Evaluating $P_{n\kappa}(r), Q_{n\kappa}(r)$ via confluent hypergeometric / generalized Laguerre polynomials $L_{n_r}^{(2\gamma)}(\rho)$ avoids shooting-method root-finding failures and satisfies analytical normalization $\int_0^\infty (|P|^2+|Q|^2)\,dr = 1$ exactly in exact arithmetic, but suffers catastrophic cancellation at large $n_r$ or tiny $Z\alpha$ unless log-$\Gamma$ normalization and stable nonrelativistic limit $\alpha \to 0$ (`Q = O(alpha)`) are verified numerically.
3. **Conflation Between 1-Electron Dirac and Many-Electron Dirac–Fock:** Users must never mistake `dirac-coulomb` (one-electron hydrogenic spinor) for `lobato2026-df` (neutral 1–118 relativistic many-electron total density) or `grasp-mcdhf` (unavailable multi-electron orbitals).
4. **Negative Ions & Unbound Configurations:** Allowing $q = Z - N < 0$ in `AtomicSystem` means users can define `H^-`, `He^-`, `O^-`, etc. One-electron Schrödinger/Dirac providers only bind $N = 1$ (`supports` must reject $N \neq 1$), and even future multi-electron approximations must never falsely claim bound solutions for negative ions.
5. **High-$n$ E1 Radial Matrix Elements:** Gordon's formula or high-order numerical quadrature for $\langle n' l' | r | n l \rangle$ can suffer floating-point cancellation for large $n, n'$. Using generalized Gauss–Laguerre / adaptive composite Gauss–Legendre with tail-mass verification plus Gordon closed-form cross-checks for NR E1 will guarantee accuracy.
6. **Isosurface & Spectrum Performance under SwiftShader:** Generating 3D scalar grids and marching-cubes meshes on the main thread would freeze the UI; voxel evaluation and triangle extraction **must** execute inside Web Workers with cancellation tokens and triangle budget limits.
7. **Relativistic E1 Angular Algebra & Degeneracy Conventions:** Einstein $A_{fi}$, oscillator strength $f_{if}$, and Dirac 3-$j$/6-$j$ angular coefficients have well-known factor-of-2 / degeneracy ($g_i = 2j_i+1$ vs $m_j$-resolved) conventions. Every convention must be pinned to standard NIST / Grant / Sobelman definitions and verified against NIST Hydrogen / He+ line wavelengths and transition rates.
