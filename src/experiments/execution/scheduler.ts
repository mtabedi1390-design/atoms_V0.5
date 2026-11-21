/**
 * ExperimentScheduler — FIFO/priority concurrency scheduler with real
 * AbortController cancellation, timeout enforcement, and monotonic per-experiment
 * runSequence tracking to prevent stale completions from overwriting newer runs.
 */
import type {
  ExecutionMode,
  ExperimentError,
  ExperimentExecution,
  ExperimentStatus,
} from "../schema";
import { createExecutionId, EXECUTION_SCHEMA_VERSION } from "../schema";

export interface ScheduledTaskContext {
  readonly execution: ExperimentExecution;
  readonly signal: AbortSignal;
  readonly updateProgress: (fraction: number, stage?: string) => void;
  readonly isStale: () => boolean;
}

export interface TaskOutcome {
  readonly status: Extract<ExperimentStatus, "completed" | "failed" | "cancelled" | "unsupported" | "timed-out">;
  readonly resultId?: string;
  readonly error?: ExperimentError;
}

export interface SchedulerOptions {
  readonly maxConcurrency?: number;
  readonly defaultTimeoutMs?: number;
  readonly onExecutionUpdated?: (exec: ExperimentExecution) => void;
  readonly onStaleDiscarded?: (exec: ExperimentExecution) => void;
}

interface InternalJob {
  execution: ExperimentExecution;
  readonly timeoutMs: number;
  readonly controller: AbortController;
  timedOut: boolean;
  cancelRequested: boolean;
  readonly execute: (ctx: ScheduledTaskContext) => Promise<TaskOutcome>;
  resolve: (exec: ExperimentExecution) => void;
}

export class ExperimentScheduler {
  private readonly maxConcurrency: number;
  private readonly defaultTimeoutMs: number;
  private readonly queue: InternalJob[] = [];
  private readonly active = new Map<string, InternalJob>();
  private readonly executions = new Map<string, ExperimentExecution>();
  private readonly seqByExperiment = new Map<string, number>();
  private readonly latestExecByExperiment = new Map<string, string>();
  private readonly listeners = new Set<(exec: ExperimentExecution) => void>();

  constructor(private readonly options: SchedulerOptions = {}) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 2);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000;
  }

  subscribe(listener: (exec: ExperimentExecution) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(exec: ExperimentExecution): void {
    this.executions.set(exec.executionId, exec);
    this.options.onExecutionUpdated?.(exec);
    for (const l of this.listeners) l(exec);
  }

  nextSequenceFor(experimentId: string): number {
    const next = (this.seqByExperiment.get(experimentId) ?? 0) + 1;
    this.seqByExperiment.set(experimentId, next);
    return next;
  }

  getLatestSequence(experimentId: string): number {
    return this.seqByExperiment.get(experimentId) ?? 0;
  }

  getExecution(executionId: string): ExperimentExecution | undefined {
    return this.executions.get(executionId);
  }

  listExecutions(experimentId?: string): readonly ExperimentExecution[] {
    const all = [...this.executions.values()];
    return experimentId ? all.filter((e) => e.experimentId === experimentId) : all;
  }

  enqueue(
    params: {
      experimentId: string;
      executionMode: ExecutionMode;
      timeoutMs?: number;
      supersedeActiveForExperiment?: boolean;
      preallocatedSequence?: number;
    },
    execute: (ctx: ScheduledTaskContext) => Promise<TaskOutcome>,
  ): { execution: ExperimentExecution; promise: Promise<ExperimentExecution> } {
    const runSequence = params.preallocatedSequence ?? this.nextSequenceFor(params.experimentId);
    if (params.preallocatedSequence && params.preallocatedSequence > (this.seqByExperiment.get(params.experimentId) ?? 0)) {
      this.seqByExperiment.set(params.experimentId, params.preallocatedSequence);
    }

    const executionId = createExecutionId();
    const prevExecId = this.latestExecByExperiment.get(params.experimentId);
    this.latestExecByExperiment.set(params.experimentId, executionId);

    if (params.supersedeActiveForExperiment && prevExecId) {
      const prevExec = this.executions.get(prevExecId);
      if (prevExec && (prevExec.status === "queued" || prevExec.status === "running")) {
        this.cancel(prevExecId, "Superseded by newer experiment run", executionId);
      }
    }

    const initial: ExperimentExecution = {
      executionId,
      executionSchemaVersion: EXECUTION_SCHEMA_VERSION,
      experimentId: params.experimentId,
      runSequence,
      status: "queued",
      executionMode: params.executionMode,
      progress: { fraction: 0, stage: "Queued" },
      queuedAtIso: new Date().toISOString(),
    };
    this.emit(initial);

    let resolvePromise!: (exec: ExperimentExecution) => void;
    const promise = new Promise<ExperimentExecution>((resolve) => {
      resolvePromise = resolve;
    });

    const job: InternalJob = {
      execution: initial,
      timeoutMs: params.timeoutMs ?? this.defaultTimeoutMs,
      controller: new AbortController(),
      timedOut: false,
      cancelRequested: false,
      execute,
      resolve: resolvePromise,
    };

    this.queue.push(job);
    this.drain();

    return { execution: initial, promise };
  }

  cancel(executionId: string, reason = "Cancelled by user", supersededByExecutionId?: string): boolean {
    const qIdx = this.queue.findIndex((j) => j.execution.executionId === executionId);
    if (qIdx >= 0) {
      const [job] = this.queue.splice(qIdx, 1);
      job.cancelRequested = true;
      job.controller.abort(new DOMException(reason, "AbortError"));
      const now = new Date().toISOString();
      const updated: ExperimentExecution = {
        ...job.execution,
        status: "cancelled",
        finishedAtIso: now,
        durationMs: 0,
        supersededByExecutionId,
        error: { code: "CANCELLED", message: reason, recoverable: true },
      };
      job.execution = updated;
      this.emit(updated);
      job.resolve(updated);
      return true;
    }

    const activeJob = this.active.get(executionId);
    if (activeJob) {
      activeJob.cancelRequested = true;
      if (supersededByExecutionId) {
        activeJob.execution = { ...activeJob.execution, supersededByExecutionId };
      }
      activeJob.controller.abort(new DOMException(reason, "AbortError"));
      return true;
    }
    return false;
  }

  private isStaleJob(exec: ExperimentExecution): boolean {
    const latestSeq = this.seqByExperiment.get(exec.experimentId) ?? 0;
    return exec.runSequence < latestSeq;
  }

  private drain(): void {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.startJob(job);
    }
  }

  private startJob(job: InternalJob): void {
    const startedMs = Date.now();
    const runningExec: ExperimentExecution = {
      ...job.execution,
      status: "running",
      startedAtIso: new Date(startedMs).toISOString(),
      progress: { fraction: 0.05, stage: "Running" },
    };
    job.execution = runningExec;
    this.active.set(runningExec.executionId, job);
    this.emit(runningExec);

    const timer =
      job.timeoutMs > 0
        ? setTimeout(() => {
            job.timedOut = true;
            job.controller.abort(new DOMException(`Timed out after ${job.timeoutMs} ms`, "TimeoutError"));
          }, job.timeoutMs)
        : null;

    const ctx: ScheduledTaskContext = {
      execution: runningExec,
      signal: job.controller.signal,
      isStale: () => this.isStaleJob(job.execution),
      updateProgress: (fraction, stage) => {
        if (job.cancelRequested || job.timedOut || this.isStaleJob(job.execution)) return;
        const clamped = Math.max(0, Math.min(1, fraction));
        job.execution = {
          ...job.execution,
          progress: { fraction: clamped, stage },
        };
        this.emit(job.execution);
      },
    };

    void job
      .execute(ctx)
      .then((outcome) => {
        if (timer) clearTimeout(timer);
        this.active.delete(job.execution.executionId);

        const finishedAtIso = new Date().toISOString();
        const durationMs = Math.max(0, Date.now() - startedMs);

        // Stale protection: if superseded by a newer sequence for the same experiment, do not mark completed over newer run
        if ((this.isStaleJob(job.execution) && outcome.status === "completed") || outcome.error?.code === "STALE_EXECUTION") {
          const staleExec: ExperimentExecution = {
            ...job.execution,
            status: "cancelled",
            finishedAtIso,
            durationMs,
            error: {
              code: "STALE_EXECUTION",
              message: outcome.error?.message ?? `Run #${job.execution.runSequence} discarded because newer run #${this.seqByExperiment.get(job.execution.experimentId)} superseded it.`,
              recoverable: true,
            },
          };
          job.execution = staleExec;
          this.options.onStaleDiscarded?.(staleExec);
          this.emit(staleExec);
          job.resolve(staleExec);
          return;
        }

        const finalStatus: ExperimentStatus = job.timedOut
          ? "timed-out"
          : job.cancelRequested
            ? "cancelled"
            : outcome.status;

        const finalError: ExperimentError | undefined = job.timedOut
          ? { code: "TIMED_OUT", message: `Execution timed out after ${job.timeoutMs} ms.`, recoverable: true }
          : job.cancelRequested
            ? outcome.error ?? { code: "CANCELLED", message: "Cancelled by user.", recoverable: true }
            : outcome.error;

        const completedExec: ExperimentExecution = {
          ...job.execution,
          status: finalStatus,
          finishedAtIso,
          durationMs,
          resultId: finalStatus === "completed" ? outcome.resultId : undefined,
          error: finalError,
          progress:
            finalStatus === "completed"
              ? { fraction: 1, stage: "Completed" }
              : job.execution.progress,
        };
        job.execution = completedExec;
        this.emit(completedExec);
        job.resolve(completedExec);
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        this.active.delete(job.execution.executionId);
        const finishedAtIso = new Date().toISOString();
        const durationMs = Math.max(0, Date.now() - startedMs);
        const failedStatus: ExperimentStatus = job.timedOut
          ? "timed-out"
          : job.cancelRequested
            ? "cancelled"
            : "failed";
        const failedExec: ExperimentExecution = {
          ...job.execution,
          status: failedStatus,
          finishedAtIso,
          durationMs,
          error: {
            code: failedStatus === "timed-out" ? "TIMED_OUT" : failedStatus === "cancelled" ? "CANCELLED" : "WORKER_ERROR",
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          },
        };
        job.execution = failedExec;
        this.emit(failedExec);
        job.resolve(failedExec);
      })
      .finally(() => {
        this.drain();
      });
  }
}
