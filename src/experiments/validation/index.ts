/**
 * ExperimentValidator — pre-execution validation binding ExperimentDefinition
 * to AtomicSystem, QuantumState, ExperimentRegistry, and PhysicsProviderRegistry.
 *
 * Clearly distinguishes schema/input errors (FAILED) from missing provider
 * capability or unsupported nuclear models (UNSUPPORTED).
 */
import { validateAtomicSystem } from "@/domain/atomic";
import {
  createNonRelativisticState,
  createRelativisticState,
  validateQuantumState,
} from "@/domain/quantum";
import {
  validationFromIssues,
  type SupportAssessment,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/validation";
import type { PhysicsProvider } from "@/physics/providers/contracts";
import type { PhysicsProviderRegistry } from "@/physics/providers/registry";
import { CONSTANTS_VERSION } from "@/physics/units";
import { createDefaultExperimentRegistry, type ExperimentRegistry } from "../registry";
import { EXPERIMENT_SCHEMA_VERSION, type ExperimentDefinition } from "../schema";

export interface ExperimentValidationReport {
  readonly validation: ValidationResult;
  readonly provider?: PhysicsProvider;
  readonly supportAssessment?: SupportAssessment;
  readonly unsupportedReason?: string;
}

export class ExperimentValidator {
  constructor(
    private readonly providerRegistry: PhysicsProviderRegistry,
    private readonly experimentRegistry: ExperimentRegistry = createDefaultExperimentRegistry(),
  ) {}

  validate(def: ExperimentDefinition): ExperimentValidationReport {
    const issues: ValidationIssue[] = [];

    if (!def.id || typeof def.id !== "string") {
      issues.push({ severity: "error", code: "INVALID_EXPERIMENT_ID", field: "id", message: "Experiment id must be a non-empty string." });
    }
    if (def.schemaVersion !== EXPERIMENT_SCHEMA_VERSION) {
      issues.push({
        severity: "error",
        code: "UNSUPPORTED_SCHEMA_VERSION",
        field: "schemaVersion",
        message: `Unsupported experiment schemaVersion "${String(def.schemaVersion)}" (expected "${EXPERIMENT_SCHEMA_VERSION}").`,
      });
    }
    if (def.constantsVersion !== CONSTANTS_VERSION) {
      issues.push({
        severity: "error",
        code: "UNSUPPORTED_CONSTANTS_VERSION",
        field: "constantsVersion",
        message: `Unsupported constantsVersion "${String(def.constantsVersion)}" (expected "${CONSTANTS_VERSION}").`,
      });
    }
    if (!def.title || !def.title.trim()) {
      issues.push({ severity: "error", code: "INVALID_TITLE", field: "title", message: "Experiment title cannot be empty." });
    }

    const descriptor = this.experimentRegistry.get(def.kind);
    if (!descriptor) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_EXPERIMENT_KIND",
        field: "kind",
        message: `Unknown experiment kind "${String(def.kind)}".`,
      });
    } else {
      if (def.quantumStates.length < descriptor.minStates || def.quantumStates.length > descriptor.maxStates) {
        issues.push({
          severity: "error",
          code: "INVALID_STATE_COUNT",
          field: "quantumStates",
          message: `Experiment kind "${def.kind}" requires ${descriptor.minStates}..${descriptor.maxStates} quantum states (got ${def.quantumStates.length}).`,
        });
      }
      if (descriptor.requiresTransition && !def.transition) {
        issues.push({
          severity: "error",
          code: "MISSING_TRANSITION_PAIR",
          field: "transition",
          message: `Experiment kind "${def.kind}" requires a transition initial/final pair.`,
        });
      }
    }

    if (def.observables.length === 0) {
      issues.push({
        severity: "error",
        code: "EMPTY_OBSERVABLES",
        field: "observables",
        message: "At least one observable must be requested.",
      });
    }

    issues.push(...validateAtomicSystem(def.system).issues);

    for (let i = 0; i < def.quantumStates.length; i++) {
      const stateRes = validateQuantumState(def.quantumStates[i]);
      for (const issue of stateRes.issues) {
        issues.push({ ...issue, field: `quantumStates[${i}].${issue.field ?? ""}` });
      }
    }

    if (def.transition) {
      const initRes = validateQuantumState(def.transition.initial);
      const finRes = validateQuantumState(def.transition.final);
      for (const issue of initRes.issues) {
        issues.push({ ...issue, field: `transition.initial.${issue.field ?? ""}` });
      }
      for (const issue of finRes.issues) {
        issues.push({ ...issue, field: `transition.final.${issue.field ?? ""}` });
      }
    }

    const provider = this.providerRegistry.getById(def.providerId);
    if (!provider) {
      issues.push({
        severity: "error",
        code: "UNKNOWN_PROVIDER",
        field: "providerId",
        message: `Physics provider "${def.providerId}" is not registered.`,
      });
      return { validation: validationFromIssues(issues) };
    }

    if (def.providerVersion && provider.version !== def.providerVersion) {
      issues.push({
        severity: "warning",
        code: "PROVIDER_VERSION_MISMATCH",
        field: "providerVersion",
        message: `Experiment requests provider version "${def.providerVersion}", registered version is "${provider.version}".`,
      });
    }

    // Check structural errors before checking provider support
    if (issues.some((i) => i.severity === "error")) {
      return { validation: validationFromIssues(issues), provider };
    }

    if (!provider.available) {
      const reason = provider.blocker ?? `Provider "${provider.id}" is unavailable in this environment.`;
      return {
        validation: validationFromIssues([
          ...issues,
          { severity: "error", code: "PROVIDER_UNAVAILABLE", field: "providerId", message: reason },
        ]),
        provider,
        supportAssessment: {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [reason],
          limitations: [reason],
          blockedBy: reason,
        },
        unsupportedReason: reason,
      };
    }

    // Missing capabilities check
    const missingCaps = def.observables.filter((obs) => !provider.capabilities.includes(obs));
    if (missingCaps.length > 0) {
      const msg = `Provider "${provider.id}" does not declare capabilities: ${missingCaps.join(", ")}.`;
      return {
        validation: validationFromIssues([
          ...issues,
          { severity: "error", code: "UNSUPPORTED_CAPABILITY", field: "observables", message: msg },
        ]),
        provider,
        supportAssessment: {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [msg],
          limitations: [],
        },
        unsupportedReason: msg,
      };
    }

    // Assess support across each specified quantum state (or transition pair states, or probe state for spectroscopy)
    const fallbackProbe =
      def.kind === "spectroscopy-series"
        ? [
            def.providerId === "dirac-coulomb"
              ? createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 })
              : createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 }),
          ]
        : [];
    const statesToCheck = def.quantumStates.length > 0
      ? def.quantumStates
      : def.transition
        ? [def.transition.initial, def.transition.final]
        : fallbackProbe;

    let lastSupport: SupportAssessment | undefined;
    for (const st of statesToCheck) {
      const supp = provider.supports(def.system, st);
      lastSupport = supp;
      if (!supp.supported) {
        const reason = supp.reasons.join("; ") || `Provider "${provider.id}" does not support this system/state combination.`;
        return {
          validation: validationFromIssues([
            ...issues,
            { severity: "error", code: "UNSUPPORTED_SYSTEM_OR_STATE", field: "system", message: reason },
          ]),
          provider,
          supportAssessment: supp,
          unsupportedReason: reason,
        };
      }

      const provVal = provider.validate({
        system: def.system,
        state: st,
        observables: def.observables,
        numericalOptions: def.numericalParameters,
      });
      issues.push(...provVal.issues);
    }

    return {
      validation: validationFromIssues(issues),
      provider,
      supportAssessment: lastSupport,
    };
  }
}
