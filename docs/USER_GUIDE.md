# ATOMS v0.7.1 — User Guide

**ATOMS Laboratory (`v0.7.1`)** integrates **10 synchronized workspaces** inside one client-local scientific application, combining exact 1-electron analytical solvers (`v0.6.1`), live multi-electron Hartree–Fock (`v0.7.0`), and Russell–Saunders Atomic Term Structure & Fixed-Orbital $LS$-Coupled CI (`v0.7.1`).

---

## 1. Execution Modes (`Full Local Scientific Mode` vs. `Static / Viewer Mode`)

- **Full Local Scientific Mode (`npm run dev` or `npm start`)**: Starts the local Express 5 + Python `.venv` server (`127.0.0.1:3000` by default). Enables all live Hartree–Fock (`/api/hf/*`) and Fixed-Orbital $LS$-CI (`/api/ls/*`) calculations.
- **Static / Viewer Mode (`dist/index.html` / `vite preview`)**: Runs client-side 1-electron Schrödinger/Dirac solvers, Russell–Saunders client-side term enumeration, E1 spectroscopy, and bundled datasets; **Hartree–Fock and LS-CI explicitly report `backend offline`** and disable solver execution rather than fabricating results.

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
   - Configure `Z = 1..54`, `N`, spin excess `2S`, occupation mode (`Curated NIST Ground`, `Aufbau + Hund`, `User Custom`), and choose clearly separated methods (`RHF (det)`, `UHF (det)`, `ROHF (det)`, `AtomSphAvg (ensemble)`). Pure single-determinant HF intentionally reports `²ˢ⁺¹L` and `<L²>` unavailable; switch to **Atomic Terms & CI** for multiplet states.
8. **Atomic Terms & CI (`v0.7.1`)**:
   - Choose an atom or ion preset (`He`, `Li ²S/²P°`, `Be`, `B⁺`, `B`, `C`, `N`, `O`, `F`, `Ne`, `Si`, `Ti²⁺`) or enter custom electronic configurations (supports `[He]`/`[Ne]`/`[Ar]` shorthands).
   - Inspect live client-side Russell–Saunders term enumeration ($^{2S+1}L^\pi$, count, unsplit allowed $J$ ranges, Racah seniority $v$ / coupling parentage) and click any term row to select the target $(L, S, \Pi)$ symmetry block.
   - Configure basis (`STO-3G` .. `aug-cc-pVTZ`, `def2-SVP/TZVP`), active space (`Single Configuration`, `Valence CAS`, `Valence + Virtuals`, `Custom Configurations`), excitation truncation (`Full CAS`, `CIS`, `CISD`), number of roots, and PySCF determinant `FCI` oracle cross-check.
   - Review multi-root CI spectra, $\langle L^2 \rangle$ / $\langle S^2 \rangle$ purity badges, configuration/CSF mixing weights, $SO(3)$ orbital shells, and NIST ASD term centroid / `ATSP2K` published MCHF literature tables. Explicit banner clarifies **Fixed-Orbital LS-Coupled CI (MCHF radial optimization NOT performed)**.
9. **Analysis**:
   - Inspect **2D XY / XZ / YZ heatmaps** (`Slice2DCanvas` for 1-e and PySCF HF volumes), radial distributions, $\langle r^k \rangle$ expectations, and the `118`-element `Inspector`.
10. **Experiment History**:
   - Manage locally persisted IndexedDB (`atoms_laboratory_db`) runs across all solvers (including `ls-term-ci`): **Load / Replay** (`loaded-from-store`) vs **Rerun Calculation** (`computed`), cancellation, and schema-validated JSON import/export.

---

## 3. Preserved `v0.5` URL Query Parameters

- `?z=79&mode=atom&source=dirac-fock` — Lobato 2026 Dirac–Fock full-atom view
- `?z=10&mode=atom&source=model&samples=75000&adaptive=0` — Neon Slater subshell view
