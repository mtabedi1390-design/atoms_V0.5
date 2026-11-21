/**
 * Live Multi-Electron Hartree–Fock PhysicsProvider (ATOMS v0.7.0).
 *
 * Bridges ATOMS ExperimentPlatform / PhysicsProviderRegistry to the real
 * PySCF + libcint + Basis Set Exchange computational backend via an
 * injectable structured-clone-safe HFTransport (defaulting to browser/worker
 * fetch against `/api/hf/calculate`).
 *
 * Strictly enforces:
 *  - Fixed point-infinite-mass non-relativistic nuclear model (does NOT silently
 *    apply hydrogenic reduced-mass corrections to N-electron systems)
 *  - Closed-shell RHF restricted to 2S === 0
 *  - Basis Set Exchange element coverage & all-electron limits
 *  - Unconverged SCF failures reported explicitly (ok: false / error thrown)
 *  - Zero mock data or offline fallbacks
 */
import type { AtomicSystem } from "@/domain/atomic";
import { validateAtomicSystem } from "@/domain/atomic";
import type { MultiElectronHFState, QuantumState } from "@/domain/quantum";
import { validateMultiElectronHFState } from "@/domain/quantum";
import {
  validationFromIssues,
  type SupportAssessment,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/validation";
import {
  defaultHttpHFTransport,
  getBasisCatalogEntry,
  getCachedHFCapabilities,
  isBasisSupportedForZ,
  type HFCalculationResponse,
  type HFTransport,
} from "@/physics/hf";
import { CONSTANTS_VERSION } from "@/physics/units";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "../contracts";

export const PYSCF_LIVE_PROVIDER_ID = "pyscf-hf-live";
export const PYSCF_LIVE_PROVIDER_VERSION = "0.7.0";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Calculation aborted", "AbortError");
  }
}

export function createPyscfLiveProvider(
  transport: HFTransport = defaultHttpHFTransport,
): PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput<MultiElectronHFState>,
  HFCalculationResponse
> {
  return {
    id: PYSCF_LIVE_PROVIDER_ID,
    name: "PySCF Multi-Electron Hartree–Fock (Live Local Engine)",
    version: PYSCF_LIVE_PROVIDER_VERSION,
    get available(): boolean {
      const cap = getCachedHFCapabilities();
      if (cap !== null) return cap.available;
      return typeof fetch === "function";
    },
    get blocker(): string | undefined {
      const cap = getCachedHFCapabilities();
      if (cap && !cap.available) return cap.blocker;
      if (typeof fetch !== "function" && transport === defaultHttpHFTransport) {
        return "HTTP fetch unavailable without custom HFTransport in this runtime.";
      }
      return undefined;
    },
    capabilities: [
      "multi-electron-hf",
      "total-energy",
      "orbital-resolved-hf",
      "total-spherical-density",
      "radial-probability",
      "spin-density",
      "scf-diagnostics",
      "spatial-density",
    ],

    supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
      const cached = getCachedHFCapabilities();
      if (cached && !cached.available) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [cached.blocker ?? "PySCF local backend is offline or not installed."],
          limitations: ["Requires local ATOMS Express+PySCF backend (`/api/hf/calculate`)."],
          blockedBy: cached.blocker ?? "PySCF backend unavailable",
        };
      }

      if (system.nuclearModel.kind !== "point-infinite-mass") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `Multi-electron Hartree–Fock uses a fixed point-infinite-mass nucleus; nuclear model "${system.nuclearModel.kind}" (finite-nucleus or hydrogenic reduced-mass) is not supported for N-electron HF in v0.7.0.`,
          ],
          limitations: ["Infinite nuclear mass fixed-nucleus Hamiltonian only."],
        };
      }

      if (state.kind !== "multi-electron-hf") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `PySCF Multi-Electron HF requires a MultiElectronHFState (kind="multi-electron-hf"); received "${state.kind}".`,
          ],
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

      if (state.method === "rhf" && state.spin2S !== 0) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [
            `Closed-shell RHF requires singlet spin 2S=0 (got 2S=${state.spin2S}). Select UHF, ROHF, or AtomSphAverageRHF.`,
          ],
          limitations: [],
        };
      }

      const basisMeta = getBasisCatalogEntry(state.basis);
      return {
        supported: true,
        evidenceClass: "computed-and-validated",
        reasons: [
          `PySCF ${state.method.toUpperCase()} / ${basisMeta.label} supports ${system.species.symbol} (Z=${system.Z}, N=${system.N}, 2S=${state.spin2S}).`,
        ],
        limitations: [
          "Non-relativistic fixed-nucleus Hartree–Fock (omits electron correlation, relativity, and finite nuclear size).",
          basisMeta.knownLimitations,
        ],
      };
    },

    validate(input: ProviderCalculationInput<MultiElectronHFState>): ValidationResult {
      const issues: ValidationIssue[] = [...validateAtomicSystem(input.system).issues];
      if (input.state.kind !== "multi-electron-hf") {
        issues.push({
          severity: "error",
          code: "HF_STATE_REQUIRED",
          field: "state",
          message: `Expected MultiElectronHFState, got "${(input.state as QuantumState).kind}".`,
        });
        return validationFromIssues(issues);
      }

      issues.push(...validateMultiElectronHFState(input.state).issues);

      if (input.state.N !== input.system.N) {
        issues.push({
          severity: "error",
          code: "HF_N_MISMATCH",
          field: "state.N",
          message: `State electron count N=${input.state.N} differs from system N=${input.system.N}.`,
        });
      }

      if (input.system.nuclearModel.kind !== "point-infinite-mass") {
        issues.push({
          severity: "error",
          code: "HF_REQUIRES_INFINITE_MASS_POINT_NUCLEUS",
          field: "system.nuclearModel",
          message: `Multi-electron HF requires point-infinite-mass nuclear model (got "${input.system.nuclearModel.kind}").`,
        });
      }

      const basisCheck = isBasisSupportedForZ(input.state.basis, input.system.Z, getCachedHFCapabilities());
      if (!basisCheck.supported) {
        issues.push({
          severity: "error",
          code: "HF_UNSUPPORTED_BASIS_ELEMENT",
          field: "state.basis",
          message: basisCheck.reason ?? `Basis ${input.state.basis} unsupported for Z=${input.system.Z}.`,
        });
      }

      return validationFromIssues(issues);
    },

    async calculate(
      input: ProviderCalculationInput<MultiElectronHFState>,
      context: CalculationContext,
    ): Promise<CalculationResult<HFCalculationResponse>> {
      throwIfAborted(context.signal);
      const val = this.validate(input);
      if (!val.valid) {
        const msg = val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
        throw new Error(msg);
      }

      context.onProgress?.(0.15, `Submitting ${input.state.method.toUpperCase()}/${input.state.basis} to PySCF/libcint`);

      const includeRadialGrid = input.numericalOptions?.includeRadialGrid !== false;
      const response = await transport.calculate(
        {
          Z: input.system.Z,
          N: input.system.N,
          spin2S: input.state.spin2S,
          method: input.state.method,
          basis: input.state.basis,
          useSymmetry: input.state.useSymmetry,
          subshellOccupations:
            input.state.subshellOccupations.length > 0 ? input.state.subshellOccupations : undefined,
          scfOptions: input.state.scfOptions,
          includeRadialGrid,
          volumeGrid: input.state.volumeGrid,
        },
        context.signal,
      );

      throwIfAborted(context.signal);

      if (response.error) {
        throw new Error(response.error);
      }
      if (!response.scf || !response.energy) {
        throw new Error("Incomplete response returned by PySCF backend (missing SCF or energy block).");
      }
      if (!response.ok || !response.scf.converged) {
        const lastCycle = response.scf.history[response.scf.history.length - 1];
        const detail = lastCycle
          ? ` (last ΔE=${lastCycle.dE_Ha.toExponential(2)} Ha, |∇|=${lastCycle.gradNorm.toExponential(2)})`
          : "";
        throw new Error(
          `SCF failed to converge within maxCycle=${response.scf.maxCycle} (cycles=${response.scf.cycles}, method=${input.state.method.toUpperCase()}, basis=${input.state.basis})${detail}. Adjust SCF options (DIIS/damping/levelShift/maxCycle) rather than loosening validation.`,
        );
      }

      context.onProgress?.(0.85, "Verifying energy decomposition, orthogonality, & density integrals");

      const basisMeta = getBasisCatalogEntry(input.state.basis);
      const checks: { name: string; passed: boolean; detail: string }[] = [
        {
          name: "SCF Convergence",
          passed: response.scf.converged,
          detail: `Converged in ${response.scf.cycles}/${response.scf.maxCycle} cycles (convTol=${response.scf.convTol.toExponential(1)})`,
        },
        {
          name: "Energy Decomposition Consistency",
          passed: response.energy.energyConsistencyError_Ha < 1e-9,
          detail: `|E_tot - (T + V_nuc + J + K)| = ${response.energy.energyConsistencyError_Ha.toExponential(3)} Ha`,
        },
        {
          name: "Overlap Metric Orthonormality",
          passed: (response.orthonormalityError ?? 1) < 1e-8,
          detail: `max |Cᵀ S C - I| = ${(response.orthonormalityError ?? 0).toExponential(3)}`,
        },
        {
          name: "Density Matrix Electron Trace",
          passed: Math.abs(response.energy.tracePS - input.system.N) < 1e-7,
          detail: `Tr(P S) = ${response.energy.tracePS.toFixed(8)} (expected ${input.system.N})`,
        },
      ];

      if (response.radialProfiles) {
        const errN = Math.abs(response.radialProfiles.integratedElectrons - input.system.N);
        checks.push({
          name: "3D Spherical/Radial Density Integral",
          passed: errN <= 1e-3,
          detail: `∫ 4πr² ρ(r) dr = ${response.radialProfiles.integratedElectrons.toFixed(6)} e (error ${errN.toExponential(2)} e, ${response.radialProfiles.anglePoints}-pt Lebedev)`,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      context.onProgress?.(1, "Complete");

      const engineVer = response.runtime?.engineVersion ?? "2.15.1";
      return {
        ok: allPassed,
        data: response,
        validationChecks: checks,
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: PYSCF_LIVE_PROVIDER_ID,
          providerVersion: `${PYSCF_LIVE_PROVIDER_VERSION} (PySCF ${engineVer})`,
          modelName: `Non-relativistic ${input.state.method.toUpperCase()} / ${basisMeta.label}`,
          hamiltonian: "H = Σ[-½∇ᵢ² - Z/rᵢ] + Σ_{i<j} 1/rᵢⱼ (fixed point-infinite-mass nucleus, a.u.)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "computed-and-validated",
          assumptions: [
            "Non-relativistic Born–Oppenheimer fixed point nucleus (infinite nuclear mass).",
            `Gaussian basis: ${basisMeta.label} (${response.basisSource ?? `BSE v${basisMeta.bseVersion}`}), ${basisMeta.harmonics} harmonics.`,
            response.rohfConvention
              ? response.rohfConvention
              : `Method: ${input.state.method.toUpperCase()}, spin 2S=${input.state.spin2S}, symmetry=${response.symmetryGroup ?? "C1"}.`,
          ],
          limitations: [
            "Single-determinant Hartree–Fock omits electron correlation (E_corr ≈ negative) and relativistic corrections.",
            basisMeta.knownLimitations,
          ],
          numericalQuality: {
            method: `${input.state.method.toUpperCase()} (${response.scf.diis.toUpperCase()}, guess=${response.scf.initGuess})`,
            gridPoints: response.radialProfiles?.rBohr.length,
            integratedNorm: response.radialProfiles?.integratedElectrons,
            relativeChargeError: response.radialProfiles
              ? Math.abs(response.radialProfiles.integratedElectrons - input.system.N) / input.system.N
              : Math.abs(response.energy.tracePS - input.system.N) / input.system.N,
            tolerances: {
              convTol: response.scf.convTol,
              convTolGrad: response.scf.convTolGrad,
              orthonormalityMaxErr: response.orthonormalityError ?? 0,
              energyConsistencyErr_Ha: response.energy.energyConsistencyError_Ha,
            },
          },
          uncertainty: {
            modelApproximationNote: `Finite-basis ${basisMeta.label} non-relativistic HF (converged to ${response.scf.convTol.toExponential(1)} Ha); residual errors come from basis incompleteness, omission of Coulomb correlation, and relativistic effects.`,
          },
          sourceCitation: `Sun et al., WIREs Comput. Mol. Sci. 8, e1340 (2018); J. Chem. Phys. 153, 024109 (2020); ${basisMeta.citation}`,
          license: "Apache-2.0 (PySCF & libcint) + BSD-3-Clause (Basis Set Exchange)",
        },
      };
    },
  };
}

export const pyscfLiveProvider = createPyscfLiveProvider();
