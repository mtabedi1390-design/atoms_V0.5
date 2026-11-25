/**
 * Pure TypeScript domain and transport contracts for ATOMS v0.7.2
 * Post-Hartree–Fock Electron Correlation (MP2, CISD, FCI).
 *
 * Zero dependencies on React, Three.js, DOM, or Node-only built-ins.
 * All structures are structured-clone-safe across Web Worker boundaries.
 */
import type { HFBasisId, HFSCFOptions } from "@/physics/hf";

export type CorrelationReferenceMethod = "rhf" | "uhf" | "rohf";
export type CorrelationMethodId = "rmp2" | "ump2" | "romp2" | "rcisd" | "ucisd" | "fci";
export type FrozenCoreMode = "none" | "noble-core";

export interface CorrelationOptions {
  readonly convTol?: number;
  readonly maxCycle?: number;
  readonly spinShift?: number;
}

export interface CorrelationCalculateRequest {
  readonly action?: "calculate" | "estimate";
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly basis: HFBasisId;
  readonly referenceMethod: CorrelationReferenceMethod;
  readonly correlationMethod: CorrelationMethodId;
  readonly frozenCoreMode: FrozenCoreMode;
  readonly nRoots?: number;
  readonly fixSpin?: boolean;
  readonly scfOptions?: HFSCFOptions;
  readonly correlationOptions?: CorrelationOptions;
}

export interface CorrelationResourceEstimate {
  readonly nSpatialOrbitals: number;
  readonly frozenOrbitals: number;
  readonly activeSpatialOrbitals: number;
  readonly nAlphaTotal: number;
  readonly nBetaTotal: number;
  readonly nAlphaActive: number;
  readonly nBetaActive: number;
  readonly nVirtualAlpha: number;
  readonly nVirtualBeta: number;
  readonly fciDeterminantCount: number;
  readonly fciDeterminantLimit: number;
  readonly cisdAmplitudeDimension: number | null;
  readonly cisdAmplitudeLimit: number;
  readonly nRoots: number;
  readonly nRootsLimit: number;
  readonly estimatedMemoryMB: number;
  readonly referenceMethod: CorrelationReferenceMethod | string;
  readonly correlationMethod: CorrelationMethodId | string;
}

export interface CorrelationMethodCapability {
  readonly available: boolean;
  readonly pyscfClass?: string;
  readonly supportedReferences?: readonly CorrelationReferenceMethod[];
  readonly fixSpinReferences?: readonly CorrelationReferenceMethod[];
  readonly smokeBenchmark?: string;
  readonly reason?: string;
}

export interface CorrelationReferenceCompatibilityEntry {
  readonly supported: boolean;
  readonly allowedMethods: readonly CorrelationMethodId[];
  readonly requiresSinglet?: boolean;
  readonly requiresOpenShell?: boolean;
  readonly spinPure?: boolean;
  readonly fractionalOccupation?: boolean;
  readonly fciFixSpinSupported?: boolean;
  readonly fciFrozenCoreSupported?: boolean;
  readonly disabledMethods?: Readonly<Record<string, string>>;
  readonly note?: string;
  readonly reason?: string;
}

export interface CorrelationCapabilitiesResponse {
  readonly available: boolean;
  readonly blocker?: string;
  readonly probeDetails?: readonly string[];
  readonly pythonExecutable?: string;
  readonly engine?: {
    readonly name: string;
    readonly version: string;
    readonly license: string;
    readonly libcintLib: string;
    readonly numpyVersion: string;
    readonly scipyVersion: string;
    readonly bseVersion: string;
    readonly bseLicense: string;
  };
  readonly methods?: Readonly<Partial<Record<CorrelationMethodId, CorrelationMethodCapability>>>;
  readonly referenceCompatibility?: Readonly<Record<string, CorrelationReferenceCompatibilityEntry>>;
  readonly resourceLimits?: {
    readonly maxFciDeterminants: number;
    readonly maxCisdAmplitudes: number;
    readonly maxFciNroots: number;
    readonly maxCorrelationOrbitals: number;
  };
  readonly bases?: readonly {
    readonly id: HFBasisId;
    readonly label: string;
    readonly bseName: string;
    readonly elements: readonly number[];
  }[];
  readonly smokeNotes?: readonly string[];
  readonly runtime?: {
    readonly executionMode: "full-local-scientific";
    readonly bindHost: string;
    readonly port: number;
    readonly nodeVersion: string;
    readonly pid: number;
  };
}

export interface CorrelationDenominatorDiagnostics {
  readonly available: boolean;
  readonly minSingleGap_Ha: number | null;
  readonly minDoubleGap_Ha: number | null;
  readonly nearDegenerate: boolean;
  readonly reason?: string;
  readonly warnings: readonly string[];
}

export interface CorrelationSpinDiagnostics {
  readonly available: boolean;
  readonly sSquared: number | null;
  readonly sSquaredExact: number | null;
  readonly spinContamination: number | null;
  readonly multiplicity: number | null;
  readonly spinPure: boolean;
  readonly spinStatus?: "spin-pure" | "unresolved-or-contaminated";
  readonly fixSpinApplied?: boolean;
  readonly spinShift?: number | null;
  readonly lSquaredAvailable?: false;
  readonly lSquared?: null;
  readonly lSquaredUnavailableReason?: string;
  readonly note?: string;
  readonly unavailableReason?: string;
}

export interface CorrelationFCIRoot {
  readonly rootIndex: number;
  readonly eTotal_Ha: number;
  readonly eTotal_eV: number;
  readonly eCorr_Ha: number;
  readonly excitation_Ha: number;
  readonly excitation_eV: number;
  readonly sSquared: number;
  readonly sSquaredExact: number;
  readonly spinError: number;
  readonly multiplicity: number;
  readonly spinPure: boolean;
  readonly spinStatus: "spin-pure" | "unresolved-or-contaminated";
}

export interface CorrelationCalculationResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly errorType?: string;
  readonly code?: string;
  readonly resourceEstimate?: CorrelationResourceEstimate;
  readonly system?: {
    readonly Z: number;
    readonly symbol: string;
    readonly N: number;
    readonly charge: number;
    readonly multiplicity: number;
    readonly spin2S: number;
    readonly spinConvention: string;
  };
  readonly basis?: HFBasisId;
  readonly basisSource?: string;
  readonly basisFunctionCount?: number;
  readonly symmetryGroup?: string;
  readonly nuclearRepulsion_Ha?: number;
  readonly densityFittingActive?: boolean;
  readonly reference?: {
    readonly method: CorrelationReferenceMethod;
    readonly pyscfClass: string;
    readonly converged: boolean;
    readonly cycles: number;
    readonly maxCycle: number;
    readonly convTol: number;
    readonly energy_Ha: number;
    readonly energy_eV: number;
    readonly spinDiagnostics: CorrelationSpinDiagnostics;
  };
  readonly orbitals?: {
    readonly nSpatialOrbitals: number;
    readonly nAlphaTotal: number;
    readonly nBetaTotal: number;
    readonly frozenCoreMode: FrozenCoreMode;
    readonly frozenOrbitals: number;
    readonly frozenElectrons: number;
    readonly correlatedElectrons: number;
    readonly activeSpatialOrbitals: number;
    readonly activeAlphaElectrons: number;
    readonly activeBetaElectrons: number;
  };
  readonly correlation?: {
    readonly requestedMethod: CorrelationMethodId;
    readonly actualPyscfClass: string;
    readonly converged: boolean;
    readonly eHf_Ha: number;
    readonly eHf_eV: number;
    readonly eCorr_Ha: number;
    readonly eCorr_eV: number;
    readonly eTotal_Ha: number;
    readonly eTotal_eV: number;
    readonly energyIdentityError_Ha: number;
    readonly isVariational: boolean;
    readonly isSizeExtensive: boolean;
    readonly isLsTermResolved: false;
    readonly eCorrSameSpin_Ha: number | null;
    readonly eCorrOppositeSpin_Ha: number | null;
    readonly eCorrSingles_Ha: number | null;
    readonly referenceWeightSq: number | null;
    readonly fixSpinApplied: boolean | null;
    readonly denominatorDiagnostics: CorrelationDenominatorDiagnostics | null;
    readonly spinDiagnostics: CorrelationSpinDiagnostics | null;
    readonly roots: readonly CorrelationFCIRoot[] | null;
  };
  readonly warnings?: readonly string[];
  readonly methodNotes?: readonly string[];
  readonly runtime?: {
    readonly engine: string;
    readonly engineVersion: string;
    readonly bseVersion: string;
    readonly scfMs: number;
    readonly correlationMs: number;
    readonly totalMs: number;
    readonly peakMemoryMB: number;
  };
}

export interface CorrelationTransport {
  getCapabilities(signal?: AbortSignal, refresh?: boolean): Promise<CorrelationCapabilitiesResponse>;
  calculate(request: CorrelationCalculateRequest, signal?: AbortSignal): Promise<CorrelationCalculationResponse>;
}
