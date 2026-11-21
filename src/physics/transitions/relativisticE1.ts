/**
 * Relativistic Dirac Electric-Dipole (E1) Transition Matrix Elements & Rates
 * (ATOMS v0.6.0 Phase 6).
 *
 * Evaluates full 4-component Dirac spinor E1 length-gauge matrix elements:
 *   <Psi_f | r C_q^{(1)} | Psi_i>
 *     = <Omega_{kappa_f, m_{jf}} | C_q^{(1)} | Omega_{kappa_i, m_{ji}}> * integral r P_f P_i dr
 *     + <Omega_{-kappa_f, m_{jf}} | C_q^{(1)} | Omega_{-kappa_i, m_{ji}}> * integral r Q_f Q_i dr
 *
 * using exact Wigner 3-j & 6-j spin-angular algebra and logarithmic-grid quadrature.
 * Zero React or Three.js dependencies.
 */
import type { AtomicSystem } from "@/domain/atomic";
import {
  lFromKappa,
  lSmallFromKappa,
  parityFromKappa,
  type RelativisticState,
} from "@/domain/quantum";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import { computeDiracEnergy, diracRadialPQ } from "@/physics/providers/dirac";
import { EXTENDED_CONSTANTS, convertEnergy, energyEvToFrequencyHz, energyEvToWavelengthNm } from "@/physics/units";
import { wigner3j, wigner6j } from "@/numerics/specialFunctions/wigner";
import type { SphericalPolarizationQ } from "./nonrelativisticE1";

export interface RelativisticE1SelectionRule {
  readonly allowed: boolean;
  readonly parityChanged: boolean;
  readonly deltaJ: number;
  readonly zeroToZeroForbidden: boolean;
  readonly deltaMj: number;
  readonly allowedPolarizations: readonly SphericalPolarizationQ[];
  readonly reasons: readonly string[];
}

export interface RelativisticE1Result {
  readonly model: "dirac-coulomb";
  readonly operator: "E1-dirac-length-gauge (-e r C_q^(1) I_4)";
  readonly initial: RelativisticState;
  readonly final: RelativisticState;
  readonly initialLabel: string;
  readonly finalLabel: string;
  readonly isEmission: boolean;
  readonly selectionRule: RelativisticE1SelectionRule;
  readonly radialLargePP_a0: number;
  readonly radialSmallQQ_a0: number;
  readonly angularCoefficientsLarge: Readonly<Record<SphericalPolarizationQ, number>>;
  readonly angularCoefficientsSmall: Readonly<Record<SphericalPolarizationQ, number>>;
  readonly totalMatrixElement_ea0: number;
  readonly totalDipoleSquared_e2a02: number;
  readonly reducedLineStrength_S: number;
  readonly initialBindingEnergy_eV: number;
  readonly finalBindingEnergy_eV: number;
  readonly transitionEnergy_eV: number;
  readonly transitionEnergy_Ha: number;
  readonly wavelength_nm: number | null;
  readonly frequency_Hz: number | null;
  readonly oscillatorStrength: number;
  readonly einsteinA_s1: number;
  readonly numericalQuality: {
    readonly radialMethod: string;
    readonly quadratureIntervals: number;
    readonly convergenceResidual: number;
  };
}

/**
 * Exact spin-angular reduced matrix element <(l_f, 1/2) j_f || C^(1) || (l_i, 1/2) j_i>
 * computed directly from Wigner 3-j and 6-j symbols.
 */
export function relativisticSpinAngularReducedC1(lf: number, jf: number, li: number, ji: number): number {
  const redL3j = wigner3j(lf, 1, li, 0, 0, 0);
  if (redL3j === 0) return 0;
  const sixJ = wigner6j(jf, 1, ji, li, 0.5, lf);
  if (sixJ === 0) return 0;

  const lRed = (lf % 2 === 0 ? 1 : -1) * Math.sqrt((2 * lf + 1) * (2 * li + 1)) * redL3j;
  const phaseExp = Math.round(lf + 0.5 + ji + 1);
  const phase = ((phaseExp % 2) + 2) % 2 === 0 ? 1 : -1;
  return phase * Math.sqrt((2 * jf + 1) * (2 * ji + 1)) * sixJ * lRed;
}

/** Full spin-angular E1 matrix element <Omega_{kappa_f, m_f} | C_q^(1) | Omega_{kappa_i, m_i}>. */
export function relativisticSpinAngularC1(
  kappaF: number,
  mf: number,
  q: SphericalPolarizationQ,
  kappaI: number,
  mi: number,
): number {
  const lf = lFromKappa(kappaF);
  const li = lFromKappa(kappaI);
  const jf = Math.abs(kappaF) - 0.5;
  const ji = Math.abs(kappaI) - 0.5;
  const m3j = wigner3j(jf, 1, ji, -mf, q, mi);
  if (m3j === 0) return 0;
  const red = relativisticSpinAngularReducedC1(lf, jf, li, ji);
  const phaseExp = Math.round(jf - mf);
  const sign = ((phaseExp % 2) + 2) % 2 === 0 ? 1 : -1;
  return sign * m3j * red;
}

export function evaluateRelativisticE1SelectionRules(
  initial: RelativisticState,
  final: RelativisticState,
): RelativisticE1SelectionRule {
  const reasons: string[] = [];
  const pI = parityFromKappa(initial.kappa);
  const pF = parityFromKappa(final.kappa);
  const parityChanged = pI * pF === -1;
  const deltaJ = final.j - initial.j;
  const zeroToZeroForbidden = initial.j === 0 && final.j === 0;
  const deltaMj = final.m_j - initial.m_j;

  if (!parityChanged) {
    reasons.push(`E1 requires opposite parity (l_i=${lFromKappa(initial.kappa)}, l_f=${lFromKappa(final.kappa)} have same parity).`);
  }
  if (Math.abs(deltaJ) > 1 + 1e-9 || zeroToZeroForbidden) {
    reasons.push(`Violates E1 total angular momentum rule Delta j in {-1, 0, +1} with 0 -/-> 0 (got j_i=${initial.j}, j_f=${final.j}).`);
  }

  const allowedPolarizations: SphericalPolarizationQ[] = [];
  if (parityChanged && Math.abs(deltaJ) <= 1 + 1e-9 && !zeroToZeroForbidden) {
    for (const q of [-1, 0, 1] as const) {
      if (Math.abs(deltaMj - q) < 1e-9) {
        const angL = relativisticSpinAngularC1(final.kappa, final.m_j, q, initial.kappa, initial.m_j);
        const angS = relativisticSpinAngularC1(-final.kappa, final.m_j, q, -initial.kappa, initial.m_j);
        if (Math.abs(angL) > 1e-12 || Math.abs(angS) > 1e-12) {
          allowedPolarizations.push(q);
        }
      }
    }
    if (allowedPolarizations.length === 0) {
      reasons.push(`Delta m_j = ${deltaMj} has no allowed E1 polarization q in {-1, 0, +1}.`);
    }
  }

  return {
    allowed: parityChanged && Math.abs(deltaJ) <= 1 + 1e-9 && !zeroToZeroForbidden && allowedPolarizations.length > 0,
    parityChanged,
    deltaJ,
    zeroToZeroForbidden,
    deltaMj,
    allowedPolarizations,
    reasons: reasons.length > 0 ? reasons : ["Relativistic E1 selection rules satisfied (Delta j = 0, ±1, parity flips)."],
  };
}

/** Log-grid Simpson quadrature for Dirac radial dipole integrals ∫ r (P_f P_i) dr and ∫ r (Q_f Q_i) dr. */
export function integrateDiracRadialDipole(
  nf: number,
  kappaF: number,
  ni: number,
  kappaI: number,
  Z: number,
  reducedMassRatio: number,
  alpha = EXTENDED_CONSTANTS.alpha,
  intervals = 4000,
): { readonly rPP_a0: number; readonly rQQ_a0: number; readonly convergenceResidual: number } {
  const aScale = 1 / reducedMassRatio;
  const maxN = Math.max(nf, ni);
  const rMax = Math.max((8 * maxN * maxN * aScale) / Z, (14 * maxN * aScale) / Z);
  const r0 = (1e-5 * aScale) / Z;
  const tMax = Math.log(1 + rMax / r0);

  const quad = (N: number): { pp: number; qq: number } => {
    const dt = tMax / N;
    let sPP = 0;
    let sQQ = 0;
    for (let i = 0; i <= N; i++) {
      const t = i * dt;
      const w = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
      const r = r0 * (Math.exp(t) - 1);
      if (r <= 0) continue;
      const jac = r + r0;
      const rf = diracRadialPQ(nf, kappaF, r, Z, reducedMassRatio, alpha);
      const ri = diracRadialPQ(ni, kappaI, r, Z, reducedMassRatio, alpha);
      sPP += w * r * rf.P * ri.P * jac;
      sQQ += w * r * rf.Q * ri.Q * jac;
    }
    const f = dt / 3;
    return { pp: sPP * f, qq: sQQ * f };
  };

  const coarse = quad(Math.max(500, Math.floor(intervals / 2)));
  const fine = quad(intervals);
  return {
    rPP_a0: fine.pp,
    rQQ_a0: fine.qq,
    convergenceResidual: Math.max(Math.abs(fine.pp - coarse.pp), Math.abs(fine.qq - coarse.qq)),
  };
}

function formatDiracLabel(s: RelativisticState): string {
  const l = lFromKappa(s.kappa);
  const twoJ = Math.round(2 * s.j);
  return `${s.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${twoJ}/2`;
}

export function calculateRelativisticE1Transition(
  system: AtomicSystem,
  initial: RelativisticState,
  final: RelativisticState,
  opts: { readonly alpha?: number; readonly quadratureIntervals?: number } = {},
): RelativisticE1Result {
  if (system.N !== 1) {
    throw new RangeError(`Dirac E1 transitions support N = 1 hydrogen-like systems only (got N=${system.N}).`);
  }
  if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
    throw new RangeError(`Finite nuclear model "${system.nuclearModel.kind}" is unsupported for analytical Dirac E1.`);
  }

  const alpha = opts.alpha ?? EXTENDED_CONSTANTS.alpha;
  const intervals = opts.quadratureIntervals ?? 4000;

  const eI = computeDiracEnergy(initial.n, initial.kappa, system.Z, system.reducedMassRatio, alpha);
  const eF = computeDiracEnergy(final.n, final.kappa, system.Z, system.reducedMassRatio, alpha);
  const deltaE_eV = Math.abs(eF.bindingEnergy_eV - eI.bindingEnergy_eV);
  const deltaE_Ha = convertEnergy(deltaE_eV, "eV", "Ha");
  const isEmission = eI.bindingEnergy_eV > eF.bindingEnergy_eV;

  const selectionRule = evaluateRelativisticE1SelectionRules(initial, final);
  const { rPP_a0, rQQ_a0, convergenceResidual } = integrateDiracRadialDipole(
    final.n,
    final.kappa,
    initial.n,
    initial.kappa,
    system.Z,
    system.reducedMassRatio,
    alpha,
    intervals,
  );

  const angL: Record<SphericalPolarizationQ, number> = {
    [-1]: relativisticSpinAngularC1(final.kappa, final.m_j, -1, initial.kappa, initial.m_j),
    0: relativisticSpinAngularC1(final.kappa, final.m_j, 0, initial.kappa, initial.m_j),
    1: relativisticSpinAngularC1(final.kappa, final.m_j, 1, initial.kappa, initial.m_j),
  };
  const angS: Record<SphericalPolarizationQ, number> = {
    [-1]: relativisticSpinAngularC1(-final.kappa, final.m_j, -1, -initial.kappa, initial.m_j),
    0: relativisticSpinAngularC1(-final.kappa, final.m_j, 0, -initial.kappa, initial.m_j),
    1: relativisticSpinAngularC1(-final.kappa, final.m_j, 1, -initial.kappa, initial.m_j),
  };

  let sumMagSq = 0;
  let totalSigned = 0;
  if (selectionRule.allowed) {
    for (const q of selectionRule.allowedPolarizations) {
      const m = angL[q] * rPP_a0 + angS[q] * rQQ_a0;
      totalSigned += m;
      sumMagSq += m * m;
    }
  }

  // Reduced relativistic E1 line strength S = |<kappa_f||C^(1)||kappa_i> R_PP + <-kappa_f||C^(1)||-kappa_i> R_QQ|^2
  const redLarge = relativisticSpinAngularReducedC1(
    lFromKappa(final.kappa),
    final.j,
    lFromKappa(initial.kappa),
    initial.j,
  );
  const redSmall = relativisticSpinAngularReducedC1(
    lSmallFromKappa(final.kappa),
    final.j,
    lSmallFromKappa(initial.kappa),
    initial.j,
  );
  const reducedAmplitude = redLarge * rPP_a0 + redSmall * rQQ_a0;
  const lineStrengthS = selectionRule.parityChanged && Math.abs(selectionRule.deltaJ) <= 1 ? reducedAmplitude * reducedAmplitude : 0;

  const lowerJ = eI.bindingEnergy_eV <= eF.bindingEnergy_eV ? initial.j : final.j;
  const upperJ = eI.bindingEnergy_eV <= eF.bindingEnergy_eV ? final.j : initial.j;
  const gLower = Math.round(2 * lowerJ + 1);
  const gUpper = Math.round(2 * upperJ + 1);

  const fOsc = deltaE_Ha > 0 && lineStrengthS > 0 ? (2 / (3 * gLower)) * deltaE_Ha * lineStrengthS : 0;
  const einsteinA =
    deltaE_Ha > 0 && lineStrengthS > 0
      ? ((4 * alpha * alpha * alpha) / (3 * gUpper * EXTENDED_CONSTANTS.au_time_s)) * Math.pow(deltaE_Ha, 3) * lineStrengthS
      : 0;

  return {
    model: "dirac-coulomb",
    operator: "E1-dirac-length-gauge (-e r C_q^(1) I_4)",
    initial,
    final,
    initialLabel: formatDiracLabel(initial),
    finalLabel: formatDiracLabel(final),
    isEmission,
    selectionRule,
    radialLargePP_a0: rPP_a0,
    radialSmallQQ_a0: rQQ_a0,
    angularCoefficientsLarge: angL,
    angularCoefficientsSmall: angS,
    totalMatrixElement_ea0: totalSigned,
    totalDipoleSquared_e2a02: sumMagSq,
    reducedLineStrength_S: lineStrengthS,
    initialBindingEnergy_eV: eI.bindingEnergy_eV,
    finalBindingEnergy_eV: eF.bindingEnergy_eV,
    transitionEnergy_eV: deltaE_eV,
    transitionEnergy_Ha: deltaE_Ha,
    wavelength_nm: deltaE_eV > 0 ? energyEvToWavelengthNm(deltaE_eV) : null,
    frequency_Hz: deltaE_eV > 0 ? energyEvToFrequencyHz(deltaE_eV) : null,
    oscillatorStrength: fOsc,
    einsteinA_s1: einsteinA,
    numericalQuality: {
      radialMethod: "log-grid-simpson-dirac-spinor",
      quadratureIntervals: intervals,
      convergenceResidual,
    },
  };
}
