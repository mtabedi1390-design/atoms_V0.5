# Models, engines and selection policy

## Implemented and runnable

| Model | Scope | Hamiltonian / method | Correlation | Relativistic | Evidence |
|---|---|---|---|---|---|
| A `hydrogenic-exact` | H, one-electron ions; orbital basis | Schrödinger, Coulomb point nucleus, M→∞, CODATA 2018 | none (one electron) | none | exact analytic solution; validated numerically |
| B `slater-screened-hydrogenic` | all Z, qualitative shapes | independent electrons, Z_eff = Z−S (Slater 1930) with n* table 1,2,3,3.7,4.0,4.2,4.3 (≥7 extrapolated and labelled) | none | none | empirical estimate, labelled as such |
| PySCF HF (`pyscf-hf`) | H, He, C, N, O, Ne density & total energy | RHF/ROHF, aug-cc-pVTZ, point nucleus | none (HF) | none | computed offline, real output, electron count & energy checks |

## Registered but unavailable

| Provider | Blocker |
|---|---|
| GRASP2018 MCDHF/RCI | not installed, source not bundled. No Breit/QED/MCDHF results were produced. Next: install GRASP on Linux, Cs-like test with Fermi nucleus, export radial orbitals in `atoms.hf-radial.v1`. |
| DFT/MCSCF/CI, X2C, four-component Dirac | no validated offline workflow in this environment; not claimed. |

## Observable-dependent selection (`src/science/providers.ts`)

* electron density, interactive → browser Slater estimate (fast, all Z).
* electron density, quantitative/high → PySCF HF if a bundled dataset exists for that Z; otherwise
  the Slater estimate is returned **with method metadata**, never relabelled as HF.
* total energy → PySCF HF where available; otherwise `null` (unavailable), not estimated.
* fine structure / transition rates → `null`; no provider (GRASP unavailable).
* Every `ProviderResult` carries engine/version/licence, method, basis, SCF convergence, validation
  checks and limitations. The inspector renders them.

## Energy quantities — kept distinct

* exact hydrogenic `E_n = −13.605693 Z²/n² eV` (one electron);
* surrogate `−13.605693 Z_eff²/n*² eV` (Slater estimate);
* HF total electronic energy (PySCF, basis-limited, includes electron–electron repulsion);
* experimental first ionization energy (NIST ASD).
They are shown with distinct labels; only the first is an eigenvalue of the displayed Hamiltonian.

## Relativistic importance

Relativistic effects are significant for Z ≳ 50 (s/p contraction, d/f expansion, spin–orbit).
They are **not implemented**. The UI warns for every Z ≥ 50 and for every full-atom display. For
Z ≥ 104 configurations are theoretical predictions and marked as such.
