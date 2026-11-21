# ATOMS v0.6.1 — Release Notes (Scientific Stabilization)

**Release Date:** 2026-11-21  
**Project:** ATOMS — General Atomic Quantum Laboratory  
**Branch / Tag:** `development/v0.6.1` / `v0.6.1` (from immutable `v0.6.0` `e26d46b` and `v0.5.0` `47b84f8`)

---

## Stabilization Highlights

1. **Nonrelativistic Schrödinger & E1 Defect Repairs**:
   - Fixed `node-counts` validation check so all non-zero magnetic sublevels (`m_l !== 0`, real and complex bases) return `ok: true` with exact polar-cone (`l - |m_l|`) and azimuthal counts.
   - Corrected the missing `(-1)^{l_f}` phase factor in `nonrelativisticAngularC1` so signed Gaunt integrals match $(-1)^{m_f}\sqrt{(2l_f+1)(2l_i+1)}\binom{l_f\,1\,l_i}{0\,0\,0}\binom{l_f\,1\,l_i}{-m_f\,q\,m_i}$ verified by independent 2D spherical quadrature.
   - Zeroed multiplet `oscillatorStrength`, `einsteinA_s1`, reduced dipole strength, and newly added `sublevelEinsteinA_s1` whenever E1 selection rules forbid a magnetic or spin-flip transition, and proved $\sum_{m_f} A_{i\to f} = A_{\text{level}}$ across both NR and Dirac engines.
2. **Numerical Robustness & UI Scientific Consistency**:
   - Upgraded `radialNodes` to non-uniform quadratic-coordinate scanning (`N = 6000`) resolving inner radial zeros cleanly up to `n = 12`.
   - Added reduced-mass Bohr scale `bohrScale = 1 / reducedMassRatio` to `integrateRadialMass`, `radialDomainForMass`, `RadialPlot`, `QuantumStatesWorkspace`, and `AnalysisWorkspace`.
   - Fixed `AnalysisWorkspace` to display Dirac spinor expectation values (`<r>`, RMS, `<r^-1>`, `<r^-2>`, `normError`, `invRError`) when Dirac mode is active instead of NR Schrödinger values.
   - Wired the `Custom` series `Lower n` input control in `SpectroscopyWorkspace` and `useAtomsLaboratory.ts`.
   - Exposed `CODATA_2018_UNCERTAINTIES` in `src/physics/units.ts` and corrected the `hbar_Js` precision comment in `src/physics/constants.ts`.
3. **Layered Scientific Verification**:
   - **16 Vitest files / 126 tests** (including closed-form Gordon `1s-2p / 2s-3p / 2p-3d`, 2D spin-angular integrals, Dirac $r^\gamma$ cusp log-slope, grid refinement convergence, Worker/IndexedDB/JSON safety).
   - **340 C++17 native checks** (Debug + Release) and **1,020 native parity vectors**.
   - **21 Playwright browser tests** (`core`, `responsive`, `science`, `laboratory`).

---

## Known Limitations & Explicit Out-of-Scope Boundaries

- **One-Electron Analytical Scope**: Exact Schrödinger/Dirac solvers cover strictly $N = 1$ systems and point-Coulomb nuclei. Multi-electron ions ($1 < N < Z$) and anions ($N > Z$) are representable in `AtomicSystem` and explicitly flagged `unsupported`.
- **No Finite-Nucleus Radial Solver**: `finite-uniform` and `finite-fermi` nuclear models remain typed schemas flagged `unsupported solver` in providers.
- **Omitted Higher-Order Effects**: Point-Coulomb Dirac eigenstates omit QED Lamb shifts, Breit interactions, hyperfine structure, and M1/E2 radiative channels; generated spectra are ideal zero-broadening discrete lines.
- **GitHub Remote Push**: Local Git tags/branches (`v0.5.0` `47b84f8`, `v0.6.0` `e26d46b`, `v0.6.1`) and packaged zip `ATOMS_v0.6.1_Scientific_Stabilization.zip` are verified locally; remote push requires workstation GitHub credentials.
