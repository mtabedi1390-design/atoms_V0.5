/**
 * Fixed-Orbital LS-Coupled Multiconfiguration CI PhysicsProvider (ATOMS v0.7.1).
 *
 * Bridges ATOMS ExperimentPlatform / PhysicsProviderRegistry / Worker runtime
 * to the exact (L^2, S^2, Pi) LS-CSF CI Python backend (`/api/ls/calculate`)
 * using SO(3)-averaged AtomSphAverageRHF radial orbitals from PySCF.
 *
 * Strictly enforces:
 *  - Fixed point-infinite-mass non-relativistic nuclear model
 *  - Multi-electron domain N >= 2, Z = 1..30 (N <= Z+2)
 *  - Explicit CSF orthonormality, Hamiltonian Hermiticity, and <L^2>, Var(L^2),
 *    <S^2>, Var(S^2) purity checks (< 1e-7)
 *  - Honest labeling as Fixed-Orbital LS-Coupled CI (MCHF radial orbital
 *    optimization is NOT performed)
 */
import type { AtomicSystem } from "@/domain/atomic";
import { validateAtomicSystem } from "@/domain/atomic";
import type { LSTermCIState, QuantumState } from "@/domain/quantum";
import { validateLSTermCIState } from "@/domain/quantum";
import {
  validationFromIssues,
  type SupportAssessment,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/validation";
import { getBasisCatalogEntry } from "@/physics/hf";
import {
  assessLSCISupport,
  defaultHttpLSTransport,
  enumerateLSTerms,
  formatConfigurationSpec,
  formatTermSymbol,
  getCachedLSCapabilities,
  type LSCIResponse,
  type LSTransport,
} from "@/physics/ls";
import { CONSTANTS_VERSION } from "@/physics/units";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "../contracts";

export const LS_TERM_CI_PROVIDER_ID = "atoms-ls-term-ci";
export const LS_TERM_CI_PROVIDER_VERSION = "0.7.1";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Calculation aborted", "AbortError");
  }
}

export function createLSTermCiProvider(
  transport: LSTransport = defaultHttpLSTransport,
): PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput<LSTermCIState>,
  LSCIResponse
> {
  return {
    id: LS_TERM_CI_PROVIDER_ID,
    name: "ATOMS Fixed-Orbital LS-Coupled CI (PySCF SO(3) Orbitals)",
    version: LS_TERM_CI_PROVIDER_VERSION,
    get available(): boolean {
      const cap = getCachedLSCapabilities();
      if (cap !== null) return cap.available;
      return typeof fetch === "function";
    },
    get blocker(): string | undefined {
      const cap = getCachedLSCapabilities();
      if (cap && !cap.available) return cap.blocker;
      if (typeof fetch !== "function" && transport === defaultHttpLSTransport) {
        return "HTTP fetch unavailable without custom LSTransport in this runtime.";
      }
      return undefined;
    },
    capabilities: ["ls-term-ci", "ls-term-enumeration", "total-energy"],

    supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
      const cached = getCachedLSCapabilities();
      if (cached && !cached.available) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [cached.blocker ?? "LS-CI local Python backend is offline or not installed."],
          limitations: ["Requires local ATOMS Express + PySCF backend (`/api/ls/calculate`)."],
          blockedBy: cached.blocker ?? "LS-CI backend unavailable",
        };
      }

      if (system.nuclearModel.kind !== "point-infinite-mass") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `Fixed-Orbital LS-Coupled CI uses a fixed point-infinite-mass nucleus; "${system.nuclearModel.kind}" is not supported.`,
          ],
          limitations: ["Infinite-mass point nucleus nonrelativistic Coulomb Hamiltonian only."],
        };
      }

      if (state.kind !== "ls-term-ci") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `LS-Term CI provider requires LSTermCIState (kind="ls-term-ci"); received "${state.kind}".`,
          ],
          limitations: [],
        };
      }

      const gate = assessLSCISupport({
        Z: system.Z,
        N: system.N,
        basis: state.basis,
        configuration: state.referenceConfiguration,
        capabilities: cached,
      });
      if (!gate.supported) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: gate.reasons,
          limitations: [],
          blockedBy: gate.reasons[0],
        };
      }

      if (state.activeSpaceMode === "single-config") {
        const analysis = enumerateLSTerms(state.referenceConfiguration);
        const match = analysis.terms.find(
          (t) => t.L === state.targetL && t.spin2S === state.targetSpin2S && t.parity === state.targetParity,
        );
        if (!match) {
          const term = formatTermSymbol(state.targetSpin2S, state.targetL, state.targetParity);
          return {
            supported: false,
            evidenceClass: "unavailable",
            reasons: [
              `Target LS term ${term} does not occur in single configuration ${analysis.label}. Allowed terms: ${analysis.terms
                .map((t) => t.termSymbol)
                .join(", ") || "none"}.`,
            ],
            limitations: [],
          };
        }
      }

      const basisMeta = getBasisCatalogEntry(state.basis);
      const termSym = formatTermSymbol(state.targetSpin2S, state.targetL, state.targetParity);
      return {
        supported: true,
        evidenceClass: "computed-and-validated",
        reasons: [
          `Fixed-Orbital LS-CI supports ${system.species.symbol} (Z=${system.Z}, N=${system.N}) block ${termSym} in ${basisMeta.label} (${state.activeSpaceMode}).`,
        ],
        limitations: [
          "Uses fixed SO(3)-symmetric AtomSphAverageRHF radial orbitals (MCHF orbital optimization is NOT performed).",
          "Omits spin-orbit J splitting, Breit, QED, finite nuclear size, and dynamical correlation outside active shells.",
        ],
      };
    },

    validate(input: ProviderCalculationInput<LSTermCIState>): ValidationResult {
      const issues: ValidationIssue[] = [...validateAtomicSystem(input.system).issues];
      if (input.state.kind !== "ls-term-ci") {
        issues.push({
          severity: "error",
          code: "LS_STATE_REQUIRED",
          field: "state",
          message: `Expected LSTermCIState, got "${(input.state as QuantumState).kind}".`,
        });
        return validationFromIssues(issues);
      }

      issues.push(...validateLSTermCIState(input.state).issues);

      if (input.state.N !== input.system.N) {
        issues.push({
          severity: "error",
          code: "LS_N_MISMATCH",
          field: "state.N",
          message: `State electron count N=${input.state.N} differs from system N=${input.system.N}.`,
        });
      }

      if (input.system.nuclearModel.kind !== "point-infinite-mass") {
        issues.push({
          severity: "error",
          code: "LS_REQUIRES_POINT_NUCLEUS",
          field: "system.nuclearModel",
          message: `LS-Coupled CI requires point-infinite-mass nuclear model (got "${input.system.nuclearModel.kind}").`,
        });
      }

      const gate = assessLSCISupport({
        Z: input.system.Z,
        N: input.system.N,
        basis: input.state.basis,
        configuration: input.state.referenceConfiguration,
        capabilities: getCachedLSCapabilities(),
      });
      if (!gate.supported) {
        issues.push({
          severity: "error",
          code: "LS_UNSUPPORTED_SYSTEM_OR_BASIS",
          field: "state",
          message: gate.reasons.join("; ") || `Unsupported LS-CI system or basis.`,
        });
      }

      return validationFromIssues(issues);
    },

    async calculate(
      input: ProviderCalculationInput<LSTermCIState>,
      context: CalculationContext,
    ): Promise<CalculationResult<LSCIResponse>> {
      throwIfAborted(context.signal);
      const val = this.validate(input);
      if (!val.valid) {
        const msg = val.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ");
        throw new Error(msg);
      }

      const termSym = formatTermSymbol(
        input.state.targetSpin2S,
        input.state.targetL,
        input.state.targetParity,
      );
      context.onProgress?.(
        0.15,
        `Generating SO(3) orbitals & (${termSym}) LS-CSFs for ${input.system.species.symbol} (${input.state.activeSpaceMode})`,
      );

      const response = await transport.calculate(
        {
          Z: input.system.Z,
          N: input.system.N,
          basis: input.state.basis,
          referenceConfiguration: input.state.referenceConfiguration,
          targetL: input.state.targetL,
          targetSpin2S: input.state.targetSpin2S,
          targetParity: input.state.targetParity,
          activeSpaceMode: input.state.activeSpaceMode,
          frozenCoreSubshells: input.state.frozenCoreSubshells,
          activeShells: input.state.activeShells,
          customConfigurations: input.state.customConfigurations,
          maxExcitationRank: input.state.maxExcitationRank,
          nRoots: input.state.nRoots,
          crossCheckPyscfFci: input.state.crossCheckPyscfFci,
        },
        context.signal,
      );

      throwIfAborted(context.signal);

      if (!response.ok || response.error || !response.roots || response.roots.length === 0) {
        throw new Error(response.error ?? "LS-CI calculation returned no valid eigenstates.");
      }

      context.onProgress?.(0.85, "Validating CSF orthonormality, Hermiticity, and (L^2, S^2) purity");

      const maxL2Err = Math.max(...response.roots.map((r) => r.operatorDiagnostics.lSquaredError));
      const maxL2Var = Math.max(...response.roots.map((r) => r.operatorDiagnostics.lSquaredVariance));
      const maxS2Err = Math.max(...response.roots.map((r) => r.operatorDiagnostics.sSquaredError));
      const maxS2Var = Math.max(...response.roots.map((r) => r.operatorDiagnostics.sSquaredVariance));

      const checks: { name: string; passed: boolean; detail: string }[] = [
        {
          name: "SO(3) Radial Orbital Quality",
          passed:
            response.orbitalSource.converged &&
            response.orbitalSource.complexOrthonormalityError < 1e-8 &&
            response.orbitalSource.maxAngularMixingError < 1e-6,
          detail: `ortho=${response.orbitalSource.complexOrthonormalityError.toExponential(2)}, angMix=${response.orbitalSource.maxAngularMixingError.toExponential(2)}`,
        },
        {
          name: "LS-CSF Orthonormality",
          passed: response.csfDiagnostics.csfOrthonormalityError < 1e-8,
          detail: `max |Cᵀ C - I| = ${response.csfDiagnostics.csfOrthonormalityError.toExponential(2)} (${response.csfDiagnostics.csfCount} CSFs)`,
        },
        {
          name: "LS-CSF Highest-Weight Nullspace",
          passed: response.csfDiagnostics.csfMaxLSNullspaceResidual < 1e-7,
          detail: `max (L₊ᵀL₊ + S₊ᵀS₊) eig = ${response.csfDiagnostics.csfMaxLSNullspaceResidual.toExponential(2)}`,
        },
        {
          name: "CSF Hamiltonian Hermiticity",
          passed: response.csfDiagnostics.hamiltonianHermiticityError < 1e-9,
          detail: `max |H - Hᵀ| = ${response.csfDiagnostics.hamiltonianHermiticityError.toExponential(2)} Ha`,
        },
        {
          name: "Eigenstate <L^2> & Var(L^2) Purity",
          passed: maxL2Err < 1e-7 && maxL2Var < 1e-7,
          detail: `max |<L²>-L(L+1)| = ${maxL2Err.toExponential(2)}, max Var(L²) = ${maxL2Var.toExponential(2)}`,
        },
        {
          name: "Eigenstate <S^2> & Var(S^2) Purity",
          passed: maxS2Err < 1e-7 && maxS2Var < 1e-7,
          detail: `max |<S²>-S(S+1)| = ${maxS2Err.toExponential(2)}, max Var(S²) = ${maxS2Var.toExponential(2)}`,
        },
      ];

      if (response.pyscfFciCrossCheck.performed) {
        checks.push({
          name: "PySCF Determinant FCI Cross-Check",
          passed: response.pyscfFciCrossCheck.passed,
          detail: response.pyscfFciCrossCheck.note,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      context.onProgress?.(1, "Complete");

      const basisMeta = getBasisCatalogEntry(input.state.basis);
      const refCfgStr = formatConfigurationSpec(input.state.referenceConfiguration);

      return {
        ok: allPassed,
        data: response,
        validationChecks: checks,
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: LS_TERM_CI_PROVIDER_ID,
          providerVersion: response.runtime.engineVersion || LS_TERM_CI_PROVIDER_VERSION,
          modelName: `Fixed-Orbital LS-Coupled CI (${termSym}, ${input.state.activeSpaceMode}) / ${basisMeta.label}`,
          hamiltonian: "H = Σ[-½∇ᵢ² - Z/rᵢ] + Σ_{i<j} 1/rᵢⱼ (nonrelativistic fixed point-infinite-mass nucleus, LS-coupled CSF block)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "computed-and-validated",
          assumptions: [
            `Method: Fixed-Orbital LS-Coupled CI (nonrelativistic, MCHF radial orbital optimization NOT performed).`,
            `Radial orbitals: SO(3)-symmetric PySCF AtomSphAverageRHF (${response.orbitalSource.shells.length} shells) transformed to complex Condon–Shortley harmonics.`,
            `Reference configuration: ${refCfgStr}; Symmetry block: ${termSym} (M_L=L, M_S=S); Active space: ${response.activeSpace.activeShellsLabel} (${response.activeSpace.configurationCount} configs, ${response.csfDiagnostics.csfCount} CSFs).`,
            `Frozen core: ${response.activeSpace.frozenCore}.`,
          ],
          limitations: [
            "Fixed-orbital CI does NOT perform self-consistent MCHF radial orbital re-optimization per LS term.",
            "Does NOT compute spin-orbit fine-structure splittings (only allowed J = |L-S|..L+S values are listed).",
            "Does NOT include dynamic electron correlation outside the chosen active space (MP2/CCSD deferred to v0.7.2) or relativistic Breit/QED effects.",
            basisMeta.knownLimitations,
          ],
          numericalQuality: {
            method: `${response.resources.solverAlgorithm} (${response.activeSpace.mode})`,
            tolerances: {
              csfOrthoErr: response.csfDiagnostics.csfOrthonormalityError,
              hamiltonianHermiticityErr_Ha: response.csfDiagnostics.hamiltonianHermiticityError,
              maxL2Error: maxL2Err,
              maxL2Variance: maxL2Var,
              maxS2Error: maxS2Err,
              maxS2Variance: maxS2Var,
            },
          },
          uncertainty: {
            modelApproximationNote: `Finite-basis (${basisMeta.label}) fixed-orbital LS-CI within active space [${response.activeSpace.activeShellsLabel}]; residual differences vs NIST term centroids come from frozen-core/basis incompleteness, omitted dynamic correlation outside the active space, lack of MCHF orbital relaxation, and relativistic/QED effects.`,
          },
          sourceCitation: `ATOMS v0.7.1 Exact (L^2, S^2, Pi) CSF-CI on PySCF/libcint; ${basisMeta.citation}`,
          license: "Apache-2.0 (PySCF & libcint) + BSD-3-Clause (Basis Set Exchange)",
        },
      };
    },
  };
}

export const lsTermCiProvider = createLSTermCiProvider();
