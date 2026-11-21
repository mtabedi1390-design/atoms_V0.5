/**
 * Result normalization & ResultRegistry (ATOMS v0.6.0 Phase 2).
 *
 * Enforces:
 *  - Stale-result protection via monotonic runSequence per experimentId
 *  - Explicit distinction between newly computed results and loaded/imported replays
 *  - Preservation of provider identity/version, constantsVersion, units, model assumptions,
 *    numerical quality, and ScientificProvenance
 */
import type { CalculationResult } from "@/physics/providers/contracts";
import {
  createResultId,
  DEFAULT_ATOMIC_RESULT_UNITS,
  RESULT_SCHEMA_VERSION,
  toPlainCloneSafeData,
  type ExperimentDefinition,
  type ExperimentResultRecord,
  type ResultOrigin,
  type ResultUnitsManifest,
} from "../schema";

export interface NormalizeResultOptions {
  readonly resultId?: string;
  readonly executionId: string;
  readonly runSequence: number;
  readonly source: ResultOrigin;
  readonly recomputedCount: number;
  readonly units?: ResultUnitsManifest;
}

export function normalizeCalculationResult(
  def: ExperimentDefinition,
  raw: CalculationResult<unknown>,
  opts: NormalizeResultOptions,
): ExperimentResultRecord {
  return {
    resultId: opts.resultId ?? createResultId(),
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    experimentId: def.id,
    executionId: opts.executionId,
    runSequence: opts.runSequence,
    source: opts.source,
    recomputedCount: opts.recomputedCount,
    providerId: raw.provenance.providerId,
    providerVersion: raw.provenance.providerVersion,
    constantsVersion: raw.provenance.constantsVersion,
    units: opts.units ?? DEFAULT_ATOMIC_RESULT_UNITS,
    modelAssumptions: [...raw.provenance.assumptions],
    nuclearModelUsed: def.system.nuclearModel,
    reducedMassRatioUsed: def.system.reducedMassRatio,
    numericalQuality: raw.provenance.numericalQuality,
    provenance: raw.provenance,
    validationChecks: [...raw.validationChecks],
    observablesProduced: [...def.observables],
    payload: toPlainCloneSafeData(raw.data),
    computedAtIso: raw.computedAtIso,
  };
}

export type RecordResultOutcome =
  | { readonly accepted: true; readonly record: ExperimentResultRecord }
  | { readonly accepted: false; readonly reason: "STALE_RESULT" | "CANCELLED_EXECUTION" };

export class ResultRegistry {
  private readonly byResultId = new Map<string, ExperimentResultRecord>();
  private readonly byExperimentId = new Map<string, string[]>();
  private readonly latestSequence = new Map<string, number>();
  private readonly cancelledExecutions = new Set<string>();

  /** Registers the newest active runSequence for an experimentId to block stale results. */
  reserveSequence(experimentId: string, runSequence: number): void {
    const prev = this.latestSequence.get(experimentId) ?? 0;
    if (runSequence > prev) {
      this.latestSequence.set(experimentId, runSequence);
    }
  }

  markExecutionCancelled(executionId: string): void {
    this.cancelledExecutions.add(executionId);
  }

  getLatestSequence(experimentId: string): number {
    return this.latestSequence.get(experimentId) ?? 0;
  }

  recordComputed(record: ExperimentResultRecord): RecordResultOutcome {
    if (this.cancelledExecutions.has(record.executionId)) {
      return { accepted: false, reason: "CANCELLED_EXECUTION" };
    }
    const latestSeq = this.latestSequence.get(record.experimentId) ?? 0;
    if (record.runSequence < latestSeq) {
      return { accepted: false, reason: "STALE_RESULT" };
    }
    this.latestSequence.set(record.experimentId, record.runSequence);
    this.storeInternal(record);
    return { accepted: true, record };
  }

  /**
   * Loads an already persisted/imported result without altering its original computedAtIso,
   * flagging source as "loaded-from-store" or "imported-json" so replay stays distinct from recompute.
   */
  recordLoaded(record: ExperimentResultRecord, origin: "loaded-from-store" | "imported-json" = "loaded-from-store"): ExperimentResultRecord {
    const marked: ExperimentResultRecord = {
      ...record,
      source: origin,
      loadedAtIso: new Date().toISOString(),
    };
    const prevSeq = this.latestSequence.get(marked.experimentId) ?? 0;
    if (marked.runSequence > prevSeq) {
      this.latestSequence.set(marked.experimentId, marked.runSequence);
    }
    this.storeInternal(marked);
    return marked;
  }

  private storeInternal(record: ExperimentResultRecord): void {
    this.byResultId.set(record.resultId, record);
    const list = this.byExperimentId.get(record.experimentId) ?? [];
    if (!list.includes(record.resultId)) {
      list.push(record.resultId);
      this.byExperimentId.set(record.experimentId, list);
    }
  }

  getById(resultId: string): ExperimentResultRecord | undefined {
    return this.byResultId.get(resultId);
  }

  listForExperiment(experimentId: string): readonly ExperimentResultRecord[] {
    const ids = this.byExperimentId.get(experimentId) ?? [];
    return ids.map((id) => this.byResultId.get(id)).filter((r): r is ExperimentResultRecord => Boolean(r));
  }

  getLatestForExperiment(experimentId: string): ExperimentResultRecord | undefined {
    const list = this.listForExperiment(experimentId);
    if (list.length === 0) return undefined;
    return list[list.length - 1];
  }

  listAll(): readonly ExperimentResultRecord[] {
    return [...this.byResultId.values()];
  }

  clear(): void {
    this.byResultId.clear();
    this.byExperimentId.clear();
    this.latestSequence.clear();
    this.cancelledExecutions.clear();
  }
}
