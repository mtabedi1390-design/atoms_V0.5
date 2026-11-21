# ATOMS v0.6.1 — General Atomic Quantum Laboratory (Scientific Stabilization)

**ATOMS (`v0.6.1`)** is a stabilized, scientifically verified browser-local computational atomic-physics laboratory combining analytical nonrelativistic Schrödinger–Coulomb and relativistic 4-component Dirac–Coulomb solvers, ab initio E1 transition rates and vacuum spectroscopy, off-thread Web-Worker experiment orchestration with IndexedDB persistence, 3D Marching Tetrahedra isosurfaces and WebGL2 point clouds, and audited `v0.5` 118-element relativistic Dirac–Fock & PySCF HF density datasets.

> **Git & Branching Note:** `v0.5.0` (`47b84f8`, branch `release/v0.5.0`) and `v0.6.0` (`e26d46b`, branch `development/v0.6.0`) remain immutable. `v0.6.1` stabilization work is maintained on branch `development/v0.6.1` (tagged `v0.6.1`) with documented Git release steps in [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md).

---

## Core Workspaces (`ATOMS Lab v0.6`)

1. **Workbench** — Preserves the interactive 3D WebGL2 Monte Carlo cloud lab (`v0.5`) and adds a live **Schrödinger (NR) / Dirac 4-spinor** engine switch (`Total |Ψ|²`, `Large P`, `Small Q`) plus off-thread **3D Marching Tetrahedra isosurfaces**.
2. **Atomic Systems** — Build neutral atoms, cations, or anions ($Z = 1..118, N \ge 0, q = Z-N$), pick isotopes with separated bare nuclear mass $M_{\text{nuc}}$ vs neutral atomic mass, select nuclear models, and inspect live `PhysicsProviderRegistry` compatibility.
3. **Quantum States** — Edit NR $(n,l,m_l,m_s)$ and Dirac $(n,\kappa,j,m_j)$ states with real-time spinor norm/fraction decomposition and `RadialPlot`.
4. **Energy Structure** — Compare Schrödinger $E_n$, Sommerfeld–Dirac $E_{n\kappa}$ fine structure, NIST 1st ionization energies, and PySCF total HF energies.
5. **Transitions** — Evaluate NR and Dirac length-gauge E1 selection rules, radial/Wigner matrix elements, polarization channels, oscillator strengths $f_{if}$, and Einstein $A_{fi}$ coefficients.
6. **Spectroscopy** — Generate discrete vacuum `Lyman`, `Balmer`, `Paschen`, or custom spectra from calculated E1 rates and compare directly against NIST $^1\text{H}$ vacuum centroids (explicitly zero-broadening).
7. **Analysis** — Inspect 2D XY/XZ/YZ heatmaps (`Slice2DCanvas`), radial $P(r)$ / $P,Q$ / $4\pi r^2\rho(r)$ distributions, analytic $\langle r^k \rangle$ moments, and the `v0.5` 118-element provenance matrix.
8. **Experiment History** — IndexedDB (`atoms_laboratory_db`) execution ledger supporting cancellation, replay (`loaded-from-store`) vs fresh recomputation (`computed`), and schema-validated JSON import/export (`atoms-experiment-bundle`).

---

## Verification Commands

```bash
npm run data:build      # SHA-256 verification + NIST/Lobato JSON generation
npm run data:matrix     # Regenerate docs/ACCURACY_MATRIX.md (118 elements)
npm run typecheck       # tsc --noEmit -p tsconfig.json (0 errors)
npm run test:native     # C++17 Debug + Release core tests (340 checks each)
npm test                # Vitest suite (16 files, 126 tests, incl. C++ parity & stabilization)
npm run build           # Vite production bundle + inline Web Workers
npm run test:browser    # Playwright WebGL2 + Laboratory tests (21 tests)
npm run bench           # CPU compute + SwiftShader WebGL2 benchmarks -> docs/BENCHMARK.md
```

---

## Documentation Index (`docs/`)

- **Architecture & Guides**: [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`API_REFERENCE.md`](docs/API_REFERENCE.md), [`USER_GUIDE.md`](docs/USER_GUIDE.md), [`DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)
- **Scientific Models**: [`PHYSICS_MODELS.md`](docs/PHYSICS_MODELS.md), [`QUANTUM_STATES.md`](docs/QUANTUM_STATES.md), [`SCHRODINGER_ENGINE.md`](docs/SCHRODINGER_ENGINE.md), [`DIRAC_ENGINE.md`](docs/DIRAC_ENGINE.md), [`TRANSITIONS.md`](docs/TRANSITIONS.md), [`SPECTROSCOPY.md`](docs/SPECTROSCOPY.md), [`MODELS.md`](docs/MODELS.md), [`SCIENTIFIC_SCOPE.md`](docs/SCIENTIFIC_SCOPE.md)
- **Constants & Data**: [`UNITS_AND_CONSTANTS.md`](docs/UNITS_AND_CONSTANTS.md), [`DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md), [`DATA.md`](docs/DATA.md), [`ACCURACY_MATRIX.md`](docs/ACCURACY_MATRIX.md)
- **Verification & Releases**: [`VALIDATION.md`](docs/VALIDATION.md), [`VERIFICATION.md`](docs/VERIFICATION.md), [`BENCHMARK.md`](docs/BENCHMARK.md), [`AUDIT.md`](docs/AUDIT.md), [`CHANGELOG.md`](docs/CHANGELOG.md), [`RELEASE_NOTES.md`](docs/RELEASE_NOTES.md)
