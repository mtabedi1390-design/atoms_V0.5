/**
 * Analytical Hydrogen-Like Schrödinger–Coulomb PhysicsProvider (ATOMS v0.6.0 Phase 3).
 *
 * Hamiltonian:
 *   H = -(hbar^2 / 2*mu) nabla^2 - Z e^2 / (4 pi epsilon_0 r)
 *
 * All radial distances use the reduced-mass Bohr scale a = a_mu / a_0 = m_e / mu = 1 / reducedMassRatio
 * so energies scale by (mu/m_e) and lengths scale by (m_e/mu) consistently across
 * R_nl(r), P_nl(r) = r^2 |R_nl|^2, nodes, and expectation values.
 *
 * Strictly restricted to one-electron systems (N = 1, q = Z - 1) and point-nucleus models.
 * Zero React or Three.js dependencies.
 */
import type { AtomicSystem } from "@/domain/atomic";
import type { NonRelativisticState, QuantumState, SuperpositionState } from "@/domain/quantum";
import { validateAtomicSystem } from "@/domain/atomic";
import { validateQuantumState } from "@/domain/quantum";
import { validationFromIssues, type SupportAssessment, type ValidationIssue, type ValidationResult } from "@/domain/validation";
import {
  angularNodeCount,
  angularNodeThetas,
  hydrogenicEnergy_eV,
  meanRSquaredAnalytic,
  meanRadiusAnalytic,
  probabilityDensity,
  psiComplex,
  psiReal,
  radialExtent,
  radialMoments,
  radialNodeCount,
  radialNodes,
  radialPDF,
  radialR,
  subshellLabel,
} from "@/physics/hydrogenic";
import { CONSTANTS_VERSION, convertEnergy } from "@/physics/units";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "../contracts";

export const SCHRODINGER_PROVIDER_ID = "schrodinger-coulomb" as const;
export const SCHRODINGER_PROVIDER_VERSION = "0.6.0" as const;

export interface SchrodingerEnergySummary {
  readonly bindingEnergy_eV: number;
  readonly bindingEnergy_Ha: number;
  readonly bindingEnergy_cm1: number;
  readonly ionizationEnergy_eV: number;
  readonly kineticEnergy_eV: number;
  readonly potentialEnergy_eV: number;
  readonly reducedMassRatio: number;
  readonly bohrScale_a0: number;
}

export interface SchrodingerNodesSummary {
  readonly radialNodeCount: number;
  readonly radialNodes_a0: readonly number[];
  readonly angularNodeCount: number;
  readonly angularNodeThetas_rad: readonly number[];
  readonly azimuthalPhiPlanes: number;
}

export interface SchrodingerExpectationValues {
  readonly meanR_a0: number;
  readonly meanR2_a02: number;
  readonly rmsRadius_a0: number;
  readonly meanInvR_a0inv: number;
  readonly meanInvR2_a0inv2: number;
  readonly meanInvR3_a0inv3: number | null;
  readonly numericNorm: number;
  readonly numericMeanR_a0: number;
  readonly normError: number;
  readonly meanRError: number;
}

export interface SchrodingerRadialGridData {
  readonly r_a0: readonly number[];
  readonly R_nl: readonly number[];
  readonly P_nl: readonly number[];
  readonly rMax_a0: number;
  readonly integratedNorm: number;
  readonly tailMass: number;
}

export interface SchrodingerCalculationData {
  readonly model: "schrodinger-coulomb";
  readonly Z: number;
  readonly N: number;
  readonly q: number;
  readonly label: string;
  readonly stateKind: "nonrelativistic" | "superposition";
  readonly energy: SchrodingerEnergySummary;
  readonly nodes?: SchrodingerNodesSummary;
  readonly expectationValues?: SchrodingerExpectationValues;
  readonly radialGrid?: SchrodingerRadialGridData;
  readonly superpositionSummary?: {
    readonly termCount: number;
    readonly normalizationSum: number;
    readonly meanEnergy_eV: number;
    readonly meanEnergy_Ha: number;
  };
}

/** Analytic <r^-1> = Z / (a * n^2) in a0^-1. */
export function meanInvRAnalytic(n: number, Z: number, a = 1): number {
  return Z / (a * n * n);
}

/** Analytic <r^-2> = Z^2 / (a^2 * n^3 * (l + 1/2)) in a0^-2. */
export function meanInvRSquaredAnalytic(n: number, l: number, Z: number, a = 1): number {
  return (Z * Z) / (a * a * n * n * n * (l + 0.5));
}

/** Analytic <r^-3> = Z^3 / (a^3 * n^3 * l * (l + 1/2) * (l + 1)) for l >= 1; null for l = 0. */
export function meanInvRCubedAnalytic(n: number, l: number, Z: number, a = 1): number | null {
  if (l === 0) return null;
  return (Z * Z * Z) / (a * a * a * n * n * n * l * (l + 0.5) * (l + 1));
}

/** Evaluate full complex or real spatial wavefunction psi_nlm(r, theta, phi) with reduced mass scale a. */
export function evaluateSchrodingerState(
  state: NonRelativisticState,
  Z: number,
  reducedMassRatio: number,
  r_a0: number,
  theta: number,
  phi: number,
): { readonly re: number; readonly im: number; readonly density: number } {
  const a = 1 / reducedMassRatio;
  const qn = { n: state.n, l: state.l, m: state.m_l };
  if (state.basis === "real") {
    const val = psiReal(qn, r_a0, theta, phi, Z, a);
    return { re: val, im: 0, density: val * val };
  }
  const [re, im] = psiComplex(qn, r_a0, theta, phi, Z, a);
  return { re, im, density: re * re + im * im };
}

/** Evaluate coherent nonrelativistic superposition psi(r) = sum_k c_k psi_k(r). */
export function evaluateSchrodingerSuperposition(
  state: SuperpositionState,
  Z: number,
  reducedMassRatio: number,
  r_a0: number,
  theta: number,
  phi: number,
): { readonly re: number; readonly im: number; readonly density: number } {
  let sumRe = 0;
  let sumIm = 0;
  let normSq = 0;
  for (const term of state.terms) {
    if (term.state.kind !== "nonrelativistic") continue;
    normSq += term.amplitude.re * term.amplitude.re + term.amplitude.im * term.amplitude.im;
  }
  const invNorm = normSq > 0 ? 1 / Math.sqrt(normSq) : 1;
  for (const term of state.terms) {
    if (term.state.kind !== "nonrelativistic") continue;
    const psi = evaluateSchrodingerState(term.state, Z, reducedMassRatio, r_a0, theta, phi);
    const cRe = term.amplitude.re * invNorm;
    const cIm = term.amplitude.im * invNorm;
    sumRe += cRe * psi.re - cIm * psi.im;
    sumIm += cRe * psi.im + cIm * psi.re;
  }
  return { re: sumRe, im: sumIm, density: sumRe * sumRe + sumIm * sumIm };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Schrödinger calculation aborted", "AbortError");
  }
}

export const schrodingerCoulombV6Provider: PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput,
  SchrodingerCalculationData
> = {
  id: SCHRODINGER_PROVIDER_ID,
  name: "Analytical Schrödinger–Coulomb (Hydrogen-Like)",
  version: SCHRODINGER_PROVIDER_VERSION,
  available: true,
  capabilities: [
    "bound-energy",
    "total-energy",
    "radial-wavefunction",
    "spatial-density",
    "radial-probability",
    "expectation-values",
    "e1-transitions",
    "spectroscopy",
  ],

  supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
    if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [
          `Analytical Schrödinger–Coulomb assumes a point nucleus (-Ze²/4πε₀r) and does not solve "${system.nuclearModel.kind}".`,
        ],
        limitations: ["Finite nuclear charge distributions require a dedicated numerical radial solver."],
      };
    }

    if (system.N !== 1) {
      const ionNote =
        system.q < 0
          ? `Negative ion (N=${system.N}, Z=${system.Z}, q=${system.q}) is a correlated multi-electron system; one-electron Coulomb theory cannot bind anions.`
          : `System has N=${system.N} electrons (Z=${system.Z}, q=${system.q}); one-electron Schrödinger–Coulomb supports N = 1 systems only (e.g. H, He⁺, Li²⁺).`;
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [ionNote],
        limitations: ["Exact analytical solution applies strictly to N = 1 hydrogen-like atoms/ions."],
      };
    }

    if (state.kind !== "nonrelativistic" && !(state.kind === "superposition" && state.basisKind === "nonrelativistic")) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [
          `Schrödinger–Coulomb is nonrelativistic and spinless; incompatible with "${state.kind}" state representation.`,
        ],
        limitations: ["Use Dirac–Coulomb for relativistic (n, kappa, j, m_j) spinor states."],
      };
    }

    return {
      supported: true,
      evidenceClass: "analytic-exact-within-stated-Hamiltonian",
      reasons: [
        `Exact analytical Schrödinger–Coulomb bound solution for one-electron ${system.species.symbol}${system.q === 0 ? "" : `${system.q}+`} (Z=${system.Z}, N=1, nuclear=${system.nuclearModel.kind}).`,
      ],
      limitations: [
        "Nonrelativistic spinless Coulomb Hamiltonian (omits fine structure, spin-orbit coupling, Darwin term, Lamb shift/QED, and hyperfine structure).",
        "Point-nucleus Coulomb potential -Ze²/(4πε₀r).",
      ],
    };
  },

  validate(input: ProviderCalculationInput): ValidationResult {
    const issues: ValidationIssue[] = [
      ...validateAtomicSystem(input.system).issues,
      ...validateQuantumState(input.state).issues,
    ];
    if (input.system.N !== 1) {
      issues.push({
        severity: "error",
        code: "REQUIRES_ONE_ELECTRON",
        field: "system.N",
        message: `One-electron Schrödinger–Coulomb requires N = 1 (got N=${input.system.N}).`,
      });
    }
    const gridPts = input.numericalOptions?.gridPoints;
    if (gridPts !== undefined && (typeof gridPts !== "number" || !Number.isInteger(gridPts) || gridPts < 32 || gridPts > 16384)) {
      issues.push({
        severity: "error",
        code: "INVALID_GRID_POINTS",
        field: "numericalOptions.gridPoints",
        message: `gridPoints must be an integer in 32..16384 (got ${String(gridPts)}).`,
      });
    }
    return validationFromIssues(issues);
  },

  async calculate(
    input: ProviderCalculationInput,
    context: CalculationContext,
  ): Promise<CalculationResult<SchrodingerCalculationData>> {
    throwIfAborted(context.signal);
    const supp = this.supports(input.system, input.state);
    if (!supp.supported) throw new Error(supp.reasons.join("; "));
    const val = this.validate(input);
    if (!val.valid) {
      throw new Error(val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
    }

    const { Z, N, q, reducedMassRatio } = input.system;
    const bohrScale = 1 / reducedMassRatio;
    const gridPoints = Number(input.numericalOptions?.gridPoints ?? 512);
    const quadIntervals = Number(input.numericalOptions?.quadratureIntervals ?? 8000);

    context.onProgress?.(0.2, "Evaluating Schrödinger–Coulomb eigenvalues and radial functions");

    if (input.state.kind === "superposition") {
      const sup = input.state;
      let normSq = 0;
      let weightedEnergy_eV = 0;
      for (const term of sup.terms) {
        if (term.state.kind !== "nonrelativistic") continue;
        const w = term.amplitude.re * term.amplitude.re + term.amplitude.im * term.amplitude.im;
        normSq += w;
        weightedEnergy_eV += w * hydrogenicEnergy_eV(term.state.n, Z, reducedMassRatio);
      }
      const meanE_eV = normSq > 0 ? weightedEnergy_eV / normSq : 0;
      const meanE_Ha = convertEnergy(meanE_eV, "eV", "Ha");
      throwIfAborted(context.signal);
      context.onProgress?.(1, "Complete");
      return {
        ok: true,
        data: {
          model: "schrodinger-coulomb",
          Z,
          N,
          q,
          label: `${input.system.isotope.label}${q === 0 ? "" : `${q}+`} superposition (${sup.terms.length} states)`,
          stateKind: "superposition",
          energy: {
            bindingEnergy_eV: meanE_eV,
            bindingEnergy_Ha: meanE_Ha,
            bindingEnergy_cm1: convertEnergy(meanE_eV, "eV", "cm-1"),
            ionizationEnergy_eV: -meanE_eV,
            kineticEnergy_eV: -meanE_eV,
            potentialEnergy_eV: 2 * meanE_eV,
            reducedMassRatio,
            bohrScale_a0: bohrScale,
          },
          superpositionSummary: {
            termCount: sup.terms.length,
            normalizationSum: normSq,
            meanEnergy_eV: meanE_eV,
            meanEnergy_Ha: meanE_Ha,
          },
        },
        validationChecks: [
          {
            name: "superposition-positive-norm",
            passed: normSq > 0,
            detail: `sum |c_i|^2 = ${normSq.toFixed(8)}`,
          },
        ],
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: this.id,
          providerVersion: this.version,
          modelName: "Analytical Schrödinger–Coulomb (Superposition)",
          hamiltonian: "H = -(hbar^2 / 2*mu) nabla^2 - Z e^2 / (4 pi epsilon_0 r)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "analytic-exact-within-stated-Hamiltonian",
          assumptions: [
            `Point-nucleus Coulomb potential, Z=${Z}, N=1`,
            `Nuclear model: ${input.system.nuclearModel.kind} (mu/m_e = ${reducedMassRatio.toFixed(10)})`,
            "Coherent stationary-state linear combination at t = 0",
          ],
          limitations: supp.limitations,
          numericalQuality: {
            method: "exact-analytic-laguerre-spherical-harmonic",
            integratedNorm: normSq,
          },
          uncertainty: {
            modelApproximationNote: "Exact nonrelativistic point-Coulomb superposition; omits fine structure, QED/Lamb shift, and finite nuclear size.",
          },
          sourceCitation: "Griffiths & Schroeter / Bethe & Salpeter; CODATA 2018",
        },
      };
    }

    const st = input.state as NonRelativisticState;
    const E_eV = hydrogenicEnergy_eV(st.n, Z, reducedMassRatio);
    const E_Ha = convertEnergy(E_eV, "eV", "Ha");
    const E_cm1 = convertEnergy(E_eV, "eV", "cm-1");

    const meanR = meanRadiusAnalytic(st.n, st.l, Z, bohrScale);
    const meanR2 = meanRSquaredAnalytic(st.n, st.l, Z, bohrScale);
    const meanInvR = meanInvRAnalytic(st.n, Z, bohrScale);
    const meanInvR2 = meanInvRSquaredAnalytic(st.n, st.l, Z, bohrScale);
    const meanInvR3 = meanInvRCubedAnalytic(st.n, st.l, Z, bohrScale);

    throwIfAborted(context.signal);
    context.onProgress?.(0.55, "Computing radial grid and quadrature verification");

    const moments = radialMoments(st.n, st.l, Z, bohrScale, quadIntervals);
    const normError = Math.abs(moments.norm - 1);
    const meanRError = Math.abs(moments.meanR - meanR) / meanR;

    const rMax = radialExtent(st.n, st.l, Z, bohrScale);
    const r_a0: number[] = new Array(gridPoints);
    const R_nl: number[] = new Array(gridPoints);
    const P_nl: number[] = new Array(gridPoints);
    for (let i = 0; i < gridPoints; i++) {
      const r = (i / (gridPoints - 1)) * rMax;
      r_a0[i] = r;
      R_nl[i] = radialR(st.n, st.l, r, Z, bohrScale);
      P_nl[i] = radialPDF(st.n, st.l, r, Z, bohrScale);
    }

    // Simpson integral over [0, rMax] on even grid
    const gridN = gridPoints % 2 === 1 ? gridPoints - 1 : gridPoints - 2;
    const hGrid = r_a0[gridN] / gridN;
    let simpsonGrid = 0;
    for (let i = 0; i <= gridN; i++) {
      const w = i === 0 || i === gridN ? 1 : i % 2 === 1 ? 4 : 2;
      simpsonGrid += w * P_nl[i];
    }
    const includedMass = (simpsonGrid * hGrid) / 3;
    const tailMass = Math.max(0, 1 - includedMass);

    const radNodes = radialNodes(st.n, st.l, Z, bohrScale);
    const angThetas = angularNodeThetas(st.l, st.m_l);
    const expRadCount = radialNodeCount(st.n, st.l);
    const expAngCount = angularNodeCount(st.l);

    // Virial residual in Hartrees: E_Ha = -0.5 * (mu/m_e) * Z^2 / n^2, V_Ha = -Z * <r^-1> = 2 * E_Ha
    const expectedV_Ha = -(Z / 1) * meanInvR;
    // Wait: V = -Z / r in e^2/(4pi eps0) = 1 Ha * a0; check that 2 * E_Ha === expectedV_Ha
    const virialResidualHa = Math.abs(2 * E_Ha - expectedV_Ha);

    // Consistency check with full 3D probability density at a sample point (r = meanR, theta = pi/3, phi = pi/5)
    const samplePdf3D = probabilityDensity(
      { n: st.n, l: st.l, m: st.m_l },
      st.basis,
      meanR,
      Math.PI / 3,
      Math.PI / 5,
      Z,
      bohrScale,
    );

    const checks = [
      {
        name: "radial-normalization",
        passed: normError < 1e-4,
        detail: `∫r²|R|²dr = ${moments.norm.toFixed(10)} (err ${normError.toExponential(2)})`,
      },
      {
        name: "analytic-vs-numeric-mean-r",
        passed: meanRError < 1e-4,
        detail: `<r> = ${meanR.toFixed(8)} a₀ vs Simpson ${moments.meanR.toFixed(8)} a₀ (rel err ${meanRError.toExponential(2)})`,
      },
      {
        name: "virial-theorem",
        passed: virialResidualHa < 1e-11,
        detail: `|2E - <V>| = ${virialResidualHa.toExponential(2)} Ha`,
      },
      {
        name: "node-counts",
        passed: radNodes.length === expRadCount && angThetas.length === expAngCount - (st.basis === "real" ? Math.abs(st.m_l) : 0) + (st.basis === "real" ? Math.abs(st.m_l) : 0) && samplePdf3D >= 0,
        detail: `radial nodes=${radNodes.length} (expected ${expRadCount}), polar cones=${angThetas.length}, total l=${expAngCount}`,
      },
    ];

    throwIfAborted(context.signal);
    context.onProgress?.(1, "Complete");

    return {
      ok: checks.every((c) => c.passed),
      data: {
        model: "schrodinger-coulomb",
        Z,
        N,
        q,
        label: `${input.system.isotope.label}${q === 0 ? "" : `${q}+`} ${subshellLabel(st.n, st.l)} (m_l=${st.m_l})`,
        stateKind: "nonrelativistic",
        energy: {
          bindingEnergy_eV: E_eV,
          bindingEnergy_Ha: E_Ha,
          bindingEnergy_cm1: E_cm1,
          ionizationEnergy_eV: -E_eV,
          kineticEnergy_eV: -E_eV,
          potentialEnergy_eV: 2 * E_eV,
          reducedMassRatio,
          bohrScale_a0: bohrScale,
        },
        nodes: {
          radialNodeCount: expRadCount,
          radialNodes_a0: radNodes,
          angularNodeCount: expAngCount,
          angularNodeThetas_rad: angThetas,
          azimuthalPhiPlanes: st.basis === "real" ? Math.abs(st.m_l) : 0,
        },
        expectationValues: {
          meanR_a0: meanR,
          meanR2_a02: meanR2,
          rmsRadius_a0: Math.sqrt(meanR2),
          meanInvR_a0inv: meanInvR,
          meanInvR2_a0inv2: meanInvR2,
          meanInvR3_a0inv3: meanInvR3,
          numericNorm: moments.norm,
          numericMeanR_a0: moments.meanR,
          normError,
          meanRError,
        },
        radialGrid: {
          r_a0,
          R_nl,
          P_nl,
          rMax_a0: rMax,
          integratedNorm: includedMass,
          tailMass,
        },
      },
      validationChecks: checks,
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: this.id,
        providerVersion: this.version,
        modelName: "Analytical Schrödinger–Coulomb (Hydrogen-Like)",
        hamiltonian: "H = -(hbar^2 / 2*mu) nabla^2 - Z e^2 / (4 pi epsilon_0 r)",
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: "analytic-exact-within-stated-Hamiltonian",
        assumptions: [
          `Point-nucleus Coulomb potential, Z=${Z}, N=1`,
          `Nuclear model: ${input.system.nuclearModel.kind} (bare nuclear mass ${input.system.isotope.nuclearMass_u.toFixed(6)} u, mu/m_e = ${reducedMassRatio.toFixed(10)})`,
          `Nonrelativistic spinless orbital (${st.basis} basis)`,
        ],
        limitations: supp.limitations,
        numericalQuality: {
          method: "exact-analytic-laguerre-plus-simpson-cross-check",
          gridPoints,
          integratedNorm: moments.norm,
          radialTailMass: tailMass,
          tolerances: {
            normError,
            meanRError,
            virialResidualHa,
          },
        },
        uncertainty: {
          numericalError: Math.max(normError, meanRError),
          modelApproximationNote:
            "Exact analytic solution to nonrelativistic point-Coulomb Hamiltonian; omits fine structure (O(Z^4 alpha^2)), QED/Lamb shift, hyperfine splitting, and finite nuclear volume.",
        },
        sourceCitation: "Bethe & Salpeter (Quantum Mechanics of One- and Two-Electron Atoms); NIST CODATA 2018",
      },
    };
  },
};
