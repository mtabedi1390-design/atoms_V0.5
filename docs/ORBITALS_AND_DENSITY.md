# Orbitals, Electron Density, and 3D Visualization (`ATOMS v0.7.0`)

Every orbital eigenvalue, spatial wavefunction, radial density profile, spin density, and 3D isosurface shown by ATOMS v0.7.0's Multi-Electron Hartree–Fock workspace originates directly from converged **PySCF `2.15.1` + `libcint`** AO coefficients (`mo_coeff`) and density matrices (`dm`).

> **Strict Anti-Fabrication Rule:** Static total-density approximations (`lobato2026-df`, `src/data/hf/*.Lobato`) and qualitative Slater screening (`browser-slater`) are never substituted for SCF molecular orbitals or spin densities.

---

## 1. Orbital Output & Overlap-Metric Orthonormality

For each occupied orbital (plus up to 5 low-lying virtual orbitals above the HOMO for LUMO inspection), ATOMS returns:
- Orbital index (`index`), spin channel (`"spatial"` for RHF / `AtomSphAvg` / ROHF, `"alpha"` / `"beta"` for UHF), `SO(3)` or `C1` symmetry irrep label (`irrep`), occupation number, and orbital energy (`energy_Ha`, `energy_eV`).
- For **ROHF**, ATOMS additionally computes exact single-determinant Koopmans Fock expectations $\langle \psi_i | \hat{F}^\alpha | \psi_i \rangle$ and $\langle \psi_i | \hat{F}^\beta | \psi_i \rangle$ alongside the Roothaan effective Fock eigenvalue.
- **Correct Non-Orthogonal Basis Metric Verification**:
  Gaussian basis functions are non-orthogonal ($S_{\mu\nu} \ne \delta_{\mu\nu}$). ATOMS verifies true orthonormality under the overlap metric:
  $$\text{orthonormalityError} = \max\left|\mathbf{C}^T\mathbf{S}\mathbf{C} - \mathbf{I}\right| < 10^{-8}, \qquad \operatorname{Tr}(\mathbf{P}\mathbf{S}) = N.$$

---

## 2. Sphericalized Radial Profiles & Angular Isotropy via 110-Point Lebedev Quadrature

Open-shell neutral atoms with partially filled $p$ or $d$ subshells (such as `B 2p1`, `C 2p2`, `O 2p4`, `F 2p5`) have **nonspherical** 3D electron and spin densities in Cartesian/real-harmonic SCF, whereas `AtomSphAverageRHF` fractional ensembles and half-filled/closed shells (`Li, N, Cr, He, Be, Ne`) are spherically symmetric.

`science/hf_backend.py` integrates over the sphere using **PySCF `dft.gen_grid.MakeAngularGrid(110)`** (110-point octahedral-symmetric Lebedev quadrature, exact through spherical degree $l = 17$) across 220 log-spaced shells ($r \in [10^{-4}, 14]\,a_0$) plus core sampling:

$$\bar{\rho}(r_k) = \sum_{q=1}^{110} w_q \rho(r_k \hat{\mathbf{u}}_q), \qquad P(r_k) = 4\pi r_k^2 \bar{\rho}(r_k),$$

and computes `angularDiagnostics`:
- `maxRelativeAnisotropy` & `rmsRelativeAnisotropy`: $\max_{r, q} |\rho(r\hat{\mathbf{u}}_q) - \bar{\rho}(r)| / \bar{\rho}(r)$ (`~2e-15` for all `AtomSphAverageRHF` runs and `Li/N/Cr` determinants; `0.50–1.72` for oriented `B, C, O, F` open-shell determinants).
- **`lSquaredAvailable = false` (`lSquared = null`)**: ATOMS never estimates $\langle \hat{L}^2 \rangle$ from a one-particle density; computing two-electron $\langle \hat{L}^2 \rangle$ rigorously requires full 2-particle density/determinant angular-momentum matrix elements.
- **Measured normalization precision**: $|\int 4\pi r^2\bar{\rho}(r)\,dr - N| \lesssim 10^{-7}\text{ to }10^{-8}\,e$, $|\int 4\pi r^2\bar{\rho}_s(r)\,dr - (N_\alpha - N_\beta)| \lesssim 10^{-7}\,e$.

---

## 3. Real 3D Cartesian Grids, 2D Slices, & 3D Marching Tetrahedra

When volumetric output is requested (`volumeGrid.enabled = true`), `science/hf_backend.py` evaluates genuine AO values `mol.eval_gto("GTOval_sph", coords)` over a uniform 3D box $[-L, L]^3$ ($N \in \{20, 24, 28, 32\}$ grid points per axis):

| Quantity (`HFVolumeQuantity`) | Mathematical Definition | Physical Interpretation |
|---|---|---|
| `mo-signed` | $\psi_i(\mathbf{r}) = \sum_\mu C_{\mu i} \chi_\mu(\mathbf{r})$ | True signed MO wavefunction (positive/negative phase lobes rendered in Workbench 3D Marching Tetrahedra) |
| `mo-density` | $|\psi_i(\mathbf{r})|^2$ | Orbital probability density |
| `total-density` | $\rho(\mathbf{r}) = \sum_{\mu\nu} P_{\mu\nu} \chi_\mu(\mathbf{r})\chi_\nu(\mathbf{r})$ | Total multi-electron Cartesian density |
| `spin-density` | $\rho_s(\mathbf{r}) = \rho_\alpha(\mathbf{r}) - \rho_\beta(\mathbf{r})$ | Signed excess spin density (polarized open shells) |

`src/numerics/isosurface/marchingTetrahedra.ts` exposes:
- `extractIsosurfacesFromVolumeGrid(grid, isoFraction)` -> watertight 6-tetrahedra positive/negative lobe meshes projected directly into Three.js `OrbitalScene`,
- `slice2DFromVolumeGrid(grid, plane, offsetBohr)` -> bilinear cross-section interpolation (`XY`, `XZ`, `YZ`) inspected inside **AnalysisWorkspace**.
