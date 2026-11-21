# ATOMS v0.7.0 — Multi-Electron Atomic Structure Laboratory

**ATOMS (`v0.7.0`)** evolves the stabilized `v0.6.1` hydrogenic quantum laboratory into a live **multi-electron Hartree–Fock computational laboratory** powered by **PySCF `2.15.1` + `libcint` + Basis Set Exchange `0.12`**, while preserving 100% of `v0.5.0` and `v0.6.1` analytical Schrödinger/Dirac solvers, E1 transitions, spectroscopy, WebGL2 point clouds, and Worker/IndexedDB experiment reproducibility.

> **Workspace & Git Note:** The current container workspace operates without a `.git` repository directory; historical `v0.5.0` (`47b84f8`), `v0.6.0` (`e26d46b`), and `v0.6.1` (`bfc0d6a91b2ca5a88ace754bcf85551e5ffa5690`) commits are documented verbatim from prior baseline metadata, while `v0.7.0` release steps for a workstation Git clone are documented in [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).

---

## Core Workspaces (`ATOMS Lab v0.7`)

1. **Workbench** — Interactive 3D WebGL2 Monte Carlo cloud lab (`v0.5`), Schrödinger (NR) / Dirac 4-spinor toggle (`Total |Ψ|²`, `Large P`, `Small Q`), and off-thread **3D Marching Tetrahedra isosurfaces** supporting both hydrogenic orbitals and live PySCF volumetric MO / density fields.
2. **Atomic Systems** — Build neutral atoms, cations, or anions ($Z = 1..118, N \ge 0, q = Z-N$), pick isotopes with separated bare nuclear mass $M_{\text{nuc}}$ vs neutral atomic mass, select nuclear models, and inspect live `PhysicsProviderRegistry` compatibility.
3. **Quantum States** — Edit NR $(n,l,m_l,m_s)$ and Dirac $(n,\kappa,j,m_j)$ states with real-time spinor norm/fraction decomposition and `RadialPlot`.
4. **Energy Structure** — Compare Schrödinger $E_n$, Sommerfeld–Dirac $E_{n\kappa}$ fine structure, NIST 1st ionization energies, and reference total HF energies.
5. **Transitions** — Evaluate NR and Dirac length-gauge E1 selection rules, radial/Wigner matrix elements, polarization channels, oscillator strengths $f_{if}$, and Einstein $A_{fi}$ coefficients.
6. **Spectroscopy** — Generate discrete vacuum `Lyman`, `Balmer`, `Paschen`, or custom spectra from calculated E1 rates and compare directly against NIST $^1\text{H}$ vacuum centroids (zero empirical broadening).
7. **Hartree–Fock (`v0.7.0` New)** — Configure neutral or ionic multi-electron atoms (`Z`, `N`, spin excess `2S`), `Curated NIST Ground` / `Aufbau + Hund` / `User Custom` subshell occupations, formalism (`RHF`, `UHF`, `ROHF`, `AtomSphAverageRHF`), pinned BSE basis (`STO-3G`, `6-31G`, `cc-pVDZ`, `cc-pVTZ`, `aug-cc-pVTZ`, `def2-SVP`, `def2-TZVP`), SCF controls (`DIIS`, initial guess, damping, level shift, tolerances, stability), and inspect genuine MO orbitals, `<Fα>/<Fβ>`, `T + V + J + K`, `<S²>`, 110-pt Lebedev radial density, SCF history, and 3D Marching Tetrahedra / 2D slices. Reports offline availability honestly if the Express+PySCF backend is inactive.
8. **Analysis** — Inspect 2D XY/XZ/YZ heatmaps (`Slice2DCanvas`) including live PySCF HF 2D slices, radial distributions, analytic $\langle r^k \rangle$ / Dirac spinor moments, and the `118`-element provenance matrix.
9. **Experiment History** — IndexedDB (`atoms_laboratory_db`) execution ledger supporting cancellation, replay (`loaded-from-store`) vs fresh recomputation (`computed`), and schema-validated JSON import/export (`atoms-experiment-bundle`).

---

## Setup & Verification Commands

```bash
# Python scientific backend setup (PySCF 2.15.1 + BSE 0.12 + NumPy + SciPy + h5py)
bash scripts/setup_python_backend.sh   # or use preinstalled /opt/atoms-py

npm run dev             # Express 5 + Vite middleware + PySCF API on http://localhost:3000
npm run data:build      # SHA-256 verification + NIST/Lobato JSON generation
npm run data:matrix     # Regenerate docs/ACCURACY_MATRIX.md (118 elements)
npm run typecheck       # tsc --noEmit -p tsconfig.json
npm run lint            # TypeScript syntax/type validation
npm run test:native     # C++17 Debug + Release core tests (340 checks each)
npm test                # Vitest suite (17 files, 133 tests incl. live PySCF validation)
npm run build           # Vite production single-file bundle + inline Web Workers
npm start               # Production Express server serving dist/ + /api/hf/* on port 3000
npm run test:browser    # Playwright full-stack Chromium + WebGL2 + PySCF tests (23 tests)
```

---

## Documentation Index (`docs/`)

- **Multi-Electron Hartree–Fock (`v0.7.0`)**: [`SOLVER_ECOSYSTEM_AUDIT.md`](docs/SOLVER_ECOSYSTEM_AUDIT.md), [`MULTI_ELECTRON_HARTREE_FOCK.md`](docs/MULTI_ELECTRON_HARTREE_FOCK.md), [`BASIS_SETS.md`](docs/BASIS_SETS.md), [`SCF_CONVERGENCE.md`](docs/SCF_CONVERGENCE.md), [`ORBITALS_AND_DENSITY.md`](docs/ORBITALS_AND_DENSITY.md), [`MULTI_ELECTRON_VALIDATION.md`](docs/MULTI_ELECTRON_VALIDATION.md)
- **Architecture & Guides**: [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`API_REFERENCE.md`](docs/API_REFERENCE.md), [`USER_GUIDE.md`](docs/USER_GUIDE.md), [`DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)
- **One-Electron & Scientific Models**: [`PHYSICS_MODELS.md`](docs/PHYSICS_MODELS.md), [`QUANTUM_STATES.md`](docs/QUANTUM_STATES.md), [`SCHRODINGER_ENGINE.md`](docs/SCHRODINGER_ENGINE.md), [`DIRAC_ENGINE.md`](docs/DIRAC_ENGINE.md), [`TRANSITIONS.md`](docs/TRANSITIONS.md), [`SPECTROSCOPY.md`](docs/SPECTROSCOPY.md), [`MODELS.md`](docs/MODELS.md), [`SCIENTIFIC_SCOPE.md`](docs/SCIENTIFIC_SCOPE.md)
- **Constants & Data**: [`UNITS_AND_CONSTANTS.md`](docs/UNITS_AND_CONSTANTS.md), [`DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md), [`DATA.md`](docs/DATA.md), [`ACCURACY_MATRIX.md`](docs/ACCURACY_MATRIX.md)
- **Verification & Releases**: [`VALIDATION.md`](docs/VALIDATION.md), [`VERIFICATION.md`](docs/VERIFICATION.md), [`BENCHMARK.md`](docs/BENCHMARK.md), [`AUDIT.md`](docs/AUDIT.md), [`CHANGELOG.md`](docs/CHANGELOG.md), [`RELEASE_NOTES.md`](docs/RELEASE_NOTES.md)
