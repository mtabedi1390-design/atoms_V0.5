/**
 * Main-thread ExperimentWorkerClient (ATOMS v0.6.0 Phase 2).
 *
 * Validates structured-clone safety on outbound requests, tracks per-experiment
 * runSequence for stale-result discarding, supports active cancellation, and
 * delegates execution to an injected WorkerLike factory.
 */
import type { SupportAssessment } from "@/domain/validation";
import type { ExperimentDefinition, ExperimentError, ExperimentResultRecord } from "@/experiments/schema";
import {
  assertStructuredCloneSafe,
  type ExperimentWorkerInbound,
  type ExperimentWorkerOutbound,
  type WorkerLike,
} from "./protocol";

export interface WorkerExecutionCallbacks {
  readonly onProgress?: (fraction: number, stage?: string) => void;
  readonly onCompleted: (result: ExperimentResultRecord) => void;
  readonly onCancelled: (reason?: string) => void;
  readonly onUnsupported: (reason: string, assessment?: SupportAssessment) => void;
  readonly onFailed: (error: ExperimentError) => void;
  readonly onStaleDiscarded?: (msg: ExperimentWorkerOutbound) => void;
}

interface PendingJob {
  readonly executionId: string;
  readonly experimentId: string;
  readonly runSequence: number;
  readonly callbacks: WorkerExecutionCallbacks;
}

export class ExperimentWorkerClient {
  private worker: WorkerLike | null = null;
  private readonly pending = new Map<string, PendingJob>();
  private readonly latestSeqByExp = new Map<string, number>();

  constructor(private readonly workerFactory: () => WorkerLike) {}

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.onmessage = (ev) => this.handleMessage(ev.data);
      this.worker.onerror = (ev) => {
        const message = ev.message || "Experiment worker crashed.";
        for (const job of this.pending.values()) {
          job.callbacks.onFailed({ code: "WORKER_ERROR", message, recoverable: true });
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }

  submit(
    params: {
      executionId: string;
      experimentId: string;
      runSequence: number;
      recomputedCount: number;
      definition: ExperimentDefinition;
    },
    callbacks: WorkerExecutionCallbacks,
  ): void {
    const prevSeq = this.latestSeqByExp.get(params.experimentId) ?? 0;
    if (params.runSequence > prevSeq) {
      this.latestSeqByExp.set(params.experimentId, params.runSequence);
    }

    const req: ExperimentWorkerInbound = {
      type: "run-experiment",
      executionId: params.executionId,
      experimentId: params.experimentId,
      runSequence: params.runSequence,
      recomputedCount: params.recomputedCount,
      definition: params.definition,
    };
    assertStructuredCloneSafe(req, "workerRequest");

    this.pending.set(params.executionId, {
      executionId: params.executionId,
      experimentId: params.experimentId,
      runSequence: params.runSequence,
      callbacks,
    });
    this.ensureWorker().postMessage(req);
  }

  cancel(executionId: string, reason = "Cancelled by user"): void {
    const req: ExperimentWorkerInbound = {
      type: "cancel-experiment",
      executionId,
      reason,
    };
    assertStructuredCloneSafe(req, "workerCancel");
    this.worker?.postMessage(req);
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }

  private handleMessage(msg: ExperimentWorkerOutbound): void {
    const job = this.pending.get(msg.executionId);
    if (!job) return;

    const latestSeq = this.latestSeqByExp.get(msg.experimentId) ?? 0;
    const isStale = msg.runSequence < latestSeq;

    if (msg.type === "progress") {
      if (isStale) {
        job.callbacks.onStaleDiscarded?.(msg);
        return;
      }
      job.callbacks.onProgress?.(msg.fraction, msg.stage);
      return;
    }

    this.pending.delete(msg.executionId);

    if (isStale && msg.type !== "cancelled") {
      job.callbacks.onStaleDiscarded?.(msg);
      return;
    }

    switch (msg.type) {
      case "completed":
        job.callbacks.onCompleted(msg.result);
        break;
      case "cancelled":
        job.callbacks.onCancelled(msg.reason);
        break;
      case "unsupported":
        job.callbacks.onUnsupported(msg.reason, msg.assessment);
        break;
      case "failed":
        job.callbacks.onFailed(msg.error);
        break;
    }
  }
}
