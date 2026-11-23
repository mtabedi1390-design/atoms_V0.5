/**
 * Pure TypeScript domain and transport contracts for ATOMS v0.7.1
 * Atomic Term Structure & Fixed-Orbital LS-Coupled Multiconfiguration CI.
 *
 * Zero dependencies on React, Three.js, DOM, or Node-only built-ins.
 * All structures are structured-clone-safe across Web Worker boundaries.
 */
import type { HFBasisId } from "@/physics/hf";

export type ConfigurationParity = "even" | "odd";

export type LSCFOrbitalSource = "atom-sph-avg-hf";
export type LSCIMethod = "fixed-orbital-ls-ci";
export type LSActiveSpaceMode = "single-config" | "valence-cas" | "valence-plus-virtuals" | "custom-configs";

export interface SubshellOccupancySpec {
  readonly n: number;
  readonly l: number;
  readonly q: number;
}

export interface LSTermCandidate {
  readonly L: number;
  readonly S: number;
  readonly spin2S: number;
  readonly multiplicity: number;
  readonly lLetter: string;
  readonly parity: ConfigurationParity;
  readonly parityValue: 1 | -1;
  readonly termSymbol: string;
  readonly asciiTermSymbol: string;
  readonly count: number;
  readonly seniorities: readonly number[];
  readonly parentages: readonly string[];
  /** Allowed LS coupling values |L-S|..L+S. Spin-orbit splittings are NOT computed in v0.7.1. */
  readonly allowedJValues: readonly number[];
}

export interface ConfigurationAnalysis {
  readonly normalizedSubshells: readonly SubshellOccupancySpec[];
  readonly label: string;
  readonly asciiLabel: string;
  readonly totalElectrons: number;
  readonly parity: ConfigurationParity;
  readonly parityValue: 1 | -1;
  readonly openShellCount: number;
  readonly totalMicrostates: number;
  readonly terms: readonly LSTermCandidate[];
}

export interface LSCIRequest {
  readonly Z: number;
  readonly N: number;
  readonly basis: HFBasisId;
  readonly referenceConfiguration: readonly SubshellOccupancySpec[];
  readonly targetL: number;
  readonly targetSpin2S: number;
  readonly targetParity: ConfigurationParity;
  readonly activeSpaceMode: LSActiveSpaceMode;
  readonly frozenCoreSubshells?: readonly SubshellOccupancySpec[];
  readonly activeShells?: readonly { readonly n: number; readonly l: number }[];
  readonly customConfigurations?: readonly (readonly SubshellOccupancySpec[])[];
  readonly maxExcitationRank?: number;
  readonly nRoots?: number;
  readonly crossCheckPyscfFci?: boolean;
  readonly referenceVectorSignature?: string;
}

export interface LSCapabilitiesResponse {
  readonly available: boolean;
  readonly blocker?: string;
  readonly probeDetails?: readonly string[];
  readonly pythonExecutable?: string;
  readonly method: LSCIMethod;
  readonly orbitalSource: LSCFOrbitalSource;
  readonly orbitalOptimizationSupported: false;
  readonly orbitalOptimizationNote: string;
  readonly engine?: {
    readonly name: string;
    readonly version: string;
    readonly pyscfVersion: string;
    readonly pyscfLicense: string;
    readonly bseVersion: string;
    readonly numpyVersion: string;
    readonly scipyVersion: string;
  };
  readonly supportedZRange: readonly [number, number];
  readonly limits: {
    readonly maxDeterminants: number;
    readonly maxCsfs: number;
    readonly denseDiagonalizationThreshold: number;
    readonly maxDenseMemoryMB: number;
  };
  readonly runtime?: {
    readonly executionMode: "full-local-scientific";
    readonly bindHost: string;
    readonly port: number;
    readonly nodeVersion: string;
    readonly pid: number;
  };
}

export interface LSCSFDescriptor {
  readonly index: number;
  readonly configuration: string;
  readonly parentage: string;
  readonly determinantCount: number;
  readonly dominantDeterminantAmplitude: number;
}

export interface LSCSFContribution {
  readonly csfIndex: number;
  readonly configuration: string;
  readonly parentage: string;
  readonly coefficient: number;
  readonly weight: number;
}

export interface LSRootOperatorDiagnostics {
  readonly lSquared: number;
  readonly lSquaredExact: number;
  readonly lSquaredError: number;
  readonly lSquaredVariance: number;
  readonly sSquared: number;
  readonly sSquaredExact: number;
  readonly sSquaredError: number;
  readonly sSquaredVariance: number;
  readonly parity: ConfigurationParity;
  readonly parityValue: 1 | -1;
  readonly purityStatus: "pure-ls-eigenstate" | "near-degenerate-mixed" | "symmetry-warning";
  readonly ambiguityNote: string | null;
}

export interface LSCIRootResult {
  readonly rootIndex: number;
  readonly termSymbol: string;
  readonly asciiTermSymbol: string;
  readonly L: number;
  readonly S: number;
  readonly spin2S: number;
  readonly multiplicity: number;
  readonly parity: ConfigurationParity;
  readonly allowedJValues: readonly number[];
  readonly fineStructureNote: string;
  readonly energy_Ha: number;
  readonly energy_eV: number;
  readonly relativeToLowest_Ha: number;
  readonly relativeToLowest_eV: number;
  readonly relativeToLowest_cm1: number;
  readonly referenceConfigurationWeight: number;
  readonly dominantConfiguration: string;
  readonly dominantParentage: string;
  readonly mixingSummary: string;
  readonly topCSFs: readonly LSCSFContribution[];
  readonly operatorDiagnostics: LSRootOperatorDiagnostics;
  readonly solverResidualNorm: number;
}

export interface LSOrbitalShellInfo {
  readonly n: number;
  readonly l: number;
  readonly label: string;
  readonly energy_Ha: number;
  readonly avgOccupation: number;
  readonly role: "frozen-core" | "active" | "virtual-unused";
  readonly shellDegeneracySplit_Ha: number;
  readonly maxAngularMixing: number;
}

export interface LSCrossCheckResult {
  readonly performed: boolean;
  readonly oracle: string;
  readonly matchedEigenvalue_Ha: number | null;
  readonly energyDifference_Ha: number | null;
  readonly passed: boolean;
  readonly note: string;
}

export interface LSCIResourceEstimate {
  readonly activeElectrons: number;
  readonly activeSpatialOrbitals: number;
  readonly determinantCount: number;
  readonly csfCount: number;
  readonly configurationCount: number;
  readonly estimatedDenseMemoryMB: number;
  readonly solverAlgorithm: "scipy-linalg-eigh" | "scipy-sparse-eigsh-lanczos";
}

export interface LSCIResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly errorType?: string;
  readonly code?: string;
  readonly method: LSCIMethod;
  readonly methodLabel: string;
  readonly orbitalOptimizationPerformed: false;
  readonly orbitalSource: {
    readonly kind: LSCFOrbitalSource;
    readonly description: string;
    readonly converged: boolean;
    readonly sphAvgEnergy_Ha: number;
    readonly complexOrthonormalityError: number;
    readonly maxAngularMixingError: number;
    readonly maxShellAlignmentError: number;
    readonly shells: readonly LSOrbitalShellInfo[];
  };
  readonly system: {
    readonly Z: number;
    readonly symbol: string;
    readonly N: number;
    readonly charge: number;
  };
  readonly basis: HFBasisId;
  readonly basisSource: string;
  readonly symmetryBlock: {
    readonly L: number;
    readonly S: number;
    readonly spin2S: number;
    readonly multiplicity: number;
    readonly parity: ConfigurationParity;
    readonly parityValue: 1 | -1;
    readonly termSymbol: string;
    readonly asciiTermSymbol: string;
    readonly allowedJValues: readonly number[];
  };
  readonly activeSpace: {
    readonly mode: LSActiveSpaceMode;
    readonly frozenCore: string;
    readonly activeShellsLabel: string;
    readonly configurations: readonly string[];
    readonly configurationCount: number;
    readonly frozenCoreEnergy_Ha: number;
    readonly effectiveIntegralMaxImag: number;
  };
  readonly csfDiagnostics: {
    readonly determinantCount: number;
    readonly csfCount: number;
    readonly csfOrthonormalityError: number;
    readonly csfMaxLSNullspaceResidual: number;
    readonly csfMinNonZeroGap: number | null;
    readonly hamiltonianHermiticityError: number;
    readonly csfs: readonly LSCSFDescriptor[];
  };
  readonly resources: LSCIResourceEstimate;
  readonly roots: readonly LSCIRootResult[];
  readonly pyscfFciCrossCheck: LSCrossCheckResult;
  readonly rootTrackingNote: string;
  readonly runtime: {
    readonly engine: string;
    readonly engineVersion: string;
    readonly setupMs: number;
    readonly csfMs: number;
    readonly ciMs: number;
    readonly totalMs: number;
    readonly peakMemoryMB: number;
  };
}

export interface LSTransport {
  getCapabilities(signal?: AbortSignal): Promise<LSCapabilitiesResponse>;
  calculate(request: LSCIRequest, signal?: AbortSignal): Promise<LSCIResponse>;
}
