/**
 * Non-breaking adapters bridging all 5 verified ATOMS v0.5.0 providers into
 * the general ATOMS v0.6.0 PhysicsProvider contract.
 *
 * Preserves every v0.5 validation check, evidence class, limitation, and blocker
 * without duplicating underlying scientific data.
 */
import type { AtomicSystem } from "@/domain/atomic";
import type { QuantumState } from "@/domain/quantum";
import { okValidation, validationFromIssues, type SupportAssessment, type ValidationIssue, type ValidationResult } from "@/domain/validation";
import { validateAtomicSystem } from "@/domain/atomic";
import { validateQuantumState } from "@/domain/quantum";
import { CONSTANTS_VERSION } from "@/physics/units";
import {
  datatomsProvider,
  graspProvider,
  lobatoDFProvider,
  pyscfHFProvider,
  slaterProvider,
  type ProviderResult,
} from "@/science/providers";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "./contracts";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Calculation aborted", "AbortError");
  }
}

function validateNeutralConfigInput(input: ProviderCalculationInput): ValidationResult {
  const issues: ValidationIssue[] = [
    ...validateAtomicSystem(input.system).issues,
    ...validateQuantumState(input.state).issues,
  ];
  if (input.system.q !== 0) {
    issues.push({
      severity: "error",
      code: "REQUIRES_NEUTRAL_ATOM",
      field: "system.q",
      message: `Neutral-atom density provider requires q = 0 (N = Z); got q=${input.system.q}.`,
    });
  }
  return validationFromIssues(issues);
}

/** Lobato et al. (2026) Dirac-Fock neutral-atom total density provider (Z = 1..118). */
export const lobatoDiracFockV6Provider: PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput,
  ProviderResult
> = {
  id: lobatoDFProvider.id,
  name: lobatoDFProvider.label,
  version: "arXiv:2608.14934",
  available: lobatoDFProvider.availability.available,
  capabilities: ["total-spherical-density", "radial-probability"],

  supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
    if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Lobato et al. (2026) Dirac–Fock uses a fixed published nuclear charge table and does not support parameterized "${system.nuclearModel.kind}" solvers.`],
        limitations: ["No user-parameterized finite-nucleus solver is available."],
      };
    }
    if (system.q !== 0 || system.N !== system.Z) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Lobato et al. (2026) Dirac–Fock tabulates neutral atoms only (N = Z); got Z=${system.Z}, N=${system.N} (q=${system.q}).`],
        limitations: ["Does not compute charged ions (positive or negative)."],
      };
    }
    if (state.kind !== "configuration-average") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Lobato et al. (2026) provides total spherically averaged neutral-atom density ρ(r) only; state kind "${state.kind}" (orbital/spinor-resolved) is not resolved.`],
        limitations: ["No subshell R_nl(r) or spinor P_nkappa(r) orbitals available."],
      };
    }
    return {
      supported: true,
      evidenceClass: lobatoDFProvider.evidenceClass,
      reasons: [`Neutral ${system.species.symbol} (Z=${system.Z}) is covered by Lobato 2026 Dirac–Padé total density.`],
      limitations: [
        "Total spherical density only — does not resolve individual subshell orbitals or phase.",
        "Open-shell atoms use spherical occupation averages.",
      ],
    };
  },

  validate: validateNeutralConfigInput,

  async calculate(input: ProviderCalculationInput, context: CalculationContext): Promise<CalculationResult<ProviderResult>> {
    throwIfAborted(context.signal);
    const supp = this.supports(input.system, input.state);
    if (!supp.supported) throw new Error(supp.reasons.join("; "));
    context.onProgress?.(0.25, "Evaluating Lobato 2026 Dirac–Padé density");
    const res = lobatoDFProvider.compute({ Z: input.system.Z, observable: "relativistic-density", accuracy: "quantitative" });
    if (!res) throw new Error(`Lobato Dirac–Fock computation failed for Z=${input.system.Z}`);
    throwIfAborted(context.signal);
    context.onProgress?.(1, "Complete");
    return {
      ok: res.validation.passed,
      data: res,
      validationChecks: res.validation.checks,
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: this.id,
        providerVersion: res.metadata.version,
        modelName: res.metadata.name,
        hamiltonian: res.metadata.hamiltonian,
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: res.evidenceClass,
        assumptions: [res.metadata.nuclearModel, res.metadata.openShellConvention],
        limitations: res.metadata.limitations,
        numericalQuality: {
          method: res.metadata.method,
          gridPoints: res.densityTable?.rBohr.length,
          relativeChargeError: res.densityTable
            ? Math.abs(res.densityTable.integratedElectrons - input.system.Z) / input.system.Z
            : undefined,
        },
        uncertainty: {
          modelApproximationNote: "Single-configuration 4-component Dirac–Fock spherical density; omits electron correlation and subshell decomposition.",
        },
        sourceCitation: res.metadata.url,
        license: res.metadata.license,
      },
    };
  },
};

/** Bundled PySCF aug-cc-pVTZ RHF/ROHF provider (H, He, C, N, O, Ne only). */
export const pyscfHartreeFockV6Provider: PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput,
  ProviderResult
> = {
  id: pyscfHFProvider.id,
  name: pyscfHFProvider.label,
  version: "2.15.1",
  available: pyscfHFProvider.availability.available,
  capabilities: ["total-spherical-density", "total-energy", "radial-probability"],

  supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
    if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Bundled PySCF HF datasets assume a fixed point-nucleus model and do not support parameterized "${system.nuclearModel.kind}" solvers.`],
        limitations: [],
      };
    }
    if (system.q !== 0) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Bundled PySCF HF datasets cover neutral atoms only (got q=${system.q}).`],
        limitations: [],
      };
    }
    if (state.kind !== "configuration-average") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Bundled PySCF HF datasets export spherically averaged total density only; "${state.kind}" orbitals are not exported.`],
        limitations: [],
      };
    }
    if (!pyscfHFProvider.supports({ Z: system.Z, observable: "electron-density", accuracy: "quantitative" })) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`No bundled PySCF HF dataset exists for Z=${system.Z} (${system.species.symbol}). Available Z: 1, 2, 6, 7, 8, 10.`],
        limitations: ["Non-relativistic RHF/ROHF aug-cc-pVTZ without correlation."],
      };
    }
    return {
      supported: true,
      evidenceClass: pyscfHFProvider.evidenceClass,
      reasons: [`Bundled PySCF RHF/ROHF dataset available for ${system.species.symbol}.`],
      limitations: ["Non-relativistic, basis-set-limited (aug-cc-pVTZ), no correlation, total density only."],
    };
  },

  validate: validateNeutralConfigInput,

  async calculate(input: ProviderCalculationInput, context: CalculationContext): Promise<CalculationResult<ProviderResult>> {
    throwIfAborted(context.signal);
    const supp = this.supports(input.system, input.state);
    if (!supp.supported) throw new Error(supp.reasons.join("; "));
    const res = pyscfHFProvider.compute({ Z: input.system.Z, observable: "electron-density", accuracy: "quantitative" });
    if (!res) throw new Error(`No PySCF HF dataset for Z=${input.system.Z}`);
    context.onProgress?.(1, "Complete");
    return {
      ok: res.validation.passed,
      data: res,
      validationChecks: res.validation.checks,
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: this.id,
        providerVersion: res.metadata.version,
        modelName: res.metadata.name,
        hamiltonian: res.metadata.hamiltonian,
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: res.evidenceClass,
        assumptions: [res.metadata.nuclearModel, res.metadata.openShellConvention],
        limitations: res.metadata.limitations,
        numericalQuality: {
          method: res.metadata.method,
          gridPoints: res.densityTable?.rBohr.length,
        },
        uncertainty: {
          modelApproximationNote: `Finite-basis (${res.metadata.basis}) non-relativistic HF; omits electron correlation and relativistic effects.`,
        },
        sourceCitation: res.metadata.url,
        license: res.metadata.license,
      },
    };
  },
};

/** Qualitative Slater-screened browser estimate (neutral multi-electron atoms). */
export const slaterV6Provider: PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput,
  ProviderResult
> = {
  id: slaterProvider.id,
  name: slaterProvider.label,
  version: "0.5.0",
  available: slaterProvider.availability.available,
  capabilities: ["total-spherical-density", "radial-probability", "spatial-density"],

  supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
    if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Slater screening rules assume a point nucleus and do not support parameterized "${system.nuclearModel.kind}" solvers.`],
        limitations: [],
      };
    }
    if (system.q !== 0) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Slater screening tables in v0.5/v0.6 apply to neutral ground configurations (got q=${system.q}).`],
        limitations: [],
      };
    }
    if (state.kind !== "configuration-average" && state.kind !== "nonrelativistic") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Slater screening is non-relativistic; incompatible with "${state.kind}" state.`],
        limitations: [],
      };
    }
    return {
      supported: true,
      evidenceClass: slaterProvider.evidenceClass,
      reasons: [`Qualitative Slater-screened independent-electron estimate for neutral ${system.species.symbol}.`],
      limitations: [
        "Empirical Slater (1930) screening rules; NOT self-consistent HF/DF and NOT valid for bound energies.",
      ],
    };
  },

  validate(input: ProviderCalculationInput): ValidationResult {
    return validateNeutralConfigInput(input);
  },

  async calculate(input: ProviderCalculationInput, context: CalculationContext): Promise<CalculationResult<ProviderResult>> {
    throwIfAborted(context.signal);
    const supp = this.supports(input.system, input.state);
    if (!supp.supported) throw new Error(supp.reasons.join("; "));
    const res = slaterProvider.compute({ Z: input.system.Z, observable: "electron-density", accuracy: "interactive" })!;
    context.onProgress?.(1, "Complete");
    return {
      ok: res.validation.passed,
      data: res,
      validationChecks: res.validation.checks,
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: this.id,
        providerVersion: res.metadata.version,
        modelName: res.metadata.name,
        hamiltonian: res.metadata.hamiltonian,
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: res.evidenceClass,
        assumptions: [res.metadata.openShellConvention],
        limitations: res.metadata.limitations,
        numericalQuality: { method: res.metadata.method },
        uncertainty: {
          modelApproximationNote: "Qualitative empirical screening estimate; omits SCF, electron correlation, and relativity.",
        },
        license: res.metadata.license,
      },
    };
  },
};

function makeUnavailableProvider(
  id: string,
  name: string,
  version: string,
  blocker: string,
): PhysicsProvider<AtomicSystem, QuantumState, ProviderCalculationInput, never> {
  return {
    id,
    name,
    version,
    available: false,
    blocker,
    capabilities: [],
    supports: () => ({
      supported: false,
      evidenceClass: "unavailable",
      reasons: [blocker],
      limitations: [blocker],
      blockedBy: blocker,
    }),
    validate: () => okValidation([{ severity: "error", code: "PROVIDER_UNAVAILABLE", message: blocker }]),
    calculate: async () => {
      throw new Error(`Provider ${id} is unavailable: ${blocker}`);
    },
  };
}

export const datatomsV6Provider = makeUnavailableProvider(
  datatomsProvider.id,
  datatomsProvider.label,
  "2026-1z118-1n10",
  datatomsProvider.availability.blocker!,
);

export const graspV6Provider = makeUnavailableProvider(
  graspProvider.id,
  graspProvider.label,
  "GRASP2018",
  graspProvider.availability.blocker!,
);
