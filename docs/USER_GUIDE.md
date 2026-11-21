# ATOMS v0.6.0 — User Guide

**ATOMS Laboratory (`v0.6.0`)** integrates 8 synchronized workspaces inside one client-local scientific application.

---

## 1. Workspace Navigation (`WorkspaceNav`)

1. **Workbench**:
   - Preserves the classic `v0.5` three-column 3D workstation (periodic table, sampling, rendering, cross-section slices, radial/levels/inspector panels).
   - **New in v0.6.0 (`ControlRail`)**: Toggle **Schrödinger (NR)** vs **Dirac 4-spinor** (for single-orbital one-electron calculations, with `Total |Ψ|²`, `Large P`, and `Small Q` spinor component views), and enable **3D Isosurface (Marching Tetrahedra)** with adjustable isovalue (`5%–75%`), grid resolution (`24³`, `32³`, `40³`), and wireframe mode.
2. **Atomic Systems**:
   - Configure atomic number `Z = 1..118`, electron count `N` (neutral atoms, cations such as $\text{He}^+$, $\text{Fe}^{25+}$, or anions $N > Z$), isotopes (showing distinct bare nuclear mass $m_{\text{nuc}}$ vs neutral atomic mass $m_{\text{atom}}$ and exact reduced-mass ratio $\mu/m_e$), and nuclear charge model (`point-infinite-mass`, `point-finite-mass`, `finite-uniform`, `finite-fermi`).
   - Inspect live provider compatibility (`supported`, `unsupported`, `unavailable`) and launch a reproducible Worker state experiment.
3. **Quantum States**:
   - Edit **Nonrelativistic** `(n, l, m_l, m_s, basis)` or **Relativistic Dirac** `(n, κ, j, m_j)` eigenstates with mathematical constraint enforcement.
   - Inspect analytic binding & total energies, $\gamma = \sqrt{\kappa^2 - (Z\alpha)^2}$, spinor normalization $\int(|P|^2 + |Q|^2)dr$, large/small fraction decomposition, and live `RadialPlot`.
4. **Energy Structure**:
   - Side-by-side comparison of Schrödinger $E_n$, Sommerfeld–Dirac $E_{n\kappa}$ fine-structure doublets ($2p_{1/2}$ vs $2p_{3/2}$), separated NIST 1st ionization energies (`evaluated` / `predicted` / `unavailable`), and PySCF total HF electronic energies where bundled.
5. **Transitions**:
   - Evaluate Nonrelativistic Schrödinger and Relativistic Dirac electric-dipole (`E1`) transitions between initial and final states.
   - Inspect selection-rule diagnostics (`E1 ALLOWED` / `E1 FORBIDDEN`), radial integrals, spherical polarization channels ($q = -1, 0, +1$), oscillator strength $f_{if}$, Einstein $A_{fi}$, $\Delta E$, vacuum $\lambda$, and quadrature convergence residual.
6. **Spectroscopy**:
   - Synthesize discrete vacuum emission/absorption stick spectra across `Lyman`, `Balmer`, `Paschen`, or `Custom` $(n_{\max}, [\lambda_{\min}, \lambda_{\max}])$ directly from calculated E1 matrix elements.
   - Compare relativistic Dirac vs Schrödinger overlay lines and NIST $^1\text{H}$ vacuum centroids cleanly (zero empirical broadening or thermal populations assumed).
7. **Analysis**:
   - Inspect live **2D XY / XZ / YZ mathematical cross-section heatmaps** (`Slice2DCanvas`), radial probability distributions ($P(r)$, Dirac $P/Q$, or total $4\pi r^2\rho(r)$), exact analytical $\langle r^k \rangle$ expectation values, and full `v0.5` provenance & 118-element coverage matrix (`Inspector`).
8. **Experiment History**:
   - Manage locally persisted IndexedDB (`atoms_laboratory_db`) experiment runs.
   - Distinguishes **Load / Replay** (`source: loaded-from-store`) from **Rerun Calculation** (`source: computed`, incrementing `recomputedCount`).
   - Cancel in-flight Worker executions, delete entries, and **Export / Import** schema-validated `atoms-experiment-bundle` JSON files (malformed or unsupported versions are rejected safely).

---

## 2. Preserved `v0.5` URL Query Parameters

Direct reproducible deep-links continue to work on boot:
- `?z=79&mode=atom&source=dirac-fock` — Iron/Gold/etc. in Lobato 2026 Dirac–Fock full-atom view
- `?z=10&mode=atom&source=model&samples=75000&adaptive=0` — Neon Slater subshell decomposition without adaptive FPS reduction
