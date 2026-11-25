/**
 * Live Post-Hartree–Fock Electron Correlation PhysicsProvider (ATOMS v0.7.2).
 *
 * Bridges ATOMS ExperimentPlatform / PhysicsProviderRegistry / Web Worker runtime
 * to the genuine local PySCF 2.15.1 MP2, CISD, and FCI Python backend (`/api/correlation/calculate`).
 *
 * Strictly enforces:
 *  - Fixed point-infinite-mass non-relativistic nuclear model
 *  - Explicit rejection of AtomSphAverageRHF fractional ensembles
 *  - Explicit rejection of ROHF + CISD (PySCF silently converts ROHF to UHF/UCISD)
 *  - Energy identity check |E_total - (E_HF + E_corr)| < 1e-9 Ha
 *  - Converged SCF reference requirement and FCI spin diagnostics
 *  - Zero mock data or offline fallbacks
 */
import type { AtomicSystem } from "@/domain/atomic";
import { validateAtomicSystem } from "@/domain/atomic";
import type { ElectronCorrelationState, QuantumState } from "@/domain/quantum";
import { validateElectronCorrelationState } from "@/domain/quantum";
import {
  validationFromIssues,
  type SupportAssessment,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/validation";
import { getBasisCatalogEntry, isBasisSupportedForZ } from "@/physics/hf";
import {
  defaultHttpCorrelationTransport,
  estimateCorrelationDimensions,
  getCachedCorrelationCapabilities,
  getCorrelationMethodDescriptor,
  validateReferenceAndMethodCompatibility,
  type CorrelationCalculationResponse,
  type CorrelationTransport,
} from "@/physics/correlation";
import { CONSTANTS_VERSION } from "@/physics/units";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "../contracts";

export const PYSCF_CORRELATION_PROVIDER_ID = "pyscf-correlation-live";
export const PYSCF_CORRELATION_PROVIDER_VERSION = "0.7.2";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Calculation aborted", "AbortError");
  }
}

export function createPyscfCorrelationProvider(
  transport: CorrelationTransport = defaultHttpCorrelationTransport,
): PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput<ElectronCorrelationState>,
  CorrelationCalculationResponse
> {
  return {
    id: PYSCF_CORRELATION_PROVIDER_ID,
    name: "PySCF Post-Hartree–Fock Electron Correlation (MP2 / CISD / FCI)",
    version: PYSCF_CORRELATION_PROVIDER_VERSION,
    get available(): boolean {
      const cap = getCachedCorrelationCapabilities();
      if (cap !== null) return cap.available;
      return typeof fetch === "function";
    },
    get blocker(): string | undefined {
      const cap = getCachedCorrelationCapabilities();
      if (cap && !cap.available) return cap.blocker;
      if (typeof fetch !== "function" && transport === defaultHttpCorrelationTransport) {
        return "HTTP fetch unavailable without custom CorrelationTransport in this runtime.";
      }
      return undefined;
    },
    capabilities: [
      "electron-correlation",
      "mp2-perturbation",
      "cisd-ci",
      "full-ci",
      "total-energy",
      "scf-diagnostics",
    ],

    supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
      const cached = getCachedCorrelationCapabilities();
      if (cached && !cached.available) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [cached.blocker ?? "PySCF Electron Correlation local backend is offline or unavailable."],
          limitations: ["Requires local ATOMS Express+PySCF backend (`/api/correlation/calculate`)."],
          blockedBy: cached.blocker ?? "Correlation backend unavailable",
        };
      }

      if (system.nuclearModel.kind !== "point-infinite-mass") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `Post-HF correlation requires fixed point-infinite-mass nucleus; "${system.nuclearModel.kind}" is not supported.`,
          ],
          limitations: ["Non-relativistic fixed point-nucleus Coulomb Hamiltonian only."],
        };
      }

      if (state.kind !== "electron-correlation") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `PySCF Correlation provider requires ElectronCorrelationState (kind="electron-correlation"); received "${state.kind}".`,
          ],
          limitations: [],
        };
      }

      if (system.Z < 1 || system.Z > 54) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [`Post-HF correlation backend supports Z=1..54 (got Z=${system.Z}).`],
          limitations: [],
        };
      }

      if (system.N < 1 || system.N > system.Z + 4) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [`Electron count N=${system.N} is outside supported range 1..${system.Z + 4} for Z=${system.Z}.`],
          limitations: [],
        };
      }

      const basisCheck = isBasisSupportedForZ(state.basis, system.Z, cached);
      if (!basisCheck.supported) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [basisCheck.reason ?? `Basis ${state.basis} does not cover Z=${system.Z}.`],
          limitations: [],
        };
      }

      const compat = validateReferenceAndMethodCompatibility({
        Z: system.Z,
        N: system.N,
        spin2S: state.spin2S,
        referenceMethod: state.referenceMethod,
        correlationMethod: state.correlationMethod,
        frozenCoreMode: state.frozenCoreMode,
      });
      if (!compat.valid) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [compat.reason ?? "Incompatible reference/correlation combination."],
          limitations: [],
        };
      }

      const preflight = estimateCorrelationDimensions({
        Z: system.Z,
        N: system.N,
        spin2S: state.spin2S,
        basis: state.basis,
        referenceMethod: state.referenceMethod,
        correlationMethod: state.correlationMethod,
        frozenCoreMode: state.frozenCoreMode,
        nRoots: state.nRoots,
        capabilities: cached,
      });
      if (!preflight.withinLimits) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [preflight.limitReason ?? "Resource limits exceeded for correlation calculation."],
          limitations: [],
        };
      }

      const basisMeta = getBasisCatalogEntry(state.basis);
      const methodMeta = getCorrelationMethodDescriptor(state.correlationMethod);
      return {
        supported: true,
        evidenceClass: "computed-and-validated",
        reasons: [
          `PySCF ${state.referenceMethod.toUpperCase()}/${methodMeta.shortLabel} (${basisMeta.label}) supports ${system.species.symbol} (Z=${system.Z}, N=${system.N}, 2S=${state.spin2S}).`,
        ],
        limitations: [
          methodMeta.caveat,
          "Finite-basis non-relativistic C1 determinant space; does NOT compute <L^2> or LS-coupled terms.",
          basisMeta.knownLimitations,
        ],
      };
    },

    validate(input: ProviderCalculationInput<ElectronCorrelationState>): ValidationResult {
      const issues: ValidationIssue[] = [...validateAtomicSystem(input.system).issues];
      if (input.state.kind !== "electron-correlation") {
        issues.push({
          severity: "error",
          code: "CORRELATION_STATE_REQUIRED",
          field: "state",
          message: `Expected ElectronCorrelationState, got "${(input.state as QuantumState).kind}".`,
        });
        return validationFromIssues(issues);
      }

      issues.push(...validateElectronCorrelationState(input.state).issues);

      if (input.state.N !== input.system.N) {
        issues.push({
          severity: "error",
          code: "CORRELATION_N_MISMATCH",
          field: "state.N",
          message: `State electron count N=${input.state.N} differs from system N=${input.system.N}.`,
        });
      }

      if (input.system.nuclearModel.kind !== "point-infinite-mass") {
        issues.push({
          severity: "error",
          code: "CORRELATION_REQUIRES_POINT_NUCLEUS",
          field: "system.nuclearModel",
          message: `Post-HF correlation requires point-infinite-mass nuclear model (got "${input.system.nuclearModel.kind}").`,
        });
      }

      const compat = validateReferenceAndMethodCompatibility({
        Z: input.system.Z,
        N: input.system.N,
        spin2S: input.state.spin2S,
        referenceMethod: input.state.referenceMethod,
        correlationMethod: input.state.correlationMethod,
        frozenCoreMode: input.state.frozenCoreMode,
      });
      if (!compat.valid) {
        issues.push({
          severity: "error",
          code: "CORRELATION_INCOMPATIBLE_METHOD",
          field: "state.correlationMethod",
          message: compat.reason ?? "Incompatible correlation method and reference.",
        });
      }

      return validationFromIssues(issues);
    },

    async calculate(
      input: ProviderCalculationInput<ElectronCorrelationState>,
      context: CalculationContext,
    ): Promise<CalculationResult<CorrelationCalculationResponse>> {
      throwIfAborted(context.signal);
      const val = this.validate(input);
      if (!val.valid) {
        const msg = val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
        throw new Error(msg);
      }

      context.onProgress?.(
        0.15,
        `Running PySCF ${input.state.referenceMethod.toUpperCase()}/${input.state.correlationMethod.toUpperCase()} (${input.state.basis})`,
      );

      const response = await transport.calculate(
        {
          action: "calculate",
          Z: input.system.Z,
          N: input.system.N,
          spin2S: input.state.spin2S,
          basis: input.state.basis,
          referenceMethod: input.state.referenceMethod,
          correlationMethod: input.state.correlationMethod,
          frozenCoreMode: input.state.frozenCoreMode,
          nRoots: input.state.nRoots,
          fixSpin: input.state.fixSpin,
          scfOptions: input.state.scfOptions,
          correlationOptions: input.state.correlationOptions,
        },
        context.signal,
      );

      throwIfAborted(context.signal);

      if (!response.ok || response.error || !response.correlation || !response.reference) {
        throw new Error(response.error ?? "Post-HF correlation calculation failed.");
      }

      context.onProgress?.(0.88, "Verifying SCF convergence, E_total = E_HF + E_corr identity, and diagnostics");

      const corr = response.correlation;
      const ref = response.reference;
      const checks: { name: string; passed: boolean; detail: string }[] = [
        {
          name: "Reference SCF Convergence",
          passed: ref.converged,
          detail: `${ref.method.toUpperCase()} converged in ${ref.cycles}/${ref.maxCycle} cycles (E_HF = ${ref.energy_Ha.toFixed(8)} Ha)`,
        },
        {
          name: "Correlation Solver Convergence",
          passed: corr.converged,
          detail: `${corr.actualPyscfClass} converged (${response.orbitals?.correlatedElectrons ?? input.system.N} correlated electrons)`,
        },
        {
          name: "Total Energy Identity (E_total = E_HF + E_corr)",
          passed: Number.isFinite(corr.energyIdentityError_Ha) && corr.energyIdentityError_Ha < 1e-9,
          detail: `|E_total - (E_HF + E_corr)| = ${corr.energyIdentityError_Ha.toExponential(2)} Ha`,
        },
      ];

      if (corr.requestedMethod === "rcisd" || corr.requestedMethod === "ucisd" || corr.requestedMethod === "fci") {
        checks.push({
          name: "Variational Correlation Upper Bound Check",
          passed: corr.eCorr_Ha <= 1e-10,
          detail: `E_corr = ${corr.eCorr_Ha >= 0 ? "+" : ""}${corr.eCorr_Ha.toFixed(8)} Ha (expected <= 0 vs HF reference)`,
        });
      }

      if (corr.requestedMethod === "fci" && corr.spinDiagnostics?.available) {
        checks.push({
          name: "FCI <S^2> Spin Diagnostic",
          passed: corr.spinDiagnostics.spinPure || !corr.fixSpinApplied,
          detail: `<S²> = ${(corr.spinDiagnostics.sSquared ?? 0).toFixed(6)} vs S(S+1) = ${(corr.spinDiagnostics.sSquaredExact ?? 0).toFixed(4)} (${corr.spinDiagnostics.spinStatus ?? "checked"})`,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      context.onProgress?.(1, "Complete");

      const basisMeta = getBasisCatalogEntry(input.state.basis);
      const methodMeta = getCorrelationMethodDescriptor(input.state.correlationMethod);
      const engineVer = response.runtime?.engineVersion ?? "2.15.1";

      return {
        ok: allPassed,
        data: response,
        validationChecks: checks,
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: PYSCF_CORRELATION_PROVIDER_ID,
          providerVersion: `${PYSCF_CORRELATION_PROVIDER_VERSION} (PySCF ${engineVer})`,
          modelName: `Post-HF ${input.state.referenceMethod.toUpperCase()}/${methodMeta.shortLabel} (${basisMeta.label})`,
          hamiltonian: "H = Σ[-½∇ᵢ² - Z/rᵢ] + Σ_{i<j} 1/rᵢⱼ (fixed point-infinite-mass nucleus, non-relativistic, a.u.)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "computed-and-validated",
          assumptions: [
            `Reference: ${ref.method.toUpperCase()} single Slater determinant in C1 symmetry (${ref.pyscfClass}).`,
            `Correlation: ${methodMeta.label} (${corr.actualPyscfClass}); frozenCoreMode="${input.state.frozenCoreMode}" (${response.orbitals?.frozenOrbitals ?? 0} frozen orbitals).`,
            `Basis: ${basisMeta.label} (${response.basisSource ?? `BSE v${basisMeta.bseVersion}`}), ${response.orbitals?.nSpatialOrbitals ?? "?"} spatial orbitals.`,
          ],
          limitations: [
            methodMeta.caveat,
            "Basis-set incompleteness error relative to complete-basis-set (CBS) limit; omits relativistic spin-orbit, Breit, QED, and finite nuclear size.",
            "Determinant CI/MP2/FCI states are NOT Russell–Saunders <L²> term eigenstates.",
            basisMeta.knownLimitations,
          ],
          numericalQuality: {
            method: `${methodMeta.shortLabel} on ${ref.method.toUpperCase()}`,
            tolerances: {
              scfConvTol: ref.convTol,
              energyIdentityError_Ha: corr.energyIdentityError_Ha,
              eCorr_Ha: corr.eCorr_Ha,
            },
          },
          uncertainty: {
            modelApproximationNote: `Finite-basis ${basisMeta.label} non-relativistic ${methodMeta.shortLabel} (${input.state.frozenCoreMode}); accuracy vs physical atoms is bounded by one-electron basis size, correlation truncation (MP2/CISD vs FCI), and omitted relativistic/QED effects.`,
          },
          sourceCitation: `Sun et al., WIREs Comput. Mol. Sci. 8, e1340 (2018); J. Chem. Phys. 153, 024109 (2020); ${basisMeta.citation}`,
          license: "Apache-2.0 (PySCF & libcint) + BSD-3-Clause (Basis Set Exchange)",
        },
      };
    },
  };
}

export const pyscfCorrelationProvider = createPyscfCorrelationProvider();
