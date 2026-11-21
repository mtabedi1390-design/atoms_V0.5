# ATOMS v0.6.0 — Data Provenance & Audit Registry

This document extends [`docs/DATA.md`](./DATA.md) with all `v0.6.0` reference tables, isotope mass provenance, and strict origin disclosures.

---

## 1. Pinned Cryptographic Snapshots (`data/sources/`)

Verified before build via `npm run data:build` (`python3 science/build_atomic_data.py`):

| File | Upstream Source | License | SHA-256 | Used For |
|---|---|---|---|---|
| `data/sources/nist_asd_ie.tsv` | NIST Atomic Spectra Database IE Query | Public Reference (NIST) | `c9767237...1e06` | Neutral `Z = 1..108` configurations, ground terms, 1st ionization energies (`asd_ground_levels.json`) AND $^1\text{H}$ ground ionization limit (`13.598434599702(12) eV`, `HDEL`) |
| `data/sources/lobato2026_adaptive_dirac_pade.txt` | Lobato et al. (2026), `arXiv:2608.14934` | Apache-2.0 | `86cbd465...078a` | All-electron relativistic Dirac–Fock radial densities `Z = 1..118` (`lobato2026.json`) |
| `data/sources/lobato2026_positivity_certificate.json` | Lobato et al. (2026) | Apache-2.0 | `05b46e68...0a49` | Global non-negativity certificate $\rho(r) \ge 0$ across `Z = 1..118` |

---

## 2. `v0.6.0` NIST Hydrogen Vacuum Reference (`nistHydrogenLines.json`)

- File: [`src/data/references/nistHydrogenLines.json`](../src/data/references/nistHydrogenLines.json) + loader [`src/data/references/nistHydrogen.ts`](../src/data/references/nistHydrogen.ts).
- **Strict Honesty Disclosure**: Because offline `lines.pl` line-by-line NIST ASD downloads are not bundled under `data/sources/`, `nistHydrogenLines.json` does **not** fabricate unpinned ASD rows. Instead:
  1. `hydrogenGroundIonization_eV = 13.598434599702` is read verbatim from the pinned `H I` row (`HDEL`) in `data/sources/nist_asd_ie.tsv`.
  2. Reference Lyman ($\alpha, \beta, \gamma$), Balmer ($\alpha, \beta, \gamma, \delta$), and Paschen ($\alpha, \beta$) vacuum Ritz centroids (`vacuumWavelength_nm`) are derived explicitly from this pinned `IE_1H` constant via $E_n = -\text{IE}_{^1\text{H}}/n^2$ and exact SI $hc = 1239.841984332\text{ eV}\cdot\text{nm}$.
  3. All wavelengths are **vacuum** (`wavelengthConvention: "vacuum"`), never air wavelengths.

---

## 3. Isotope Nuclear Mass Provenance (`src/domain/atomic/index.ts`)

| Nuclide | `nuclearMass_u` (bare nucleus) | `neutralAtomicMass_u` | Source |
|---|---|---|---|
| $^1\text{H}$ | `1.007276466621` | `1.00782503223` | CODATA 2018 proton mass / AME 2020 |
| $^2\text{H}$ (D) | `2.013553212745` | `2.01410177811` | CODATA 2018 deuteron mass / AME 2020 |
| $^4\text{He}$ | `4.001506179127` | `4.00260325413` | CODATA 2018 alpha particle mass / AME 2020 |
| $^{12}\text{C}$ | `11.9967085` (`12 - 6*m_e`) | `12.000000000` | Exact SI $^{12}\text{C}$ scale minus $Z m_e$ |
| Arbitrary $Z$ | `atomicMass_u - Z * m_e` | CIAAW 2021 / `[A]` (`elements.ts`) | Derived bare-nuclear estimate |

---

## 4. Multi-Electron & Unavailable External Sources

- **PySCF HF (`src/data/hf/{H,He,C,N,O,Ne}.json`)**: Bundled `aug-cc-pVTZ` nonrelativistic RHF/ROHF spherical radial densities and variational total energies (Apache-2.0, generated offline via `science/hf_export.py`).
- **Datatoms (`datatoms-2026-mcdf`, `doi:10.57745/5RV42G`, CC BY 4.0)**: Explicitly registered `unavailable` in browser UI/registry because upstream scope is strictly `1 <= N <= 10` ions (`H`-like through `Ne`-like) and is not a general neutral radial density table.
- **GRASP2018 (`grasp-mcdhf`)**: Explicitly registered `unavailable` because GRASP2018 Fortran/MPI toolchain is not installed or bundled.
