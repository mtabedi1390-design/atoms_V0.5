/**
 * Pinned Gaussian Basis Set Catalog & Provenance Metadata (ATOMS v0.7.0).
 *
 * Verified directly against Basis Set Exchange v0.12 (BSD-3-Clause) and
 * PySCF v2.15.1 bundled GTO definitions.
 *
 * Scientific honesty rules:
 *  - Every basis records exact all-electron Z coverage and missing elements
 *    (e.g., cc-pVDZ and cc-pVTZ omit K=19; aug-cc-pVTZ omits K=19 and Ca=20).
 *  - def2-SVP and def2-TZVP are all-electron for Z=1..36 (H..Kr) and capped at
 *    Z=36 here because Z >= 37 requires Effective Core Potentials (ECP),
 *    which are out of scope for all-electron HF in ATOMS v0.7.0.
 */
import type { HFBasisId, HFCapabilitiesResponse } from "./types";

export interface HFBasisCatalogEntry {
  readonly id: HFBasisId;
  readonly label: string;
  readonly family: string;
  readonly bseName: string;
  readonly bseVersion: string;
  readonly harmonics: "spherical" | "cartesian";
  readonly normalizationConvention: string;
  readonly allElectronMaxZ: number;
  readonly excludedElementsUpToMaxZ: readonly number[];
  readonly license: string;
  readonly citation: string;
  readonly description: string;
  readonly knownLimitations: string;
}

export const HF_BASIS_CATALOG: readonly HFBasisCatalogEntry[] = [
  {
    id: "sto-3g",
    label: "STO-3G",
    family: "Pople minimal STO-3G",
    bseName: "sto-3g",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted GTO standard spherical normalization (libcint / BSE)",
    allElectronMaxZ: 54,
    excludedElementsUpToMaxZ: [],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Hehre, Stewart, Pople, J. Chem. Phys. 51, 2657 (1969); Pritchard et al., J. Chem. Inf. Model. 59, 4814 (2019).",
    description: "Minimal basis (3 primitives per Slater-type atomic orbital). Fast qualitative baseline across Z=1..54 (H–Xe).",
    knownLimitations: "Minimal valence flexibility and poor radial tail/diffuse behavior; large basis-set incompleteness error.",
  },
  {
    id: "6-31g",
    label: "6-31G",
    family: "Pople split-valence double-zeta",
    bseName: "6-31g",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted GTO standard spherical normalization (libcint / BSE)",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Ditchfield, Hehre, Pople, J. Chem. Phys. 54, 724 (1971); Rassolov et al., J. Comput. Chem. 22, 976 (2001).",
    description: "Split-valence double-zeta all-electron basis covering Z=1..36 (H–Kr).",
    knownLimitations: "Lacks polarization and diffuse functions; non-relativistic point-nucleus Gaussian approximation.",
  },
  {
    id: "cc-pvdz",
    label: "cc-pVDZ",
    family: "Dunning correlation-consistent polarized DZ",
    bseName: "cc-pvdz",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted spherical harmonics (5d, 7f) per Dunning / libcint",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [19],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Dunning, J. Chem. Phys. 90, 1007 (1989); Woon & Dunning (1993); Balabanov & Peterson (2005).",
    description: "Polarized correlation-consistent double-zeta basis. Standard compact benchmark for 1st/2nd/3rd-row atoms.",
    knownLimitations: "Omits K (Z=19) in standard BSE/PySCF cc-pVDZ; noticeable core/valence basis error vs CBS HF limit.",
  },
  {
    id: "cc-pvtz",
    label: "cc-pVTZ",
    family: "Dunning correlation-consistent polarized TZ",
    bseName: "cc-pvtz",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted spherical harmonics (5d, 7f, 9g) per Dunning / libcint",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [19],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Dunning, J. Chem. Phys. 90, 1007 (1989); Kendall, Dunning, Harrison (1992); Balabanov & Peterson (2005).",
    description: "Triple-zeta polarized basis giving substantially improved HF total and orbital energies.",
    knownLimitations: "Omits K (Z=19) in standard BSE/PySCF cc-pVTZ; lacks diffuse functions for anions/Rydberg tails.",
  },
  {
    id: "aug-cc-pvtz",
    label: "aug-cc-pVTZ",
    family: "Augmented Dunning polarized TZ",
    bseName: "aug-cc-pvtz",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted spherical harmonics with diffuse augmentation (libcint)",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [19, 20],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Kendall, Dunning, Harrison, J. Chem. Phys. 96, 6796 (1992).",
    description: "Triple-zeta basis augmented with diffuse shells; matches ATOMS v0.5/v0.6.1 reference datasets and benchmarks closely against numerical HF limits.",
    knownLimitations: "Omits K (Z=19) and Ca (Z=20) in BSE v1; higher integral/memory cost for transition metals.",
  },
  {
    id: "def2-svp",
    label: "def2-SVP",
    family: "Karlsruhe Ahlrichs def2 split-valence polarized",
    bseName: "def2-svp",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted spherical harmonics (Weigend-Ahlrichs / libcint)",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Weigend & Ahlrichs, Phys. Chem. Chem. Phys. 7, 3297 (2005).",
    description: "Full H–Kr (Z=1..36) all-electron Karlsruhe polarized double-zeta basis including K and Ca.",
    knownLimitations: "Z >= 37 (Rb–Rn) in def2 uses ECPs and is excluded in v0.7.0 all-electron HF.",
  },
  {
    id: "def2-tzvp",
    label: "def2-TZVP",
    family: "Karlsruhe Ahlrichs def2 triple-zeta valence polarized",
    bseName: "def2-tzvp",
    bseVersion: "1",
    harmonics: "spherical",
    normalizationConvention: "Contracted spherical harmonics (Weigend-Ahlrichs / libcint)",
    allElectronMaxZ: 36,
    excludedElementsUpToMaxZ: [],
    license: "BSD-3-Clause (BSE v0.12) / Apache-2.0 (PySCF)",
    citation: "Weigend & Ahlrichs, Phys. Chem. Chem. Phys. 7, 3297 (2005).",
    description: "Full H–Kr (Z=1..36) all-electron Karlsruhe triple-zeta polarized basis including K and Ca.",
    knownLimitations: "Z >= 37 (Rb–Rn) in def2 uses ECPs and is excluded in v0.7.0 all-electron HF.",
  },
];

export function getBasisCatalogEntry(basis: HFBasisId): HFBasisCatalogEntry {
  const found = HF_BASIS_CATALOG.find((b) => b.id === basis);
  if (!found) {
    throw new Error(`Unknown HF basis id: ${basis}`);
  }
  return found;
}

export function isBasisSupportedForZ(
  basis: HFBasisId,
  Z: number,
  liveCapabilities?: HFCapabilitiesResponse | null,
): { readonly supported: boolean; readonly reason?: string } {
  const meta = getBasisCatalogEntry(basis);
  if (Z > meta.allElectronMaxZ) {
    return {
      supported: false,
      reason: `All-electron ${meta.label} is supported up to Z=${meta.allElectronMaxZ} (${
        basis.startsWith("def2") ? "Z>=37 uses def2-ECP, outside all-electron v0.7.0" : "no BSE all-electron definition above Z=" + meta.allElectronMaxZ
      }).`,
    };
  }
  if (meta.excludedElementsUpToMaxZ.includes(Z)) {
    return {
      supported: false,
      reason: `${meta.label} (BSE v${meta.bseVersion}) does not define basis functions for Z=${Z}. Use def2-SVP, def2-TZVP, 6-31G, or STO-3G.`,
    };
  }
  if (liveCapabilities?.available && liveCapabilities.bases) {
    const liveEntry = liveCapabilities.bases.find((b) => b.id === basis);
    if (liveEntry && !liveEntry.elements.includes(Z)) {
      return {
        supported: false,
        reason: `Live backend reports ${meta.label} does not cover Z=${Z}.`,
      };
    }
  }
  return { supported: true };
}
