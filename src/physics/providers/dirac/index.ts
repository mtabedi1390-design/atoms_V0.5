/**
 * Relativistic One-Electron Point-Coulomb Dirac Engine (ATOMS v0.6.0 Phase 4).
 *
 * Hamiltonian (atomic units, c = 1/alpha):
 *   H_D = c (alpha_vec · p) + beta m_e c^2 + V(r),   V(r) = -Z e^2 / (4 pi epsilon_0 r)
 *
 * Relativistic 4-component Dirac spinor:
 *   Psi_{n,kappa,m_j}(r,theta,phi) = (1/r) [ P_{n,kappa}(r) Omega_{kappa,m_j}(theta,phi) ;
 *                                            i Q_{n,kappa}(r) Omega_{-kappa,m_j}(theta,phi) ]
 *
 * Normalization:
 *   integral_0^infinity (|P_{n,kappa}(r)|^2 + |Q_{n,kappa}(r)|^2) dr = 1
 *
 * Explicitly separates Total Relativistic Energy E_{n,kappa} (which includes m_e c^2)
 * from Binding Energy E_bind = E_{n,kappa} - m_e c^2 (< 0 for bound states).
 *
 * Strictly enforces mathematical domain 0 < Z*alpha < |kappa| and N = 1,
 * and rejects finite-nucleus models (finite-uniform / finite-fermi) until
 * dedicated finite-nucleus radial solvers are implemented.
 *
 * Zero React or Three.js dependencies.
 */
import type { AtomicSystem } from "@/domain/atomic";
import { validateAtomicSystem } from "@/domain/atomic";
import {
  jFromKappa,
  lFromKappa,
  lSmallFromKappa,
  parityFromKappa,
  validateQuantumState,
  type QuantumState,
  type RelativisticState,
  type SuperpositionState,
} from "@/domain/quantum";
import {
  validationFromIssues,
  type SupportAssessment,
  type ValidationIssue,
  type ValidationResult,
} from "@/domain/validation";
import { sphericalHarmonic, SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import { laguerre, lgamma, lnFactorial } from "@/physics/special";
import { CONSTANTS_VERSION, EXTENDED_CONSTANTS, convertEnergy } from "@/physics/units";
import type {
  CalculationContext,
  CalculationResult,
  PhysicsProvider,
  ProviderCalculationInput,
} from "../contracts";

export const DIRAC_PROVIDER_ID = "dirac-coulomb" as const;
export const DIRAC_PROVIDER_VERSION = "0.6.0" as const;

export interface DiracEnergyMetrics {
  readonly gamma: number;
  readonly apparentN: number;
  readonly radialQuantumNumber: number;
  /** Dimensionless ratio epsilon = E_total / (m_e c^2) in (0, 1). */
  readonly dimensionlessTotalEpsilon: number;
  /** Total relativistic energy including electron rest mass m_e c^2 (in eV). */
  readonly totalEnergy_eV: number;
  /** Total relativistic energy including rest mass (in Ha). */
  readonly totalEnergy_Ha: number;
  /** Relativistic binding energy E_total - m_e c^2 (in eV, < 0). */
  readonly bindingEnergy_eV: number;
  /** Relativistic binding energy E_total - m_e c^2 (in Ha, < 0). */
  readonly bindingEnergy_Ha: number;
  /** Binding energy in cm^-1 (< 0). */
  readonly bindingEnergy_cm1: number;
  /** Positive ionization threshold |E_bind| (in eV). */
  readonly ionizationEnergy_eV: number;
  /** Infinite-mass Dirac binding energy before leading reduced-mass recoil scaling (in eV). */
  readonly infiniteMassBindingEnergy_eV: number;
  readonly restMassEnergy_eV: number;
  readonly reducedMassRatio: number;
  readonly bohrScale_a0: number;
}

export interface DiracFineStructurePartner {
  readonly partnerKappa: number;
  readonly partnerJ: number;
  readonly partnerBindingEnergy_eV: number;
  /** Splitting |E(n, kappa) - E(n, partnerKappa)| in eV, cm^-1, and GHz. */
  readonly splitting_eV: number;
  readonly splitting_cm1: number;
  readonly splitting_GHz: number;
}

export interface DiracExpectationValues {
  readonly meanR_a0: number;
  readonly meanR2_a02: number;
  readonly rmsRadius_a0: number;
  readonly meanInvR_a0inv: number;
  readonly analyticMeanInvR_a0inv: number;
  readonly invRError: number;
  readonly meanInvR2_a0inv2: number;
  readonly largeComponentNorm: number;
  readonly smallComponentNorm: number;
  readonly totalSpinorNorm: number;
  readonly normError: number;
}

export interface DiracRadialGridData {
  readonly r_a0: readonly number[];
  readonly P_nkappa: readonly number[];
  readonly Q_nkappa: readonly number[];
  readonly radialProbability: readonly number[];
  readonly rMax_a0: number;
  readonly integratedNorm: number;
  readonly smallFraction: number;
}

export interface DiracCalculationData {
  readonly model: "dirac-coulomb";
  readonly Z: number;
  readonly N: number;
  readonly q: number;
  readonly label: string;
  readonly stateKind: "relativistic" | "superposition";
  readonly quantumNumbers?: {
    readonly n: number;
    readonly kappa: number;
    readonly l: number;
    readonly lSmall: number;
    readonly j: number;
    readonly m_j: number;
    readonly parity: 1 | -1;
  };
  readonly energy: DiracEnergyMetrics;
  readonly fineStructure?: DiracFineStructurePartner;
  readonly expectationValues?: DiracExpectationValues;
  readonly radialGrid?: DiracRadialGridData;
  readonly superpositionSummary?: {
    readonly termCount: number;
    readonly normalizationSum: number;
    readonly meanBindingEnergy_eV: number;
  };
}

export interface Complex2 {
  readonly re: number;
  readonly im: number;
}

export interface DiracSpinorValue {
  /** 4-component Dirac spinor [up_large, down_large, up_small, down_small]. */
  readonly components: readonly [Complex2, Complex2, Complex2, Complex2];
  readonly density: number;
  readonly largeDensity: number;
  readonly smallDensity: number;
}

/** Check point-Coulomb Dirac mathematical domain 0 < Z * alpha < |kappa|. */
export function checkDiracCoulombDomain(Z: number, kappa: number, alpha = EXTENDED_CONSTANTS.alpha): {
  readonly valid: boolean;
  readonly gamma: number;
  readonly za: number;
  readonly reason?: string;
} {
  const za = Z * alpha;
  const kAbs = Math.abs(kappa);
  const disc = kAbs * kAbs - za * za;
  if (!(za > 0) || disc <= 0) {
    return {
      valid: false,
      gamma: NaN,
      za,
      reason: `Point-Coulomb Dirac domain violation: requires 0 < Z*alpha < |kappa| (got Z=${Z}, Z*alpha=${za.toFixed(6)}, |kappa|=${kAbs}).`,
    };
  }
  return { valid: true, gamma: Math.sqrt(disc), za };
}

/**
 * Exact point-Coulomb Dirac bound-state energy metrics.
 * Uses cancellation-free form E_bind = -Z^2 / (N_app^2 * (1 + epsilon)) Ha
 * scaled by reducedMassRatio for point-finite-mass leading recoil.
 */
export function computeDiracEnergy(
  n: number,
  kappa: number,
  Z: number,
  reducedMassRatio = 1,
  alpha = EXTENDED_CONSTANTS.alpha,
): DiracEnergyMetrics {
  const dom = checkDiracCoulombDomain(Z, kappa, alpha);
  if (!dom.valid) {
    throw new RangeError(dom.reason);
  }
  const kAbs = Math.abs(kappa);
  const nr = n - kAbs;
  if (nr < 0) {
    throw new RangeError(`Invalid Dirac state (n=${n}, kappa=${kappa}): n_r = n - |kappa| < 0.`);
  }
  const gamma = dom.gamma;
  const nApp = Math.sqrt(nr * nr + 2 * nr * gamma + kAbs * kAbs);
  const epsilon = (nr + gamma) / nApp; // = 1 / sqrt(1 + (Z*alpha/(nr+gamma))^2)
  const restHa = 1 / (alpha * alpha);
  const bindInfHa = -(Z * Z) / (nApp * nApp * (1 + epsilon));
  const bindInf_eV = convertEnergy(bindInfHa, "Ha", "eV");

  // Leading nonrelativistic reduced-mass factor (exact when point-infinite-mass -> reducedMassRatio = 1)
  const bindHa = bindInfHa * reducedMassRatio;
  const bind_eV = convertEnergy(bindHa, "Ha", "eV");
  const rest_eV = convertEnergy(restHa, "Ha", "eV");
  const total_eV = rest_eV + bind_eV;
  const total_Ha = restHa + bindHa;

  return {
    gamma,
    apparentN: nApp,
    radialQuantumNumber: nr,
    dimensionlessTotalEpsilon: epsilon,
    totalEnergy_eV: total_eV,
    totalEnergy_Ha: total_Ha,
    bindingEnergy_eV: bind_eV,
    bindingEnergy_Ha: bindHa,
    bindingEnergy_cm1: convertEnergy(bind_eV, "eV", "cm-1"),
    ionizationEnergy_eV: -bind_eV,
    infiniteMassBindingEnergy_eV: bindInf_eV,
    restMassEnergy_eV: rest_eV,
    reducedMassRatio,
    bohrScale_a0: 1 / reducedMassRatio,
  };
}

/**
 * Evaluate exact normalized Dirac radial spinor components (P_{n,kappa}(r), Q_{n,kappa}(r))
 * at radius r (in Bohr units a_0) satisfying integral_0^inf (|P|^2 + |Q|^2) dr = 1.
 */
export function diracRadialPQ(
  n: number,
  kappa: number,
  r_a0: number,
  Z: number,
  reducedMassRatio = 1,
  alpha = EXTENDED_CONSTANTS.alpha,
): { readonly P: number; readonly Q: number } {
  if (r_a0 <= 0) return { P: 0, Q: 0 };
  const dom = checkDiracCoulombDomain(Z, kappa, alpha);
  if (!dom.valid) throw new RangeError(dom.reason);

  const kAbs = Math.abs(kappa);
  const nr = n - kAbs;
  if (nr < 0) throw new RangeError(`Invalid Dirac (n=${n}, kappa=${kappa})`);

  const gamma = dom.gamma;
  const nApp = Math.sqrt(nr * nr + 2 * nr * gamma + kAbs * kAbs);
  const epsilon = (nr + gamma) / nApp;
  const aScale = 1 / reducedMassRatio;
  const lambda = Z / (nApp * aScale); // in a_0^-1
  const rho = 2 * lambda * r_a0;

  // Log-space normalization prevents Gamma overflow at large n or high Z
  const logPref =
    0.5 *
      (Math.log(lambda) +
        Math.log(nApp - kappa) +
        lnFactorial(nr) -
        Math.log(2 * nApp) -
        lgamma(nr + 2 * gamma + 1)) +
    gamma * Math.log(rho) -
    0.5 * rho;

  // Guard tiny underflow gracefully
  if (logPref < -720) return { P: 0, Q: 0 };
  const base = Math.exp(logPref);

  const twoGamma = 2 * gamma;
  const u = laguerre(nr, twoGamma, rho);
  const v = nr >= 1 ? -((nr + twoGamma) / (nApp - kappa)) * laguerre(nr - 1, twoGamma, rho) : 0;

  const P = base * Math.sqrt(1 + epsilon) * (u + v);
  const Q = -base * Math.sqrt(1 - epsilon) * (u - v);
  return { P, Q };
}

/**
 * Exact spin-angular spherical spinor Omega_{kappa, m_j}(theta, phi) in 2-component Pauli basis.
 */
export function spinAngularOmega(kappa: number, m_j: number, theta: number, phi: number): readonly [Complex2, Complex2] {
  const l = lFromKappa(kappa);
  const denom = 2 * l + 1;
  const mUp = Math.round(m_j - 0.5);
  const mDn = Math.round(m_j + 0.5);

  let upRe = 0;
  let upIm = 0;
  if (Math.abs(mUp) <= l) {
    const cgUp = kappa < 0 ? Math.sqrt((l + 0.5 + m_j) / denom) : -Math.sqrt((l + 0.5 - m_j) / denom);
    const [yr, yi] = sphericalHarmonic(l, mUp, theta, phi);
    upRe = cgUp * yr;
    upIm = cgUp * yi;
  }

  let dnRe = 0;
  let dnIm = 0;
  if (Math.abs(mDn) <= l) {
    const cgDn = kappa < 0 ? Math.sqrt((l + 0.5 - m_j) / denom) : Math.sqrt((l + 0.5 + m_j) / denom);
    const [yr, yi] = sphericalHarmonic(l, mDn, theta, phi);
    dnRe = cgDn * yr;
    dnIm = cgDn * yi;
  }

  return [
    { re: upRe, im: upIm },
    { re: dnRe, im: dnIm },
  ];
}

/**
 * Evaluate full 4-component Dirac spinor and probability densities at spherical coordinates (r, theta, phi).
 * Clamps r below 1e-8 a0 for 1/r projection safety near the point-Coulomb origin.
 */
export function evaluateDiracSpinor(
  state: RelativisticState,
  Z: number,
  reducedMassRatio: number,
  r_a0: number,
  theta: number,
  phi: number,
  alpha = EXTENDED_CONSTANTS.alpha,
): DiracSpinorValue {
  const rSafe = Math.max(r_a0, 1e-8);
  const { P, Q } = diracRadialPQ(state.n, state.kappa, rSafe, Z, reducedMassRatio, alpha);
  const invR = 1 / rSafe;
  const omP = spinAngularOmega(state.kappa, state.m_j, theta, phi);
  const omQ = spinAngularOmega(-state.kappa, state.m_j, theta, phi);

  const c0: Complex2 = { re: invR * P * omP[0].re, im: invR * P * omP[0].im };
  const c1: Complex2 = { re: invR * P * omP[1].re, im: invR * P * omP[1].im };
  // Lower spinor carries factor i * Q: i * (a + i b) = (-b) + i a
  const c2: Complex2 = { re: -invR * Q * omQ[0].im, im: invR * Q * omQ[0].re };
  const c3: Complex2 = { re: -invR * Q * omQ[1].im, im: invR * Q * omQ[1].re };

  const largeDensity = c0.re * c0.re + c0.im * c0.im + c1.re * c1.re + c1.im * c1.im;
  const smallDensity = c2.re * c2.re + c2.im * c2.im + c3.re * c3.re + c3.im * c3.im;
  return {
    components: [c0, c1, c2, c3],
    density: largeDensity + smallDensity,
    largeDensity,
    smallDensity,
  };
}

/** Exact Dirac point-Coulomb analytic <r^-1> = Z (n_r gamma + kappa^2) / (a_mu gamma N_app^3). */
export function diracAnalyticMeanInvR(
  n: number,
  kappa: number,
  Z: number,
  reducedMassRatio = 1,
  alpha = EXTENDED_CONSTANTS.alpha,
): number {
  const dom = checkDiracCoulombDomain(Z, kappa, alpha);
  if (!dom.valid) throw new RangeError(dom.reason);
  const kAbs = Math.abs(kappa);
  const nr = n - kAbs;
  const g = dom.gamma;
  const nApp = Math.sqrt(nr * nr + 2 * nr * g + kAbs * kAbs);
  const aScale = 1 / reducedMassRatio;
  return (Z * (nr * g + kappa * kappa)) / (aScale * g * nApp * nApp * nApp);
}

/**
 * Exponential-coordinate Simpson quadrature resolving both the near-origin r^gamma cusp
 * (critical at high Z) and the outer asymptotic tail.
 */
export function integrateDiracExpectationValues(
  n: number,
  kappa: number,
  Z: number,
  reducedMassRatio = 1,
  alpha = EXTENDED_CONSTANTS.alpha,
  intervals = 4000,
): DiracExpectationValues {
  const dom = checkDiracCoulombDomain(Z, kappa, alpha);
  if (!dom.valid) throw new RangeError(dom.reason);
  const aScale = 1 / reducedMassRatio;
  const l = lFromKappa(kappa);
  const rMax = Math.max(((3 * n * n - l * (l + 1)) * aScale) / (2 * Z) * 8, (12 * n * aScale) / Z);
  const r0 = (1e-5 * aScale) / Z;
  const tMax = Math.log(1 + rMax / r0);
  const dt = tMax / intervals;

  let sP2 = 0;
  let sQ2 = 0;
  let sR = 0;
  let sR2 = 0;
  let sInvR = 0;
  let sInvR2 = 0;

  for (let i = 0; i <= intervals; i++) {
    const t = i * dt;
    const w = i === 0 || i === intervals ? 1 : i % 2 === 1 ? 4 : 2;
    const r = r0 * (Math.exp(t) - 1);
    const jac = r + r0; // dr / dt
    if (r > 0) {
      const { P, Q } = diracRadialPQ(n, kappa, r, Z, reducedMassRatio, alpha);
      const p2 = P * P;
      const q2 = Q * Q;
      const tot = p2 + q2;
      sP2 += w * p2 * jac;
      sQ2 += w * q2 * jac;
      sR += w * tot * r * jac;
      sR2 += w * tot * r * r * jac;
      sInvR += w * (tot / r) * jac;
      sInvR2 += w * (tot / (r * r)) * jac;
    }
  }

  const f = dt / 3;
  const largeNorm = sP2 * f;
  const smallNorm = sQ2 * f;
  const totalNorm = largeNorm + smallNorm;
  const meanInvR = sInvR * f;
  const analyticInvR = diracAnalyticMeanInvR(n, kappa, Z, reducedMassRatio, alpha);

  return {
    meanR_a0: sR * f,
    meanR2_a02: sR2 * f,
    rmsRadius_a0: Math.sqrt(Math.max(0, sR2 * f)),
    meanInvR_a0inv: meanInvR,
    analyticMeanInvR_a0inv: analyticInvR,
    invRError: Math.abs(meanInvR - analyticInvR) / analyticInvR,
    meanInvR2_a0inv2: sInvR2 * f,
    largeComponentNorm: largeNorm,
    smallComponentNorm: smallNorm,
    totalSpinorNorm: totalNorm,
    normError: Math.abs(totalNorm - 1),
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Dirac calculation aborted", "AbortError");
  }
}

export const diracCoulombV6Provider: PhysicsProvider<
  AtomicSystem,
  QuantumState,
  ProviderCalculationInput,
  DiracCalculationData
> = {
  id: DIRAC_PROVIDER_ID,
  name: "Analytical Point-Coulomb Dirac (Hydrogen-Like)",
  version: DIRAC_PROVIDER_VERSION,
  available: true,
  capabilities: [
    "bound-energy",
    "total-energy",
    "spinor-wavefunction",
    "radial-wavefunction",
    "spatial-density",
    "radial-probability",
    "expectation-values",
    "fine-structure",
    "e1-transitions",
    "spectroscopy",
  ],

  supports(system: AtomicSystem, state: QuantumState): SupportAssessment {
    if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [
          `Point-Coulomb Dirac does not implement finite nuclear charge distributions ("${system.nuclearModel.kind}"). Point nucleus will not be silently substituted.`,
        ],
        limitations: ["Requires dedicated numerical finite-nucleus Dirac radial solver."],
      };
    }

    if (system.N !== 1) {
      const ionNote =
        system.q < 0
          ? `Negative ion (N=${system.N}, Z=${system.Z}, q=${system.q}) is a correlated many-electron system; one-electron Dirac–Coulomb cannot bind anions.`
          : `One-electron Dirac–Coulomb supports N = 1 hydrogen-like systems only (got N=${system.N}, Z=${system.Z}). Do not confuse one-electron Dirac with many-electron Dirac–Fock.`;
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [ionNote],
        limitations: ["Strictly restricted to one-electron N = 1 Coulomb systems."],
      };
    }

    if (state.kind !== "relativistic" && !(state.kind === "superposition" && state.basisKind === "relativistic")) {
      return {
        supported: false,
        evidenceClass: "unavailable",
        reasons: [`Dirac–Coulomb requires relativistic (n, kappa, j, m_j) spinor states; incompatible with "${state.kind}".`],
        limitations: ["Use Schrödinger–Coulomb for nonrelativistic (n, l, m_l, m_s) orbitals."],
      };
    }

    if (state.kind === "relativistic") {
      const dom = checkDiracCoulombDomain(system.Z, state.kappa);
      if (!dom.valid) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [dom.reason!],
          limitations: ["Point-Coulomb Dirac breaks down for Z*alpha >= |kappa|."],
        };
      }
    } else {
      for (const term of state.terms) {
        if (term.state.kind !== "relativistic") continue;
        const dom = checkDiracCoulombDomain(system.Z, term.state.kappa);
        if (!dom.valid) {
          return {
            supported: false,
            evidenceClass: "unavailable",
            reasons: [dom.reason!],
            limitations: ["Point-Coulomb Dirac breaks down for Z*alpha >= |kappa|."],
          };
        }
      }
    }

    return {
      supported: true,
      evidenceClass: "analytic-exact-within-stated-Hamiltonian",
      reasons: [
        `Exact analytical point-Coulomb Dirac 4-component spinor solution for one-electron ${system.species.symbol}${system.q === 0 ? "" : `${system.q}+`} (Z=${system.Z}, N=1).`,
      ],
      limitations: [
        "One-electron point-Coulomb Dirac Hamiltonian ONLY (not many-electron Dirac–Fock/MCDHF).",
        "Omits QED radiative corrections (Lamb shift, self-energy, vacuum polarization), Breit interaction, hyperfine splitting, and finite nuclear volume.",
        "Finite-mass recoil is modeled only to leading reduced-mass order when point-finite-mass is selected; full relativistic two-body recoil is omitted.",
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
        code: "DIRAC_REQUIRES_ONE_ELECTRON",
        field: "system.N",
        message: `One-electron Dirac–Coulomb requires N = 1 (got N=${input.system.N}).`,
      });
    }
    if (input.state.kind === "relativistic") {
      const dom = checkDiracCoulombDomain(input.system.Z, input.state.kappa);
      if (!dom.valid) {
        issues.push({
          severity: "error",
          code: "DIRAC_DOMAIN_VIOLATION",
          field: "system.Z",
          message: dom.reason!,
        });
      }
    }
    return validationFromIssues(issues);
  },

  async calculate(
    input: ProviderCalculationInput,
    context: CalculationContext,
  ): Promise<CalculationResult<DiracCalculationData>> {
    throwIfAborted(context.signal);
    const supp = this.supports(input.system, input.state);
    if (!supp.supported) throw new Error(supp.reasons.join("; "));
    const val = this.validate(input);
    if (!val.valid) {
      throw new Error(val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
    }

    const { Z, N, q, reducedMassRatio } = input.system;
    const gridPoints = Number(input.numericalOptions?.gridPoints ?? 512);
    const alphaOverride =
      typeof input.numericalOptions?.alpha === "number" ? input.numericalOptions.alpha : EXTENDED_CONSTANTS.alpha;

    context.onProgress?.(0.25, "Evaluating analytical Dirac–Coulomb spinor eigenvalues");

    if (input.state.kind === "superposition") {
      const sup = input.state as SuperpositionState;
      let normSq = 0;
      let weightedBind_eV = 0;
      let firstEnergy: DiracEnergyMetrics | undefined;
      for (const term of sup.terms) {
        if (term.state.kind !== "relativistic") continue;
        const e = computeDiracEnergy(term.state.n, term.state.kappa, Z, reducedMassRatio, alphaOverride);
        firstEnergy ??= e;
        const w = term.amplitude.re * term.amplitude.re + term.amplitude.im * term.amplitude.im;
        normSq += w;
        weightedBind_eV += w * e.bindingEnergy_eV;
      }
      const meanBind_eV = normSq > 0 ? weightedBind_eV / normSq : 0;
      const base = firstEnergy ?? computeDiracEnergy(1, -1, Z, reducedMassRatio, alphaOverride);
      throwIfAborted(context.signal);
      context.onProgress?.(1, "Complete");
      return {
        ok: normSq > 0,
        data: {
          model: "dirac-coulomb",
          Z,
          N,
          q,
          label: `${input.system.isotope.label}${q === 0 ? "" : `${q}+`} Dirac superposition`,
          stateKind: "superposition",
          energy: {
            ...base,
            bindingEnergy_eV: meanBind_eV,
            bindingEnergy_Ha: convertEnergy(meanBind_eV, "eV", "Ha"),
            bindingEnergy_cm1: convertEnergy(meanBind_eV, "eV", "cm-1"),
            ionizationEnergy_eV: -meanBind_eV,
          },
          superpositionSummary: {
            termCount: sup.terms.length,
            normalizationSum: normSq,
            meanBindingEnergy_eV: meanBind_eV,
          },
        },
        validationChecks: [{ name: "superposition-positive-norm", passed: normSq > 0, detail: `sum |c_i|^2 = ${normSq.toFixed(8)}` }],
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: this.id,
          providerVersion: this.version,
          modelName: "Analytical Point-Coulomb Dirac (Superposition)",
          hamiltonian: "H_D = c alpha·p + beta m_e c^2 - Z e^2 / (4 pi epsilon_0 r)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "analytic-exact-within-stated-Hamiltonian",
          assumptions: [
            `One-electron point-Coulomb Dirac Hamiltonian, Z=${Z}, N=1`,
            `Energy reference: total includes m_e c^2; binding = E_total - m_e c^2`,
          ],
          limitations: supp.limitations,
          numericalQuality: { method: "exact-analytic-dirac-laguerre", integratedNorm: normSq },
          uncertainty: {
            modelApproximationNote: "Exact point-Coulomb Dirac spinor superposition; omits Lamb shift/QED, Breit, and finite nuclear volume.",
          },
        },
      };
    }

    const st = input.state as RelativisticState;
    const l = lFromKappa(st.kappa);
    const lSmall = lSmallFromKappa(st.kappa);
    const parity = parityFromKappa(st.kappa);
    const energy = computeDiracEnergy(st.n, st.kappa, Z, reducedMassRatio, alphaOverride);

    let fineStructure: DiracFineStructurePartner | undefined;
    if (l >= 1) {
      const partnerKappa = st.kappa < 0 ? l : -(l + 1);
      const partnerEnergy = computeDiracEnergy(st.n, partnerKappa, Z, reducedMassRatio, alphaOverride);
      const split_eV = Math.abs(energy.bindingEnergy_eV - partnerEnergy.bindingEnergy_eV);
      const split_cm1 = convertEnergy(split_eV, "eV", "cm-1");
      const split_GHz = (split_eV * EXTENDED_CONSTANTS.e_C) / EXTENDED_CONSTANTS.h_Js / 1e9;
      fineStructure = {
        partnerKappa,
        partnerJ: jFromKappa(partnerKappa),
        partnerBindingEnergy_eV: partnerEnergy.bindingEnergy_eV,
        splitting_eV: split_eV,
        splitting_cm1: split_cm1,
        splitting_GHz: split_GHz,
      };
    }

    throwIfAborted(context.signal);
    context.onProgress?.(0.6, "Evaluating spinor radial P(r), Q(r) & quadrature checks");

    const expectVals = integrateDiracExpectationValues(st.n, st.kappa, Z, reducedMassRatio, alphaOverride);

    const aScale = 1 / reducedMassRatio;
    const rMax = Math.max(((3 * st.n * st.n - l * (l + 1)) * aScale) / (2 * Z) * 5, (10 * st.n * aScale) / Z);
    const r_a0: number[] = new Array(gridPoints);
    const P_nkappa: number[] = new Array(gridPoints);
    const Q_nkappa: number[] = new Array(gridPoints);
    const radialProbability: number[] = new Array(gridPoints);

    for (let i = 0; i < gridPoints; i++) {
      const r = (i / (gridPoints - 1)) * rMax;
      r_a0[i] = r;
      const { P, Q } = diracRadialPQ(st.n, st.kappa, r, Z, reducedMassRatio, alphaOverride);
      P_nkappa[i] = P;
      Q_nkappa[i] = Q;
      radialProbability[i] = P * P + Q * Q;
    }

    const twoJ = Math.round(2 * st.j);
    const subLabel = `${st.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${twoJ}/2`;

    const checks = [
      {
        name: "spinor-radial-normalization",
        passed: expectVals.normError < 1e-5,
        detail: `∫(|P|²+|Q|²)dr = ${expectVals.totalSpinorNorm.toFixed(10)} (err ${expectVals.normError.toExponential(2)})`,
      },
      {
        name: "dirac-hellmann-feynman-inv-r",
        passed: expectVals.invRError < 1e-5,
        detail: `<r⁻¹> quad ${expectVals.meanInvR_a0inv.toFixed(8)} vs exact ${expectVals.analyticMeanInvR_a0inv.toFixed(8)} a₀⁻¹ (rel err ${expectVals.invRError.toExponential(2)})`,
      },
      {
        name: "point-coulomb-domain",
        passed: Z * alphaOverride < Math.abs(st.kappa),
        detail: `Z·α = ${(Z * alphaOverride).toFixed(6)} < |κ| = ${Math.abs(st.kappa)} (γ = ${energy.gamma.toFixed(6)})`,
      },
    ];

    throwIfAborted(context.signal);
    context.onProgress?.(1, "Complete");

    return {
      ok: checks.every((c) => c.passed),
      data: {
        model: "dirac-coulomb",
        Z,
        N,
        q,
        label: `${input.system.isotope.label}${q === 0 ? "" : `${q}+`} ${subLabel} (κ=${st.kappa})`,
        stateKind: "relativistic",
        quantumNumbers: {
          n: st.n,
          kappa: st.kappa,
          l,
          lSmall,
          j: st.j,
          m_j: st.m_j,
          parity,
        },
        energy,
        fineStructure,
        expectationValues: expectVals,
        radialGrid: {
          r_a0,
          P_nkappa,
          Q_nkappa,
          radialProbability,
          rMax_a0: rMax,
          integratedNorm: expectVals.totalSpinorNorm,
          smallFraction: expectVals.smallComponentNorm,
        },
      },
      validationChecks: checks,
      computedAtIso: new Date().toISOString(),
      provenance: {
        providerId: this.id,
        providerVersion: this.version,
        modelName: "Analytical Point-Coulomb Dirac (Hydrogen-Like)",
        hamiltonian: "H_D = c alpha·p + beta m_e c^2 - Z e^2 / (4 pi epsilon_0 r)",
        constantsVersion: CONSTANTS_VERSION,
        evidenceClass: "analytic-exact-within-stated-Hamiltonian",
        assumptions: [
          `One-electron point-Coulomb Dirac 4-component spinor, Z=${Z}, N=1`,
          `Nuclear model: ${input.system.nuclearModel.kind} (mu/m_e = ${reducedMassRatio.toFixed(10)})`,
          `Rest-energy reference explicitly separated: bindingEnergy = totalEnergy - m_e c^2`,
        ],
        limitations: supp.limitations,
        numericalQuality: {
          method: "exact-analytic-dirac-laguerre-plus-log-grid-simpson",
          gridPoints,
          integratedNorm: expectVals.totalSpinorNorm,
          tolerances: {
            normError: expectVals.normError,
            invRError: expectVals.invRError,
          },
        },
        uncertainty: {
          numericalError: Math.max(expectVals.normError, expectVals.invRError),
          modelApproximationNote:
            "Exact analytic solution to one-electron point-Coulomb Dirac equation; omits Lamb shift/QED (O(alpha (Z*alpha)^4)), hyperfine structure, Breit, and finite nuclear size.",
        },
        sourceCitation: "Grant (Relativistic Quantum Theory of Atoms and Molecules); Bethe & Salpeter; CODATA 2018",
      },
    };
  },
};
