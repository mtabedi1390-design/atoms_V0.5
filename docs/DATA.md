# Atomic Data Provenance & Pipeline (`v0.5.0`)

## 1. Pinned Source Snapshots & Verification

All primary scientific datasets shipped in `v0.5.0` are pinned as verbatim snapshots under `data/sources/` with cryptographic SHA-256 checksums recorded in `data/sources/MANIFEST.json` and verified by `python3 science/build_atomic_data.py`:

| Pinned Snapshot File | Upstream Source | License | SHA-256 | Coverage |
|---|---|---|---|---|
| `data/sources/nist_asd_ie.tsv` | NIST Atomic Spectra Database IE query (`physics.nist.gov/cgi-bin/ASD/ie.pl`) | Public reference data (NIST) | `c976723761930dbc163ebf24647c561b2607e16b9b405e0aca991afa983b1e06` | `Z = 1..108` neutral atoms (`Z = 109..118` absent from ASD IE query) |
| `data/sources/lobato2026_adaptive_dirac_pade.txt` | Lobato et al. (2026), `arXiv:2608.14934` (`github.com/NeuralSoftX/scattering_factors_2026`) | Apache-2.0 | `86cbd465973c0701c944f66f57ef045dfeacaa5caeabdb8af9f6d8fcd8de078a` | `Z = 1..118` Dirac–Padé total radial density parameters |
| `data/sources/lobato2026_positivity_certificate.json` | Lobato et al. (2026) positivity certificate | Apache-2.0 | `05b46e68d35abde5b06e7ff5b007b50202c8e03ea74700772b4e2f7508950a49` | All 118 elements globally non-negative |

Running `npm run data:build` (`python3 science/build_atomic_data.py`) verifies every SHA-256 hash against `MANIFEST.json` before regenerating:
- `src/data/nist/asd_ground_levels.json` (108 records)
- `src/data/df/lobato2026.json` (118 records; verifies positivity and charge integral $\int_0^\infty 4\pi r^2\rho(r)\,dr = Z$ with `max relative charge error: 1.991e-07`).

---

## 2. Per-Field Provenance in `src/data/elements.ts`

| Field | Definition / Convention | Source | Evidence Classes |
|---|---|---|---|
| `Z`, `symbol`, `name` | IUPAC atomic number, symbol, name | IUPAC periodic table | `evaluated` |
| `mass`, `massKind` | Standard atomic weight (u) or mass number of longest-lived isotope (`[A]`) | IUPAC/CIAAW 2021 abridged | `evaluated` / `measured` |
| `category`, `group`, `period`, `block` | 18-column periodic layout (`La/Ac/Lu/Lr` in `d`-block columns; other inner-transition in `f`-block) | IUPAC layout | `evaluated` |
| `configuration` | Noble-gas shorthand with Aufbau exceptions (`Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, Pa, U, Np, Cm, Lr`) | NIST ASD (`Z ≤ 103`); theoretical relativistic predictions (`Z ≥ 104`) | `evaluated` / `predicted` |
| `groundTerm`, `groundJ` | Neutral ground-state term symbol & total angular momentum $J$ | Pinned NIST ASD snapshot (`asd_ground_levels.json`) | `evaluated` (`Z ≤ 103`), `predicted` (`Z = 104..108`), `unavailable` (`Z = 109..118`) |
| `ionizationEnergy_eV`, `ionizationUncertainty_eV`, `ionizationRef` | First ionization energy of the neutral atom (`eV`) | Pinned NIST ASD snapshot (`asd_ground_levels.json`) | `evaluated` / `measured`, `predicted` (`Pa, Fm, Md, 104..108`), `unavailable` (`Z = 109..118`) |
| `covalentRadius_pm` | Single-bond covalent radius (`pm`, `Z ≤ 96`; never mixed with van der Waals radii) | Cordero et al., *Dalton Trans.* 2008, 2832 | `evaluated` (`Z ≤ 96`), `unavailable` (`Z ≥ 97`) |
| `isOpenShell` | Boolean flag indicating any partially occupied subshell (`occupancy < 2(2l+1)`) | Derived from ground subshells | Exact structural property |

---

## 3. Bundled Hartree–Fock Datasets (`src/data/hf/*.json`)

- Schema: `atoms.hf-radial.v1` (`H.json`, `He.json`, `C.json`, `N.json`, `O.json`, `Ne.json`).
- Generator: `python3 science/hf_export.py` using PySCF 2.15.1 (Apache-2.0), RHF/ROHF, `aug-cc-pVTZ`, point nucleus, non-relativistic.
- Runtime & test validation (`validateHFDataset`, `integrateDatasetElectrons`): enforces strict monotonic `rBohr > 0`, non-negative `rhoElectronPerBohr3`, integrated electron count within `0.5%` of `Z`, and variational energy checks against numerical HF limits.
