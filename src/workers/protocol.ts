/**
 * Structured-clone-safe Worker communication protocol & handler for ATOMS v0.6.0.
 *
 * Enforces:
 *  - No functions, symbols, DOM/React elements, or class instances cross worker boundaries
 *  - Real AbortController cancellation per executionId
 *  - Cooperative progress reporting
 *  - Normalized structured ExperimentError & CalculationResult payloads
 */
import type { SupportAssessment } from "@/domain/validation";
import type { CalculationResult } from "@/physics/providers/contracts";
import type { PhysicsProviderRegistry } from "@/physics/providers/registry";
import { createDefaultExperimentRegistry, type ExperimentRegistry } from "@/experiments/registry";
import {
  DEFAULT_ATOMIC_RESULT_UNITS,
  toPlainCloneSafeData,
  type ExperimentDefinition,
  type ExperimentError,
  type ExperimentResultRecord,
} from "@/experiments/schema";
import { normalizeCalculationResult } from "@/experiments/results";
import { executeTransitionOrSpectroscopyExperiment } from "@/experiments/execution/dispatchSpecialExperiment";
import { ExperimentValidator } from "@/experiments/validation";

export interface WorkerRunExperimentRequest {
  readonly type: "run-experiment";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly recomputedCount: number;
  readonly definition: ExperimentDefinition;
}

export interface WorkerCancelExperimentRequest {
  readonly type: "cancel-experiment";
  readonly executionId: string;
  readonly reason?: string;
}

export type ExperimentWorkerInbound = WorkerRunExperimentRequest | WorkerCancelExperimentRequest;

export interface WorkerProgressMessage {
  readonly type: "progress";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly fraction: number;
  readonly stage?: string;
}

export interface WorkerCompletedMessage {
  readonly type: "completed";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly result: ExperimentResultRecord;
}

export interface WorkerCancelledMessage {
  readonly type: "cancelled";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly reason?: string;
}

export interface WorkerUnsupportedMessage {
  readonly type: "unsupported";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly reason: string;
  readonly assessment?: SupportAssessment;
}

export interface WorkerFailedMessage {
  readonly type: "failed";
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly error: ExperimentError;
}

export type ExperimentWorkerOutbound =
  | WorkerProgressMessage
  | WorkerCompletedMessage
  | WorkerCancelledMessage
  | WorkerUnsupportedMessage
  | WorkerFailedMessage;

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: { data: ExperimentWorkerOutbound }) => void) | null;
  onerror: ((ev: { message?: string }) => void) | null;
}

/**
 * Runtime guard asserting that a value contains only structured-clone-safe primitives,
 * plain objects, arrays, or TypedArrays — rejecting functions, symbols, React elements,
 * DOM nodes, and non-plain class instances.
 */
export function assertStructuredCloneSafe(value: unknown, path = "$", seen = new Set<object>()): void {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return;
  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new TypeError(`Non-clone-safe ${t} found at ${path}`);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      throw new TypeError(`Cyclic reference detected at ${path}`);
    }
    if ("$$typeof" in obj) {
      throw new TypeError(`React element ($$typeof) cannot cross Worker boundary at ${path}`);
    }
    if (ArrayBuffer.isView(obj)) {
      if (obj instanceof DataView) {
        throw new TypeError(`DataView not supported across Worker boundary at ${path}`);
      }
      return;
    }
    if (Array.isArray(obj)) {
      seen.add(obj);
      for (let i = 0; i < obj.length; i++) {
        assertStructuredCloneSafe(obj[i], `${path}[${i}]`, seen);
      }
      seen.delete(obj);
      return;
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      const tag = (proto as { constructor?: { name?: string } })?.constructor?.name ?? "ClassInstance";
      throw new TypeError(`Non-plain instance (${tag}) cannot cross Worker boundary at ${path}`);
    }
    seen.add(obj);
    for (const [k, v] of Object.entries(obj)) {
      assertStructuredCloneSafe(v, `${path}.${k}`, seen);
    }
    seen.delete(obj);
    return;
  }
  throw new TypeError(`Unsupported value at ${path}`);
}

export function normalizeWorkerError(err: unknown): ExperimentError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { code: "CANCELLED", message: err.message || "Calculation cancelled.", recoverable: true };
  }
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const pe = err as { code?: unknown; message?: unknown; details?: unknown };
    return {
      code: "PROVIDER_ERROR",
      message: String(pe.message),
      recoverable: true,
      details: pe.details && typeof pe.details === "object" ? (toPlainCloneSafeData(pe.details) as Record<string, unknown>) : undefined,
    };
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || /abort|cancel/i.test(err.message)) {
      return { code: "CANCELLED", message: err.message, recoverable: true };
    }
    return { code: "PROVIDER_ERROR", message: err.message, recoverable: true };
  }
  return { code: "WORKER_ERROR", message: String(err), recoverable: true };
}

export interface WorkerRuntimeHost {
  readonly receive: (msg: ExperimentWorkerInbound) => void;
}

/**
 * Pure worker-side execution engine shared by `experiment.worker.ts` and headless tests.
 */
export function createExperimentWorkerRuntime(
  providerRegistry: PhysicsProviderRegistry,
  post: (msg: ExperimentWorkerOutbound) => void,
  experimentRegistry: ExperimentRegistry = createDefaultExperimentRegistry(),
): WorkerRuntimeHost {
  const validator = new ExperimentValidator(providerRegistry, experimentRegistry);
  const controllers = new Map<string, AbortController>();
  const metaByExec = new Map<string, { experimentId: string; runSequence: number; reason?: string }>();

  const emit = (msg: ExperimentWorkerOutbound): void => {
    assertStructuredCloneSafe(msg, "workerOutbound");
    post(msg);
  };

  return {
    receive(msg: ExperimentWorkerInbound): void {
      assertStructuredCloneSafe(msg, "workerInbound");
      if (msg.type === "cancel-experiment") {
        const meta = metaByExec.get(msg.executionId);
        if (meta) meta.reason = msg.reason;
        const ctrl = controllers.get(msg.executionId);
        if (ctrl && !ctrl.signal.aborted) {
          ctrl.abort(new DOMException(msg.reason ?? "Cancelled by user", "AbortError"));
        }
        return;
      }

      const { executionId, experimentId, runSequence, recomputedCount, definition } = msg;
      const ctrl = new AbortController();
      controllers.set(executionId, ctrl);
      metaByExec.set(executionId, { experimentId, runSequence });

      void (async () => {
        try {
          const report = validator.validate(definition);
          if (report.unsupportedReason || (report.supportAssessment && !report.supportAssessment.supported)) {
            emit({
              type: "unsupported",
              executionId,
              experimentId,
              runSequence,
              reason: report.unsupportedReason ?? report.supportAssessment?.reasons.join("; ") ?? "Unsupported",
              assessment: report.supportAssessment,
            });
            return;
          }
          if (!report.validation.valid || !report.provider) {
            const errorMsg = report.validation.issues
              .filter((i) => i.severity === "error")
              .map((i) => `[${i.code}] ${i.message}`)
              .join("; ");
            emit({
              type: "failed",
              executionId,
              experimentId,
              runSequence,
              error: {
                code: "VALIDATION_ERROR",
                message: errorMsg || "Experiment validation failed.",
                recoverable: false,
                details: { issues: report.validation.issues },
              },
            });
            return;
          }

          let raw: CalculationResult<unknown>;
          if (definition.kind === "e1-transition" || definition.kind === "spectroscopy-series") {
            raw = executeTransitionOrSpectroscopyExperiment(definition, report.provider.version, (fraction, stage) => {
              if (ctrl.signal.aborted) return;
              emit({ type: "progress", executionId, experimentId, runSequence, fraction, stage });
            });
          } else {
            const state = definition.quantumStates[0] ?? definition.transition?.initial;
            if (!state) {
              emit({
                type: "failed",
                executionId,
                experimentId,
                runSequence,
                error: { code: "VALIDATION_ERROR", message: "No quantum state present for provider execution.", recoverable: false },
              });
              return;
            }

            raw = await report.provider.calculate(
              {
                system: definition.system,
                state,
                observables: definition.observables,
                numericalOptions: definition.numericalParameters,
              },
              {
                signal: ctrl.signal,
                onProgress: (fraction, stage) => {
                  if (ctrl.signal.aborted) return;
                  emit({ type: "progress", executionId, experimentId, runSequence, fraction, stage });
                },
              },
            );
          }

          if (ctrl.signal.aborted) {
            emit({
              type: "cancelled",
              executionId,
              experimentId,
              runSequence,
              reason: metaByExec.get(executionId)?.reason ?? "Cancelled",
            });
            return;
          }

          const normalized = normalizeCalculationResult(definition, raw, {
            executionId,
            runSequence,
            source: "computed",
            recomputedCount,
            units: DEFAULT_ATOMIC_RESULT_UNITS,
          });
          emit({
            type: "completed",
            executionId,
            experimentId,
            runSequence,
            result: normalized,
          });
        } catch (err) {
          if (ctrl.signal.aborted) {
            emit({
              type: "cancelled",
              executionId,
              experimentId,
              runSequence,
              reason: metaByExec.get(executionId)?.reason ?? "Cancelled",
            });
            return;
          }
          const normalizedErr = normalizeWorkerError(err);
          if (normalizedErr.code === "CANCELLED") {
            emit({
              type: "cancelled",
              executionId,
              experimentId,
              runSequence,
              reason: normalizedErr.message,
            });
            return;
          }
          emit({
            type: "failed",
            executionId,
            experimentId,
            runSequence,
            error: normalizedErr,
          });
        } finally {
          controllers.delete(executionId);
          metaByExec.delete(executionId);
        }
      })();
    },
  };
}
