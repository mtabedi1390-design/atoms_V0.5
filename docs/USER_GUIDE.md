# ATOMS v0.5.0 — User Guide

## 1. Layout Overview

- **Top Telemetry Bar**: Displays the selected element (`symbol`, `name`, `Z`, atomic mass, NIST ground term), active quantum state or full-atom subshell count, open-shell/closed-shell indicator, physical observables ($\langle r \rangle$, $Z_{\text{eff}}$, energy, or total-density representation), active density source, integrated electron check ($\int\rho\,dV$), worker sampling timing, and live FPS/draw-call telemetry.
- **Left Control Rail**:
  1. **Element**: Interactive 118-element periodic table with search (`symbol`, `name`, or `Z`) and arrow-key keyboard navigation.
  2. **Mode**: Toggle between **Single orbital $\psi_{nlm}$** (Model A exact hydrogenic ion vs Model B Slater-screened orbital) and **Full-atom density** (neutral multi-electron cloud).
  3. **Full-atom density source**:
     - **Dirac–Fock (Z=1–118)** (default): Lobato et al. (2026) all-electron relativistic B-spline Dirac–Fock spherical density across all 118 elements.
     - **PySCF HF (offline)**: Bundled non-relativistic RHF/ROHF density (enabled for `H, He, C, N, O, Ne`; explicitly disabled where not computed).
     - **Slater subshells**: Qualitative independent-electron configuration average with interactive per-subshell visibility checkboxes and opacity sliders.
  4. **Orbital / subshell**: Select $(n, l, m)$, switch **Real (tesseral)** vs **Complex $Y_l^m$** basis, or inspect any occupied subshell.
  5. **Sampling / Rendering / Cross-section slice**: Adjust Monte Carlo sample count (`25,000–300,000`), seed, adaptive FPS throttling, point size, brightness, log-relative density cutoff, axes/nucleus markers, probability current arrows ($\mathbf{j}$ for single-orbital complex $m \neq 0$), and XY/XZ/YZ slab slicing.
- **Right Analysis Panel**:
  - **Radial P(r)**: Plots $P_r(r) = r^2|R_{nl}(r)|^2$ (with radial nodes and analytic/numeric $\langle r \rangle$) in single-orbital or Slater subshell mode, and switches automatically to $P_{\text{total}}(r) = 4\pi r^2\rho(r)$ (with $\int 4\pi r^2\rho\,dr$ and numeric $\langle r \rangle$ per electron) when viewing Dirac–Fock or PySCF HF total density.
  - **Levels**: Subshell level bars with separated display of NIST 1st ionization energy (experimental/evaluated vs predicted vs unavailable) and PySCF total HF energy.
  - **Inspector**: Per-field provenance badges, active model limitations, observable-dependent provider selection, validation checks, external dataset blockers (Datatoms `1 ≤ N ≤ 10`, GRASP2018), and the per-element **Element × Observable Coverage** table.

---

## 2. URL Query Parameters

You can link directly to reproducible states using URL parameters:
- `?z=79` — Select element `Z` (`1..118`, e.g., `79` = Gold, `118` = Oganesson).
- `&mode=single|atom` — Start in single-orbital or full-atom density mode.
- `&source=dirac-fock|hf|model` — Select Full-atom density source (`dirac-fock` default).
- `&samples=75000` — Initial particle sample count (`25000..300000`).
- `&adaptive=0|1` — Enable/disable automatic sample reduction below 30 FPS.

Example: `/?z=26&mode=atom&source=dirac-fock` opens Iron (`Z = 26`) in relativistic Dirac–Fock full-atom view; `/?z=10&mode=atom&source=model` opens Neon's Slater-screened subshell layer controls.
