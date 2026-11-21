/**
 * ExperimentRunner — orchestrates validation, scheduling, direct/Worker execution,
 * result normalization, stale-result rejection, persistence, and explicit
 * Load/Replay vs Recompute separation (ATOMS v0.6.0 Phase 2).
 */
import type { PhysicsProviderRegistry } from "@/physics/providers/registry";
import type { ExperimentWorkerClient } from "@/workers/experimentClient";
import { normalizeWorkerError } from "@/workers/protocol";
import { createDefaultExperimentRegistry, type ExperimentRegistry } from "../registry";
import { normalizeCalculationResult, ResultRegistry } from "../results";
import {
  DEFAULT_ATOMIC_RESULT_UNITS,
  EXECUTION_SCHEMA_VERSION,
  createExecutionId,
  type ExecutionMode,
  type ExperimentDefinition,
  type ExperimentExecution,
  type ExperimentResultRecord,
} from "../schema";
import { ExperimentValidator } from "../validation";
import type { ExperimentStorageBackend } from "../persistence/store";
import { executeTransitionOrSpectroscopyExperiment } from "./dispatchSpecialExperiment";
import { ExperimentScheduler } from "./scheduler";

export interface ExperimentRunnerOptions {
  readonly providerRegistry: PhysicsProviderRegistry;
  readonly experimentRegistry?: ExperimentRegistry;
  readonly resultRegistry?: ResultRegistry;
  readonly scheduler?: ExperimentScheduler;
  readonly workerClient?: ExperimentWorkerClient;
  readonly store?: ExperimentStorageBackend;
}

export interface RunExperimentOptions {
  readonly mode?: ExecutionMode;
  readonly timeoutMs?: number;
  readonly supersedeActive?: boolean;
  readonly persist?: boolean;
  readonly recomputedCount?: number;
}

export interface RunExperimentHandle {
  readonly execution: ExperimentExecution;
  readonly completion: Promise<{
    readonly execution: ExperimentExecution;
    readonly result?: ExperimentResultRecord;
  }>;
  readonly cancel: (reason?: string) => void;
}

export class ExperimentRunner {
  readonly providerRegistry: PhysicsProviderRegistry;
  readonly experimentRegistry: ExperimentRegistry;
  readonly validator: ExperimentValidator;
  readonly resultRegistry: ResultRegistry;
  readonly scheduler: ExperimentScheduler;
  readonly workerClient?: ExperimentWorkerClient;
  readonly store?: ExperimentStorageBackend;

  private readonly definitions = new Map<string, ExperimentDefinition>();
  private readonly recomputeCounts = new Map<string, number>();

  constructor(options: ExperimentRunnerOptions) {
    this.providerRegistry = options.providerRegistry;
    this.experimentRegistry = options.experimentRegistry ?? createDefaultExperimentRegistry();
    this.validator = new ExperimentValidator(this.providerRegistry, this.experimentRegistry);
    this.resultRegistry = options.resultRegistry ?? new ResultRegistry();
    this.scheduler = options.scheduler ?? new ExperimentScheduler();
    this.workerClient = options.workerClient;
    this.store = options.store;
  }

  registerDefinition(def: ExperimentDefinition): void {
    this.definitions.set(def.id, def);
  }

  getDefinition(experimentId: string): ExperimentDefinition | undefined {
    return this.definitions.get(experimentId);
  }

  /**
   * Submits an experiment for validation, queuing, and execution (via Worker or direct provider).
   */
  run(def: ExperimentDefinition, opts: RunExperimentOptions = {}): RunExperimentHandle {
    this.registerDefinition(def);
    const mode: ExecutionMode = opts.mode ?? (this.workerClient ? "worker" : "direct");
    const runSequence = this.scheduler.nextSequenceFor(def.id);
    this.resultRegistry.reserveSequence(def.id, runSequence);

    const recomputedCount = opts.recomputedCount ?? this.recomputeCounts.get(def.id) ?? 0;
    const report = this.validator.validate(def);

    // Pre-execution unsupported or validation failure short-circuits before running provider
    if (report.unsupportedReason || (report.supportAssessment && !report.supportAssessment.supported)) {
      const now = new Date().toISOString();
      const execution: ExperimentExecution = {
        executionId: createExecutionId(),
        executionSchemaVersion: EXECUTION_SCHEMA_VERSION,
        experimentId: def.id,
        runSequence,
        status: "unsupported",
        executionMode: mode,
        progress: { fraction: 0, stage: "Unsupported" },
        queuedAtIso: now,
        startedAtIso: now,
        finishedAtIso: now,
        durationMs: 0,
        validation: report.validation,
        supportAssessment: report.supportAssessment,
        error: {
          code: def.system.nuclearModel.kind.startsWith("finite-")
            ? "UNSUPPORTED_NUCLEAR_MODEL"
            : "UNSUPPORTED_CAPABILITY",
          message: report.unsupportedReason ?? report.supportAssessment?.reasons.join("; ") ?? "Unsupported capability.",
          recoverable: false,
        },
      };
      const completion = (async () => {
        if (opts.persist && this.store) {
          await this.store.saveExperiment(def);
          await this.store.saveExecution(execution);
        }
        return { execution };
      })();
      return {
        execution,
        completion,
        cancel: () => {},
      };
    }

    if (!report.validation.valid || !report.provider) {
      const now = new Date().toISOString();
      const message = report.validation.issues
        .filter((i) => i.severity === "error")
        .map((i) => `[${i.code}] ${i.message}`)
        .join("; ");
      const execution: ExperimentExecution = {
        executionId: createExecutionId(),
        executionSchemaVersion: EXECUTION_SCHEMA_VERSION,
        experimentId: def.id,
        runSequence,
        status: "failed",
        executionMode: mode,
        progress: { fraction: 0, stage: "Validation failed" },
        queuedAtIso: now,
        startedAtIso: now,
        finishedAtIso: now,
        durationMs: 0,
        validation: report.validation,
        error: {
          code: "VALIDATION_ERROR",
          message: message || "Experiment definition validation failed.",
          recoverable: false,
        },
      };
      const completion = (async () => {
        if (opts.persist && this.store) {
          await this.store.saveExperiment(def);
          await this.store.saveExecution(execution);
        }
        return { execution };
      })();
      return {
        execution,
        completion,
        cancel: () => {},
      };
    }

    let producedResult: ExperimentResultRecord | undefined;

    const scheduled = this.scheduler.enqueue(
      {
        experimentId: def.id,
        executionMode: mode,
        timeoutMs: opts.timeoutMs,
        supersedeActiveForExperiment: opts.supersedeActive ?? true,
        preallocatedSequence: runSequence,
      },
      async (ctx) => {
        if (mode === "worker" && this.workerClient) {
          return await new Promise((resolve) => {
            const abortHandler = () => {
              this.resultRegistry.markExecutionCancelled(ctx.execution.executionId);
              this.workerClient!.cancel(ctx.execution.executionId, "Aborted by scheduler");
            };
            ctx.signal.addEventListener("abort", abortHandler, { once: true });

            this.workerClient!.submit(
              {
                executionId: ctx.execution.executionId,
                experimentId: def.id,
                runSequence,
                recomputedCount,
                definition: def,
              },
              {
                onProgress: (fraction, stage) => ctx.updateProgress(fraction, stage),
                onCompleted: (workerResult) => {
                  ctx.signal.removeEventListener("abort", abortHandler);
                  if (ctx.signal.aborted || ctx.isStale()) {
                    resolve({
                      status: "cancelled",
                      error: { code: "STALE_EXECUTION", message: "Stale worker completion discarded.", recoverable: true },
                    });
                    return;
                  }
                  const recOutcome = this.resultRegistry.recordComputed(workerResult);
                  if (!recOutcome.accepted) {
                    resolve({
                      status: "cancelled",
                      error: { code: "STALE_EXECUTION", message: `Result rejected (${recOutcome.reason}).`, recoverable: true },
                    });
                    return;
                  }
                  producedResult = recOutcome.record;
                  resolve({ status: "completed", resultId: recOutcome.record.resultId });
                },
                onCancelled: (reason) => {
                  ctx.signal.removeEventListener("abort", abortHandler);
                  this.resultRegistry.markExecutionCancelled(ctx.execution.executionId);
                  resolve({
                    status: "cancelled",
                    error: { code: "CANCELLED", message: reason ?? "Cancelled", recoverable: true },
                  });
                },
                onUnsupported: (reason) => {
                  ctx.signal.removeEventListener("abort", abortHandler);
                  resolve({
                    status: "unsupported",
                    error: { code: "UNSUPPORTED_CAPABILITY", message: reason, recoverable: false },
                  });
                },
                onFailed: (error) => {
                  ctx.signal.removeEventListener("abort", abortHandler);
                  resolve({ status: "failed", error });
                },
              },
            );
          });
        }

        // Direct provider execution path
        try {
          let raw;
          if (def.kind === "e1-transition" || def.kind === "spectroscopy-series") {
            raw = executeTransitionOrSpectroscopyExperiment(def, report.provider!.version, (fraction, stage) =>
              ctx.updateProgress(fraction, stage),
            );
          } else {
            const state = def.quantumStates[0] ?? def.transition?.initial;
            if (!state) {
              return {
                status: "failed",
                error: { code: "VALIDATION_ERROR", message: "No quantum state provided.", recoverable: false },
              };
            }
            raw = await report.provider!.calculate(
              {
                system: def.system,
                state,
                observables: def.observables,
                numericalOptions: def.numericalParameters,
              },
              {
                signal: ctx.signal,
                onProgress: (fraction, stage) => ctx.updateProgress(fraction, stage),
              },
            );
          }
          if (ctx.signal.aborted) {
            this.resultRegistry.markExecutionCancelled(ctx.execution.executionId);
            return {
              status: "cancelled",
              error: { code: "CANCELLED", message: "Calculation aborted.", recoverable: true },
            };
          }
          if (ctx.isStale()) {
            return {
              status: "cancelled",
              error: { code: "STALE_EXECUTION", message: "Stale direct result discarded.", recoverable: true },
            };
          }

          const normalized = normalizeCalculationResult(def, raw, {
            executionId: ctx.execution.executionId,
            runSequence,
            source: "computed",
            recomputedCount,
            units: DEFAULT_ATOMIC_RESULT_UNITS,
          });
          const recOutcome = this.resultRegistry.recordComputed(normalized);
          if (!recOutcome.accepted) {
            return {
              status: "cancelled",
              error: { code: "STALE_EXECUTION", message: `Result rejected (${recOutcome.reason}).`, recoverable: true },
            };
          }
          producedResult = recOutcome.record;
          return { status: "completed", resultId: recOutcome.record.resultId };
        } catch (err) {
          const normalizedErr = normalizeWorkerError(err);
          if (normalizedErr.code === "CANCELLED" || ctx.signal.aborted) {
            this.resultRegistry.markExecutionCancelled(ctx.execution.executionId);
            return { status: "cancelled", error: normalizedErr };
          }
          return { status: "failed", error: normalizedErr };
        }
      },
    );

    const completion = scheduled.promise.then(async (finalExec) => {
      if (opts.persist && this.store) {
        await this.store.saveExperiment(def);
        await this.store.saveExecution(finalExec);
        if (finalExec.status === "completed" && producedResult) {
          await this.store.saveResult(producedResult);
        }
      }
      return { execution: finalExec, result: producedResult };
    });

    return {
      execution: scheduled.execution,
      completion,
      cancel: (reason?: string) => {
        this.resultRegistry.markExecutionCancelled(scheduled.execution.executionId);
        this.scheduler.cancel(scheduled.execution.executionId, reason);
      },
    };
  }

  /**
   * Replays an already stored result from ExperimentStore WITHOUT invoking a provider.
   * Marks `source: "loaded-from-store"` and preserves original `computedAtIso`.
   */
  async loadStoredExperiment(experimentId: string): Promise<{
    readonly definition?: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly latestResult?: ExperimentResultRecord;
  }> {
    if (!this.store) {
      throw new Error("No ExperimentStorageBackend configured on ExperimentRunner.");
    }
    const loaded = await this.store.loadExperimentBundle(experimentId);
    if (loaded.definition) {
      this.registerDefinition(loaded.definition);
    }
    let latest: ExperimentResultRecord | undefined;
    for (const r of loaded.results) {
      latest = this.resultRegistry.recordLoaded(r, "loaded-from-store");
    }
    return {
      definition: loaded.definition,
      executions: loaded.executions,
      latestResult: latest,
    };
  }

  /**
   * Explicitly recomputes an experiment from its definition, incrementing `recomputedCount`
   * and producing a fresh execution + result with `source: "computed"`.
   */
  rerun(def: ExperimentDefinition, opts: Omit<RunExperimentOptions, "recomputedCount"> = {}): RunExperimentHandle {
    const nextCount = (this.recomputeCounts.get(def.id) ?? 0) + 1;
    this.recomputeCounts.set(def.id, nextCount);
    return this.run(def, { ...opts, recomputedCount: nextCount });
  }
}
