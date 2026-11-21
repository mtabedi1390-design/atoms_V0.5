/**
 * ExperimentSerializer — versioned JSON export/import with strict schema,
 * atomic system, quantum state, units, constantsVersion, and provenance validation
 * (ATOMS v0.6.0 Phase 2).
 */
import { validateAtomicSystem } from "@/domain/atomic";
import { validateQuantumState } from "@/domain/quantum";
import { validationFromIssues, type ValidationIssue } from "@/domain/validation";
import { CONSTANTS_VERSION } from "@/physics/units";
import { createDefaultExperimentRegistry } from "../registry";
import {
  createExecutionId,
  createExperimentId,
  createResultId,
  EXECUTION_SCHEMA_VERSION,
  EXPERIMENT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION,
  toPlainCloneSafeData,
  type ExperimentDefinition,
  type ExperimentExecution,
  type ExperimentResultRecord,
} from "../schema";

export const EXPERIMENT_BUNDLE_FORMAT = "atoms-experiment-bundle" as const;
export const EXPERIMENT_BUNDLE_VERSION = 1 as const;

export interface ExperimentBundleEntry {
  readonly definition: ExperimentDefinition;
  readonly executions: readonly ExperimentExecution[];
  readonly results: readonly ExperimentResultRecord[];
}

export interface ExperimentJsonBundle {
  readonly format: typeof EXPERIMENT_BUNDLE_FORMAT;
  readonly bundleVersion: typeof EXPERIMENT_BUNDLE_VERSION;
  readonly exportedAtIso: string;
  readonly entries: readonly ExperimentBundleEntry[];
}

export type JsonImportOutcome =
  | { readonly ok: true; readonly bundle: ExperimentJsonBundle; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly message: string; readonly issues: readonly ValidationIssue[] };

export class ExperimentSerializer {
  private static readonly expRegistry = createDefaultExperimentRegistry();

  static exportEntry(entry: ExperimentBundleEntry): string {
    const bundle: ExperimentJsonBundle = {
      format: EXPERIMENT_BUNDLE_FORMAT,
      bundleVersion: EXPERIMENT_BUNDLE_VERSION,
      exportedAtIso: new Date().toISOString(),
      entries: [
        {
          definition: toPlainCloneSafeData(entry.definition) as ExperimentDefinition,
          executions: entry.executions.map((e) => toPlainCloneSafeData(e) as ExperimentExecution),
          results: entry.results.map((r) => toPlainCloneSafeData(r) as ExperimentResultRecord),
        },
      ],
    };
    return JSON.stringify(bundle, null, 2);
  }

  static exportMultiple(entries: readonly ExperimentBundleEntry[]): string {
    const bundle: ExperimentJsonBundle = {
      format: EXPERIMENT_BUNDLE_FORMAT,
      bundleVersion: EXPERIMENT_BUNDLE_VERSION,
      exportedAtIso: new Date().toISOString(),
      entries: entries.map((entry) => ({
        definition: toPlainCloneSafeData(entry.definition) as ExperimentDefinition,
        executions: entry.executions.map((e) => toPlainCloneSafeData(e) as ExperimentExecution),
        results: entry.results.map((r) => toPlainCloneSafeData(r) as ExperimentResultRecord),
      })),
    };
    return JSON.stringify(bundle, null, 2);
  }

  static importFromJson(rawJson: string): JsonImportOutcome {
    const issues: ValidationIssue[] = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (e) {
      const msg = `Malformed JSON: ${e instanceof Error ? e.message : String(e)}`;
      return {
        ok: false,
        message: msg,
        issues: [{ severity: "error", code: "MALFORMED_JSON", message: msg }],
      };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const msg = "Bundle root must be a JSON object.";
      return { ok: false, message: msg, issues: [{ severity: "error", code: "INVALID_BUNDLE_ROOT", message: msg }] };
    }

    const b = parsed as Record<string, unknown>;
    if (b.format !== EXPERIMENT_BUNDLE_FORMAT) {
      issues.push({
        severity: "error",
        code: "INVALID_BUNDLE_FORMAT",
        field: "format",
        message: `Expected format "${EXPERIMENT_BUNDLE_FORMAT}", got "${String(b.format)}".`,
      });
    }
    if (b.bundleVersion !== EXPERIMENT_BUNDLE_VERSION) {
      issues.push({
        severity: "error",
        code: "UNSUPPORTED_BUNDLE_VERSION",
        field: "bundleVersion",
        message: `Unsupported bundleVersion ${String(b.bundleVersion)} (only version ${EXPERIMENT_BUNDLE_VERSION} is supported).`,
      });
    }
    if (!Array.isArray(b.entries) || b.entries.length === 0) {
      issues.push({
        severity: "error",
        code: "EMPTY_BUNDLE_ENTRIES",
        field: "entries",
        message: "Bundle must contain a non-empty entries array.",
      });
    }

    if (issues.some((i) => i.severity === "error")) {
      return {
        ok: false,
        message: issues.map((i) => i.message).join("; "),
        issues,
      };
    }

    const entries = b.entries as unknown[];
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const prefix = `entries[${idx}]`;
      if (!entry || typeof entry !== "object") {
        issues.push({ severity: "error", code: "INVALID_ENTRY", field: prefix, message: `${prefix} must be an object.` });
        continue;
      }
      const eObj = entry as Record<string, unknown>;
      const def = eObj.definition as ExperimentDefinition | undefined;
      if (!def || typeof def !== "object") {
        issues.push({ severity: "error", code: "MISSING_DEFINITION", field: `${prefix}.definition`, message: `${prefix}.definition is missing.` });
        continue;
      }

      if (def.schemaVersion !== EXPERIMENT_SCHEMA_VERSION) {
        issues.push({
          severity: "error",
          code: "UNSUPPORTED_EXPERIMENT_SCHEMA_VERSION",
          field: `${prefix}.definition.schemaVersion`,
          message: `Unsupported experiment schemaVersion "${String(def.schemaVersion)}" (expected "${EXPERIMENT_SCHEMA_VERSION}").`,
        });
      }
      if (def.constantsVersion !== CONSTANTS_VERSION) {
        issues.push({
          severity: "error",
          code: "UNSUPPORTED_CONSTANTS_VERSION",
          field: `${prefix}.definition.constantsVersion`,
          message: `Unsupported constantsVersion "${String(def.constantsVersion)}" (expected "${CONSTANTS_VERSION}").`,
        });
      }
      if (!this.expRegistry.get(def.kind)) {
        issues.push({
          severity: "error",
          code: "UNKNOWN_EXPERIMENT_KIND",
          field: `${prefix}.definition.kind`,
          message: `Unknown experiment kind "${String(def.kind)}".`,
        });
      }
      if (!def.id || typeof def.id !== "string" || !def.providerId || !def.providerVersion) {
        issues.push({
          severity: "error",
          code: "INCOMPLETE_EXPERIMENT_METADATA",
          field: `${prefix}.definition`,
          message: "Experiment definition requires id, providerId, and providerVersion.",
        });
      }

      if (!def.system || typeof def.system !== "object") {
        issues.push({ severity: "error", code: "MISSING_ATOMIC_SYSTEM", field: `${prefix}.definition.system`, message: "AtomicSystem is required." });
      } else {
        const sysVal = validateAtomicSystem(def.system);
        for (const iss of sysVal.issues) {
          issues.push({ ...iss, field: `${prefix}.definition.system.${iss.field ?? ""}` });
        }
      }

      if (!Array.isArray(def.quantumStates)) {
        issues.push({ severity: "error", code: "INVALID_QUANTUM_STATES", field: `${prefix}.definition.quantumStates`, message: "quantumStates must be an array." });
      } else {
        for (let sIdx = 0; sIdx < def.quantumStates.length; sIdx++) {
          const stVal = validateQuantumState(def.quantumStates[sIdx]);
          for (const iss of stVal.issues) {
            issues.push({ ...iss, field: `${prefix}.definition.quantumStates[${sIdx}].${iss.field ?? ""}` });
          }
        }
      }

      if (!Array.isArray(eObj.executions)) {
        issues.push({ severity: "error", code: "INVALID_EXECUTIONS", field: `${prefix}.executions`, message: "executions must be an array." });
      } else {
        for (let xIdx = 0; xIdx < eObj.executions.length; xIdx++) {
          const exec = eObj.executions[xIdx] as ExperimentExecution | undefined;
          if (!exec || exec.executionSchemaVersion !== EXECUTION_SCHEMA_VERSION || !exec.executionId || !exec.status) {
            issues.push({
              severity: "error",
              code: "INVALID_EXECUTION_RECORD",
              field: `${prefix}.executions[${xIdx}]`,
              message: `Execution record at ${prefix}.executions[${xIdx}] is missing required schemaVersion "${EXECUTION_SCHEMA_VERSION}" or fields.`,
            });
          }
        }
      }

      if (!Array.isArray(eObj.results)) {
        issues.push({ severity: "error", code: "INVALID_RESULTS", field: `${prefix}.results`, message: "results must be an array." });
      } else {
        for (let rIdx = 0; rIdx < eObj.results.length; rIdx++) {
          const res = eObj.results[rIdx] as ExperimentResultRecord | undefined;
          if (
            !res ||
            res.resultSchemaVersion !== RESULT_SCHEMA_VERSION ||
            !res.resultId ||
            !res.providerId ||
            !res.providerVersion ||
            res.constantsVersion !== CONSTANTS_VERSION ||
            !res.units ||
            !res.provenance
          ) {
            issues.push({
              severity: "error",
              code: "INVALID_RESULT_RECORD",
              field: `${prefix}.results[${rIdx}]`,
              message: `Result record at ${prefix}.results[${rIdx}] is missing required provenance, units, constantsVersion, or schemaVersion "${RESULT_SCHEMA_VERSION}".`,
            });
          }
        }
      }
    }

    const resVal = validationFromIssues(issues);
    if (!resVal.valid) {
      return {
        ok: false,
        message: issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "),
        issues,
      };
    }

    return {
      ok: true,
      bundle: parsed as ExperimentJsonBundle,
      warnings: issues.filter((i) => i.severity !== "error"),
    };
  }

  /**
   * Imports a validated JSON bundle entry into a brand-new ExperimentDefinition ID,
   * preserving original provenance, units, and timestamps while flagging imported origin.
   */
  static importIntoFreshRecord(rawJson: string):
    | { readonly ok: true; readonly imported: readonly ExperimentBundleEntry[]; readonly warnings: readonly ValidationIssue[] }
    | { readonly ok: false; readonly message: string; readonly issues: readonly ValidationIssue[] } {
    const check = this.importFromJson(rawJson);
    if (!check.ok) return check;

    const now = new Date().toISOString();
    const imported: ExperimentBundleEntry[] = check.bundle.entries.map((entry) => {
      const freshExpId = createExperimentId();
      const freshDef: ExperimentDefinition = {
        ...entry.definition,
        id: freshExpId,
        updatedAtIso: now,
        originNote: `Imported from ${entry.definition.id} (${entry.definition.createdAtIso})`,
      };
      const execIdMap = new Map<string, string>();
      const resIdMap = new Map<string, string>();
      for (const ex of entry.executions) execIdMap.set(ex.executionId, createExecutionId());
      for (const r of entry.results) resIdMap.set(r.resultId, createResultId());

      const freshExecs: ExperimentExecution[] = entry.executions.map((ex) => ({
        ...ex,
        executionId: execIdMap.get(ex.executionId) ?? createExecutionId(),
        experimentId: freshExpId,
        ...(ex.resultId ? { resultId: resIdMap.get(ex.resultId) ?? ex.resultId } : {}),
      }));
      const freshResults: ExperimentResultRecord[] = entry.results.map((r) => ({
        ...r,
        resultId: resIdMap.get(r.resultId) ?? createResultId(),
        executionId: execIdMap.get(r.executionId) ?? r.executionId,
        experimentId: freshExpId,
        source: "imported-json",
        loadedAtIso: now,
      }));
      return {
        definition: freshDef,
        executions: freshExecs,
        results: freshResults,
      };
    });

    return { ok: true, imported, warnings: check.warnings };
  }
}
