/**
 * Exact Wigner 3-j and 6-j symbols supporting integer and half-integer
 * angular momenta via integer doubled representation (2*j, 2*m) and
 * log-factorial arithmetic (ATOMS v0.6.0 Phase 6).
 *
 * Zero React or Three.js dependencies.
 */
import { lnFactorial } from "@/physics/special";

function isHalfOrInt(x: number): boolean {
  const twoX = Math.round(2 * x);
  return Math.abs(2 * x - twoX) < 1e-9;
}

function triangleCheckTwo(tj1: number, tj2: number, tj3: number): boolean {
  if (tj1 < 0 || tj2 < 0 || tj3 < 0) return false;
  if ((tj1 + tj2 + tj3) % 2 !== 0) return false;
  return tj3 >= Math.abs(tj1 - tj2) && tj3 <= tj1 + tj2;
}

function lnDeltaTwo(tj1: number, tj2: number, tj3: number): number {
  const a = (tj1 + tj2 - tj3) / 2;
  const b = (tj1 - tj2 + tj3) / 2;
  const c = (-tj1 + tj2 + tj3) / 2;
  const s = (tj1 + tj2 + tj3) / 2 + 1;
  return lnFactorial(a) + lnFactorial(b) + lnFactorial(c) - lnFactorial(s);
}

/**
 * Wigner 3-j symbol:
 *   ( j1  j2  j3 )
 *   ( m1  m2  m3 )
 */
export function wigner3j(
  j1: number,
  j2: number,
  j3: number,
  m1: number,
  m2: number,
  m3: number,
): number {
  if (![j1, j2, j3, m1, m2, m3].every(isHalfOrInt)) return 0;

  const tj1 = Math.round(2 * j1);
  const tj2 = Math.round(2 * j2);
  const tj3 = Math.round(2 * j3);
  const tm1 = Math.round(2 * m1);
  const tm2 = Math.round(2 * m2);
  const tm3 = Math.round(2 * m3);

  if (tm1 + tm2 + tm3 !== 0) return 0;
  if (!triangleCheckTwo(tj1, tj2, tj3)) return 0;
  if (Math.abs(tm1) > tj1 || Math.abs(tm2) > tj2 || Math.abs(tm3) > tj3) return 0;
  if ((tj1 - Math.abs(tm1)) % 2 !== 0 || (tj2 - Math.abs(tm2)) % 2 !== 0 || (tj3 - Math.abs(tm3)) % 2 !== 0) {
    return 0;
  }

  const c1 = (tj1 + tj2 - tj3) / 2;
  const c2 = (tj1 - tm1) / 2;
  const c3 = (tj2 + tm2) / 2;
  const c4 = (tj3 - tj2 + tm1) / 2;
  const c5 = (tj3 - tj1 - tm2) / 2;

  const kMin = Math.max(0, -c4, -c5);
  const kMax = Math.min(c1, c2, c3);
  if (kMin > kMax) return 0;

  const lnPref =
    0.5 *
    (lnDeltaTwo(tj1, tj2, tj3) +
      lnFactorial((tj1 + tm1) / 2) +
      lnFactorial((tj1 - tm1) / 2) +
      lnFactorial((tj2 + tm2) / 2) +
      lnFactorial((tj2 - tm2) / 2) +
      lnFactorial((tj3 + tm3) / 2) +
      lnFactorial((tj3 - tm3) / 2));

  let sum = 0;
  for (let k = kMin; k <= kMax; k++) {
    const lnDen =
      lnFactorial(k) +
      lnFactorial(c1 - k) +
      lnFactorial(c2 - k) +
      lnFactorial(c3 - k) +
      lnFactorial(c4 + k) +
      lnFactorial(c5 + k);
    const term = Math.exp(lnPref - lnDen);
    sum += k % 2 === 0 ? term : -term;
  }

  const expSign = (tj1 - tj2 - tm3) / 2;
  const sign = ((expSign % 2) + 2) % 2 === 0 ? 1 : -1;
  return sign * sum;
}

/**
 * Wigner 6-j symbol:
 *   { j1  j2  j3 }
 *   { j4  j5  j6 }
 */
export function wigner6j(
  j1: number,
  j2: number,
  j3: number,
  j4: number,
  j5: number,
  j6: number,
): number {
  if (![j1, j2, j3, j4, j5, j6].every(isHalfOrInt)) return 0;

  const tj1 = Math.round(2 * j1);
  const tj2 = Math.round(2 * j2);
  const tj3 = Math.round(2 * j3);
  const tj4 = Math.round(2 * j4);
  const tj5 = Math.round(2 * j5);
  const tj6 = Math.round(2 * j6);

  if (
    !triangleCheckTwo(tj1, tj2, tj3) ||
    !triangleCheckTwo(tj1, tj5, tj6) ||
    !triangleCheckTwo(tj4, tj2, tj6) ||
    !triangleCheckTwo(tj4, tj5, tj3)
  ) {
    return 0;
  }

  const lnTriProd =
    0.5 *
    (lnDeltaTwo(tj1, tj2, tj3) +
      lnDeltaTwo(tj1, tj5, tj6) +
      lnDeltaTwo(tj4, tj2, tj6) +
      lnDeltaTwo(tj4, tj5, tj3));

  const s1 = (tj1 + tj2 + tj3) / 2;
  const s2 = (tj1 + tj5 + tj6) / 2;
  const s3 = (tj4 + tj2 + tj6) / 2;
  const s4 = (tj4 + tj5 + tj3) / 2;

  const p1 = (tj1 + tj2 + tj4 + tj5) / 2;
  const p2 = (tj2 + tj3 + tj5 + tj6) / 2;
  const p3 = (tj1 + tj3 + tj4 + tj6) / 2;

  const kMin = Math.max(s1, s2, s3, s4);
  const kMax = Math.min(p1, p2, p3);
  if (kMin > kMax) return 0;

  let sum = 0;
  for (let k = kMin; k <= kMax; k++) {
    const lnDen =
      lnFactorial(k - s1) +
      lnFactorial(k - s2) +
      lnFactorial(k - s3) +
      lnFactorial(k - s4) +
      lnFactorial(p1 - k) +
      lnFactorial(p2 - k) +
      lnFactorial(p3 - k);
    const term = Math.exp(lnTriProd + lnFactorial(k + 1) - lnDen);
    sum += k % 2 === 0 ? term : -term;
  }
  return sum;
}
