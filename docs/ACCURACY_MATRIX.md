# ATOMS v0.5.0 — 118-Element Scientific Coverage & Accuracy Matrix

Generated deterministically by `npm run data:matrix` (`scripts/generate_accuracy_matrix.ts`) from `src/science/coverageMatrix.ts`.

## Summary Counts (Z = 1..118)

| Observable / Property | validated/computed | evaluated | approximate | predicted | not-available | Notes |
|---|---:|---:|---:|---:|---:|---|
| Ground configuration | 0 | 103 | 0 | 15 | 0 | NIST ASD Z=1..103; literature predictions Z=104..118 |
| Ground term & J | 0 | 103 | 0 | 5 | 10 | Pinned NIST ASD Z=1..108 (104..108 predicted); Z=109..118 null |
| 1st Ionization Energy | 0 | 99 | 0 | 9 | 10 | NIST ASD Z=1..108 (H, Pa, Fm, Md, 104..108 marked); Z=109..118 null |
| Total ρ(r) — Dirac–Fock | 118 | 0 | 0 | 0 | 0 | Lobato et al. (2026) finite-nucleus B-spline Dirac–Fock (`atomx`); Z=1 exact Dirac 1s |
| Total ρ(r) — PySCF HF | 6 | 0 | 0 | 0 | 112 | Bundled aug-cc-pVTZ RHF/ROHF for Z ∈ {1, 2, 6, 7, 8, 10} |
| Subshell orbitals R_nl(r) | 1 | 0 | 117 | 0 | 0 | Exact 1-e⁻ only for H/ions; Slater Z_eff qualitative estimate for neutral multi-electron atoms |

## Method & Literature Boundary Matrix

| Provider / Dataset | Z Coverage | N (e⁻) Coverage | Observables Provided | Evidence Class | Explicit Limitations / Blockers |
|---|---|---|---|---|---|
| Lobato et al. (2026) Dirac–Padé (`lobato2026-df`) | Z = 1..118 | Neutral (N = Z) | Total spherical density ρ(r) | `computed-and-validated` | Total density only; no subshell R_nl(r), no orbital ε_i, spherical avg for open shells |
| PySCF RHF/ROHF (`pyscf-hf`) | Z ∈ {1,2,6,7,8,10} | Neutral (N = Z) | Total spherical ρ(r), E_HF | `computed-basis-limited` | Non-relativistic, no electron correlation, aug-cc-pVTZ basis |
| Model A Hydrogenic (`hydrogenic-exact`) | Z = 1..118 (ions) | N = 1 only | Exact ψ_nlm, E_n, ⟨r⟩, j | `analytic-exact-within-stated-Hamiltonian` | One-electron H or bare-nucleus X^(Z-1)+ ion only; non-relativistic point nucleus |
| Model B Slater (`browser-slater`) | Z = 2..118 | Independent e⁻ | Qualitative subshell R_nl, Z_eff | `qualitative-approximation` | Empirical screening rules; n* ≥ 7 extrapolated; non-relativistic |
| NIST ASD IE & Ground Levels | Z = 1..108 | Neutral (N = Z) | Config, term/J, 1st IE | `evaluated` / `predicted` | Z = 109..118 absent from ASD IE query (flagged `unavailable`) |
| Datatoms 2026 MCDF (`datatoms-2026-mcdf`) | Z = 1..118 | **1 ≤ N ≤ 10 only** | Levels/lines (not neutral Z>10) | `unavailable` (neutral Z>10) | External dataset scoped strictly to H-like through Ne-like ions (`N ≤ 10`) |
| GRASP2018 MCDHF/RCI (`grasp-mcdhf`) | — | — | Spin-orbit R_nlj, fine structure | `unavailable` | GRASP2018 not installed/bundled; never silently substituted |

## Per-Element Coverage (Z = 1..118)

| Z | Sym | Name | Config | Ground Term | 1st IE (NIST) | Total ρ(r) DF | Total ρ(r) HF | Subshell Orbitals | Relativistic / Validation |
|---:|:---:|---|---|---|---|---|---|---|---|
| 1 | H | Hydrogen | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (13.598434599702 eV (NIST)) | validated/computed | validated/computed | validated/computed (Exact 1-e- hydrogenic (analytic)) | DF charge + PySCF HF limit |
| 2 | He | Helium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (24.587389011 eV (NIST)) | validated/computed | validated/computed | approximate (Slater Z_eff (qualitative only)) | DF charge + PySCF HF limit |
| 3 | Li | Lithium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (5.391714996 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 4 | Be | Beryllium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (9.322699 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 5 | B | Boron | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (8.298019 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 6 | C | Carbon | evaluated (NIST ASD) | evaluated (3P0) | evaluated (11.260288 eV (NIST)) | validated/computed | validated/computed | approximate (Slater Z_eff (qualitative only)) | DF charge + PySCF HF limit |
| 7 | N | Nitrogen | evaluated (NIST ASD) | evaluated (4S*<3/2>) | evaluated (14.53413 eV (NIST)) | validated/computed | validated/computed | approximate (Slater Z_eff (qualitative only)) | DF charge + PySCF HF limit |
| 8 | O | Oxygen | evaluated (NIST ASD) | evaluated (3P<2>) | evaluated (13.618055 eV (NIST)) | validated/computed | validated/computed | approximate (Slater Z_eff (qualitative only)) | DF charge + PySCF HF limit |
| 9 | F | Fluorine | evaluated (NIST ASD) | evaluated (2P*<3/2>) | evaluated (17.42282 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 10 | Ne | Neon | evaluated (NIST ASD) | evaluated (1S0) | evaluated (21.564541 eV (NIST)) | validated/computed | validated/computed | approximate (Slater Z_eff (qualitative only)) | DF charge + PySCF HF limit |
| 11 | Na | Sodium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (5.13907696 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 12 | Mg | Magnesium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (7.646236 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 13 | Al | Aluminium | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (5.985769 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 14 | Si | Silicon | evaluated (NIST ASD) | evaluated (3P0) | evaluated (8.15168 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 15 | P | Phosphorus | evaluated (NIST ASD) | evaluated (4S*<3/2>) | evaluated (10.486686 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 16 | S | Sulfur | evaluated (NIST ASD) | evaluated (3P<2>) | evaluated (10.3600167 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 17 | Cl | Chlorine | evaluated (NIST ASD) | evaluated (2P*<3/2>) | evaluated (12.967633 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 18 | Ar | Argon | evaluated (NIST ASD) | evaluated (1S0) | evaluated (15.7596119 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 19 | K | Potassium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (4.34066373 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 20 | Ca | Calcium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (6.113154921 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 21 | Sc | Scandium | evaluated (NIST ASD) | evaluated (2D<3/2>) | evaluated (6.56149 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 22 | Ti | Titanium | evaluated (NIST ASD) | evaluated (3F<2>) | evaluated (6.82812 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 23 | V | Vanadium | evaluated (NIST ASD) | evaluated (4F<3/2>) | evaluated (6.746187 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 24 | Cr | Chromium | evaluated (NIST ASD) | evaluated (7S<3>) | evaluated (6.76651 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 25 | Mn | Manganese | evaluated (NIST ASD) | evaluated (6S<5/2>) | evaluated (7.434038 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 26 | Fe | Iron | evaluated (NIST ASD) | evaluated (5D<4>) | evaluated (7.9024681 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 27 | Co | Cobalt | evaluated (NIST ASD) | evaluated (4F<9/2>) | evaluated (7.88101 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 28 | Ni | Nickel | evaluated (NIST ASD) | evaluated (3F<4>) | evaluated (7.639878 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 29 | Cu | Copper | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (7.72638 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 30 | Zn | Zinc | evaluated (NIST ASD) | evaluated (1S0) | evaluated (9.394197 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 31 | Ga | Gallium | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (5.999302 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 32 | Ge | Germanium | evaluated (NIST ASD) | evaluated (3P0) | evaluated (7.899435 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 33 | As | Arsenic | evaluated (NIST ASD) | evaluated (4S*<3/2>) | evaluated (9.78855 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 34 | Se | Selenium | evaluated (NIST ASD) | evaluated (3P<2>) | evaluated (9.752368 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 35 | Br | Bromine | evaluated (NIST ASD) | evaluated (2P*<3/2>) | evaluated (11.81381 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 36 | Kr | Krypton | evaluated (NIST ASD) | evaluated (1S0) | evaluated (13.9996055 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 37 | Rb | Rubidium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (4.1771281 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 38 | Sr | Strontium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (5.69486745 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 39 | Y | Yttrium | evaluated (NIST ASD) | evaluated (2D<3/2>) | evaluated (6.21726 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 40 | Zr | Zirconium | evaluated (NIST ASD) | evaluated (3F<2>) | evaluated (6.634126 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 41 | Nb | Niobium | evaluated (NIST ASD) | evaluated (6D<1/2>) | evaluated (6.75885 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 42 | Mo | Molybdenum | evaluated (NIST ASD) | evaluated (7S<3>) | evaluated (7.09243 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 43 | Tc | Technetium | evaluated (NIST ASD) | evaluated (6S<5/2>) | evaluated (7.11938 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 44 | Ru | Ruthenium | evaluated (NIST ASD) | evaluated (5F<5>) | evaluated (7.3605 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 45 | Rh | Rhodium | evaluated (NIST ASD) | evaluated (4F<9/2>) | evaluated (7.4589 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 46 | Pd | Palladium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (8.336839 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 47 | Ag | Silver | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (7.576234 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 48 | Cd | Cadmium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (8.99382 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 49 | In | Indium | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (5.7863558 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 50 | Sn | Tin | evaluated (NIST ASD) | evaluated (3P0) | evaluated (7.343918 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 51 | Sb | Antimony | evaluated (NIST ASD) | evaluated (4S*<3/2>) | evaluated (8.608389 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 52 | Te | Tellurium | evaluated (NIST ASD) | evaluated (3P<2>) | evaluated (9.009808 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 53 | I | Iodine | evaluated (NIST ASD) | evaluated (2P*<3/2>) | evaluated (10.451236 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 54 | Xe | Xenon | evaluated (NIST ASD) | evaluated (1S0) | evaluated (12.1298437 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 55 | Cs | Caesium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (3.89390572743 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 56 | Ba | Barium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (5.2116646 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 57 | La | Lanthanum | evaluated (NIST ASD) | evaluated (2D<3/2>) | evaluated (5.5769 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 58 | Ce | Cerium | evaluated (NIST ASD) | evaluated (1G*<4>) | evaluated (5.5386 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 59 | Pr | Praseodymium | evaluated (NIST ASD) | evaluated (4I*<9/2>) | predicted (5.4702 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 60 | Nd | Neodymium | evaluated (NIST ASD) | evaluated (5I<4>) | evaluated (5.52475 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 61 | Pm | Promethium | evaluated (NIST ASD) | evaluated (6H*<5/2>) | evaluated (5.58187 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 62 | Sm | Samarium | evaluated (NIST ASD) | evaluated (7F0) | evaluated (5.643722 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 63 | Eu | Europium | evaluated (NIST ASD) | evaluated (8S*<7/2>) | evaluated (5.670385 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 64 | Gd | Gadolinium | evaluated (NIST ASD) | evaluated (9D*<2>) | evaluated (6.1498 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 65 | Tb | Terbium | evaluated (NIST ASD) | evaluated (6H*<15/2>) | evaluated (5.8638 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 66 | Dy | Dysprosium | evaluated (NIST ASD) | evaluated (5I<8>) | evaluated (5.939061 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 67 | Ho | Holmium | evaluated (NIST ASD) | evaluated (4I*<15/2>) | evaluated (6.0215 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 68 | Er | Erbium | evaluated (NIST ASD) | evaluated (3H<6>) | evaluated (6.1077 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 69 | Tm | Thulium | evaluated (NIST ASD) | evaluated (2F*<7/2>) | evaluated (6.184402 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 70 | Yb | Ytterbium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (6.25416 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 71 | Lu | Lutetium | evaluated (NIST ASD) | evaluated (2D<3/2>) | evaluated (5.425871 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 72 | Hf | Hafnium | evaluated (NIST ASD) | evaluated (3F<2>) | evaluated (6.82507 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 73 | Ta | Tantalum | evaluated (NIST ASD) | evaluated (4F<3/2>) | evaluated (7.549571 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 74 | W | Tungsten | evaluated (NIST ASD) | evaluated (5D0) | evaluated (7.86403 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 75 | Re | Rhenium | evaluated (NIST ASD) | evaluated (6S<5/2>) | evaluated (7.83352 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 76 | Os | Osmium | evaluated (NIST ASD) | evaluated (5D<4>) | evaluated (8.43823 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 77 | Ir | Iridium | evaluated (NIST ASD) | evaluated (4F<9/2>) | evaluated (8.96702 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 78 | Pt | Platinum | evaluated (NIST ASD) | evaluated (3D<3>) | evaluated (8.95883 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 79 | Au | Gold | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (9.225554 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 80 | Hg | Mercury | evaluated (NIST ASD) | evaluated (1S0) | evaluated (10.437504 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 81 | Tl | Thallium | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (6.1082873 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 82 | Pb | Lead | evaluated (NIST ASD) | evaluated ((1/2,1/2)0) | evaluated (7.4166799 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 83 | Bi | Bismuth | evaluated (NIST ASD) | evaluated (4S*<3/2>) | evaluated (7.285516 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 84 | Po | Polonium | evaluated (NIST ASD) | evaluated (3P<2>) | evaluated (8.41807 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 85 | At | Astatine | evaluated (NIST ASD) | evaluated (2P*<3/2>) | evaluated (9.31751 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 86 | Rn | Radon | evaluated (NIST ASD) | evaluated (1S0) | evaluated (10.7485 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 87 | Fr | Francium | evaluated (NIST ASD) | evaluated (2S<1/2>) | evaluated (4.0727411 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 88 | Ra | Radium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (5.2784239 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 89 | Ac | Actinium | evaluated (NIST ASD) | evaluated (2D<3/2>) | evaluated (5.380235 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 90 | Th | Thorium | evaluated (NIST ASD) | evaluated (3F<2>) | evaluated (6.3067 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 91 | Pa | Protactinium | evaluated (NIST ASD) | evaluated (4K<11/2>) | predicted (5.89 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 92 | U | Uranium | evaluated (NIST ASD) | evaluated (5L*<6>) | evaluated (6.19405 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 93 | Np | Neptunium | evaluated (NIST ASD) | evaluated (6L<11/2>) | evaluated (6.265608 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 94 | Pu | Plutonium | evaluated (NIST ASD) | evaluated (7F0) | evaluated (6.02576 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 95 | Am | Americium | evaluated (NIST ASD) | evaluated (8S*<7/2>) | evaluated (5.97381 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 96 | Cm | Curium | evaluated (NIST ASD) | evaluated (9D*<2>) | evaluated (5.992241 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 97 | Bk | Berkelium | evaluated (NIST ASD) | evaluated (6H*<15/2>) | evaluated (6.19785 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 98 | Cf | Californium | evaluated (NIST ASD) | evaluated (5I<8>) | evaluated (6.281878 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 99 | Es | Einsteinium | evaluated (NIST ASD) | evaluated (4I*<15/2>) | evaluated (6.3684 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 100 | Fm | Fermium | evaluated (NIST ASD) | evaluated (3H<6>) | predicted (6.5 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 101 | Md | Mendelevium | evaluated (NIST ASD) | evaluated (2F*<7/2>) | predicted (6.58 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 102 | No | Nobelium | evaluated (NIST ASD) | evaluated (1S0) | evaluated (6.62621 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 103 | Lr | Lawrencium | evaluated (NIST ASD) | evaluated (2P*<1/2>) | evaluated (4.96 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 104 | Rf | Rutherfordium | predicted (Relativistic prediction) | predicted (3F<2>) | predicted (6.02 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 105 | Db | Dubnium | predicted (Relativistic prediction) | predicted (4F<3/2>) | predicted (6.8 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 106 | Sg | Seaborgium | predicted (Relativistic prediction) | predicted (0) | predicted (7.8 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 107 | Bh | Bohrium | predicted (Relativistic prediction) | predicted (<5/2>) | predicted (7.7 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 108 | Hs | Hassium | predicted (Relativistic prediction) | predicted (<4>) | predicted (7.6 eV (NIST)) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 109 | Mt | Meitnerium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 110 | Ds | Darmstadtium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 111 | Rg | Roentgenium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 112 | Cn | Copernicium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 113 | Nh | Nihonium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 114 | Fl | Flerovium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 115 | Mc | Moscovium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 116 | Lv | Livermorium | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 117 | Ts | Tennessine | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
| 118 | Og | Oganesson | predicted (Relativistic prediction) | not-available (unavailable) | not-available (unavailable) | validated/computed | not-available | approximate (Slater Z_eff (qualitative only)) | DF charge & positivity checks |
