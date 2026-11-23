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

export type HFBenchmarkComparableAnsatz =
  | "exact-1e"
  | "rhf-closed-shell"
  | "rohf-high-spin-det-ls-match"
  | "sphf-term-resolved";

export interface HFBenchmarkReference {
  readonly key: string;
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly speciesLabel: string;
  readonly configuration: string;
  /** External benchmark LS term (NOT inferred by PySCF single-determinant HF). */
  readonly referenceTerm: string;
  readonly comparableAnsatz: HFBenchmarkComparableAnsatz;
  readonly methodNote: string;
  readonly hfLimit_Ha: number;
  readonly source: string;
  readonly licenseOrCitation: string;
  readonly averageOfConfiguration_Ha?: number;
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
    referenceTerm: "2S (exact 1e)",
    comparableAnsatz: "exact-1e",
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
    referenceTerm: "2S (exact 1e)",
    comparableAnsatz: "exact-1e",
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
    referenceTerm: "1S (closed shell)",
    comparableAnsatz: "rhf-closed-shell",
    methodNote: "Closed-shell RHF numerical B-spline HF limit (directly built & executed compas/sphf 913991f)",
    hfLimit_Ha: -2.861679995612,
    source: "compas/sphf direct execution & test_all/out1 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf commit 913991f, gfortran 12.3.0) · Koga et al. (1999): -2.8616800 Ha",
    orbitalEnergies_Ha: [{ label: "1s", energy_Ha: -0.91795556 }],
  },
  {
    key: "Li:3:1",
    Z: 3,
    N: 3,
    spin2S: 1,
    speciesLabel: "Li",
    configuration: "1s2 2s1",
    referenceTerm: "2S (spherical 2s1)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote:
      "Spherical ROHF numerical B-spline limit (directly executed compas/sphf 913991f; UHF lies ~0.045 mHa lower via core spin polarization; AtomSphAverageRHF uses spin-unpolarized 2s^{0.5,0.5})",
    hfLimit_Ha: -7.432726930728,
    source: "compas/sphf direct execution & test_all/out2 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf commit 913991f, gfortran 12.3.0) · Koga et al. (1999): -7.4327269 Ha",
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
    referenceTerm: "1S (closed shell)",
    comparableAnsatz: "rhf-closed-shell",
    methodNote: "Closed-shell RHF numerical B-spline HF limit (directly executed compas/sphf 913991f)",
    hfLimit_Ha: -14.573023168313,
    source: "compas/sphf direct execution & test_all/out4 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf commit 913991f, gfortran 12.3.0) · Koga et al. (1999): -14.5730232 Ha",
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
    referenceTerm: "2P (non-relativistic term)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote:
      "SPHF central-field 2P numerical limit (directly executed compas/sphf 913991f). Real-harmonic ROHF |2pz> gives anisotropic density with identical single-det 2P expectation value.",
    hfLimit_Ha: -24.529060728524,
    source: "compas/sphf direct execution (B 2P 5., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -24.5290607 Ha",
  },
  {
    key: "C:6:2",
    Z: 6,
    N: 6,
    spin2S: 2,
    speciesLabel: "C",
    configuration: "1s2 2s2 2p2",
    referenceTerm: "3P (non-relativistic term)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote:
      "SPHF term-resolved 3P limit (-37.688618963 Ha; average-of-configuration SPHF AV = -37.659698065 Ha). ROHF |2pz α 2px α> is an anisotropic determinant whose expectation energy converges to the 3P limit; AtomSphAverageRHF is a spin-unpolarized ensemble (~-37.34 Ha).",
    hfLimit_Ha: -37.688618962962,
    averageOfConfiguration_Ha: -37.659698064875,
    source: "compas/sphf direct execution (C 3P / C AV 6., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -37.6886190 Ha",
  },
  {
    key: "N:7:3",
    Z: 7,
    N: 7,
    spin2S: 3,
    speciesLabel: "N",
    configuration: "1s2 2s2 2p3",
    referenceTerm: "4S (half-filled 2p3)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote: "SPHF 4S / spherical half-filled 2p3 ROHF limit (directly executed compas/sphf 913991f)",
    hfLimit_Ha: -54.400934208503,
    source: "compas/sphf direct execution (N 4S 7., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -54.4009342 Ha",
  },
  {
    key: "O:8:2",
    Z: 8,
    N: 8,
    spin2S: 2,
    speciesLabel: "O",
    configuration: "1s2 2s2 2p4",
    referenceTerm: "3P (non-relativistic term)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote:
      "SPHF 3P numerical limit (directly executed compas/sphf 913991f). Real-harmonic ROHF |2pz² 2px 2py> is anisotropic with the 3P determinant expectation value.",
    hfLimit_Ha: -74.809398470001,
    source: "compas/sphf direct execution (O 3P 8., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -74.8093985 Ha",
  },
  {
    key: "F:9:1",
    Z: 9,
    N: 9,
    spin2S: 1,
    speciesLabel: "F",
    configuration: "1s2 2s2 2p5",
    referenceTerm: "2P (non-relativistic term)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote: "SPHF 2P numerical B-spline HF limit (directly executed compas/sphf 913991f)",
    hfLimit_Ha: -99.409349386693,
    source: "compas/sphf direct execution & test_all/out5 (Froese Fischer B-spline HF)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -99.4093494 Ha",
  },
  {
    key: "Ne:10:0",
    Z: 10,
    N: 10,
    spin2S: 0,
    speciesLabel: "Ne",
    configuration: "1s2 2s2 2p6",
    referenceTerm: "1S (closed shell)",
    comparableAnsatz: "rhf-closed-shell",
    methodNote: "Closed-shell RHF numerical B-spline HF limit (directly executed compas/sphf 913991f)",
    hfLimit_Ha: -128.54709810935,
    source: "compas/sphf direct execution (Ne 1S 10., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f) · Koga et al. (1999): -128.5470981 Ha",
    orbitalEnergies_Ha: [
      { label: "1s", energy_Ha: -32.772443 },
      { label: "2s", energy_Ha: -1.930391 },
      { label: "2p", energy_Ha: -0.85041 },
    ],
  },
  {
    key: "Cr:24:6",
    Z: 24,
    N: 24,
    spin2S: 6,
    speciesLabel: "Cr",
    configuration: "1s2 2s2 2p6 3s2 3p6 3d5 4s1",
    referenceTerm: "7S (half-filled 3d5 4s1)",
    comparableAnsatz: "rohf-high-spin-det-ls-match",
    methodNote:
      "SPHF 7S high-spin half-filled 3d5 4s1 numerical HF limit (directly executed compas/sphf 913991f). Aufbau 3d4 4s2 (2S=4) is higher in energy.",
    hfLimit_Ha: -1043.356376285607,
    source: "compas/sphf direct execution (Cr 7S 24., gfortran 12.3.0)",
    licenseOrCitation: "MIT (compas/sphf 913991f, Froese Fischer B-spline HF)",
  },
];

export function lookupHFBenchmark(Z: number, N: number, spin2S: number): HFBenchmarkReference | undefined {
  return HF_BENCHMARK_REFERENCES.find((b) => b.Z === Z && b.N === N && b.spin2S === spin2S);
}
