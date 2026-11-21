/**
 * Nonrelativistic Electric-Dipole (E1) Transition Matrix Elements & Rates
 * for one-electron Schrödinger–Coulomb states (ATOMS v0.6.0 Phase 6).
 *
 * Operator (length gauge, atomic units e = a0 = 1):
 *   d_q = -e * r * C_q^{(1)}(theta, phi),  q in {-1, 0, +1}
 *   C_q^{(1)} = sqrt(4*pi/3) Y_1^q
 *
 * Selection rules evaluated directly & numerically verified:
 *   - m_{s,f} = m_{s,i}
 *   - Delta l = ±1 (parity flips)
 *   - Delta m_l = q in {-1, 0, +1} (for complex basis; real basis expanded cleanly)
 *
 * Zero React or Three.js dependencies.
 */
import type { AtomicSystem } from "@/domain/atomic";
import type { NonRelativisticState } from "@/domain/quantum";
import { hydrogenicEnergy_eV, radialExtent, radialR, subshellLabel } from "@/physics/hydrogenic";
import { EXTENDED_CONSTANTS, convertEnergy, energyEvToFrequencyHz, energyEvToWavelengthNm } from "@/physics/units";
import { wigner3j } from "@/numerics/specialFunctions/wigner";

export type SphericalPolarizationQ = -1 | 0 | 1;

export interface E1SelectionRuleEvaluation {
  readonly allowed: boolean;
  readonly spinConserved: boolean;
  readonly parityChanged: boolean;
  readonly deltaL: number;
  readonly allowedPolarizations: readonly SphericalPolarizationQ[];
  readonly reasons: readonly string[];
}

export interface NonRelativisticE1Result {
  readonly model: "schrodinger-coulomb";
  readonly operator: "E1-length-gauge (-e r C_q^(1))";
  readonly initial: NonRelativisticState;
  readonly final: NonRelativisticState;
  readonly initialLabel: string;
  readonly finalLabel: string;
  readonly isEmission: boolean;
  readonly selectionRule: E1SelectionRuleEvaluation;
  readonly radialMatrixElement_a0: number;
  readonly angularCoefficients: Readonly<Record<SphericalPolarizationQ, number>>;
  readonly totalDipoleSquared_e2a02: number;
  readonly reducedDipoleSquared_e2a02: number;
  readonly initialEnergy_eV: number;
  readonly finalEnergy_eV: number;
  readonly transitionEnergy_eV: number;
  readonly transitionEnergy_Ha: number;
  readonly wavelength_nm: number | null;
  readonly frequency_Hz: number | null;
  /** Absorption subshell oscillator strength f_{lower -> upper} (dimensionless, 0 when forbidden). */
  readonly oscillatorStrength: number;
  /** Spontaneous emission subshell-summed Einstein A_{upper -> lower} in s^-1 (0 when forbidden or degenerate). */
  readonly einsteinA_s1: number;
  /** Exact sublevel-to-sublevel spontaneous emission Einstein A_{i -> f} in s^-1 (0 if not emission or forbidden). */
  readonly sublevelEinsteinA_s1: number;
  readonly numericalQuality: {
    readonly radialMethod: string;
    readonly quadratureIntervals: number;
    readonly convergenceResidual: number;
  };
}

/** Complex spherical coefficients of real tesseral harmonic |l, m_real> in {|l, +m>, |l, -m>}. */
function realToComplexExpansion(m: number): Array<{ m: number; re: number; im: number }> {
  if (m === 0) return [{ m: 0, re: 1, im: 0 }];
  const am = Math.abs(m);
  const cs = am % 2 === 0 ? 1 : -1;
  // From realHarmonic definition in hydrogenic.ts:
  // m > 0: cos(am*phi) * sqrt(2) * cs * N * P_l^{am} = (cs/sqrt(2)) * [ Y_l^{am} + (-1)^am Y_l^{-am} ]
  // Wait: Y_l^{-am} = (-1)^am conj(Y_l^{am}) = (-1)^am N P e^{-i am phi}
  // So Y_l^{am} + (-1)^am Y_l^{-am} = 2 N P cos(am phi), thus divide by sqrt(2) and multiply by cs:
  if (m > 0) {
    return [
      { m: am, re: cs * Math.SQRT1_2, im: 0 },
      { m: -am, re: cs * Math.SQRT1_2 * cs, im: 0 },
    ];
  }
  // m < 0: 2 i sin(am phi) N P = Y_l^{am} - (-1)^am Y_l^{-am}, divide by i sqrt(2) -> mult by -i * cs / sqrt(2)
  return [
    { m: am, re: 0, im: -cs * Math.SQRT1_2 },
    { m: -am, re: 0, im: cs * Math.SQRT1_2 * cs },
  ];
}

/** Exact <l_f m_f | C_q^(1) | l_i m_i> via Wigner-Eckart & Wigner 3-j. */
export function nonrelativisticAngularC1(lf: number, mf: number, q: SphericalPolarizationQ, li: number, mi: number): number {
  const red3j = wigner3j(lf, 1, li, 0, 0, 0);
  if (red3j === 0) return 0;
  const m3j = wigner3j(lf, 1, li, -mf, q, mi);
  if (m3j === 0) return 0;
  // <l_f || C^(1) || l_i> = (-1)^{l_f} sqrt((2l_f+1)(2l_i+1)) 3j(l_f,1,l_i;0,0,0), combined with Wigner-Eckart (-1)^{l_f - m_f} -> (-1)^{m_f}
  const sign = Math.abs(mf) % 2 === 0 ? 1 : -1;
  return sign * Math.sqrt((2 * lf + 1) * (2 * li + 1)) * red3j * m3j;
}

/** Exact numerical radial dipole integral ∫_0^∞ r^3 R_{nf,lf}(r) R_{ni,li}(r) dr in a_0. */
export function integrateRadialDipoleNR(
  nf: number,
  lf: number,
  ni: number,
  li: number,
  Z: number,
  reducedMassRatio: number,
  intervals = 6000,
): { readonly integral_a0: number; readonly convergenceResidual: number } {
  const aScale = 1 / reducedMassRatio;
  const rMax = Math.max(radialExtent(nf, lf, Z, aScale), radialExtent(ni, li, Z, aScale)) * 1.4;

  const simpson = (N: number): number => {
    const h = rMax / N;
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      const r = i * h;
      if (r === 0) continue;
      const w = i === N ? 1 : i % 2 === 1 ? 4 : 2;
      sum += w * (r * r * r) * radialR(nf, lf, r, Z, aScale) * radialR(ni, li, r, Z, aScale);
    }
    return (sum * h) / 3;
  };

  const coarse = simpson(Math.max(500, Math.floor(intervals / 2)));
  const fine = simpson(intervals);
  return {
    integral_a0: fine,
    convergenceResidual: Math.abs(fine - coarse),
  };
}

export function evaluateNonRelativisticE1SelectionRules(
  initial: NonRelativisticState,
  final: NonRelativisticState,
): E1SelectionRuleEvaluation {
  const reasons: string[] = [];
  const spinConserved = initial.m_s === final.m_s;
  if (!spinConserved) {
    reasons.push(`Spin projection changes (m_s: ${initial.m_s} -> ${final.m_s}); spin-flipped E1 is forbidden in spinless NR Hamiltonian.`);
  }
  const deltaL = final.l - initial.l;
  const parityChanged = Math.abs(deltaL) === 1;
  if (!parityChanged) {
    reasons.push(`Delta l = ${deltaL} violates E1 selection rule Delta l = ±1.`);
  }

  const allowedPolarizations: SphericalPolarizationQ[] = [];
  if (spinConserved && parityChanged) {
    for (const q of [-1, 0, 1] as const) {
      const magSq = computeBasisAngularFactorSq(final, q, initial);
      if (magSq > 1e-18) allowedPolarizations.push(q);
    }
    if (allowedPolarizations.length === 0) {
      reasons.push(
        `Magnetic projection transition (${initial.basis} m_l=${initial.m_l} -> ${final.basis} m_l=${final.m_l}) has zero angular matrix element for all polarizations q = -1, 0, +1.`,
      );
    }
  }

  return {
    allowed: spinConserved && parityChanged && allowedPolarizations.length > 0,
    spinConserved,
    parityChanged,
    deltaL,
    allowedPolarizations,
    reasons: reasons.length > 0 ? reasons : ["E1 selection rules satisfied (Delta l = ±1, spin conserved, valid polarization channel)."],
  };
}

function computeBasisAngularFactorSq(
  final: NonRelativisticState,
  q: SphericalPolarizationQ,
  initial: NonRelativisticState,
): number {
  const iTerms =
    initial.basis === "complex"
      ? [{ m: initial.m_l, re: 1, im: 0 }]
      : realToComplexExpansion(initial.m_l);
  const fTerms =
    final.basis === "complex"
      ? [{ m: final.m_l, re: 1, im: 0 }]
      : realToComplexExpansion(final.m_l);

  let sumRe = 0;
  let sumIm = 0;
  for (const ft of fTerms) {
    for (const it of iTerms) {
      const ang = nonrelativisticAngularC1(final.l, ft.m, q, initial.l, it.m);
      if (ang === 0) continue;
      // conj(c_f) * c_i * ang
      sumRe += (ft.re * it.re + ft.im * it.im) * ang;
      sumIm += (ft.re * it.im - ft.im * it.re) * ang;
    }
  }
  return sumRe * sumRe + sumIm * sumIm;
}

export function calculateNonRelativisticE1Transition(
  system: AtomicSystem,
  initial: NonRelativisticState,
  final: NonRelativisticState,
  quadratureIntervals = 6000,
): NonRelativisticE1Result {
  if (system.N !== 1) {
    throw new RangeError(`Schrödinger E1 transitions support N = 1 hydrogen-like systems only (got N=${system.N}).`);
  }
  if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
    throw new RangeError(`Finite nuclear model "${system.nuclearModel.kind}" is unsupported for analytical Schrödinger E1.`);
  }

  const E_i = hydrogenicEnergy_eV(initial.n, system.Z, system.reducedMassRatio);
  const E_f = hydrogenicEnergy_eV(final.n, system.Z, system.reducedMassRatio);
  const deltaE_eV = Math.abs(E_f - E_i);
  const deltaE_Ha = convertEnergy(deltaE_eV, "eV", "Ha");
  const isEmission = E_i > E_f;

  const selectionRule = evaluateNonRelativisticE1SelectionRules(initial, final);
  const { integral_a0, convergenceResidual } = integrateRadialDipoleNR(
    final.n,
    final.l,
    initial.n,
    initial.l,
    system.Z,
    system.reducedMassRatio,
    quadratureIntervals,
  );

  const angSq: Record<SphericalPolarizationQ, number> = {
    [-1]: selectionRule.spinConserved && selectionRule.parityChanged ? computeBasisAngularFactorSq(final, -1, initial) : 0,
    0: selectionRule.spinConserved && selectionRule.parityChanged ? computeBasisAngularFactorSq(final, 0, initial) : 0,
    1: selectionRule.spinConserved && selectionRule.parityChanged ? computeBasisAngularFactorSq(final, 1, initial) : 0,
  };

  const sumAngSq = angSq[-1] + angSq[0] + angSq[1];
  const totalDipoleSq = selectionRule.allowed ? integral_a0 * integral_a0 * sumAngSq : 0;

  // Subshell-averaged reduced dipole strength |<nl||r C^(1)||n'l'>|^2 = max(l_i, l_f) * R_if^2 (0 when selection rule forbids transition)
  const maxL = Math.max(initial.l, final.l);
  const reducedDipoleSq = selectionRule.allowed ? maxL * integral_a0 * integral_a0 : 0;

  // Absorption oscillator strength f_{lower -> upper} = (2/3) * deltaE_Ha * (<r^2>_subshell / g_lower)
  // Equivalently for subshell: Sum over m_f of |<f|r|i>|^2 = (maxL / (2*l_lower + 1)) * R^2
  const lowerL = E_i <= E_f ? initial.l : final.l;
  const upperL = E_i <= E_f ? final.l : initial.l;
  const fOsc =
    selectionRule.allowed && deltaE_Ha > 0
      ? (2 / 3) * deltaE_Ha * (maxL / (2 * lowerL + 1)) * integral_a0 * integral_a0
      : 0;

  // Einstein A_{upper -> lower} = (4 alpha^3 / (3 tau_0)) * deltaE_Ha^3 * (maxL / (2*l_upper + 1)) * R^2
  const alpha = EXTENDED_CONSTANTS.alpha;
  const tau0 = EXTENDED_CONSTANTS.au_time_s;
  const einsteinA =
    selectionRule.allowed && deltaE_Ha > 0
      ? ((4 * alpha * alpha * alpha) / (3 * tau0)) *
        Math.pow(deltaE_Ha, 3) *
        (maxL / (2 * upperL + 1)) *
        integral_a0 *
        integral_a0
      : 0;
  const sublevelEinsteinA =
    isEmission && selectionRule.allowed && deltaE_Ha > 0
      ? ((4 * alpha * alpha * alpha) / (3 * tau0)) * Math.pow(deltaE_Ha, 3) * totalDipoleSq
      : 0;

  return {
    model: "schrodinger-coulomb",
    operator: "E1-length-gauge (-e r C_q^(1))",
    initial,
    final,
    initialLabel: `${subshellLabel(initial.n, initial.l)} (m_l=${initial.m_l})`,
    finalLabel: `${subshellLabel(final.n, final.l)} (m_l=${final.m_l})`,
    isEmission,
    selectionRule,
    radialMatrixElement_a0: integral_a0,
    angularCoefficients: {
      [-1]: Math.sqrt(angSq[-1]),
      0: Math.sqrt(angSq[0]),
      1: Math.sqrt(angSq[1]),
    },
    totalDipoleSquared_e2a02: totalDipoleSq,
    reducedDipoleSquared_e2a02: reducedDipoleSq,
    initialEnergy_eV: E_i,
    finalEnergy_eV: E_f,
    transitionEnergy_eV: deltaE_eV,
    transitionEnergy_Ha: deltaE_Ha,
    wavelength_nm: deltaE_eV > 0 ? energyEvToWavelengthNm(deltaE_eV) : null,
    frequency_Hz: deltaE_eV > 0 ? energyEvToFrequencyHz(deltaE_eV) : null,
    oscillatorStrength: fOsc,
    einsteinA_s1: einsteinA,
    sublevelEinsteinA_s1: sublevelEinsteinA,
    numericalQuality: {
      radialMethod: "composite-simpson-3/8-to-1/3",
      quadratureIntervals,
      convergenceResidual,
    },
  };
}
