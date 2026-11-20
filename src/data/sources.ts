/**
 * Authoritative scientific source registry for ATOMS v0.5.0.
 * Every field in elements.ts and every provider in providers.ts cites an entry here.
 */

export interface ScientificSource {
  readonly id: string;
  readonly shortName: string;
  readonly citation: string;
  readonly url: string;
  readonly license: string;
  readonly scope: string;
}

export const SOURCES = {
  nistAsd: {
    id: "nist-asd-ie",
    shortName: "NIST ASD (v5.11+)",
    citation: "Kramida, A., Ralchenko, Yu., Reader, J., and NIST ASD Team, NIST Atomic Spectra Database (Ground Levels and Ionization Energies for Neutral Atoms, Z = 1..108).",
    url: "https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html",
    license: "NIST Standard Reference Data (public domain; attribution requested)",
    scope: "Evaluated/measured ground-state configurations, LS/jj term symbols, and first ionization energies for Z = 1..108 (theoretical/interpolated entries flagged; Z = 109..118 absent).",
  },
  iupacCiaaw: {
    id: "iupac-ciaaw-2021",
    shortName: "IUPAC / CIAAW 2021",
    citation: "Prohaska, T. et al., Pure Appl. Chem. 94(5), 573–600 (2022); CIAAW Standard Atomic Weights 2021 abridged.",
    url: "https://ciaaw.org/atomic-weights.htm",
    license: "IUPAC published reference table",
    scope: "Standard atomic weights (u) where defined; longest-lived isotope mass numbers [A] for radioactive/synthetic elements without standard weights.",
  },
  cordero2008: {
    id: "cordero-2008",
    shortName: "Cordero et al. (2008)",
    citation: "Cordero, B. et al., 'Covalent radii revisited', Dalton Trans. 2832–2838 (2008).",
    url: "https://doi.org/10.1039/B801115J",
    license: "Published literature table (single-bond covalent radii)",
    scope: "Single-bond covalent radii (pm) for Z = 1..96 (Mn/Fe/Co low-spin, C sp3); null for Z = 97..118. Distinct from electron-cloud radius or van der Waals radius.",
  },
  lobato2026: {
    id: "lobato-2026-df",
    shortName: "Lobato et al. (2026) Dirac–Fock",
    citation: "Lobato, I., Zhang, Z., Van Aert, S., and Kirkland, A. I., 'Updated all-electron Dirac–Fock densities and an element-adaptive parameterisation of scattering factors and potentials for neutral atoms', arXiv:2608.14934 (2026).",
    url: "https://arxiv.org/abs/2608.14934",
    license: "Apache-2.0 (github.com/NeuralSoftX/scattering_factors_2026)",
    scope: "All-electron relativistic B-spline Dirac–Fock (atomx, finite nucleus, spherical average of open-shell occupations) for Z = 2..118 and exact Dirac 1s for H (Z = 1). Provides total spherical electron density rho(r) only; does not resolve individual subshell orbitals.",
  },
  pyscf2026: {
    id: "pyscf-hf",
    shortName: "PySCF 2.15.1 RHF/ROHF",
    citation: "Sun, Q. et al., J. Chem. Phys. 153, 024109 (2020); PySCF 2.15.1 aug-cc-pVTZ offline exports (science/hf_export.py).",
    url: "https://pyscf.org",
    license: "Apache-2.0",
    scope: "Non-relativistic point-nucleus RHF/ROHF spherically averaged total electron density and total HF energy for H, He, C, N, O, Ne. Basis-set-limited, no electron correlation.",
  },
  datatoms2026: {
    id: "datatoms-2026-mcdf",
    shortName: "Datatoms 2026-1z118-1n10",
    citation: "Becht, D., Pillet, N., Hupin, G., and Indelicato, P., 'Dataset of AI-guided Multi-Configuration Dirac-Fock (MCDF) calculations for atoms and ions with 1 <= Z <= 118 and 1 <= N <= 10', doi:10.57745/5RV42G (2026).",
    url: "https://doi.org/10.57745/5RV42G",
    license: "CC BY 4.0",
    scope: "Relativistic MCDF+QED (MDFGME) energies and radiative transitions for 1 <= Z <= 118 with 1 <= N <= 10 electrons only (covers neutral atoms only up to Ne, Z <= 10; highly charged H-like through Ne-like ions for Z > 10).",
  },
  slater1930: {
    id: "slater-1930",
    shortName: "Slater (1930)",
    citation: "Slater, J. C., 'Atomic Shielding Constants', Phys. Rev. 36, 57–64 (1930).",
    url: "https://doi.org/10.1103/PhysRev.36.57",
    license: "Public scientific formula",
    scope: "Qualitative independent-electron empirical screening rules (Z_eff = Z - S, n* extrapolated for n >= 7). Non-relativistic; not an SCF orbital or binding energy.",
  },
  codata2018: {
    id: "codata-2018",
    shortName: "CODATA 2018",
    citation: "Tiesinga, E., Mohr, P. J., Newell, D. B., and Taylor, B. N., Rev. Mod. Phys. 93, 025010 (2021).",
    url: "https://physics.nist.gov/cuu/Constants/",
    license: "NIST Standard Reference Data",
    scope: "Fundamental physical constants (Bohr radius a0, Hartree, Rydberg energy).",
  },
} as const satisfies Record<string, ScientificSource>;
