/**
 * Explicitly declared domain, presets, and support gating for ATOMS v0.7.1
 * Fixed-Orbital LS-Coupled Multiconfiguration CI.
 *
 * Never overclaims periodic-table or correlation coverage.
 */
import { elementByZ } from "@/data/elements";
import { getBasisCatalogEntry, isBasisSupportedForZ, type HFBasisId } from "@/physics/hf";
import { proposeAufbauConfiguration, proposeDefaultConfiguration } from "@/physics/hf/configurations";
import type { LSActiveSpaceMode, LSCapabilitiesResponse, SubshellOccupancySpec } from "./types";
import { computeConfigurationParity, formatConfigurationSpec, validateConfigurationSpec } from "./terms";

export const LS_CI_SUPPORTED_Z_MIN = 1;
export const LS_CI_SUPPORTED_Z_MAX = 30;
export const LS_CI_DEFAULT_LIMITS = {
  maxDeterminants: 12000,
  maxCsfs: 2500,
  denseDiagonalizationThreshold: 450,
  maxDenseMemoryMB: 256,
} as const;

export interface LSCuratedPreset {
  readonly id: string;
  readonly label: string;
  readonly Z: number;
  readonly N: number;
  readonly referenceConfiguration: readonly SubshellOccupancySpec[];
  readonly defaultTargetL: number;
  readonly defaultTargetSpin2S: number;
  readonly defaultBasis: HFBasisId;
  readonly defaultActiveMode: LSActiveSpaceMode;
  readonly note: string;
}

export const LS_CURATED_PRESETS: readonly LSCuratedPreset[] = [
  {
    id: "he-1s2",
    label: "He (1s²) ¹S",
    Z: 2,
    N: 2,
    referenceConfiguration: [{ n: 1, l: 0, q: 2 }],
    defaultTargetL: 0,
    defaultTargetSpin2S: 0,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-plus-virtuals",
    note: "2-electron singlet ground configuration; mixes 1s² + 2s² + 2p² + ... in ¹S_even",
  },
  {
    id: "li-2s",
    label: "Li (1s² 2s¹) ²S",
    Z: 3,
    N: 3,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 1 },
    ],
    defaultTargetL: 0,
    defaultTargetSpin2S: 1,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-plus-virtuals",
    note: "3-electron doublet ground state (1s² core + 2s/2p/3s valence-virtual space)",
  },
  {
    id: "li-2p",
    label: "Li (1s² 2p¹) ²P°",
    Z: 3,
    N: 3,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 1, q: 1 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 1,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-plus-virtuals",
    note: "First excited odd-parity doublet ²P° (compare Li I NIST ASD 2s→2p centroid)",
  },
  {
    id: "be-2s2",
    label: "Be (1s² 2s²) ¹S",
    Z: 4,
    N: 4,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
    ],
    defaultTargetL: 0,
    defaultTargetSpin2S: 0,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-plus-virtuals",
    note: "Classic strong 2s² + 2p² near-degeneracy correlation in ¹S_even",
  },
  {
    id: "b-2p",
    label: "B (1s² 2s² 2p¹) ²P°",
    Z: 5,
    N: 5,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 1 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 1,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "Open 2p¹ odd-parity doublet; valence CAS mixes 2s² 2p + 2p³",
  },
  {
    id: "c-2p2",
    label: "C (1s² 2s² 2p²) ³P / ¹D / ¹S",
    Z: 6,
    N: 6,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 2 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 2,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "Canonical 2p² multiplet splitting (³P, ¹D, ¹S); 1s² core + 2s/2p/3p valence CAS",
  },
  {
    id: "n-2p3",
    label: "N (1s² 2s² 2p³) ⁴S° / ²D° / ²P°",
    Z: 7,
    N: 7,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 3 },
    ],
    defaultTargetL: 0,
    defaultTargetSpin2S: 3,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "Half-filled 2p³ equivalent-electron Pauli multiplet (⁴S°, ²D°, ²P°)",
  },
  {
    id: "o-2p4",
    label: "O (1s² 2s² 2p⁴) ³P / ¹D / ¹S",
    Z: 8,
    N: 8,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 4 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 2,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "Particle-hole conjugate of 2p² (³P, ¹D, ¹S) with inverted fine-structure order in experiment",
  },
  {
    id: "f-2p5",
    label: "F (1s² 2s² 2p⁵) ²P°",
    Z: 9,
    N: 9,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 5 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 1,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "2p⁵ single-hole odd-parity doublet ²P°",
  },
  {
    id: "ne-2p6",
    label: "Ne (1s² 2s² 2p⁶) ¹S",
    Z: 10,
    N: 10,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 6 },
    ],
    defaultTargetL: 0,
    defaultTargetSpin2S: 0,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "single-config",
    note: "Closed-shell 2p⁶ ¹S reference",
  },
  {
    id: "b-plus-2s2",
    label: "B⁺ (1s² 2s²) ¹S (ion)",
    Z: 5,
    N: 4,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
    ],
    defaultTargetL: 0,
    defaultTargetSpin2S: 0,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-plus-virtuals",
    note: "Be-like cation B II; test 2s² → 2s2p ³P°/¹P° centroid splittings",
  },
  {
    id: "si-3p2",
    label: "Si ([Ne] 3s² 3p²) ³P / ¹D / ¹S",
    Z: 14,
    N: 14,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 6 },
      { n: 3, l: 0, q: 2 },
      { n: 3, l: 1, q: 2 },
    ],
    defaultTargetL: 1,
    defaultTargetSpin2S: 2,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "valence-cas",
    note: "Second-row 3p² analog (compare NIST Si I and ATSP2K published example 3s²3p²)",
  },
  {
    id: "ti2plus-3d2",
    label: "Ti²⁺ ([Ar] 3d²) ³F / ¹D / ³P / ¹G / ¹S",
    Z: 22,
    N: 20,
    referenceConfiguration: [
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 6 },
      { n: 3, l: 0, q: 2 },
      { n: 3, l: 1, q: 6 },
      { n: 3, l: 2, q: 2 },
    ],
    defaultTargetL: 3,
    defaultTargetSpin2S: 2,
    defaultBasis: "cc-pvdz",
    defaultActiveMode: "single-config",
    note: "Open 3d² ion demonstrating equivalent d-electron Pauli terms (³F, ¹D, ³P, ¹G, ¹S)",
  },
];

export function defaultLSConfigurationForSystem(Z: number, N: number): readonly SubshellOccupancySpec[] {
  const prop = N === Z ? proposeDefaultConfiguration(Z, N) : proposeAufbauConfiguration(N);
  return prop.subshells
    .map((s) => ({ n: s.n, l: s.l, q: s.alpha + s.beta }))
    .filter((s) => s.q > 0)
    .sort((a, b) => a.n - b.n || a.l - b.l);
}

export function assessLSCISupport(params: {
  readonly Z: number;
  readonly N: number;
  readonly basis: HFBasisId;
  readonly configuration: readonly SubshellOccupancySpec[];
  readonly capabilities?: LSCapabilitiesResponse | null;
}): { readonly supported: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];

  if (params.capabilities && !params.capabilities.available) {
    reasons.push(params.capabilities.blocker ?? "LS-CI Python backend is offline or not running.");
  }
  if (!Number.isInteger(params.Z) || params.Z < LS_CI_SUPPORTED_Z_MIN || params.Z > LS_CI_SUPPORTED_Z_MAX) {
    reasons.push(
      `Fixed-orbital LS-CI is validated for Z=${LS_CI_SUPPORTED_Z_MIN}..${LS_CI_SUPPORTED_Z_MAX} in v0.7.1 (got Z=${params.Z}).`,
    );
  }
  if (!Number.isInteger(params.N) || params.N < 2) {
    reasons.push(
      `LS multiconfiguration CI requires N >= 2 electrons (N=${params.N}; 1-electron ions are solved analytically in the Schrödinger/Dirac workspaces).`,
    );
  } else if (params.N > params.Z + 2) {
    reasons.push(
      `Highly charged anions N=${params.N} > Z+2 (${params.Z + 2}) are outside the validated Gaussian bound-state domain.`,
    );
  }

  const basisSupport = isBasisSupportedForZ(params.basis, params.Z);
  if (!basisSupport.supported) {
    reasons.push(
      basisSupport.reason ?? `Basis ${getBasisCatalogEntry(params.basis).label} does not cover Z=${params.Z}.`,
    );
  }

  const cfgVal = validateConfigurationSpec(params.configuration, params.N);
  if (!cfgVal.valid) {
    reasons.push(...cfgVal.issues.filter((i) => i.severity === "error").map((i) => i.message));
  }

  // Note high-l shell limitation in STO-3G / 6-31G etc.
  for (const s of params.configuration) {
    if (s.l > 2) {
      reasons.push(
        `Active f-shell or higher occupancy (${formatConfigurationSpec([s])}) is outside the s/p/d validated LS-CI solver domain in v0.7.1.`,
      );
    }
  }

  if (reasons.length === 0) {
    const el = elementByZ(params.Z);
    const { parity } = computeConfigurationParity(params.configuration);
    void el;
    void parity;
  }

  return {
    supported: reasons.length === 0,
    reasons,
  };
}
