/**
 * Versioned Experiment Platform schemas (ATOMS v0.6.0 Phase 2).
 *
 * Strictly separates:
 *  1. ExperimentDefinition (atom-exp/v1)
 *  2. ExperimentExecution  (atom-exec/v1)
 *  3. ExperimentResultRecord (atom-res/v1) + ScientificProvenance
 *
 * All types are plain-data / structured-clone-safe (no classes, functions, React, or Three.js).
 */
import type { AtomicSystem, NuclearModel } from "@/domain/atomic";
import type { ProviderCapability, ScientificProvenance } from "@/domain/observables";
import type { QuantumState, TransitionPair } from "@/domain/quantum";
import type { SupportAssessment, ValidationResult } from "@/domain/validation";
import { CONSTANTS_VERSION, type ConstantsVersion, type TypedQuantity } from "@/physics/units";

export const EXPERIMENT_SCHEMA_VERSION = "atom-exp/v1" as const;
export const EXECUTION_SCHEMA_VERSION = "atom-exec/v1" as const;
export const RESULT_SCHEMA_VERSION = "atom-res/v1" as const;

export type ExperimentKind =
  | "total-density"
  | "single-state"
  | "energy-spectrum"
  | "e1-transition"
  | "spectroscopy-series"
  | "multi-electron-hf";

export type ExperimentStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unsupported"
  | "timed-out";

export type ExecutionMode = "worker" | "direct";

export type ResultOrigin = "computed" | "loaded-from-store" | "imported-json";

export interface ExperimentError {
  readonly code:
    | "VALIDATION_ERROR"
    | "UNSUPPORTED_CAPABILITY"
    | "UNSUPPORTED_NUCLEAR_MODEL"
    | "PROVIDER_UNAVAILABLE"
    | "PROVIDER_ERROR"
    | "CANCELLED"
    | "TIMED_OUT"
    | "WORKER_ERROR"
    | "STALE_EXECUTION"
    | "STORAGE_ERROR";
  readonly message: string;
  readonly recoverable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ExperimentDefinition {
  readonly id: string;
  readonly schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  readonly kind: ExperimentKind;
  readonly title: string;
  readonly description?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly system: AtomicSystem;
  readonly quantumStates: readonly QuantumState[];
  readonly transition?: TransitionPair;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly observables: readonly ProviderCapability[];
  readonly modelParameters: Readonly<Record<string, number | boolean | string>>;
  readonly numericalParameters: Readonly<Record<string, number | boolean | string>>;
  readonly constantsVersion: ConstantsVersion;
  readonly tags?: readonly string[];
  readonly originNote?: string;
}

export interface ExecutionProgress {
  readonly fraction: number;
  readonly stage?: string;
}

export interface ExperimentExecution {
  readonly executionId: string;
  readonly executionSchemaVersion: typeof EXECUTION_SCHEMA_VERSION;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly status: ExperimentStatus;
  readonly executionMode: ExecutionMode;
  readonly progress: ExecutionProgress;
  readonly queuedAtIso: string;
  readonly startedAtIso?: string;
  readonly finishedAtIso?: string;
  readonly durationMs?: number;
  readonly resultId?: string;
  readonly error?: ExperimentError;
  readonly validation?: ValidationResult;
  readonly supportAssessment?: SupportAssessment;
  readonly supersededByExecutionId?: string;
}

export interface ResultUnitsManifest {
  readonly energy: "eV" | "Ha";
  readonly length: "a0" | "nm" | "pm";
  readonly mass: "u" | "me";
  readonly charge: "e";
  readonly frequency: "Hz";
  readonly density: "e/a0^3" | "1/a0^3";
  readonly radialProbability: "1/a0";
}

export const DEFAULT_ATOMIC_RESULT_UNITS: ResultUnitsManifest = {
  energy: "eV",
  length: "a0",
  mass: "u",
  charge: "e",
  frequency: "Hz",
  density: "e/a0^3",
  radialProbability: "1/a0",
};

export interface ExperimentResultRecord {
  readonly resultId: string;
  readonly resultSchemaVersion: typeof RESULT_SCHEMA_VERSION;
  readonly experimentId: string;
  readonly executionId: string;
  readonly runSequence: number;
  readonly source: ResultOrigin;
  readonly recomputedCount: number;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly constantsVersion: ConstantsVersion;
  readonly units: ResultUnitsManifest;
  readonly modelAssumptions: readonly string[];
  readonly nuclearModelUsed: NuclearModel;
  readonly reducedMassRatioUsed: number;
  readonly numericalQuality: ScientificProvenance["numericalQuality"];
  readonly provenance: ScientificProvenance;
  readonly validationChecks: readonly {
    readonly name: string;
    readonly passed: boolean;
    readonly detail: string;
  }[];
  readonly observablesProduced: readonly ProviderCapability[];
  readonly scalarObservables?: Readonly<Record<string, TypedQuantity<string>>>;
  readonly payload: unknown;
  readonly computedAtIso: string;
  readonly loadedAtIso?: string;
}

export interface CreateExperimentOptions {
  readonly id?: string;
  readonly kind: ExperimentKind;
  readonly title: string;
  readonly description?: string;
  readonly system: AtomicSystem;
  readonly quantumStates: readonly QuantumState[];
  readonly transition?: TransitionPair;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly observables: readonly ProviderCapability[];
  readonly modelParameters?: Readonly<Record<string, number | boolean | string>>;
  readonly numericalParameters?: Readonly<Record<string, number | boolean | string>>;
  readonly tags?: readonly string[];
  readonly originNote?: string;
  readonly nowIso?: string;
}

function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function createExperimentId(): string {
  return generateId("exp");
}

export function createExecutionId(): string {
  return generateId("exec");
}

export function createResultId(): string {
  return generateId("res");
}

export function createExperimentDefinition(opts: CreateExperimentOptions): ExperimentDefinition {
  const now = opts.nowIso ?? new Date().toISOString();
  return {
    id: opts.id ?? createExperimentId(),
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    kind: opts.kind,
    title: opts.title,
    description: opts.description,
    createdAtIso: now,
    updatedAtIso: now,
    system: opts.system,
    quantumStates: opts.quantumStates,
    transition: opts.transition,
    providerId: opts.providerId,
    providerVersion: opts.providerVersion,
    observables: opts.observables,
    modelParameters: opts.modelParameters ?? {},
    numericalParameters: opts.numericalParameters ?? {},
    constantsVersion: CONSTANTS_VERSION,
    tags: opts.tags,
    originNote: opts.originNote,
  };
}

/**
 * Recursively converts TypedArrays into plain JS arrays so payloads remain lossless
 * across JSON export/import and structured-clone transactions.
 */
export function toPlainCloneSafeData(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      throw new TypeError("DataView is not supported in plain result payloads.");
    }
    return Array.from(value as unknown as ArrayLike<number>);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlainCloneSafeData(item));
  }
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = toPlainCloneSafeData(v);
    }
    return out;
  }
  throw new TypeError(`Unsupported non-plain value in experiment payload: ${Object.prototype.toString.call(value)}`);
}
