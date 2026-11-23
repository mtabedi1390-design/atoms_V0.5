/**
 * Pure TypeScript domain and transport contracts for ATOMS v0.7.0
 * Multi-Electron Hartree–Fock calculations.
 *
 * Zero dependencies on React, Three.js, DOM, or Node-only built-ins.
 * All structures are structured-clone-safe across Web Worker boundaries.
 */

export type HFMethod = "rhf" | "uhf" | "rohf" | "atom-sph-avg";

export type HFBasisId =
  | "sto-3g"
  | "6-31g"
  | "cc-pvdz"
  | "cc-pvtz"
  | "aug-cc-pvtz"
  | "def2-svp"
  | "def2-tzvp";

export type HFOccupationMode = "curated-ground" | "aufbau" | "custom";
export type HFInitGuess = "minao" | "1e" | "atom";
export type HFDiisMode = "cdiis" | "ediis" | "adiis" | "none";
export type HFVolumeQuantity = "mo-signed" | "mo-density" | "total-density" | "spin-density";

export interface SubshellOccupation {
  readonly n: number;
  readonly l: number;
  readonly alpha: number;
  readonly beta: number;
}

export interface HFSCFOptions {
  readonly convTol?: number;
  readonly convTolGrad?: number;
  readonly maxCycle?: number;
  readonly initGuess?: HFInitGuess;
  readonly diis?: HFDiisMode;
  readonly damp?: number;
  readonly levelShift?: number;
  readonly runStability?: boolean;
}

export interface HFVolumeGridSpec {
  readonly enabled: boolean;
  readonly gridN?: number;
  readonly extentBohr?: number;
  readonly quantity?: HFVolumeQuantity;
  readonly orbitalIndex?: number;
  readonly spinChannel?: "alpha" | "beta";
}

export interface HFCalculateRequest {
  readonly Z: number;
  readonly N: number;
  readonly spin2S: number;
  readonly method: HFMethod;
  readonly basis: HFBasisId;
  readonly useSymmetry?: boolean;
  readonly subshellOccupations?: readonly SubshellOccupation[];
  readonly scfOptions?: HFSCFOptions;
  readonly includeRadialGrid?: boolean;
  readonly volumeGrid?: HFVolumeGridSpec;
}

export interface HFCapabilitiesBasisEntry {
  readonly id: HFBasisId;
  readonly label: string;
  readonly bseName: string;
  readonly elements: readonly number[];
}

export interface HFCapabilitiesResponse {
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
  readonly methods?: readonly HFMethod[];
  readonly bases?: readonly HFCapabilitiesBasisEntry[];
  readonly runtime?: {
    readonly executionMode: "full-local-scientific";
    readonly bindHost: string;
    readonly port: number;
    readonly nodeVersion: string;
    readonly pid: number;
  };
}

export interface HFSCFCycleEntry {
  readonly cycle: number;
  readonly eTotal_Ha: number;
  readonly dE_Ha: number;
  readonly gradNorm: number;
}

export interface HFEnergyDecomposition {
  readonly eTotal_Ha: number;
  readonly eTotal_eV: number;
  readonly eKinetic_Ha: number;
  readonly eNuclear_Ha: number;
  readonly eOneElectron_Ha: number;
  readonly eCoulomb_Ha: number;
  readonly eExchange_Ha: number;
  readonly eTwoElectron_Ha: number;
  readonly energyConsistencyError_Ha: number;
  readonly virialRatio: number | null;
  readonly tracePS: number;
  readonly traceAlpha: number;
  readonly traceBeta: number;
  readonly overlapMinEig: number;
  readonly overlapConditionNumber: number;
}

export interface HFOrbitalRecord {
  readonly index: number;
  readonly spin: "spatial" | "alpha" | "beta";
  readonly irrep: string;
  readonly occupation: number;
  readonly energy_Ha: number;
  readonly energy_eV: number;
  readonly fockAlpha_Ha?: number;
  readonly fockBeta_Ha?: number;
}

export type HFStateCharacter =
  | "closed-shell-determinant"
  | "unrestricted-determinant"
  | "restricted-open-shell-determinant"
  | "spherical-ensemble-average";

export interface HFTermResolutionStatus {
  readonly supported: false;
  readonly termSymbol: null;
  readonly totalJ: null;
  readonly lSquaredAvailable: false;
  readonly reason: string;
}

export interface HFStateInfo {
  readonly stateCharacter: HFStateCharacter;
  readonly ansatzLabel: string;
  readonly spinSymmetryStatus:
    | "spin-pure"
    | "spin-unrestricted-broken-possible"
    | "spin-unpolarized-ensemble";
  readonly so3SymmetryUsed: boolean;
  readonly magneticSublevelOccupations: Readonly<Record<string, readonly [number, number]>> | null;
  readonly magneticSublevelNote: string;
  readonly termResolution: HFTermResolutionStatus;
  readonly notes: readonly string[];
}

export interface HFAngularDiagnostics {
  readonly quadraturePoints: number;
  readonly maxRelativeAnisotropy: number;
  readonly rmsRelativeAnisotropy: number;
  readonly isSphericallySymmetric: boolean;
  readonly spatialSymmetryGroup: string;
  readonly lSquaredAvailable: false;
  readonly lSquared: null;
  readonly lSquaredUnavailableReason: string;
  readonly equallyOccupiedSubshellSplitMax_Ha: number | null;
}

export interface HFSpinDiagnostics {
  readonly available: boolean;
  readonly sSquared: number | null;
  readonly sSquaredExact: number | null;
  readonly spinContamination: number | null;
  readonly multiplicity: number | null;
  readonly unavailableReason?: string;
}

export interface HFOrbitalRadialProfile {
  readonly index: number;
  readonly spin: "spatial" | "alpha" | "beta";
  readonly occupation: number;
  readonly integratedNorm: number;
  readonly radialProb: readonly number[];
}

export interface HFRadialProfiles {
  readonly rBohr: readonly number[];
  readonly rhoTotal: readonly number[];
  readonly rhoAlpha: readonly number[];
  readonly rhoBeta: readonly number[];
  readonly rhoSpin: readonly number[];
  readonly radialProbTotal: readonly number[];
  readonly integratedElectrons: number;
  readonly integratedSpin: number;
  readonly meanRadiusBohr: number;
  readonly anglePoints: number;
  readonly orbitalRadialProbs: readonly HFOrbitalRadialProfile[];
}

export interface HFVolumeGridPayload {
  readonly gridN: number;
  readonly extentBohr: number;
  readonly quantity: HFVolumeQuantity;
  readonly orbitalIndex: number;
  readonly spinChannel: "alpha" | "beta";
  readonly signed: boolean;
  readonly fieldMin: number;
  readonly fieldMax: number;
  readonly values: readonly number[];
}

export interface HFCalculationResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly errorType?: string;
  readonly code?: string;
  readonly system?: {
    readonly Z: number;
    readonly symbol: string;
    readonly N: number;
    readonly charge: number;
    readonly spin2S: number;
  };
  readonly method?: HFMethod;
  readonly basis?: HFBasisId;
  readonly basisSource?: string;
  readonly symmetryGroup?: string;
  readonly rohfConvention?: string | null;
  readonly stateInfo?: HFStateInfo;
  readonly angularDiagnostics?: HFAngularDiagnostics;
  readonly scf?: {
    readonly converged: boolean;
    readonly cycles: number;
    readonly maxCycle: number;
    readonly convTol: number;
    readonly convTolGrad: number;
    readonly initGuess: HFInitGuess;
    readonly diis: HFDiisMode;
    readonly damp: number;
    readonly levelShift: number;
    readonly history: readonly HFSCFCycleEntry[];
    readonly stability: {
      readonly checked: boolean;
      readonly internalStable?: boolean;
      readonly error?: string;
    } | null;
  };
  readonly energy?: HFEnergyDecomposition;
  readonly orbitals?: readonly HFOrbitalRecord[];
  readonly orthonormalityError?: number;
  readonly spinDiagnostics?: HFSpinDiagnostics;
  readonly radialProfiles?: HFRadialProfiles | null;
  readonly volumeGrid?: HFVolumeGridPayload | null;
  readonly aoCount?: number;
  readonly aoLabels?: readonly string[];
  readonly runtime?: {
    readonly engine: string;
    readonly engineVersion: string;
    readonly bseVersion: string;
    readonly setupMs: number;
    readonly scfMs: number;
    readonly diagnosticsMs: number;
    readonly totalMs: number;
    readonly peakMemoryMB: number;
  };
}

export interface HFTransport {
  getCapabilities(signal?: AbortSignal): Promise<HFCapabilitiesResponse>;
  calculate(request: HFCalculateRequest, signal?: AbortSignal): Promise<HFCalculationResponse>;
}
