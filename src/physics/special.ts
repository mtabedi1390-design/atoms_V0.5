/**
 * Special functions shared by every renderer / sampler.
 *
 * These are ports of the recurrences found in kavan010/Atoms `src/atom_realtime.cpp`
 * (sampleR / sampleTheta), extracted into one tested module.  Two defects of the
 * original were corrected here:
 *   1. The Legendre recurrence was called with the *signed* m, so negative-m
 *      states produced garbage.  We evaluate with |m| and apply the exact
 *      relation P_l^{-m} = (-1)^m (l-m)!/(l+m)! P_l^m.
 *   2. Factorials were computed with tgamma() which overflows for n+l ≳ 170;
 *      we use log-gamma so high (n,l) remain finite.
 */

/** Natural log of Γ(x) for x > 0 (Lanczos approximation, g = 7, n = 9). */
export function lgamma(x: number): number {
  if (x < 0.5) {
    // reflection
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** ln(n!) */
export function lnFactorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError(`lnFactorial: invalid n=${n}`);
  if (n < 2) return 0;
  return lgamma(n + 1);
}

export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new RangeError(`factorial: invalid n=${n}`);
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/**
 * Generalized (associated) Laguerre polynomial L_k^{(α)}(x) via the stable
 * three-term recurrence  (j) L_j = (2j-1+α-x) L_{j-1} - (j-1+α) L_{j-2}.
 * Identical to the recurrence used in atom_realtime.cpp.
 */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k < 0) throw new RangeError(`laguerre: k must be ≥ 0, got ${k}`);
  if (k === 0) return 1;
  let Lm2 = 1;
  let Lm1 = 1 + alpha - x;
  if (k === 1) return Lm1;
  let L = Lm1;
  for (let j = 2; j <= k; j++) {
    L = ((2 * j - 1 + alpha - x) * Lm1 - (j - 1 + alpha) * Lm2) / j;
    Lm2 = Lm1;
    Lm1 = L;
  }
  return L;
}

/**
 * Associated Legendre function P_l^m(x), m may be negative, |x| ≤ 1.
 * Includes the Condon–Shortley phase (-1)^m (consistent with scipy.special.lpmv
 * and the convention used by `schrodinger.py`'s sph_harm in the upstream repo).
 */
export function legendreP(l: number, m: number, x: number): number {
  if (l < 0 || Math.abs(m) > l) throw new RangeError(`legendreP: invalid (l,m)=(${l},${m})`);
  if (x < -1 || x > 1) throw new RangeError(`legendreP: |x|>1 (${x})`);
  const am = Math.abs(m);
  // P_am^am
  let pmm = 1;
  if (am > 0) {
    const somx2 = Math.sqrt((1 - x) * (1 + x));
    let fact = 1;
    for (let i = 1; i <= am; i++) {
      pmm *= -fact * somx2; // Condon–Shortley phase folded in
      fact += 2;
    }
  }
  let result: number;
  if (l === am) {
    result = pmm;
  } else {
    let pmmp1 = x * (2 * am + 1) * pmm;
    if (l === am + 1) {
      result = pmmp1;
    } else {
      let pll = 0;
      for (let ll = am + 2; ll <= l; ll++) {
        pll = ((2 * ll - 1) * x * pmmp1 - (ll + am - 1) * pmm) / (ll - am);
        pmm = pmmp1;
        pmmp1 = pll;
      }
      result = pll;
    }
  }
  if (m < 0) {
    // P_l^{-m} = (-1)^m (l-m)!/(l+m)! P_l^m
    const sign = am % 2 === 0 ? 1 : -1;
    result *= sign * Math.exp(lnFactorial(l - am) - lnFactorial(l + am));
  }
  return result;
}

/**
 * Normalization constant of the complex spherical harmonic:
 *   N_lm = sqrt( (2l+1)/(4π) · (l-m)!/(l+m)! )
 */
export function sphNorm(l: number, m: number): number {
  return Math.sqrt(
    ((2 * l + 1) / (4 * Math.PI)) * Math.exp(lnFactorial(l - m) - lnFactorial(l + m)),
  );
}
