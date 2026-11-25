/**
 * Electron Correlation Method Catalog, Basis Orbital Lookup, Compatibility Rules,
 * & Client Preflight Estimator (ATOMS v0.7.2).
 *
 * Pure TypeScript — zero React, Three.js, DOM, or Node built-ins.
 */
import type { HFBasisId } from "@/physics/hf";
import type {
  CorrelationCapabilitiesResponse,
  CorrelationMethodId,
  CorrelationReferenceMethod,
  CorrelationResourceEstimate,
  FrozenCoreMode,
} from "./types";

export const DEFAULT_MAX_FCI_DETERMINANTS = 200_000;
export const DEFAULT_MAX_CISD_AMPLITUDES = 2_000_000;
export const DEFAULT_MAX_FCI_NROOTS = 5;
export const DEFAULT_MAX_CORR_ORBITALS = 120;

export interface CorrelationMethodDescriptor {
  readonly id: CorrelationMethodId;
  readonly label: string;
  readonly shortLabel: string;
  readonly family: "mp2" | "cisd" | "fci";
  readonly description: string;
  readonly variational: boolean;
  readonly sizeExtensive: boolean;
  readonly compatibleReferences: readonly CorrelationReferenceMethod[];
  readonly caveat: string;
}

export const CORRELATION_METHOD_CATALOG: readonly CorrelationMethodDescriptor[] = [
  {
    id: "rmp2",
    label: "Restricted MP2 (RMP2)",
    shortLabel: "RMP2",
    family: "mp2",
    description: "Closed-shell Møller–Plesset 2nd-order perturbation theory on an RHF singlet reference (2S = 0).",
    variational: false,
    sizeExtensive: true,
    compatibleReferences: ["rhf"],
    caveat: "Non-variational; may overshoot FCI or diverge for small HOMO–LUMO denominators.",
  },
  {
    id: "ump2",
    label: "Unrestricted MP2 (UMP2)",
    shortLabel: "UMP2",
    family: "mp2",
    description: "Unrestricted Møller–Plesset 2nd-order perturbation theory on a UHF reference.",
    variational: false,
    sizeExtensive: true,
    compatibleReferences: ["uhf"],
    caveat: "Non-variational; sensitive to UHF reference spin contamination (<S²>).",
  },
  {
    id: "romp2",
    label: "Semi-Canonical ROHF-MP2 (ROMP2)",
    shortLabel: "ROMP2",
    family: "mp2",
    description: "PySCF semi-canonicalized ROHF-MP2 including second-order singles (e_corr_singles) for open-shell 2S ≥ 1.",
    variational: false,
    sizeExtensive: true,
    compatibleReferences: ["rohf"],
    caveat: "Non-variational perturbative correction; requires 2S ≥ 1 open-shell ROHF.",
  },
  {
    id: "rcisd",
    label: "Restricted CISD (RCISD)",
    shortLabel: "RCISD",
    family: "cisd",
    description: "Spin-adapted closed-shell Configuration Interaction Singles & Doubles on an RHF reference.",
    variational: true,
    sizeExtensive: false,
    compatibleReferences: ["rhf"],
    caveat: "Variational upper bound, NOT size-extensive for ≥ 4 electrons (exact for 2 electrons).",
  },
  {
    id: "ucisd",
    label: "Unrestricted CISD (UCISD)",
    shortLabel: "UCISD",
    family: "cisd",
    description: "Unrestricted Configuration Interaction Singles & Doubles on a UHF reference.",
    variational: true,
    sizeExtensive: false,
    compatibleReferences: ["uhf"],
    caveat: "Variational on UHF reference, NOT size-extensive, and lacks built-in <S²> symmetry enforcement.",
  },
  {
    id: "fci",
    label: "Direct Full CI (FCI / CASCI)",
    shortLabel: "FCI",
    family: "fci",
    description: "Exact iterative diagonalization in the full active Slater determinant space (with CASCI when frozen-core is active on RHF/ROHF).",
    variational: true,
    sizeExtensive: true,
    compatibleReferences: ["rhf", "rohf", "uhf"],
    caveat: "Exact ONLY within the chosen finite Gaussian basis & active orbital/electron space; not <L²>-adapted LS-CSF.",
  },
];

export function getCorrelationMethodDescriptor(id: CorrelationMethodId): CorrelationMethodDescriptor {
  const found = CORRELATION_METHOD_CATALOG.find((m) => m.id === id);
  if (!found) {
    throw new Error(`Unknown correlation method: ${String(id)}`);
  }
  return found;
}

/**
 * Exact PySCF 2.15.1 + BSE spherical-harmonic spatial orbital counts (`mol.nao_nr()`)
 * measured for neutral/ionic atoms across Z = 1..54.
 */
const SPATIAL_ORBITAL_TABLE: Readonly<Record<HFBasisId, Readonly<Record<number, number>>>> = {
  "sto-3g": {
    1: 1, 2: 1, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5, 10: 5,
    11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 9,
    19: 13, 20: 13, 21: 18, 22: 18, 23: 18, 24: 18, 25: 18, 26: 18, 27: 18, 28: 18, 29: 18, 30: 18,
    31: 18, 32: 18, 33: 18, 34: 18, 35: 18, 36: 18,
    37: 22, 38: 22, 39: 27, 40: 27, 41: 27, 42: 27, 43: 27, 44: 27, 45: 27, 46: 27, 47: 27, 48: 27,
    49: 27, 50: 27, 51: 27, 52: 27, 53: 27, 54: 27,
  },
  "6-31g": {
    1: 2, 2: 2, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9, 10: 9,
    11: 13, 12: 13, 13: 13, 14: 13, 15: 13, 16: 13, 17: 13, 18: 13,
    19: 17, 20: 17, 21: 27, 22: 27, 23: 27, 24: 27, 25: 27, 26: 27, 27: 27, 28: 27, 29: 27, 30: 27,
    31: 27, 32: 27, 33: 27, 34: 27, 35: 27, 36: 27,
  },
  "cc-pvdz": {
    1: 5, 2: 5, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14, 9: 14, 10: 14,
    11: 18, 12: 18, 13: 18, 14: 18, 15: 18, 16: 18, 17: 18, 18: 18,
    20: 27, 21: 43, 22: 43, 23: 43, 24: 43, 25: 43, 26: 43, 27: 43, 28: 43, 29: 43, 30: 43,
    31: 27, 32: 27, 33: 27, 34: 27, 35: 27, 36: 27,
  },
  "cc-pvtz": {
    1: 14, 2: 14, 3: 30, 4: 30, 5: 30, 6: 30, 7: 30, 8: 30, 9: 30, 10: 30,
    11: 34, 12: 34, 13: 34, 14: 34, 15: 34, 16: 34, 17: 34, 18: 34,
    20: 43, 21: 68, 22: 68, 23: 68, 24: 68, 25: 68, 26: 68, 27: 68, 28: 68, 29: 68, 30: 68,
    31: 43, 32: 43, 33: 43, 34: 43, 35: 43, 36: 43,
  },
  "aug-cc-pvtz": {
    1: 23, 2: 23, 3: 46, 4: 46, 5: 46, 6: 46, 7: 46, 8: 46, 9: 46, 10: 46,
    11: 50, 12: 50, 13: 50, 14: 50, 15: 50, 16: 50, 17: 50, 18: 50,
    21: 93, 22: 93, 23: 93, 24: 93, 25: 93, 26: 93, 27: 93, 28: 93, 29: 93, 30: 93,
    31: 59, 32: 59, 33: 59, 34: 59, 35: 59, 36: 59,
  },
  "def2-svp": {
    1: 5, 2: 5, 3: 9, 4: 9, 5: 14, 6: 14, 7: 14, 8: 14, 9: 14, 10: 14,
    11: 15, 12: 18, 13: 18, 14: 18, 15: 18, 16: 18, 17: 18, 18: 18,
    19: 24, 20: 24, 21: 31, 22: 31, 23: 31, 24: 31, 25: 31, 26: 31, 27: 31, 28: 31, 29: 31, 30: 31,
    31: 32, 32: 32, 33: 32, 34: 32, 35: 32, 36: 32,
  },
  "def2-tzvp": {
    1: 6, 2: 6, 3: 14, 4: 19, 5: 31, 6: 31, 7: 31, 8: 31, 9: 31, 10: 31,
    11: 32, 12: 32, 13: 37, 14: 37, 15: 37, 16: 37, 17: 37, 18: 37,
    19: 33, 20: 36, 21: 45, 22: 45, 23: 45, 24: 45, 25: 45, 26: 45, 27: 45, 28: 45, 29: 45,
    30: 48, 31: 48, 32: 48, 33: 48, 34: 48, 35: 48, 36: 48,
  },
};

export function lookupBasisSpatialOrbitals(basis: HFBasisId, Z: number): number | null {
  return SPATIAL_ORBITAL_TABLE[basis]?.[Z] ?? null;
}

export function nobleCoreFrozenCount(Z: number): number {
  if (Z <= 2) return 0;
  if (Z <= 10) return 1;
  if (Z <= 18) return 5;
  if (Z <= 36) return 9;
  if (Z <= 54) return 18;
  return 27;
}

function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n || n < 0) return 0;
  const kk = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= kk; i++) {
    res = Math.round((res * (n - kk + i)) / i);
    if (!Number.isFinite(res) || res > 1e15) return Number.MAX_SAFE_INTEGER;
  }
  return res;
}

export interface PreflightAssessment {
  readonly estimate: CorrelationResourceEstimate | null;
  readonly withinLimits: boolean;
  readonly limitReason: string | null;
}

export function estimateCorrelationDimensions(params: {
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly basis: HFBasisId;
  readonly referenceMethod: CorrelationReferenceMethod;
  readonly correlationMethod: CorrelationMethodId;
  readonly frozenCoreMode: FrozenCoreMode;
  readonly nRoots?: number;
  readonly capabilities?: CorrelationCapabilitiesResponse | null;
}): PreflightAssessment {
  const nOrb = lookupBasisSpatialOrbitals(params.basis, params.Z);
  if (nOrb === null) {
    return {
      estimate: null,
      withinLimits: false,
      limitReason: `Basis ${params.basis} does not support Z=${params.Z}.`,
    };
  }

  const nAlpha = Math.floor((params.N + params.spin2S) / 2);
  const nBeta = Math.floor((params.N - params.spin2S) / 2);
  const rawCore = params.frozenCoreMode === "noble-core" ? nobleCoreFrozenCount(params.Z) : 0;
  if (rawCore > 0 && (nAlpha <= rawCore || nBeta < rawCore || nOrb <= rawCore)) {
    return {
      estimate: null,
      withinLimits: false,
      limitReason: `Noble-core freezing (${rawCore} core orbitals) leaves invalid active electrons for N_alpha=${nAlpha}, N_beta=${nBeta}. Switch Frozen Core to 'none'.`,
    };
  }

  const frozen = rawCore;
  const nActOrb = nOrb - frozen;
  const nActA = nAlpha - frozen;
  const nActB = nBeta - frozen;
  const nVirA = nOrb - nAlpha;
  const nVirB = nOrb - nBeta;

  const fciNDet = nChooseK(nActOrb, nActA) * nChooseK(nActOrb, nActB);
  let cisdDim: number | null = null;
  if (params.correlationMethod === "rcisd") {
    const occVir = nActA * nVirA;
    cisdDim = 1 + occVir + occVir * occVir;
  } else if (params.correlationMethod === "ucisd") {
    const nooa = Math.floor((nActA * Math.max(0, nActA - 1)) / 2);
    const nvva = Math.floor((nVirA * Math.max(0, nVirA - 1)) / 2);
    const noob = Math.floor((nActB * Math.max(0, nActB - 1)) / 2);
    const nvvb = Math.floor((nVirB * Math.max(0, nVirB - 1)) / 2);
    cisdDim = 1 + nActA * nVirA + nActB * nVirB + nActA * nActB * nVirA * nVirB + nooa * nvva + noob * nvvb;
  }

  const nRoots = params.nRoots ?? 1;
  const limits = params.capabilities?.resourceLimits;
  const maxFciDet = limits?.maxFciDeterminants ?? DEFAULT_MAX_FCI_DETERMINANTS;
  const maxCisdDim = limits?.maxCisdAmplitudes ?? DEFAULT_MAX_CISD_AMPLITUDES;
  const maxNroots = limits?.maxFciNroots ?? DEFAULT_MAX_FCI_NROOTS;
  const maxOrb = limits?.maxCorrelationOrbitals ?? DEFAULT_MAX_CORR_ORBITALS;

  let estimatedMemoryMB = 20;
  if (params.correlationMethod === "fci") {
    const vecMb = (fciNDet * 8 * Math.max(12, 4 * nRoots)) / (1024 * 1024);
    const eriMb = ((nActOrb ** 4) * 8) / (1024 * 1024);
    estimatedMemoryMB = Number((vecMb + eriMb + 20).toFixed(2));
  } else if (params.correlationMethod === "rcisd" || params.correlationMethod === "ucisd") {
    const vecMb = ((cisdDim ?? 0) * 8 * 16) / (1024 * 1024);
    const eriMb = ((nOrb ** 4) * 8) / (1024 * 1024);
    estimatedMemoryMB = Number((vecMb + eriMb + 20).toFixed(2));
  } else {
    const ovovMb = ((Math.max(1, nActA) ** 2) * (Math.max(1, nVirA) ** 2) * 8 * 4) / (1024 * 1024);
    estimatedMemoryMB = Number((ovovMb + 16).toFixed(2));
  }

  const estimate: CorrelationResourceEstimate = {
    nSpatialOrbitals: nOrb,
    frozenOrbitals: frozen,
    activeSpatialOrbitals: nActOrb,
    nAlphaTotal: nAlpha,
    nBetaTotal: nBeta,
    nAlphaActive: nActA,
    nBetaActive: nActB,
    nVirtualAlpha: nVirA,
    nVirtualBeta: nVirB,
    fciDeterminantCount: fciNDet,
    fciDeterminantLimit: maxFciDet,
    cisdAmplitudeDimension: cisdDim,
    cisdAmplitudeLimit: maxCisdDim,
    nRoots,
    nRootsLimit: maxNroots,
    estimatedMemoryMB,
    referenceMethod: params.referenceMethod,
    correlationMethod: params.correlationMethod,
  };

  if (nOrb > maxOrb) {
    return {
      estimate,
      withinLimits: false,
      limitReason: `Basis orbital count (${nOrb}) exceeds configured limit (${maxOrb}).`,
    };
  }
  if (params.correlationMethod === "fci") {
    if (nRoots > maxNroots) {
      return {
        estimate,
        withinLimits: false,
        limitReason: `Requested FCI roots (${nRoots}) exceeds limit (${maxNroots}).`,
      };
    }
    if (fciNDet > maxFciDet) {
      return {
        estimate,
        withinLimits: false,
        limitReason: `FCI determinant space N_det = ${fciNDet.toLocaleString()} exceeds limit (${maxFciDet.toLocaleString()}). Select MP2/CISD, enable noble-core freezing, or choose a smaller basis.`,
      };
    }
  }
  if ((params.correlationMethod === "rcisd" || params.correlationMethod === "ucisd") && cisdDim !== null) {
    if (cisdDim > maxCisdDim) {
      return {
        estimate,
        withinLimits: false,
        limitReason: `CISD excitation vector dimension (${cisdDim.toLocaleString()}) exceeds limit (${maxCisdDim.toLocaleString()}).`,
      };
    }
  }

  return { estimate, withinLimits: true, limitReason: null };
}

export function validateReferenceAndMethodCompatibility(params: {
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly referenceMethod: CorrelationReferenceMethod | "atom-sph-avg";
  readonly correlationMethod: CorrelationMethodId;
  readonly frozenCoreMode: FrozenCoreMode;
}): { readonly valid: boolean; readonly reason?: string } {
  if (params.referenceMethod === "atom-sph-avg") {
    return {
      valid: false,
      reason:
        "AtomSphAverageRHF is a fractional-occupation spherical ensemble, not a canonical single determinant; it cannot be used as an MP2/CISD/FCI reference.",
    };
  }
  if (params.spin2S < 0 || params.spin2S > params.N || (params.N - params.spin2S) % 2 !== 0) {
    return {
      valid: false,
      reason: `Spin 2S=${params.spin2S} is incompatible with N=${params.N} electrons.`,
    };
  }
  if (params.referenceMethod === "rhf" && params.spin2S !== 0) {
    return {
      valid: false,
      reason: `Closed-shell RHF requires 2S=0 singlet spin (got 2S=${params.spin2S}). Select UHF or ROHF.`,
    };
  }
  if (params.referenceMethod === "rohf" && params.spin2S === 0) {
    return {
      valid: false,
      reason: "For closed-shell singlet (2S=0), select RHF rather than ROHF.",
    };
  }
  if (params.correlationMethod === "rmp2" && params.referenceMethod !== "rhf") {
    return { valid: false, reason: "RMP2 requires a closed-shell RHF reference." };
  }
  if (params.correlationMethod === "ump2" && params.referenceMethod !== "uhf") {
    return { valid: false, reason: "UMP2 requires a UHF reference." };
  }
  if (params.correlationMethod === "romp2" && params.referenceMethod !== "rohf") {
    return { valid: false, reason: "ROMP2 requires an open-shell ROHF (2S >= 1) reference." };
  }
  if (params.correlationMethod === "rcisd" && params.referenceMethod !== "rhf") {
    return {
      valid: false,
      reason: "RCISD requires a closed-shell RHF reference (PySCF has no spin-restricted open-shell ROCISD).",
    };
  }
  if (params.correlationMethod === "ucisd" && params.referenceMethod !== "uhf") {
    return {
      valid: false,
      reason:
        params.referenceMethod === "rohf"
          ? "PySCF does not implement spin-restricted ROCISD (ci.CISD(rohf) silently converts ROHF to UHF/UCISD). Select UHF for UCISD or ROHF+FCI."
          : "UCISD requires a UHF reference.",
    };
  }
  const core = params.frozenCoreMode === "noble-core" ? nobleCoreFrozenCount(params.Z) : 0;
  if (params.correlationMethod === "fci" && params.referenceMethod === "uhf" && core > 0) {
    return {
      valid: false,
      reason: "Frozen-core FCI (CASCI) requires a shared spatial-orbital reference (RHF or ROHF), not UHF.",
    };
  }
  return { valid: true };
}

export function allowedMethodsForReference(
  referenceMethod: CorrelationReferenceMethod | "atom-sph-avg",
): readonly CorrelationMethodId[] {
  switch (referenceMethod) {
    case "rhf":
      return ["rmp2", "rcisd", "fci"];
    case "uhf":
      return ["ump2", "ucisd", "fci"];
    case "rohf":
      return ["romp2", "fci"];
    case "atom-sph-avg":
      return [];
  }
}

export function buildCorrelationComparisonKey(params: {
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly basis: HFBasisId;
  readonly frozenCoreMode: FrozenCoreMode;
}): string {
  return `${params.Z}|${params.N}|${params.spin2S}|${params.basis}|${params.frozenCoreMode}`;
}
