# ATOMS v0.7.0 — User Guide

**ATOMS Laboratory (`v0.7.0`)** integrates **9 synchronized workspaces** inside one client-local scientific application, combining exact 1-electron analytical solvers (`v0.6.1`) with live multi-electron Hartree–Fock (`PySCF 2.15.1` + `libcint` + `BSE 0.12`).

---

## 1. Execution Modes (`Full Local Scientific Mode` vs. `Static / Viewer Mode`)

- **Full Local Scientific Mode (`npm run dev` or `npm start`)**: Starts the local Express 5 + Python `.venv` server (`127.0.0.1:3000` by default). Enables all live Hartree–Fock calculations, orbital/density tables, and volumetric 3D/2D grids.
- **Static / Viewer Mode (`dist/index.html` / `vite preview`)**: Runs client-side 1-electron Schrödinger/Dirac solvers, E1 spectroscopy, and bundled datasets; **Hartree–Fock explicitly reports `backend offline`** and disables calculation submission rather than fabricating or simulating HF data.

---

## 2. Workspace Navigation (`WorkspaceNav`)

1. **Workbench**:
   - Interactive 3D workstation (`v0.5` Monte Carlo cloud, **Schrödinger (NR)** vs **Dirac 4-spinor** toggle, **3D Isosurface (Marching Tetrahedra)**) plus 3D overlay projection for live PySCF HF orbitals, total density, or spin density.
2. **Atomic Systems**:
   - Configure `Z = 1..118`, electron count `N`, isotopes (bare nuclear mass $m_{\text{nuc}}$ vs neutral atomic mass $m_{\text{atom}}$), nuclear models, and inspect provider compatibility.
3. **Quantum States**:
   - Edit **Nonrelativistic** `(n, l, m_l, m_s, basis)` or **Relativistic Dirac** `(n, κ, j, m_j)` 1-electron eigenstates with `RadialPlot`.
4. **Energy Structure**:
   - Compare Schrödinger $E_n$, Sommerfeld–Dirac $E_{n\kappa}$ fine-structure doublets, NIST 1st ionization energies, and reference total HF limits.
5. **Transitions**:
   - Evaluate NR and Dirac electric-dipole (`E1`) transitions, selection rules (`E1 ALLOWED` / `FORBIDDEN`), $q=-1,0,+1$ channels, oscillator strength $f_{if}$, and Einstein $A_{fi}$.
6. **Spectroscopy**:
   - Synthesize discrete vacuum emission/absorption spectra (`Lyman`, `Balmer`, `Paschen`, `Custom`) against NIST $^1\text{H}$ centroids.
7. **Hartree–Fock (`v0.7.0`)**:
   - Configure `Z = 1..54`, `N`, spin excess `2S`, occupation mode (`Curated NIST Ground`, `Aufbau + Hund`, `User Custom`), and choose clearly separated methods:
     - **RHF (det)** — restricted closed-shell determinant (`2S = 0` strictly),
     - **UHF (det)** — unrestricted $\alpha/\beta$ determinant (reports $\langle S^2 \rangle$ & spin contamination),
     - **ROHF (det)** — spin-pure restricted open-shell determinant (with both effective eigenvalues and Koopmans $\langle F^\alpha \rangle / \langle F^\beta \rangle$),
     - **AtomSphAvg (ensemble)** — spin-unpolarized fractional spherical ensemble (`N >= 2`; $\langle S^2 \rangle$ explicitly unavailable).
   - **Important**: Term-resolved $LS$ multiplets ($^{2S+1}L$), relativistic $J$, and $\langle L^2 \rangle$ are **not implemented in `v0.7.0`** and are explicitly displayed as unavailable rather than fabricated.
   - Inspect `stateCharacter`, 110-pt Lebedev angular isotropy (`spherical` vs `anisotropic det`), orbital energies, `T+V+J+K`, SCF trace, and project genuine 3D volumetric fields into Workbench or 2D slices into Analysis.
8. **Analysis**:
   - Inspect **2D XY / XZ / YZ heatmaps** (`Slice2DCanvas` for 1-e and PySCF HF volumes), radial distributions, $\langle r^k \rangle$ expectations, and the `118`-element `Inspector`.
9. **Experiment History**:
   - Manage locally persisted IndexedDB (`atoms_laboratory_db`) runs: **Load / Replay** (`loaded-from-store`) vs **Rerun Calculation** (`computed`), cancellation, and schema-validated JSON import/export.

---

## 3. Preserved `v0.5` URL Query Parameters

- `?z=79&mode=atom&source=dirac-fock` — Lobato 2026 Dirac–Fock full-atom view
- `?z=10&mode=atom&source=model&samples=75000&adaptive=0` — Neon Slater subshell view
