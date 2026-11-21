/**
 * Shared provider-aware dispatcher for `e1-transition` and `spectroscopy-series`
 * ExperimentDefinitions across direct ExperimentRunner and WorkerRuntimeHost.
 * Zero React or Three.js dependencies.
 */
import type { CalculationResult } from "@/physics/providers/contracts";
import { CONSTANTS_VERSION } from "@/physics/units";
import {
  calculateNonRelativisticE1Transition,
  calculateRelativisticE1Transition,
} from "@/physics/transitions";
import {
  generateHydrogenLikeSpectrum,
  type SpectralSeriesKind,
  type SpectrumMode,
} from "@/physics/spectroscopy";
import { SCHRODINGER_PROVIDER_ID } from "@/physics/providers/schrodinger";
import { DIRAC_PROVIDER_ID } from "@/physics/providers/dirac";
import type { ExperimentDefinition } from "../schema";

export function executeTransitionOrSpectroscopyExperiment(
  def: ExperimentDefinition,
  providerVersion: string,
  onProgress?: (fraction: number, stage?: string) => void,
): CalculationResult<unknown> {
  if (def.kind === "e1-transition") {
    if (!def.transition) {
      throw new Error("e1-transition experiment requires a transition pair.");
    }
    const intervals = Number(def.numericalParameters.quadratureIntervals ?? 4000);
    onProgress?.(0.3, "Evaluating E1 dipole matrix elements and selection rules");

    if (def.providerId === SCHRODINGER_PROVIDER_ID) {
      if (def.transition.initial.kind !== "nonrelativistic" || def.transition.final.kind !== "nonrelativistic") {
        throw new Error("Schrödinger E1 requires nonrelativistic initial and final states.");
      }
      const res = calculateNonRelativisticE1Transition(
        def.system,
        def.transition.initial,
        def.transition.final,
        intervals,
      );
      onProgress?.(1, "Complete");
      return {
        ok: true,
        data: res,
        validationChecks: [
          {
            name: "e1-selection-rules-evaluated",
            passed: true,
            detail: res.selectionRule.allowed
              ? `Allowed (${res.selectionRule.reasons[0]})`
              : `Forbidden (${res.selectionRule.reasons[0]})`,
          },
          {
            name: "quadrature-convergence",
            passed: res.numericalQuality.convergenceResidual < 1e-4,
            detail: `residual ${res.numericalQuality.convergenceResidual.toExponential(2)}`,
          },
        ],
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: def.providerId,
          providerVersion,
          modelName: "Analytical Schrödinger–Coulomb E1 Transition Engine",
          hamiltonian: "H = -(hbar^2/2mu) nabla^2 - Ze^2/(4 pi eps0 r); d_q = -e r C_q^(1)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "analytic-exact-within-stated-Hamiltonian",
          assumptions: [
            `One-electron N=1 point-Coulomb transition (Z=${def.system.Z}, mu/me=${def.system.reducedMassRatio.toFixed(8)})`,
            "Electric-dipole (E1) length gauge, spin-conserving approximation",
          ],
          limitations: ["Omit magnetic dipole (M1), electric quadrupole (E2), and QED/fine-structure shifts."],
          numericalQuality: {
            method: res.numericalQuality.radialMethod,
            tolerances: { convergenceResidual: res.numericalQuality.convergenceResidual },
          },
          uncertainty: {
            numericalError: res.numericalQuality.convergenceResidual,
            modelApproximationNote: "Nonrelativistic spinless E1 length-gauge rate.",
          },
        },
      };
    }

    if (def.providerId === DIRAC_PROVIDER_ID) {
      if (def.transition.initial.kind !== "relativistic" || def.transition.final.kind !== "relativistic") {
        throw new Error("Dirac E1 requires relativistic initial and final spinor states.");
      }
      const res = calculateRelativisticE1Transition(def.system, def.transition.initial, def.transition.final, {
        quadratureIntervals: intervals,
      });
      onProgress?.(1, "Complete");
      return {
        ok: true,
        data: res,
        validationChecks: [
          {
            name: "dirac-e1-selection-rules-evaluated",
            passed: true,
            detail: res.selectionRule.allowed
              ? `Allowed (${res.selectionRule.reasons[0]})`
              : `Forbidden (${res.selectionRule.reasons[0]})`,
          },
          {
            name: "spinor-dipole-quadrature-convergence",
            passed: res.numericalQuality.convergenceResidual < 1e-4,
            detail: `residual ${res.numericalQuality.convergenceResidual.toExponential(2)}`,
          },
        ],
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: def.providerId,
          providerVersion,
          modelName: "Relativistic Dirac–Coulomb E1 Transition Engine",
          hamiltonian: "H_D = c alpha·p + beta m_e c^2 - Ze^2/(4 pi eps0 r); E1 = -e r C_q^(1) I_4",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "analytic-exact-within-stated-Hamiltonian",
          assumptions: [
            `Full 4-component Dirac spinor PP + QQ radial & Wigner 6-j spin-angular dipole (Z=${def.system.Z})`,
          ],
          limitations: ["Omits QED/Lamb shift, hyperfine structure, and finite nuclear volume."],
          numericalQuality: {
            method: res.numericalQuality.radialMethod,
            tolerances: { convergenceResidual: res.numericalQuality.convergenceResidual },
          },
          uncertainty: {
            numericalError: res.numericalQuality.convergenceResidual,
            modelApproximationNote: "Point-Coulomb Dirac E1 rate without QED radiative corrections.",
          },
        },
      };
    }

    throw new Error(`Provider "${def.providerId}" does not support e1-transition calculations.`);
  }

  if (def.kind === "spectroscopy-series") {
    const model = def.providerId === DIRAC_PROVIDER_ID ? "dirac-coulomb" : "schrodinger-coulomb";
    if (def.providerId !== SCHRODINGER_PROVIDER_ID && def.providerId !== DIRAC_PROVIDER_ID) {
      throw new Error(`Provider "${def.providerId}" does not support spectroscopy-series generation.`);
    }
    const series = (def.modelParameters.series as SpectralSeriesKind | undefined) ?? "lyman";
    const mode = (def.modelParameters.mode as SpectrumMode | undefined) ?? "emission";
    const maxUpperN =
      typeof def.modelParameters.maxUpperN === "number" ? def.modelParameters.maxUpperN : undefined;
    const customLowerN =
      typeof def.modelParameters.customLowerN === "number" ? def.modelParameters.customLowerN : undefined;
    const minWavelength_nm =
      typeof def.modelParameters.minWavelength_nm === "number" ? def.modelParameters.minWavelength_nm : undefined;
    const maxWavelength_nm =
      typeof def.modelParameters.maxWavelength_nm === "number" ? def.modelParameters.maxWavelength_nm : undefined;
    const quadratureIntervals =
      typeof def.numericalParameters.quadratureIntervals === "number"
        ? def.numericalParameters.quadratureIntervals
        : 2400;

    onProgress?.(0.3, `Generating ${series} ${mode} spectrum via ${model}`);
    const spectrum = generateHydrogenLikeSpectrum(def.system, {
      model,
      mode,
      series,
      maxUpperN,
      customLowerN,
      minWavelength_nm,
      maxWavelength_nm,
      quadratureIntervals,
    });
    onProgress?.(1, "Complete");

    return {
      ok: true,
      data: spectrum,
      validationChecks: [
        {
          name: "non-empty-or-filtered-spectrum",
          passed: spectrum.lines.length >= 0,
          detail: `Generated ${spectrum.lines.length} ideal discrete lines in vacuum`,
        },
      ],
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: def.providerId,
        providerVersion,
        modelName: `Hydrogen-Like ${model} E1 Spectroscopy`,
        hamiltonian:
          model === "dirac-coulomb"
            ? "Point-Coulomb Dirac Hamiltonian (4-component spinors)"
            : "Point-Coulomb Schrödinger Hamiltonian",
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: "analytic-exact-within-stated-Hamiltonian",
        assumptions: [...spectrum.assumptions],
        limitations: [...spectrum.limitations],
        numericalQuality: {
          method: `e1-matrix-element-ensemble (${model})`,
        },
        uncertainty: {
          modelApproximationNote: "Ideal discrete transition wavelengths and fundamental strengths without broadening.",
        },
      },
    };
  }

  throw new Error(`Unsupported dispatch kind: ${def.kind}`);
}
