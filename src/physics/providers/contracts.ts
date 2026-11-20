/**
 * Generic strongly-typed PhysicsProvider contract for ATOMS v0.6.0.
 * Zero dependency on React or Three.js.
 */
import type { AtomicSystem } from "@/domain/atomic";
import type { QuantumState } from "@/domain/quantum";
import type { ProviderCapability, ScientificProvenance } from "@/domain/observables";
import type { SupportAssessment, ValidationResult } from "@/domain/validation";

export interface CalculationContext {
  readonly signal?: AbortSignal;
  readonly onProgress?: (fraction: number, stage?: string) => void;
}

export interface ProviderCalculationInput<TState extends QuantumState = QuantumState> {
  readonly system: AtomicSystem;
  readonly state: TState;
  readonly observables: readonly ProviderCapability[];
  readonly numericalOptions?: Readonly<Record<string, number | boolean | string>>;
}

export interface CalculationResult<TData = unknown> {
  readonly ok: boolean;
  readonly data: TData;
  readonly provenance: ScientificProvenance;
  readonly validationChecks: readonly { readonly name: string; readonly passed: boolean; readonly detail: string }[];
  readonly computedAtIso: string;
}

export interface ProviderError {
  readonly code: "UNSUPPORTED_SYSTEM" | "INVALID_INPUT" | "DOMAIN_VIOLATION" | "CANCELLED" | "NUMERICAL_FAILURE" | "UNAVAILABLE";
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface PhysicsProvider<
  TSystem = AtomicSystem,
  TState = QuantumState,
  TInput = ProviderCalculationInput,
  TResult = unknown,
> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly available: boolean;
  readonly blocker?: string;
  readonly capabilities: readonly ProviderCapability[];

  supports(system: TSystem, state: TState): SupportAssessment;
  validate(input: TInput): ValidationResult;
  calculate(input: TInput, context: CalculationContext): Promise<CalculationResult<TResult>>;
}
