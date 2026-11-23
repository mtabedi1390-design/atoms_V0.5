/**
 * Pinned Independent Atomic Term-Structure & LS-CI Benchmarks (ATOMS v0.7.1).
 *
 * Strictly distinguishes:
 *  1. Experimental NIST ASD evaluated J-resolved levels and (2J+1)-weighted term centroids
 *     (including fine-structure span and provenance).
 *  2. Published/executed CompAS `sphf` (MIT) single-configuration LS HF limits.
 *  3. Published `ATSP2K` (ADLY_v2_0, Comput. Phys. Commun. 176 (2007) 559) MCHF/CI examples.
 *
 * These are validation fixtures and UI comparison references ONLY — never substituted
 * for live calculations.
 */
import type { ConfigurationParity } from "./types";

const CM1_TO_EV = 1.2398419843320026e-4; // hc/(e*100) CODATA 2018
const CM1_TO_HA = 4.556335252912e-6; // 1 cm^-1 in Hartree (CODATA 2018)

export interface NISTJLevelEntry {
  readonly J: number;
  readonly energy_cm1: number;
}

export interface NISTTermCentroidReference {
  readonly key: string;
  readonly species: string;
  readonly Z: number;
  readonly N: number;
  readonly configuration: string;
  readonly termSymbol: string;
  readonly asciiTerm: string;
  readonly L: number;
  readonly spin2S: number;
  readonly parity: ConfigurationParity;
  readonly jLevels: readonly NISTJLevelEntry[];
  readonly centroid_cm1: number;
  readonly relativeToGroundCentroid_cm1: number;
  readonly relativeToGroundCentroid_eV: number;
  readonly relativeToGroundCentroid_Ha: number;
  readonly fineStructureSpan_cm1: number;
  readonly source: string;
  readonly notes: string;
}

function weightedCentroid(levels: readonly NISTJLevelEntry[]): number {
  let num = 0;
  let den = 0;
  for (const lv of levels) {
    const g = 2 * lv.J + 1;
    num += g * lv.energy_cm1;
    den += g;
  }
  return den > 0 ? num / den : 0;
}

function makeNistTerm(params: {
  key: string;
  species: string;
  Z: number;
  N: number;
  configuration: string;
  termSymbol: string;
  asciiTerm: string;
  L: number;
  spin2S: number;
  parity: ConfigurationParity;
  jLevels: readonly NISTJLevelEntry[];
  groundCentroid_cm1: number;
  source: string;
  notes: string;
}): NISTTermCentroidReference {
  const centroid = weightedCentroid(params.jLevels);
  const relCm1 = centroid - params.groundCentroid_cm1;
  const energies = params.jLevels.map((j) => j.energy_cm1);
  const span = Math.max(...energies) - Math.min(...energies);
  return {
    key: params.key,
    species: params.species,
    Z: params.Z,
    N: params.N,
    configuration: params.configuration,
    termSymbol: params.termSymbol,
    asciiTerm: params.asciiTerm,
    L: params.L,
    spin2S: params.spin2S,
    parity: params.parity,
    jLevels: params.jLevels,
    centroid_cm1: centroid,
    relativeToGroundCentroid_cm1: relCm1,
    relativeToGroundCentroid_eV: relCm1 * CM1_TO_EV,
    relativeToGroundCentroid_Ha: relCm1 * CM1_TO_HA,
    fineStructureSpan_cm1: span,
    source: params.source,
    notes: params.notes,
  };
}

// Ground centroids in cm^-1 relative to each species' J=ground level:
const C_I_GROUND_CENTROID = weightedCentroid([
  { J: 0, energy_cm1: 0.0 },
  { J: 1, energy_cm1: 16.417 },
  { J: 2, energy_cm1: 43.413 },
]);
const O_I_GROUND_CENTROID = weightedCentroid([
  { J: 2, energy_cm1: 0.0 },
  { J: 1, energy_cm1: 158.265 },
  { J: 0, energy_cm1: 226.977 },
]);
const SI_I_GROUND_CENTROID = weightedCentroid([
  { J: 0, energy_cm1: 0.0 },
  { J: 1, energy_cm1: 77.112 },
  { J: 2, energy_cm1: 223.157 },
]);

export const NIST_TERM_CENTROID_BENCHMARKS: readonly NISTTermCentroidReference[] = [
  // Li I (Z=3, N=3)
  makeNistTerm({
    key: "LiI:2S",
    species: "Li I",
    Z: 3,
    N: 3,
    configuration: "1s2 2s1",
    termSymbol: "²S",
    asciiTerm: "2S",
    L: 0,
    spin2S: 1,
    parity: "even",
    jLevels: [{ J: 0.5, energy_cm1: 0.0 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (Li I evaluated levels)",
    notes: "Ground term 2s ²S_1/2",
  }),
  makeNistTerm({
    key: "LiI:2Po",
    species: "Li I",
    Z: 3,
    N: 3,
    configuration: "1s2 2p1",
    termSymbol: "²P°",
    asciiTerm: "2Po",
    L: 1,
    spin2S: 1,
    parity: "odd",
    jLevels: [
      { J: 0.5, energy_cm1: 14903.622 },
      { J: 1.5, energy_cm1: 14903.957 },
    ],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (Li I evaluated levels)",
    notes: "2p ²P° (2J+1 weighted centroid across J=1/2, 3/2)",
  }),

  // Be I (Z=4, N=4)
  makeNistTerm({
    key: "BeI:1S",
    species: "Be I",
    Z: 4,
    N: 4,
    configuration: "1s2 2s2",
    termSymbol: "¹S",
    asciiTerm: "1S",
    L: 0,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 0, energy_cm1: 0.0 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (Be I evaluated levels)",
    notes: "Ground term 2s² ¹S_0",
  }),
  makeNistTerm({
    key: "BeI:3Po",
    species: "Be I",
    Z: 4,
    N: 4,
    configuration: "1s2 2s1 2p1",
    termSymbol: "³P°",
    asciiTerm: "3Po",
    L: 1,
    spin2S: 2,
    parity: "odd",
    jLevels: [
      { J: 0, energy_cm1: 21978.28 },
      { J: 1, energy_cm1: 21978.925 },
      { J: 2, energy_cm1: 21981.27 },
    ],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (Be I evaluated levels)",
    notes: "2s2p ³P° centroid across J=0,1,2",
  }),
  makeNistTerm({
    key: "BeI:1Po",
    species: "Be I",
    Z: 4,
    N: 4,
    configuration: "1s2 2s1 2p1",
    termSymbol: "¹P°",
    asciiTerm: "1Po",
    L: 1,
    spin2S: 0,
    parity: "odd",
    jLevels: [{ J: 1, energy_cm1: 42565.35 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (Be I evaluated levels)",
    notes: "2s2p ¹P°_1",
  }),

  // B II (B+ ion, Z=5, N=4)
  makeNistTerm({
    key: "BII:1S",
    species: "B II",
    Z: 5,
    N: 4,
    configuration: "1s2 2s2",
    termSymbol: "¹S",
    asciiTerm: "1S",
    L: 0,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 0, energy_cm1: 0.0 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (B II evaluated levels)",
    notes: "Ground term 2s² ¹S_0",
  }),
  makeNistTerm({
    key: "BII:3Po",
    species: "B II",
    Z: 5,
    N: 4,
    configuration: "1s2 2s1 2p1",
    termSymbol: "³P°",
    asciiTerm: "3Po",
    L: 1,
    spin2S: 2,
    parity: "odd",
    jLevels: [
      { J: 0, energy_cm1: 37336.04 },
      { J: 1, energy_cm1: 37342.15 },
      { J: 2, energy_cm1: 37358.3 },
    ],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (B II evaluated levels)",
    notes: "2s2p ³P° centroid across J=0,1,2",
  }),
  makeNistTerm({
    key: "BII:1Po",
    species: "B II",
    Z: 5,
    N: 4,
    configuration: "1s2 2s1 2p1",
    termSymbol: "¹P°",
    asciiTerm: "1Po",
    L: 1,
    spin2S: 0,
    parity: "odd",
    jLevels: [{ J: 1, energy_cm1: 73396.51 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (B II evaluated levels)",
    notes: "2s2p ¹P°_1",
  }),

  // C I (Z=6, N=6)
  makeNistTerm({
    key: "CI:3P",
    species: "C I",
    Z: 6,
    N: 6,
    configuration: "1s2 2s2 2p2",
    termSymbol: "³P",
    asciiTerm: "3P",
    L: 1,
    spin2S: 2,
    parity: "even",
    jLevels: [
      { J: 0, energy_cm1: 0.0 },
      { J: 1, energy_cm1: 16.417 },
      { J: 2, energy_cm1: 43.413 },
    ],
    groundCentroid_cm1: C_I_GROUND_CENTROID,
    source: "NIST ASD (C I evaluated levels)",
    notes: "Ground multiplet ³P (2J+1 centroid = 29.591 cm⁻¹ above J=0)",
  }),
  makeNistTerm({
    key: "CI:1D",
    species: "C I",
    Z: 6,
    N: 6,
    configuration: "1s2 2s2 2p2",
    termSymbol: "¹D",
    asciiTerm: "1D",
    L: 2,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 2, energy_cm1: 10192.657 }],
    groundCentroid_cm1: C_I_GROUND_CENTROID,
    source: "NIST ASD (C I evaluated levels)",
    notes: "2p² ¹D_2 excitation above ³P centroid = 10163.066 cm⁻¹ (1.26006 eV)",
  }),
  makeNistTerm({
    key: "CI:1S",
    species: "C I",
    Z: 6,
    N: 6,
    configuration: "1s2 2s2 2p2",
    termSymbol: "¹S",
    asciiTerm: "1S",
    L: 0,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 0, energy_cm1: 21648.03 }],
    groundCentroid_cm1: C_I_GROUND_CENTROID,
    source: "NIST ASD (C I evaluated levels)",
    notes: "2p² ¹S_0 excitation above ³P centroid = 21618.439 cm⁻¹ (2.68035 eV)",
  }),

  // N I (Z=7, N=7)
  makeNistTerm({
    key: "NI:4So",
    species: "N I",
    Z: 7,
    N: 7,
    configuration: "1s2 2s2 2p3",
    termSymbol: "⁴S°",
    asciiTerm: "4So",
    L: 0,
    spin2S: 3,
    parity: "odd",
    jLevels: [{ J: 1.5, energy_cm1: 0.0 }],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (N I evaluated levels)",
    notes: "Ground term 2p³ ⁴S°_3/2",
  }),
  makeNistTerm({
    key: "NI:2Do",
    species: "N I",
    Z: 7,
    N: 7,
    configuration: "1s2 2s2 2p3",
    termSymbol: "²D°",
    asciiTerm: "2Do",
    L: 2,
    spin2S: 1,
    parity: "odd",
    jLevels: [
      { J: 2.5, energy_cm1: 19224.464 },
      { J: 1.5, energy_cm1: 19233.177 },
    ],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (N I evaluated levels)",
    notes: "2p³ ²D° centroid (inverted J order) = 19227.949 cm⁻¹ (2.38396 eV)",
  }),
  makeNistTerm({
    key: "NI:2Po",
    species: "N I",
    Z: 7,
    N: 7,
    configuration: "1s2 2s2 2p3",
    termSymbol: "²P°",
    asciiTerm: "2Po",
    L: 1,
    spin2S: 1,
    parity: "odd",
    jLevels: [
      { J: 0.5, energy_cm1: 28838.92 },
      { J: 1.5, energy_cm1: 28839.306 },
    ],
    groundCentroid_cm1: 0.0,
    source: "NIST ASD (N I evaluated levels)",
    notes: "2p³ ²P° centroid = 28839.177 cm⁻¹ (3.57560 eV)",
  }),

  // O I (Z=8, N=8)
  makeNistTerm({
    key: "OI:3P",
    species: "O I",
    Z: 8,
    N: 8,
    configuration: "1s2 2s2 2p4",
    termSymbol: "³P",
    asciiTerm: "3P",
    L: 1,
    spin2S: 2,
    parity: "even",
    jLevels: [
      { J: 2, energy_cm1: 0.0 },
      { J: 1, energy_cm1: 158.265 },
      { J: 0, energy_cm1: 226.977 },
    ],
    groundCentroid_cm1: O_I_GROUND_CENTROID,
    source: "NIST ASD (O I evaluated levels)",
    notes: "Ground inverted triplet ³P (centroid = 77.975 cm⁻¹ above J=2)",
  }),
  makeNistTerm({
    key: "OI:1D",
    species: "O I",
    Z: 8,
    N: 8,
    configuration: "1s2 2s2 2p4",
    termSymbol: "¹D",
    asciiTerm: "1D",
    L: 2,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 2, energy_cm1: 15867.862 }],
    groundCentroid_cm1: O_I_GROUND_CENTROID,
    source: "NIST ASD (O I evaluated levels)",
    notes: "2p⁴ ¹D_2 above ³P centroid = 15789.887 cm⁻¹ (1.95770 eV)",
  }),
  makeNistTerm({
    key: "OI:1S",
    species: "O I",
    Z: 8,
    N: 8,
    configuration: "1s2 2s2 2p4",
    termSymbol: "¹S",
    asciiTerm: "1S",
    L: 0,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 0, energy_cm1: 33792.583 }],
    groundCentroid_cm1: O_I_GROUND_CENTROID,
    source: "NIST ASD (O I evaluated levels)",
    notes: "2p⁴ ¹S_0 above ³P centroid = 33714.608 cm⁻¹ (4.18008 eV)",
  }),

  // Si I (Z=14, N=14)
  makeNistTerm({
    key: "SiI:3P",
    species: "Si I",
    Z: 14,
    N: 14,
    configuration: "1s2 2s2 2p6 3s2 3p2",
    termSymbol: "³P",
    asciiTerm: "3P",
    L: 1,
    spin2S: 2,
    parity: "even",
    jLevels: [
      { J: 0, energy_cm1: 0.0 },
      { J: 1, energy_cm1: 77.112 },
      { J: 2, energy_cm1: 223.157 },
    ],
    groundCentroid_cm1: SI_I_GROUND_CENTROID,
    source: "NIST ASD (Si I evaluated levels)",
    notes: "Ground multiplet 3p² ³P (centroid = 149.680 cm⁻¹)",
  }),
  makeNistTerm({
    key: "SiI:1D",
    species: "Si I",
    Z: 14,
    N: 14,
    configuration: "1s2 2s2 2p6 3s2 3p2",
    termSymbol: "¹D",
    asciiTerm: "1D",
    L: 2,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 2, energy_cm1: 6298.847 }],
    groundCentroid_cm1: SI_I_GROUND_CENTROID,
    source: "NIST ASD (Si I evaluated levels)",
    notes: "3p² ¹D_2 above ³P centroid = 6149.167 cm⁻¹ (0.76240 eV)",
  }),
  makeNistTerm({
    key: "SiI:1S",
    species: "Si I",
    Z: 14,
    N: 14,
    configuration: "1s2 2s2 2p6 3s2 3p2",
    termSymbol: "¹S",
    asciiTerm: "1S",
    L: 0,
    spin2S: 0,
    parity: "even",
    jLevels: [{ J: 0, energy_cm1: 15394.362 }],
    groundCentroid_cm1: SI_I_GROUND_CENTROID,
    source: "NIST ASD (Si I evaluated levels)",
    notes: "3p² ¹S_0 above ³P centroid = 15244.682 cm⁻¹ (1.89010 eV)",
  }),
];

export interface ATSP2KPublishedExampleReference {
  readonly key: string;
  readonly species: string;
  readonly Z: number;
  readonly N: number;
  readonly configuration: string;
  readonly termSymbol: string;
  readonly totalEnergy_Ha: number;
  readonly source: string;
  readonly notes: string;
}

export const ATSP2K_PUBLISHED_REFERENCES: readonly ATSP2KPublishedExampleReference[] = [
  {
    key: "ATSP2K:Si:3P",
    species: "Si",
    Z: 14,
    N: 14,
    configuration: "3s2 3p2",
    termSymbol: "³P",
    totalEnergy_Ha: -288.935678169,
    source: "ATSP2K ADLY_v2_0 examples/output/e1/3Pe1.14_4.l (CPC 176 (2007) 559)",
    notes: "239-CSF MCHF/CI J=0 nonrelativistic + Breit-Pauli benchmark output",
  },
  {
    key: "ATSP2K:Si:1D",
    species: "Si",
    Z: 14,
    N: 14,
    configuration: "3s2 3p2",
    termSymbol: "¹D",
    totalEnergy_Ha: -288.906052812,
    source: "ATSP2K ADLY_v2_0 examples/output/e1/1De1.14_4.l (CPC 176 (2007) 559)",
    notes: "239-CSF MCHF/CI ¹D_2 nonrelativistic + Breit-Pauli benchmark output",
  },
  {
    key: "ATSP2K:Si:1S",
    species: "Si",
    Z: 14,
    N: 14,
    configuration: "3s2 3p2",
    termSymbol: "¹S",
    totalEnergy_Ha: -288.86315893,
    source: "ATSP2K ADLY_v2_0 examples/output/e1/1Se1.14_4.l (CPC 176 (2007) 559)",
    notes: "239-CSF MCHF/CI ¹S_0 nonrelativistic + Breit-Pauli benchmark output",
  },
];

export function lookupNISTBenchmarksForSystem(Z: number, N: number): readonly NISTTermCentroidReference[] {
  return NIST_TERM_CENTROID_BENCHMARKS.filter((b) => b.Z === Z && b.N === N);
}

export function lookupNISTTermCentroid(
  Z: number,
  N: number,
  L: number,
  spin2S: number,
  parity: ConfigurationParity,
): NISTTermCentroidReference | undefined {
  return NIST_TERM_CENTROID_BENCHMARKS.find(
    (b) => b.Z === Z && b.N === N && b.L === L && b.spin2S === spin2S && b.parity === parity,
  );
}
