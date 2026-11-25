---
title: Atoms Quantum Lab
emoji: ⚛️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 3000
pinned: false
license: apache-2.0
short_description: Browser-based 3D quantum atomic orbital & Hartree-Fock lab
---


# ATOMS v0.7.2 — Post-Hartree–Fock Electron Correlation, LS-Coupled CI & Multi-Electron Laboratory

**ATOMS (`v0.7.2`)** extends the live **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`** computational atomic laboratory with **Post-Hartree–Fock Electron Correlation** (`RMP2`, `UMP2`, `ROMP2`, `RCISD`, `UCISD`, and bounded Direct `FCI` / `CASCI`), while preserving 100% of `v0.5.0`, `v0.6.1`, `v0.7.0`, and `v0.7.1` (`LS`-Coupled CI) solvers, datasets, and experiment workflows.

> **Workspace & Git Note:** The current container workspace operates without a `.git` repository directory; historical `v0.5.0` (`47b84f8`), `v0.6.0` (`e26d46b`), and `v0.6.1` (`bfc0d6a91b2ca5a88ace754bcf85551e5ffa5690`) commits are documented verbatim from prior baseline metadata, while release steps for a workstation Git clone are documented in [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).

---

## Core Workspaces (`ATOMS Lab v0.7.2`)

1. **Workbench** — Interactive 3D WebGL2 Monte Carlo cloud lab (`v0.5`), Schrödinger (NR) / Dirac 4-spinor toggle (`Total |Ψ|²`, `Large P`, `Small Q`), and off-thread **3D Marching Tetrahedra isosurfaces** supporting both hydrogenic orbitals and live PySCF volumetric MO / density fields.
2. **Atomic Systems** — Build neutral atoms, cations, or anions ($Z = 1..118, N \ge 0, q = Z-N$), pick isotopes with separated bare nuclear mass $M_{\text{nuc}}$ vs neutral atomic mass, select nuclear models, and inspect live `PhysicsProviderRegistry` compatibility.
3. **Quantum States** — Edit NR $(n,l,m_l,m_s)$ and Dirac $(n,\kappa,j,m_j)$ states with real-time spinor norm/fraction decomposition and `RadialPlot`.
4. **Energy Structure** — Compare Schrödinger $E_n$, Sommerfeld–Dirac $E_{n\kappa}$ fine structure, NIST 1st ionization energies, and reference total HF energies.
5. **Transitions** — Evaluate NR and Dirac length-gauge E1 selection rules, radial/Wigner matrix elements, polarization channels, oscillator strengths $f_{if}$, and Einstein $A_{fi}$ coefficients.
6. **Spectroscopy** — Generate discrete vacuum `Lyman`, `Balmer`, `Paschen`, or custom spectra from calculated E1 rates and compare directly against NIST $^1\text{H}$ vacuum centroids (zero empirical broadening).
7. **Hartree–Fock (`v0.7.0`)** — Configure neutral or ionic multi-electron atoms (`Z`, `N`, spin excess `2S`), `Curated NIST Ground` / `Aufbau + Hund` / `User Custom` subshell occupations, cleanly separated methods (`RHF (det)`, `UHF (det)`, `ROHF (det)`, `AtomSphAvg (ensemble)`), pinned BSE bases (`STO-3G`..`aug-cc-pVTZ`, `def2-*`), SCF controls, 110-pt Lebedev radial density & angular isotropy checks, and 3D Marching Tetrahedra / 2D slices.
8. **Atomic Terms & CI (`v0.7.1`)** — Parse electronic configurations (with `[He]`/`[Ne]`/`[Ar]` shorthands), enumerate all Russell–Saunders $^{2S+1}L^\pi$ terms with exact Racah seniority $v$ & multi-shell Clebsch–Gordan parentages, select $(L, S, \Pi)$ blocks and active spaces (`Single Config`, `Valence CAS`, `Valence + Virtuals`, `Custom`), and solve **Fixed-Orbital LS-Coupled CI** (`Orbital optimization / MCHF NOT performed` explicitly disclosed). Cross-checks lowest eigenvalues to `< 1e-12 Ha` against `pyscf.fci.direct_spin1` and compares splittings against NIST ASD $(2J+1)$-weighted centroids and `ATSP2K` published MCHF literature values.
9. **Electron Correlation (`v0.7.2` New)** — Configure $Z=1..54$ systems with single-determinant references (`RHF`, `UHF`, `ROHF`; `AtomSphAverageRHF` strictly disabled), select `RMP2`/`UMP2`/`ROMP2`, `RCISD`/`UCISD` (`ROHF+CISD` explicitly blocked), or bounded `FCI`/`CASCI` (`none` vs `noble-core`, multi-root `fix_spin_`), inspect live preflight determinant/amplitude resource ceilings, run **PySCF 2.15.1** calculations, and compare methods side-by-side on matched `(Z, N, 2S, basis, frozenCore)` keys.
10. **Analysis** — Inspect 2D XY/XZ/YZ heatmaps (`Slice2DCanvas`) including live PySCF HF 2D slices, radial distributions, analytic $\langle r^k \rangle$ / Dirac spinor moments, and the `118`-element provenance matrix.
11. **Experiment History** — IndexedDB (`atoms_laboratory_db`) execution ledger supporting cancellation, replay (`loaded-from-store`) vs fresh recomputation (`computed`), optional Firebase cloud sync & bookmarks, and schema-validated JSON import/export (`atoms-experiment-bundle`).

---

## Execution Modes & Setup Commands

- **Full Local Scientific Mode (`npm run dev` / `npm start`)**: Express 5 binds to **`127.0.0.1:3000` by default** (override via `--host` / `ATOMS_HOST` for managed containers), validates Host/Origin on `/api/hf/*`, `/api/ls/*`, and `/api/correlation/*` (`403` on cross-origin requests), and invokes `.venv/bin/python` (or `ATOMS_PYTHON`) on `science/hf_backend.py`, `science/ls_ci_backend.py`, and `science/correlation_backend.py`.
- **Static / Viewer Mode (`vite preview` / static `dist/index.html`)**: Preserves 1-electron analytical solvers, client-side LS term enumeration, and bundled datasets; `/api/hf/capabilities`, `/api/ls/capabilities`, and `/api/correlation/capabilities` return non-JSON, so live PySCF engines report `Offline / Unavailable` and disable execution cleanly.

```bash
# Python scientific backend setup (PySCF 2.15.1 + libcint + BSE 0.12 + NumPy + SciPy + h5py)
bash scripts/setup_python_backend.sh

npm run dev             # Express 5 + Vite middleware + PySCF HF/LS-CI APIs on http://127.0.0.1:3000
npm run data:build      # SHA-256 verification + NIST/Lobato JSON generation
npm run data:matrix     # Regenerate docs/ACCURACY_MATRIX.md (118 elements)
npm run typecheck       # tsc --noEmit -p tsconfig.json
npm run lint            # TypeScript syntax/type validation
npm run test:native     # C++17 Debug + Release core tests (340 checks each)
npm test                # Vitest suite (incl. live PySCF HF, LS-CI & C++ parity)
npm run build           # Vite production single-file bundle + inline Web Workers
npm start               # Production Express server serving dist/ + /api/hf/* & /api/ls/* on http://127.0.0.1:3000
npm run test:browser    # Playwright full-stack Chromium + WebGL2 + PySCF tests
```

---

## Documentation Index (`docs/`)

- **Post-Hartree–Fock Electron Correlation (`v0.7.2`)**: [`ELECTRON_CORRELATION_METHODS.md`](docs/ELECTRON_CORRELATION_METHODS.md), [`ELECTRON_CORRELATION_VALIDATION.md`](docs/ELECTRON_CORRELATION_VALIDATION.md), [`ELECTRON_CORRELATION_USER_GUIDE.md`](docs/ELECTRON_CORRELATION_USER_GUIDE.md)
- **Atomic Term Structure & LS-Coupled CI (`v0.7.1`)**: [`ATOMIC_LS_SOLVER_AUDIT.md`](docs/ATOMIC_LS_SOLVER_AUDIT.md), [`ATOMIC_TERM_STRUCTURE.md`](docs/ATOMIC_TERM_STRUCTURE.md), [`CSF_GENERATION_AND_ANGULAR_MOMENTUM.md`](docs/CSF_GENERATION_AND_ANGULAR_MOMENTUM.md), [`LS_COUPLED_CI.md`](docs/LS_COUPLED_CI.md), [`MCHF_AND_ORBITAL_OPTIMIZATION.md`](docs/MCHF_AND_ORBITAL_OPTIMIZATION.md), [`ATOMIC_TERM_VALIDATION.md`](docs/ATOMIC_TERM_VALIDATION.md)
- **Multi-Electron Hartree–Fock (`v0.7.0`)**: [`SOLVER_ECOSYSTEM_AUDIT.md`](docs/SOLVER_ECOSYSTEM_AUDIT.md), [`MULTI_ELECTRON_HARTREE_FOCK.md`](docs/MULTI_ELECTRON_HARTREE_FOCK.md), [`BASIS_SETS.md`](docs/BASIS_SETS.md), [`SCF_CONVERGENCE.md`](docs/SCF_CONVERGENCE.md), [`ORBITALS_AND_DENSITY.md`](docs/ORBITALS_AND_DENSITY.md), [`MULTI_ELECTRON_VALIDATION.md`](docs/MULTI_ELECTRON_VALIDATION.md)
- **Architecture & Guides**: [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`API_REFERENCE.md`](docs/API_REFERENCE.md), [`USER_GUIDE.md`](docs/USER_GUIDE.md), [`DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)
- **One-Electron & Scientific Models**: [`PHYSICS_MODELS.md`](docs/PHYSICS_MODELS.md), [`QUANTUM_STATES.md`](docs/QUANTUM_STATES.md), [`SCHRODINGER_ENGINE.md`](docs/SCHRODINGER_ENGINE.md), [`DIRAC_ENGINE.md`](docs/DIRAC_ENGINE.md), [`TRANSITIONS.md`](docs/TRANSITIONS.md), [`SPECTROSCOPY.md`](docs/SPECTROSCOPY.md), [`MODELS.md`](docs/MODELS.md), [`SCIENTIFIC_SCOPE.md`](docs/SCIENTIFIC_SCOPE.md)
- **Constants & Data**: [`UNITS_AND_CONSTANTS.md`](docs/UNITS_AND_CONSTANTS.md), [`DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md), [`DATA.md`](docs/DATA.md), [`ACCURACY_MATRIX.md`](docs/ACCURACY_MATRIX.md)
- **Verification & Releases**: [`VALIDATION.md`](docs/VALIDATION.md), [`VERIFICATION.md`](docs/VERIFICATION.md), [`BENCHMARK.md`](docs/BENCHMARK.md), [`AUDIT.md`](docs/AUDIT.md), [`CHANGELOG.md`](docs/CHANGELOG.md), [`RELEASE_NOTES.md`](docs/RELEASE_NOTES.md)
