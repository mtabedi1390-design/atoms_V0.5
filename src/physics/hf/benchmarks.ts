/**
 * Pinned Independent Multi-Electron Hartree–Fock Benchmarks (ATOMS v0.7.0).
 *
 * Authoritative independent references:
 *  1. Froese Fischer B-spline Numerical Atomic HF (`compas/sphf`, MIT license,
 *     test_all/out1..out8, Comput. Phys. Commun. 2011).
 *  2. Koga, Kanayama, Watanabe & Thakkar, Int. J. Quantum Chem. 71, 491 (1999) /
 *     Tatewaki & Koga (2005) — Roothaan/numerical non-relativistic point-nucleus HF limits.
 *  3. Exact fixed-nucleus non-relativistic 1-electron energies E = -Z²/2 Ha.
 *
 * Used strictly for validation, parity comparisons, and basis-set convergence tracking.
 */

export interface HFOrbitalBenchmark {
  readonly label: string;
  readonly energy_Ha: number;
}

export interface HFBenchmarkReference {
  readonly key: string;
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly speciesLabel: string;
  readonly configuration: string;
  readonly term: string;
  readonly methodNote: string;
  readonly hfLimit_Ha: number;
  readonly source: string;
  readonly licenseOrCitation: string;
  readonly orbitalEnergies_Ha?: readonly HFOrbitalBenchmark[];
}

export const HF_BENCHMARK_REFERENCES: readonly HFBenchmarkReference[] = [
  {
    key: "H:1:1",
    Z: 1,
    N: 1,
    spin2S: 1,
    speciesLabel: "H",
    configuration: "1s1",
    term: "2S",
    methodNote: "Exact analytical non-relativistic fixed-nucleus limit E = -1/2 Ha",
    hfLimit_Ha: -0.5,
    source: "Exact Schrödinger-Coulomb analytic limit",
    licenseOrCitation: "Analytical (-Z²/2 Ha)",
    orbitalEnergies_Ha: [{ label: "1s", energy_Ha: -0.5 }],
  },
  {
    key: "He+:2:1",
    Z: 2,
    N: 1,
    spin2S: 1,
    speciesLabel: "He+",
    configuration: "1s1",
    term: "2S",
    methodNote: "Exact analytical non-relativistic fixed-nucleus limit E = -Z²/2 = -2.0 Ha",
    hfLimit_Ha: -2.0,
    source: "Exact Schrödinger-Coulomb analytic limit",
    licenseOrCitation: "Analytical (-Z²/2 Ha)",
    orbitalEnergies_Ha: [{ label: "1s", energy_Ha: -2.0 }],
  },
  {
    key: "He:2:0",
    Z: 2,
    N: 2,
    spin2S: 0,
    speciesLabel: "He",
    configuration: "1s2",
    term: "1S",
    methodNote: "Closed-shell RHF / numerical B-spline HF limit",
    hfLimit_Ha: -2.861679995612,
    source: "compas/sphf test_all/out1 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf) · Koga et al. (1999): -2.8616800 Ha",
    orbitalEnergies_Ha: [{ label: "1s", energy_Ha: -0.91795556 }],
  },
  {
    key: "Li:3:1",
    Z: 3,
    N: 3,
    spin2S: 1,
    speciesLabel: "Li",
    configuration: "1s2 2s1",
    term: "2S",
    methodNote: "Restricted open-shell / spin-restricted HF limit (ROHF; UHF lies ~0.045 mHa lower)",
    hfLimit_Ha: -7.432726930728,
    source: "compas/sphf test_all/out2 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf) · Koga et al. (1999): -7.4327269 Ha",
    orbitalEnergies_Ha: [
      { label: "1s", energy_Ha: -2.477751 },
      { label: "2s", energy_Ha: -0.196323 },
    ],
  },
  {
    key: "Be:4:0",
    Z: 4,
    N: 4,
    spin2S: 0,
    speciesLabel: "Be",
    configuration: "1s2 2s2",
    term: "1S",
    methodNote: "Closed-shell RHF / numerical B-spline HF limit",
    hfLimit_Ha: -14.573023168313,
    source: "compas/sphf test_all/out4 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf) · Koga et al. (1999): -14.5730232 Ha",
    orbitalEnergies_Ha: [
      { label: "1s", energy_Ha: -4.73267 },
      { label: "2s", energy_Ha: -0.30927 },
    ],
  },
  {
    key: "B:5:1",
    Z: 5,
    N: 5,
    spin2S: 1,
    speciesLabel: "B",
    configuration: "1s2 2s2 2p1",
    term: "2P",
    methodNote: "Spherical restricted open-shell HF numerical limit (ROHF reference)",
    hfLimit_Ha: -24.5290607,
    source: "Koga, Kanayama, Watanabe & Thakkar (1999)",
    licenseOrCitation: "Int. J. Quantum Chem. 71, 491 (1999)",
  },
  {
    key: "C:6:2",
    Z: 6,
    N: 6,
    spin2S: 2,
    speciesLabel: "C",
    configuration: "1s2 2s2 2p2",
    term: "3P",
    methodNote: "ROHF single-configuration 3P HF limit (non-relativistic)",
    hfLimit_Ha: -37.688619,
    source: "Koga, Kanayama, Watanabe & Thakkar (1999)",
    licenseOrCitation: "Int. J. Quantum Chem. 71, 491 (1999)",
  },
  {
    key: "N:7:3",
    Z: 7,
    N: 7,
    spin2S: 3,
    speciesLabel: "N",
    configuration: "1s2 2s2 2p3",
    term: "4S",
    methodNote: "ROHF 4S HF limit (half-filled 2p3 spherical shell)",
    hfLimit_Ha: -54.4009342,
    source: "Koga, Kanayama, Watanabe & Thakkar (1999)",
    licenseOrCitation: "Int. J. Quantum Chem. 71, 491 (1999)",
  },
  {
    key: "O:8:2",
    Z: 8,
    N: 8,
    spin2S: 2,
    speciesLabel: "O",
    configuration: "1s2 2s2 2p4",
    term: "3P",
    methodNote: "ROHF 3P HF limit (non-relativistic)",
    hfLimit_Ha: -74.8093985,
    source: "Koga, Kanayama, Watanabe & Thakkar (1999)",
    licenseOrCitation: "Int. J. Quantum Chem. 71, 491 (1999)",
  },
  {
    key: "F:9:1",
    Z: 9,
    N: 9,
    spin2S: 1,
    speciesLabel: "F",
    configuration: "1s2 2s2 2p5",
    term: "2P",
    methodNote: "Numerical B-spline HF 2P limit",
    hfLimit_Ha: -99.409349386694,
    source: "compas/sphf test_all/out5 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf) · Koga et al. (1999): -99.4093494 Ha",
  },
  {
    key: "Ne:10:0",
    Z: 10,
    N: 10,
    spin2S: 0,
    speciesLabel: "Ne",
    configuration: "1s2 2s2 2p6",
    term: "1S",
    methodNote: "Closed-shell RHF numerical HF limit",
    hfLimit_Ha: -128.5470981,
    source: "Koga, Kanayama, Watanabe & Thakkar (1999)",
    licenseOrCitation: "Int. J. Quantum Chem. 71, 491 (1999)",
    orbitalEnergies_Ha: [
      { label: "1s", energy_Ha: -32.772443 },
      { label: "2s", energy_Ha: -1.930391 },
      { label: "2p", energy_Ha: -0.85041 },
    ],
  },
];

export function lookupHFBenchmark(Z: number, N: number, spin2S: number): HFBenchmarkReference | undefined {
  return HF_BENCHMARK_REFERENCES.find((b) => b.Z === Z && b.N === N && b.spin2S === spin2S);
}
