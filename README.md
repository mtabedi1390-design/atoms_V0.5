# ATOMS v0.5.0 — Atomic Science Laboratory

**ATOMS** (`v0.5.0`) is a browser-based computational atomic-physics workstation for all **118 elements** (`Z = 1..118`), combining an exact non-relativistic hydrogenic solver (paired with a header-only C++17 reference core), all-electron relativistic Dirac–Fock spherical total electron densities for every element `Z = 1..118`, bundled non-relativistic PySCF Hartree–Fock benchmark datasets (`H, He, C, N, O, Ne`), qualitative Slater-screened subshell shapes, pinned NIST Atomic Spectra Database (ASD) snapshots, Web-Worker Monte Carlo inverse-CDF sampling, and a Three.js/WebGL2 point renderer.

> **Workspace & Repository Note:** This AI Studio workspace contains the imported working copy of `mtabedi1390-design/atoms` without a `.git` directory or GitHub credentials. All code, data snapshots, scripts, tests, and documentation were executed and verified in this workspace copy; Git branch creation (`openhands/v0.5.0-atomic-visualization`), commit, and push commands are documented in the release delivery instructions rather than executed against GitHub remotely.

---

## Scientific Coverage at a Glance (`v0.5.0`)

| Layer / Model | Element Scope | Physical Quantities | Evidence Class | Key Limitations |
|---|---|---|---|---|
| **Lobato et al. (2026) Dirac–Fock** (`lobato2026-df`, Apache-2.0) | `Z = 1..118` neutral atoms | Total spherically averaged density $\rho(r)$, $4\pi r^2\rho(r)$, $\langle r \rangle$, $\int \rho\,dV = Z$ | `computed-and-validated` | Finite-nucleus B-spline Dirac–Fock (`atomx`) parameterized by adaptive Dirac–Padé (`Z = 1` exact Dirac 1s). Provides **total spherical density only** — no individual subshell $R_{nl}(r)$ orbitals, orbital $\varepsilon_i$, or wavefunction phase; open-shell atoms use spherical occupation averages. |
| **PySCF RHF/ROHF** (`pyscf-hf`, Apache-2.0) | `H, He, C, N, O, Ne` (`Z ∈ {1,2,6,7,8,10}`) | Total spherically averaged $\rho(r)$, total HF electronic energy $E_{\text{HF}}$ | `computed-basis-limited` | `aug-cc-pVTZ`, point nucleus, non-relativistic, no electron correlation ($\Delta E = 0.00018\text{–}0.01383\text{ Ha}$ vs numerical HF limits). |
| **Model A — Exact Hydrogenic** (`hydrogenic-exact`, TS + C++17) | `H` and one-electron ions `X^(Z-1)+` (`Z = 1..118`) | Exact $\psi_{nlm}(r,\theta,\phi)$, $R_{nl}$, $Y_l^m$/tesseral, $E_n$, $\langle r\rangle$, nodes, probability current $\mathbf{j}$ | `analytic-exact-within-stated-Hamiltonian` | One-electron non-relativistic Schrödinger point-nucleus Hamiltonian only; **not** neutral multi-electron atoms for $Z > 1$. |
| **Model B — Slater-Screened** (`slater-screened-hydrogenic` / `browser-slater`) | `Z = 2..118` | Qualitative subshell shapes, $Z_{\text{eff}} = Z - S$, independent-electron configuration average | `qualitative-approximation` | Empirical screening rules (Slater 1930; $n^* \ge 7$ extrapolated); non-relativistic, uncorrelated, not SCF orbitals or eigenvalues. |
| **NIST ASD Snapshot** (`asd_ground_levels.json`) | `Z = 1..108` (`109..118` null) | Neutral configurations, ground terms & $J$, 1st ionization energies + uncertainties | `evaluated` (`Z ≤ 103`), `predicted` (`Z = 104..108`), `unavailable` (`Z = 109..118`) | Strictly reflects pinned NIST ASD IE table; missing `Z = 109..118` entries remain `null` and flagged `unavailable`. |
| **Datatoms 2026 MCDF** (`datatoms-2026-mcdf`, CC BY 4.0) | Registered scope-limited (`1 ≤ N ≤ 10`) | — (blocked for neutral `Z > 10`) | `unavailable` (neutral `Z > 10`) | Verified upstream scope is H-like through Ne-like ions (`1 ≤ N ≤ 10`) only; registered visibly as unavailable rather than misapplied. |
| **GRASP2018 MCDHF/RCI** (`grasp-mcdhf`) | Registered unavailable | Spin–orbit $R_{nlj}(r)$, fine structure | `unavailable` | GRASP2018 not installed in runtime environment; concrete blocker shown in Inspector. |

See [`docs/SCIENTIFIC_SCOPE.md`](docs/SCIENTIFIC_SCOPE.md), [`docs/MODELS.md`](docs/MODELS.md), [`docs/DATA.md`](docs/DATA.md), and the generated 118-element [`docs/ACCURACY_MATRIX.md`](docs/ACCURACY_MATRIX.md).

---

## Core Architecture

- **Physics & Math (`src/physics/`, `native/quantum_core.hpp`)**: Analytic radial and angular hydrogenic functions (log-$\Gamma$ stabilized up to high $n,l$), real tesseral and complex spherical harmonics with Condon–Shortley phase, azimuthal probability current $\mathbf{j}$, Slater screening, radial tail control ($\le 10^{-8}$), and closed-form relativistic Dirac–Padé $\rho(r)$ evaluator (`src/physics/diracFock.ts`).
- **Pinned Data Pipeline (`data/sources/`, `science/build_atomic_data.py`, `src/data/`)**: SHA-256 verified upstream snapshots from NIST ASD and Lobato et al. (2026) (`arXiv:2608.14934`) compiled into normalized JSON tables with strict schema, positivity, and charge-conservation checks (`max relative charge error: 1.991e-07` across `Z = 1..118`).
- **Observable-Dependent Provider Registry (`src/science/providers.ts`, `src/science/coverageMatrix.ts`)**: Deterministic selection across `lobato2026-df`, `pyscf-hf`, `browser-slater`, `datatoms-2026-mcdf`, and `grasp-mcdhf`, plus a machine-readable 118-element coverage matrix.
- **Sampling & WebGL2 Rendering (`src/sampling/`, `src/render/`)**: Seeded `xoshiro128**` Web Worker with parameter-keyed CDF caching, linear-interpolated inverse-CDF radial sampling (`single`, `subshell-average`, `tabulated-hf`, `tabulated-df`), shared cross-shell brightness normalization, and `THREE.Points` GLSL rendering with XY/XZ/YZ slicing and WebGL2 fallback.

---

## Commands

```bash
npm ci                  # clean dependency install from package-lock.json / manifest
npm run data:build      # verify SHA-256 snapshots & regenerate src/data/{nist,df} JSONs
npm run data:matrix     # regenerate docs/ACCURACY_MATRIX.md (118 elements x observables)
npm run typecheck       # strict TypeScript check (tsc --noEmit)
npm run lint            # TypeScript lint check
npm test                # Vitest suite (72 tests across 6 files, incl. C++ parity)
npm run test:native     # Debug + Release C++17 builds (CMake/CTest or g++ fallback, 340 checks each)
npm run build           # Vite single-file production bundle (dist/index.html)
npm run test:browser    # Playwright browser suite (13 scenarios, SwiftShader in headless CI)
npm run bench           # writes docs/BENCHMARK.md (SwiftShader software baseline by default)
npm run data:hf         # regenerate PySCF aug-cc-pVTZ HF datasets (requires pyscf)
```

---

## Documentation Index

- [`CHANGELOG.md`](CHANGELOG.md) — Release notes for `v0.5.0`.
- [`docs/SCIENTIFIC_SCOPE.md`](docs/SCIENTIFIC_SCOPE.md) — Strict atomic-structure scope, model boundaries, and intentional exclusions.
- [`docs/MODELS.md`](docs/MODELS.md) — Mathematical definitions, Hamiltonians, open-shell conventions, and provider selection rules.
- [`docs/DATA.md`](docs/DATA.md) — Pinned source snapshots, SHA-256 manifest, data pipeline, and provenance rules.
- [`docs/ACCURACY_MATRIX.md`](docs/ACCURACY_MATRIX.md) — Machine-generated 118-element $\times$ observable $\times$ method matrix.
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — Navigating single-orbital vs full-atom views, density sources, radial/level plots, and URL parameters.
- [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) — Codebase layout, C++ parity workflow, extending providers, and testing instructions.
- [`docs/AUDIT.md`](docs/AUDIT.md) — Upstream `kavan010/Atoms` defect log and `v0.5.0` rendering/UI fixes.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — Executed commands, test outputs, native/browser environments, and known blockers.
- [`docs/BENCHMARK.md`](docs/BENCHMARK.md) — Reproducible renderer benchmark results and SwiftShader software-rasterisation caveats.

---

## License & Redistribution

- **Upstream math attribution**: `kavan010/Atoms` carries no upstream `LICENSE` file; no upstream viewer sources, `mesh.json`, or binaries are redistributed. Numerical recurrences were independently re-implemented, audited, and cross-checked (`native/quantum_core.hpp` ↔ `src/physics/*.ts`).
- **External datasets**:
  - Lobato et al. (2026) Dirac–Padé parameters & positivity certificate: **Apache-2.0** (`github.com/NeuralSoftX/scattering_factors_2026`).
  - PySCF exported datasets (`src/data/hf/*.json`): generated by **PySCF 2.15.1** (**Apache-2.0**).
  - NIST Atomic Spectra Database ground levels & ionization energies: public reference tables (`physics.nist.gov`).
  - Standard atomic weights: IUPAC/CIAAW 2021 abridged tables.
  - Covalent radii: Cordero et al., *Dalton Trans.* 2008, 2832.
