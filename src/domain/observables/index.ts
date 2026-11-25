/**
 * Typed observables, numerical quality, and scientific provenance metadata contracts (ATOMS v0.6.0).
 * Zero dependency on React or Three.js.
 */
import type { EvidenceClass } from "@/science/providers";
import type { ConstantsVersion, UncertaintyBudget } from "@/physics/units";

export type ProviderCapability =
  | "bound-energy"
  | "total-energy"
  | "radial-wavefunction"
  | "spinor-wavefunction"
  | "spatial-density"
  | "total-spherical-density"
  | "radial-probability"
  | "expectation-values"
  | "fine-structure"
  | "e1-transitions"
  | "spectroscopy"
  | "multi-electron-hf"
  | "orbital-resolved-hf"
  | "spin-density"
  | "scf-diagnostics"
  | "ls-term-ci"
  | "ls-term-enumeration"
  | "electron-correlation"
  | "mp2-perturbation"
  | "cisd-ci"
  | "full-ci";

export type ObservableKind = ProviderCapability;

export interface NumericalQuality {
  readonly method: string;
  readonly gridPoints?: number;
  readonly radialTailMass?: number;
  readonly integratedNorm?: number;
  readonly relativeChargeError?: number;
  readonly tolerances?: Readonly<Record<string, number>>;
}

export interface ScientificProvenance {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly modelName: string;
  readonly hamiltonian: string;
  readonly constantsVersion: ConstantsVersion;
  readonly evidenceClass: EvidenceClass;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly numericalQuality: NumericalQuality;
  readonly uncertainty: UncertaintyBudget;
  readonly sourceCitation?: string;
  readonly license?: string;
}
