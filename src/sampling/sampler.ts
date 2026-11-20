/**
 * Statistically-correct orbital sampler (ported from atom_realtime.cpp sampleR/sampleTheta,
 * with the following corrections):
 *   • CDF tables are keyed by every parameter (model, Zeff, n, l, m, basis, grid) — the
 *     original used `static bool built` and silently reused the first table forever.
 *   • Inverse-CDF uses linear interpolation inside the bin instead of returning the grid
 *     node (the original quantised r to rMax/4095).
 *   • Radial domain is adaptive (⟨r⟩ + 5σ) instead of a fixed 10 n² a0.
 *   • Deterministic PRNG (xoshiro128**) with explicit seed.
 *   • Real tesseral orbitals get the proper non-uniform φ distribution (∝ cos² mφ / sin² mφ);
 *     the original only ever sampled uniform φ.
 *   • z is the polar axis.
 */
import { angularDensityComplex, radialDomainForMass, radialPDF, type AngularBasis, type QuantumNumbers, validateQN, realHarmonic, radialR, sphericalHarmonic } from "@/physics/hydrogenic";

export interface SamplingParams extends QuantumNumbers {
  readonly zeff: number;
  readonly basis: AngularBasis;
  readonly count: number;
  readonly seed: number;
  readonly modelId: string;
  /**
   * "single": the single state (n,l,m).
   * "subshell-average": spherically-averaged subshell density, i.e. each sample draws m
   * uniformly from −l…l (complex basis). By Unsöld's theorem Σ_m|Y_lm|² = (2l+1)/4π, so the
   * density assigned to each sample is R²/(4π). Used for Mode B (independent-electron atom).
   */
  readonly mix?: "single" | "subshell-average" | "tabulated" | "tabulated-hf" | "tabulated-df";
  /** Electrons assigned to this subshell (configuration-average density weighting). */
  readonly occupancy?: number;
  /** Precomputed spherically averaged density (r in a0, rho in electrons/a0³). */
  readonly tabulated?: { id: string; r: number[]; rho: number[]; expectedElectrons: number };
}

export interface SampleResult {
  /** xyz triplets in Bohr radii (z = polar axis). */
  positions: Float32Array;
  /** |ψ|² at each sample (Bohr⁻³). */
  density: Float32Array;
  /** real basis: sign of ψ (±1). complex basis: phase angle arg ψ in (−π, π]. */
  phase: Float32Array;
  maxDensity: number;
  rMax: number;
  radial: { includedMass: number; tailMass: number; expansions: number };
  /** Integrated electrons (absolute, occupancy-weighted or tabulated). */
  electrons: number;
}

// ---------- PRNG ----------
export class Xoshiro128 {
  private s: Uint32Array;
  constructor(seed: number) {
    // splitmix32 seeding
    const s = new Uint32Array(4);
    let x = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      s[i] = (z ^ (z >>> 16)) >>> 0;
    }
    if (s.every((v) => v === 0)) s[0] = 1;
    this.s = s;
  }
  nextU32(): number {
    const s = this.s;
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }
  /** Uniform in [0,1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }
}
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// ---------- CDF tables ----------
export interface CdfTable {
  readonly x: Float64Array; // abscissa grid
  readonly cdf: Float64Array; // monotone, cdf[0]=0, cdf[last]=1
  /** Integrated mass BEFORE normalisation (≈1 for orbital tables, Z for total densities). */
  readonly rawMass: number;
  readonly onGrid: boolean;
}

export function buildCdf(pdf: (x: number) => number, x0: number, x1: number, N: number): CdfTable {
  const x = new Float64Array(N);
  const cdf = new Float64Array(N);
  const h = (x1 - x0) / (N - 1);
  let prev = Math.max(pdf(x0), 0);
  x[0] = x0;
  cdf[0] = 0;
  for (let i = 1; i < N; i++) {
    const xi = x0 + i * h;
    const cur = Math.max(pdf(xi), 0);
    x[i] = xi;
    cdf[i] = cdf[i - 1] + 0.5 * (prev + cur) * h; // trapezoid
    prev = cur;
  }
  const total = cdf[N - 1];
  if (!(total > 0) || !Number.isFinite(total)) throw new Error("buildCdf: non-positive or non-finite total probability");
  for (let i = 0; i < N; i++) cdf[i] /= total;
  return { x, cdf, rawMass: total, onGrid: true };
}

/** CDF from arbitrary strictly-increasing abscissae (used for imported HF grids). */
export function buildCdfSamples(xs: readonly number[], f: readonly number[]): CdfTable {
  const n = xs.length;
  if (n < 2 || f.length !== n) throw new Error("buildCdfSamples: length mismatch");
  const x = Float64Array.from(xs);
  const cdf = new Float64Array(n);
  let total = 0;
  for (let i = 1; i < n; i++) {
    const h = x[i] - x[i - 1];
    if (!(h > 0)) throw new Error("buildCdfSamples: abscissae must increase");
    const a = Math.max(f[i - 1], 0), b = Math.max(f[i], 0);
    total += 0.5 * (a + b) * h;
    cdf[i] = total;
  }
  if (!(total > 0)) throw new Error("buildCdfSamples: non-positive mass");
  for (let i = 0; i < n; i++) cdf[i] /= total;
  return { x, cdf, rawMass: total, onGrid: false };
}

/** Linear interpolation of a tabulated density; logs are not used (ρ can vanish). */
export function interpolateTable(xs: readonly number[], ys: readonly number[], v: number): number {
  if (v <= xs[0]) return ys[0];
  if (v >= xs[xs.length - 1]) return 0;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; }
  const t = (v - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/** Inverse CDF with linear interpolation within the bracketing bin. */
export function sampleFromCdf(t: CdfTable, u: number): number {
  const { x, cdf } = t;
  let lo = 0,
    hi = cdf.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid;
    else hi = mid;
  }
  const c0 = cdf[lo],
    c1 = cdf[hi];
  const f = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
  return x[lo] + f * (x[hi] - x[lo]);
}

const RADIAL_N = 8192;
const THETA_N = 2048;
const PHI_N = 2048;

export function cacheKey(p: Omit<SamplingParams, "count" | "seed">): string {
  const tab = p.tabulated ? `|tab=${p.tabulated.id}:${p.tabulated.r.length}` : "";
  return `${p.modelId}|Z=${p.zeff.toFixed(6)}|n=${p.n}|l=${p.l}|m=${p.m}|${p.basis}|${p.mix ?? "single"}|occ=${p.occupancy ?? 1}${tab}|grid=${RADIAL_N},${THETA_N},${PHI_N}`;
}

interface Tables {
  radial: CdfTable;
  theta: CdfTable;
  phi: CdfTable | null; // null ⇒ uniform
  rMax: number;
}

export class SamplerCache {
  private map = new Map<string, Tables>();
  constructor(private readonly maxEntries = 64) {}
  get size(): number {
    return this.map.size;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  tables(p: Omit<SamplingParams, "count" | "seed">): Tables {
    const key = cacheKey(p);
    const hit = this.map.get(key);
    if (hit) return hit;
    validateQN(p);
    let rMax: number;
    let radial: CdfTable;
    if (p.mix === "tabulated-hf" || p.mix === "tabulated-df" || p.mix === "tabulated") {
      const tab = p.tabulated;
      if (!tab) throw new Error("tabulated sampling requested without a table");
      rMax = tab.r[tab.r.length - 1];
      radial = buildCdfSamples(tab.r, tab.r.map((r, i) => 4 * Math.PI * r * r * tab.rho[i]));
      const expected = tab.expectedElectrons;
      if (Math.abs(radial.rawMass - expected) / expected > 5e-3)
        throw new Error(`tabulated density integrates to ${radial.rawMass.toFixed(4)} e, expected ${expected.toFixed(4)} e (tolerance 0.5%) — refusing to renormalise silently`);
    } else {
      // Domain is expanded until the tail mass is below tolerance; failure is fatal.
      const dom = radialDomainForMass(p.n, p.l, p.zeff, 1e-8);
      rMax = dom.rMax;
      radial = buildCdf((r) => radialPDF(p.n, p.l, r, p.zeff), 0, rMax, RADIAL_N);
    }
    // angular density w.r.t. dθ: |Y|² sinθ  (Jacobian included exactly once, here)
    const theta = buildCdf((t) => angularDensityComplex(p.l, p.m, t) * Math.sin(t), 0, Math.PI, THETA_N);
    let phi: CdfTable | null = null;
    if (p.basis === "real" && p.m !== 0) {
      const am = Math.abs(p.m);
      const f = p.m > 0 ? (ph: number) => Math.cos(am * ph) ** 2 : (ph: number) => Math.sin(am * ph) ** 2;
      phi = buildCdf(f, 0, 2 * Math.PI, PHI_N);
    }
    const t: Tables = { radial, theta, phi, rMax };
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, t);
    return t;
  }
  clear(): void {
    this.map.clear();
  }
}

export function sampleOrbital(p: SamplingParams, cache: SamplerCache, onProgress?: (frac: number) => void, shouldCancel?: () => boolean): SampleResult | null {
  const tabulated = p.mix === "tabulated-hf" || p.mix === "tabulated-df" || p.mix === "tabulated";
  const mix = p.mix === "subshell-average";
  const T = cache.tables(tabulated ? p : mix ? { ...p, m: 0, basis: "complex" } : p);
  const dom = { includedMass: T.radial.rawMass, tailMass: Math.max(0, 1 - T.radial.rawMass), expansions: 0 };
  const thetaTables: CdfTable[] = [];
  if (mix) for (let mm = -p.l; mm <= p.l; mm++) thetaTables.push(cache.tables({ ...p, m: mm, basis: "complex" }).theta);
  const rng = new Xoshiro128(p.seed);
  const N = p.count;
  const positions = new Float32Array(N * 3);
  const density = new Float32Array(N);
  const phase = new Float32Array(N);
  let maxDensity = 0;
  const chunk = 8192;
  for (let i = 0; i < N; i++) {
    if ((i & (chunk - 1)) === 0) {
      if (shouldCancel?.()) return null;
      onProgress?.(i / N);
    }
    const r = sampleFromCdf(T.radial, rng.next());
    if (tabulated) {
      const d = interpolateTable(p.tabulated!.r, p.tabulated!.rho, r);
      const ct = 2 * rng.next() - 1, st = Math.sqrt(1 - ct * ct), phit = 2 * Math.PI * rng.next();
      positions[3 * i] = r * st * Math.cos(phit);
      positions[3 * i + 1] = r * st * Math.sin(phit);
      positions[3 * i + 2] = r * ct;
      density[i] = d;
      phase[i] = 0;
      if (d > maxDensity) maxDensity = d;
      continue;
    }
    const thetaTable = mix ? thetaTables[Math.min(thetaTables.length - 1, Math.floor(rng.next() * thetaTables.length))] : T.theta;
    const theta = sampleFromCdf(thetaTable, rng.next());
    const phi = T.phi ? sampleFromCdf(T.phi, rng.next()) : 2 * Math.PI * rng.next();
    const st = Math.sin(theta);
    positions[3 * i] = r * st * Math.cos(phi);
    positions[3 * i + 1] = r * st * Math.sin(phi);
    positions[3 * i + 2] = r * Math.cos(theta);
    const R = radialR(p.n, p.l, r, p.zeff);
    if (mix) {
      const d = ((p.occupancy ?? 1) * R * R) / (4 * Math.PI);
      density[i] = d;
      phase[i] = 0;
      if (d > maxDensity) maxDensity = d;
    } else if (p.basis === "real") {
      const psi = R * realHarmonic(p.l, p.m, theta, phi);
      const d = psi * psi;
      density[i] = d;
      phase[i] = psi >= 0 ? 1 : -1;
      if (d > maxDensity) maxDensity = d;
    } else {
      const [yr, yi] = sphericalHarmonic(p.l, p.m, theta, phi);
      const re = R * yr,
        im = R * yi;
      const d = re * re + im * im;
      density[i] = d;
      phase[i] = Math.atan2(im, re);
      if (d > maxDensity) maxDensity = d;
    }
  }
  onProgress?.(1);
  const electrons = tabulated ? T.radial.rawMass : (p.occupancy ?? 1) * dom.includedMass;
  return { positions, density, phase, maxDensity, rMax: T.rMax, radial: dom, electrons };
}
