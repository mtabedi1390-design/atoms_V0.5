/**
 * Reference Electron Correlation Benchmarks measured with PySCF 2.15.1 + BSE 0.12
 * (C1 symmetry, non-relativistic point-infinite-mass nucleus, ATOMS v0.7.2).
 */
import type { HFBasisId } from "@/physics/hf";
import type { CorrelationMethodId, CorrelationReferenceMethod, FrozenCoreMode } from "./types";

export interface CorrelationBenchmarkPreset {
  readonly id: string;
  readonly label: string;
  readonly Z: number;
  readonly symbol: string;
  readonly N: number;
  readonly spin2S: number;
  readonly basis: HFBasisId;
  readonly referenceMethod: CorrelationReferenceMethod;
  readonly correlationMethod: CorrelationMethodId;
  readonly frozenCoreMode: FrozenCoreMode;
  readonly expectedHf_Ha: number;
  readonly expectedCorr_Ha: number;
  readonly expectedTotal_Ha: number;
  readonly note: string;
}

export const CORRELATION_BENCHMARKS: readonly CorrelationBenchmarkPreset[] = [
  {
    id: "he-ccpvdz-rmp2",
    label: "He (cc-pVDZ) · RHF/RMP2",
    Z: 2,
    symbol: "He",
    N: 2,
    spin2S: 0,
    basis: "cc-pvdz",
    referenceMethod: "rhf",
    correlationMethod: "rmp2",
    frozenCoreMode: "none",
    expectedHf_Ha: -2.8551604772,
    expectedCorr_Ha: -0.0258283396,
    expectedTotal_Ha: -2.8809888169,
    note: "Closed-shell 2-electron RMP2 recovers ~79.6% of the cc-pVDZ correlation energy.",
  },
  {
    id: "he-ccpvdz-fci",
    label: "He (cc-pVDZ) · RHF/FCI (= RCISD)",
    Z: 2,
    symbol: "He",
    N: 2,
    spin2S: 0,
    basis: "cc-pvdz",
    referenceMethod: "rhf",
    correlationMethod: "fci",
    frozenCoreMode: "none",
    expectedHf_Ha: -2.8551604772,
    expectedCorr_Ha: -0.0324343538,
    expectedTotal_Ha: -2.8875948311,
    note: "Exact 2-electron limit inside cc-pVDZ (RCISD equals FCI to machine precision).",
  },
  {
    id: "li-ccpvdz-romp2",
    label: "Li (cc-pVDZ) · ROHF/ROMP2",
    Z: 3,
    symbol: "Li",
    N: 3,
    spin2S: 1,
    basis: "cc-pvdz",
    referenceMethod: "rohf",
    correlationMethod: "romp2",
    frozenCoreMode: "none",
    expectedHf_Ha: -7.4324198797,
    expectedCorr_Ha: -0.0001935521,
    expectedTotal_Ha: -7.4326134318,
    note: "Open-shell semi-canonicalized ROMP2 with nonzero singles contribution (e_corr_singles ≈ -5.89e-7 Ha).",
  },
  {
    id: "be-ccpvdz-rcisd",
    label: "Be (cc-pVDZ) · RHF/RCISD (all-electron)",
    Z: 4,
    symbol: "Be",
    N: 4,
    spin2S: 0,
    basis: "cc-pvdz",
    referenceMethod: "rhf",
    correlationMethod: "rcisd",
    frozenCoreMode: "none",
    expectedHf_Ha: -14.5723376310,
    expectedCorr_Ha: -0.0450181567,
    expectedTotal_Ha: -14.6173557877,
    note: "Shows 2s²/2p² near-degeneracy; RCISD lies ~5.4e-5 Ha above all-electron FCI (-14.61740951 Ha).",
  },
  {
    id: "b-ccpvdz-rohf-fc-fci",
    label: "B (cc-pVDZ) · ROHF/FCI (frozen 1s² core)",
    Z: 5,
    symbol: "B",
    N: 5,
    spin2S: 1,
    basis: "cc-pvdz",
    referenceMethod: "rohf",
    correlationMethod: "fci",
    frozenCoreMode: "noble-core",
    expectedHf_Ha: -24.5265909060,
    expectedCorr_Ha: -0.0631666740,
    expectedTotal_Ha: -24.5897575800,
    note: "3 valence electrons in 13 active orbitals via CASCI(3, 13) with fix_spin_ (<S²> = 0.750000).",
  },
  {
    id: "ne-ccpvdz-rmp2",
    label: "Ne (cc-pVDZ) · RHF/RMP2 (non-variational)",
    Z: 10,
    symbol: "Ne",
    N: 10,
    spin2S: 0,
    basis: "cc-pvdz",
    referenceMethod: "rhf",
    correlationMethod: "rmp2",
    frozenCoreMode: "none",
    expectedHf_Ha: -128.4887755517,
    expectedCorr_Ha: -0.1875671856,
    expectedTotal_Ha: -128.6763427373,
    note: "RMP2 correlation (-0.18757 Ha) slightly overshoots RCISD (-0.18665 Ha); FCI N_det = 4,008,004 is blocked pre-allocation.",
  },
];
