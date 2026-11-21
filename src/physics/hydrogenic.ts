/**
 * Model A — exact non-relativistic hydrogenic (one-electron Coulomb) orbitals.
 *
 *   R_nl(r)  = sqrt( (2Z/na)^3 (n-l-1)! / (2n (n+l)!) ) e^{-ρ/2} ρ^l L_{n-l-1}^{2l+1}(ρ),  ρ = 2Zr/(na)
 *   Y_l^m    = N_lm P_l^{|m|}(cosθ) e^{imφ}   (Condon–Shortley phase inside P)
 *   ψ_nlm    = R_nl Y_l^m
 *
 * Normalization conventions used *everywhere* in this project:
 *   ∫ |R|² r² dr = 1,   ∫ |Y|² dΩ = 1  ⇒  P_r(r) = r² |R|²  (NOT 4π r² |R|²).
 *
 * Coordinates: physics convention, z is the polar axis (θ from +z, φ from +x in the
 * xy-plane).  The upstream C++ used y as the polar axis while schrodinger.py used z;
 * we standardise on z and document it.
 *
 * Lengths are in units of the Bohr radius a0 unless a function name ends in `_pm`.
 */
import { CONSTANTS } from "./constants";
import { laguerre, legendreP, lnFactorial, sphNorm } from "./special";

export interface QuantumNumbers {
  readonly n: number;
  readonly l: number;
  readonly m: number;
}

export type AngularBasis = "complex" | "real";

export function validateQN(q: QuantumNumbers): void {
  const { n, l, m } = q;
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`n must be an integer ≥ 1 (got ${n})`);
  if (!Number.isInteger(l) || l < 0 || l > n - 1)
    throw new RangeError(`l must satisfy 0 ≤ l ≤ n-1 (got n=${n}, l=${l})`);
  if (!Number.isInteger(m) || Math.abs(m) > l)
    throw new RangeError(`m must satisfy |m| ≤ l (got l=${l}, m=${m})`);
}

export function isValidQN(q: QuantumNumbers): boolean {
  try {
    validateQN(q);
    return true;
  } catch {
    return false;
  }
}

export const SUBSHELL_LETTERS = ["s", "p", "d", "f", "g", "h", "i", "k"] as const;
export function subshellLabel(n: number, l: number): string {
  return `${n}${SUBSHELL_LETTERS[l] ?? `l${l}`}`;
}

/** Radial normalization constant (a in Bohr units; a=1 for infinite nuclear mass). */
export function radialNorm(n: number, l: number, Z: number, a = 1): number {
  const pref = Math.pow((2 * Z) / (n * a), 3);
  return Math.sqrt((pref * Math.exp(lnFactorial(n - l - 1) - lnFactorial(n + l))) / (2 * n));
}

/** R_nl(r) with r in Bohr radii. */
export function radialR(n: number, l: number, r: number, Z = 1, a = 1): number {
  const rho = (2 * Z * r) / (n * a);
  return radialNorm(n, l, Z, a) * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Radial probability density w.r.t. dr:  P_r(r) = r² |R_nl(r)|². */
export function radialPDF(n: number, l: number, r: number, Z = 1, a = 1): number {
  const R = radialR(n, l, r, Z, a);
  return r * r * R * R;
}

/** Complex spherical harmonic Y_l^m(θ,φ) → [re, im]. */
export function sphericalHarmonic(l: number, m: number, theta: number, phi: number): [number, number] {
  const am = Math.abs(m);
  let val = sphNorm(l, am) * legendreP(l, am, Math.cos(theta));
  if (m < 0 && am % 2 === 1) val = -val; // Y_l^{-m} = (-1)^m conj(Y_l^m)
  return [val * Math.cos(m * phi), val * Math.sin(m * phi)];
}

/** |Y_l^m|² — independent of φ for a pure complex harmonic. */
export function angularDensityComplex(l: number, m: number, theta: number): number {
  const am = Math.abs(m);
  const v = sphNorm(l, am) * legendreP(l, am, Math.cos(theta));
  return v * v;
}

/**
 * Real (tesseral) harmonic built consistently from the complex set:
 *   m>0: sqrt2 · N P_l^m cos(mφ) · (-1)^m
 *   m=0: Y_l^0
 *   m<0: sqrt2 · N P_l^|m| sin(|m|φ) · (-1)^m
 * The (-1)^m removes the Condon–Shortley phase so that p_x, d_xy… have the
 * conventional positive lobe along +x etc.
 */
export function realHarmonic(l: number, m: number, theta: number, phi: number): number {
  const am = Math.abs(m);
  const base = sphNorm(l, am) * legendreP(l, am, Math.cos(theta));
  if (m === 0) return base;
  const cs = am % 2 === 0 ? 1 : -1;
  const s = Math.SQRT2 * cs * base;
  return m > 0 ? s * Math.cos(am * phi) : s * Math.sin(am * phi);
}

/** Signed real wavefunction value ψ (real basis) at spherical point. */
export function psiReal(q: QuantumNumbers, r: number, theta: number, phi: number, Z = 1, a = 1): number {
  return radialR(q.n, q.l, r, Z, a) * realHarmonic(q.l, q.m, theta, phi);
}

/** Complex ψ (complex basis) → [re, im]. */
export function psiComplex(q: QuantumNumbers, r: number, theta: number, phi: number, Z = 1, a = 1): [number, number] {
  const R = radialR(q.n, q.l, r, Z, a);
  const [yr, yi] = sphericalHarmonic(q.l, q.m, theta, phi);
  return [R * yr, R * yi];
}

export function probabilityDensity(q: QuantumNumbers, basis: AngularBasis, r: number, theta: number, phi: number, Z = 1, a = 1): number {
  if (basis === "real") {
    const p = psiReal(q, r, theta, phi, Z, a);
    return p * p;
  }
  const [re, im] = psiComplex(q, r, theta, phi, Z, a);
  return re * re + im * im;
}

/** Point-nucleus, non-relativistic energy in eV: E_n = -Ry·Z²/n² · (μ/m_e). */
export function hydrogenicEnergy_eV(n: number, Z: number, reducedMassRatio = 1): number {
  return (-CONSTANTS.rydberg_eV * Z * Z * reducedMassRatio) / (n * n);
}

/** Analytic ⟨r⟩ = a/(2Z) [3n² − l(l+1)]  (Bohr units). */
export function meanRadiusAnalytic(n: number, l: number, Z = 1, a = 1): number {
  return (a / (2 * Z)) * (3 * n * n - l * (l + 1));
}

/** Analytic ⟨r²⟩ = a² n²/(2Z²) [5n² + 1 − 3l(l+1)]. */
export function meanRSquaredAnalytic(n: number, l: number, Z = 1, a = 1): number {
  return ((a * a * n * n) / (2 * Z * Z)) * (5 * n * n + 1 - 3 * l * (l + 1));
}

export function radialNodeCount(n: number, l: number): number {
  return n - l - 1;
}
export function angularNodeCount(l: number): number {
  return l;
}

/** Practical outer radius (Bohr) beyond which P_r is negligible. */
export function radialExtent(n: number, l: number, Z = 1, a = 1): number {
  // ⟨r⟩ + 7σ with a floor; tail mass beyond this is < 1e-7 for all tested (n,l)
  const mean = meanRadiusAnalytic(n, l, Z, a);
  const sd = Math.sqrt(Math.max(meanRSquaredAnalytic(n, l, Z, a) - mean * mean, 0));
  return Math.max(mean + 7 * sd, (6 * n * a) / Z);
}

/** Locate radial nodes (zeros of L_{n-l-1}^{2l+1}) by non-uniform quadratic-grid sign scanning + bisection, in Bohr. */
export function radialNodes(n: number, l: number, Z = 1, a = 1): number[] {
  const k = n - l - 1;
  if (k === 0) return [];
  const rMax = radialExtent(n, l, Z, a);
  const N = 6000;
  const nodes: number[] = [];
  const f = (r: number) => laguerre(k, 2 * l + 1, (2 * Z * r) / (n * a));
  let prevR = 1e-12;
  let prev = f(prevR);
  for (let i = 1; i <= N && nodes.length < k; i++) {
    const t = i / N;
    const r = rMax * t * t;
    const cur = f(r);
    if (prev * cur < 0) {
      let lo = prevR;
      let hi = r;
      let flo = prev;
      for (let it = 0; it < 64; it++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      nodes.push(0.5 * (lo + hi));
    }
    prevR = r;
    prev = cur;
  }
  return nodes;
}

/** Angular nodes: θ values where P_l^|m|(cosθ) = 0 (cones), count = l-|m|; plus |m| planes for real basis. */
export function angularNodeThetas(l: number, m: number): number[] {
  const am = Math.abs(m);
  const count = l - am;
  if (count === 0) return [];
  const N = 4000;
  const out: number[] = [];
  const f = (t: number) => legendreP(l, am, Math.cos(t));
  let prev = f(1e-6);
  for (let i = 1; i <= N && out.length < count; i++) {
    const t = (i / N) * Math.PI;
    const cur = f(t);
    if (prev * cur < 0) {
      let lo = ((i - 1) / N) * Math.PI,
        hi = t,
        flo = prev;
      for (let it = 0; it < 50; it++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      out.push(0.5 * (lo + hi));
    }
    prev = cur;
  }
  return out;
}

/** Numerical ∫_0^∞ P_r dr and ⟨r⟩ via composite Simpson on [0, rMax]. */
export function radialMoments(n: number, l: number, Z = 1, a = 1, N = 20000): { norm: number; meanR: number } {
  const rMax = radialExtent(n, l, Z, a) * 1.5;
  const h = rMax / N;
  let s0 = 0,
    s1 = 0;
  for (let i = 0; i <= N; i++) {
    const r = i * h;
    const w = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
    const p = radialPDF(n, l, r, Z, a);
    s0 += w * p;
    s1 += w * p * r;
  }
  return { norm: (s0 * h) / 3, meanR: (s1 * h) / 3 };
}

export const BOHR_PM = CONSTANTS.a0_pm;
export const bohrToPm = (r: number): number => r * BOHR_PM;

/**
 * Integrated radial probability mass ∫_0^R P_r dr by composite Simpson.
 */
export function integrateRadialMass(
  n: number,
  l: number,
  Z = 1,
  rMax?: number,
  intervals = 4000,
  a = 1,
): number {
  const rUpper = rMax ?? radialExtent(n, l, Z, a);
  const h = rUpper / intervals;
  let s = 0;
  for (let i = 0; i <= intervals; i++) {
    const r = i * h;
    const w = i === 0 || i === intervals ? 1 : i % 2 === 1 ? 4 : 2;
    s += w * radialPDF(n, l, r, Z, a);
  }
  return (s * h) / 3;
}

export interface RadialDomain {
  rMax: number;
  includedMass: number;
  tailMass: number;
  expansions: number;
}

/**
 * Radial domain guaranteed to contain mass ≥ 1 − tol.  Expands the domain
 * geometrically and throws a diagnostic if the tolerance cannot be met; callers
 * must never silently renormalise a truncated distribution.
 */
export function radialDomainForMass(
  n: number,
  l: number,
  Z = 1,
  tol = 1e-8,
  maxExpansions = 24,
  a = 1,
): RadialDomain {
  validateQN({ n, l, m: 0 });
  if (!(tol > 0 && tol < 0.5)) throw new RangeError(`radialDomainForMass: tol must be in (0, 0.5), got ${tol}`);
  let rMax = radialExtent(n, l, Z, a);
  for (let k = 0; k <= maxExpansions; k++) {
    const includedMass = integrateRadialMass(n, l, Z, rMax, 4000, a);
    if (includedMass >= 1 - tol) return { rMax, includedMass, tailMass: Math.max(0, 1 - includedMass), expansions: k };
    rMax *= 1.5;
  }
  throw new Error(`radialDomainForMass: mass tolerance ${tol} not reached for n=${n}, l=${l}, Z=${Z}`);
}
