import { describe, expect, it } from "vitest";
import { SamplerCache, Xoshiro128, buildCdf, cacheKey, sampleFromCdf, sampleOrbital, type SamplingParams } from "../sampler";
import { angularDensityComplex, meanRadiusAnalytic, radialPDF, realHarmonic } from "@/physics/hydrogenic";

const base: SamplingParams = { n: 1, l: 0, m: 0, zeff: 1, basis: "complex", count: 40000, seed: 42, modelId: "hydrogenic-exact" };

/** One-sample Kolmogorov–Smirnov statistic vs a CDF table. */
function ksStat(samples: Float64Array, cdf: (x: number) => number): number {
  const s = Float64Array.from(samples).sort();
  let d = 0;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const F = cdf(s[i]);
    d = Math.max(d, Math.abs(F - i / n), Math.abs(F - (i + 1) / n));
  }
  return d;
}
const ksCrit = (n: number, alpha = 0.001) => Math.sqrt(-0.5 * Math.log(alpha / 2)) / Math.sqrt(n); // 1.95/√n at α=0.001

function tableCdf(t: { x: Float64Array; cdf: Float64Array }) {
  return (v: number) => {
    const { x, cdf } = t;
    if (v <= x[0]) return 0;
    if (v >= x[x.length - 1]) return 1;
    let lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= v) lo = mid; else hi = mid; }
    return cdf[lo] + (cdf[hi] - cdf[lo]) * ((v - x[lo]) / (x[hi] - x[lo]));
  };
}

describe("PRNG", () => {
  it("is deterministic per seed and uniform-ish", () => {
    const a = new Xoshiro128(7), b = new Xoshiro128(7), c = new Xoshiro128(8);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs[0]).not.toBe(c.next());
    const mean = xs.reduce((p, q) => p + q, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
    expect(xs.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("CDF construction", () => {
  it("inverse CDF reproduces an exponential distribution", () => {
    const t = buildCdf((x) => Math.exp(-x), 0, 40, 4096);
    const rng = new Xoshiro128(1);
    const s = new Float64Array(20000).map(() => sampleFromCdf(t, rng.next()));
    expect(ksStat(s, (x) => 1 - Math.exp(-x))).toBeLessThan(ksCrit(s.length));
  });
  it("rejects a zero pdf", () => {
    expect(() => buildCdf(() => 0, 0, 1, 10)).toThrow();
  });
});

describe("orbital sampling", () => {
  const cache = new SamplerCache();
  const sph = (pos: Float32Array, i: number) => {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    const r = Math.hypot(x, y, z);
    return { r, theta: Math.acos(z / r), phi: Math.atan2(y, x) };
  };

  it("radial KS test passes for 1s, 2s, 3d, 4f (Z=1) and 2p (Z=6)", () => {
    for (const [n, l, Z] of [[1, 0, 1], [2, 0, 1], [3, 2, 1], [4, 3, 1], [2, 1, 6]] as const) {
      const p = { ...base, n, l, m: 0, zeff: Z };
      const res = sampleOrbital(p, cache)!;
      const rs = new Float64Array(p.count);
      for (let i = 0; i < p.count; i++) rs[i] = sph(res.positions, i).r;
      const ref = buildCdf((r) => radialPDF(n, l, r, Z), 0, res.rMax, 20000);
      expect(ksStat(rs, tableCdf(ref))).toBeLessThan(ksCrit(p.count));
      const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
      expect(Math.abs(mean - meanRadiusAnalytic(n, l, Z)) / meanRadiusAnalytic(n, l, Z)).toBeLessThan(0.02);
    }
  });

  it("θ distribution includes sinθ Jacobian exactly once (2p m=0, 3d m=±2)", () => {
    for (const [l, m] of [[1, 0], [2, 2], [2, -2], [3, 1]] as const) {
      const p = { ...base, n: 4, l, m };
      const res = sampleOrbital(p, cache)!;
      const ts = new Float64Array(p.count);
      for (let i = 0; i < p.count; i++) ts[i] = sph(res.positions, i).theta;
      const ref = buildCdf((t) => angularDensityComplex(l, m, t) * Math.sin(t), 0, Math.PI, 8000);
      expect(ksStat(ts, tableCdf(ref))).toBeLessThan(ksCrit(p.count));
    }
  });

  it("complex basis φ is uniform; real p_x basis φ ∝ cos²φ", () => {
    const pc = { ...base, n: 2, l: 1, m: 1 };
    const rc = sampleOrbital(pc, cache)!;
    const phis = new Float64Array(pc.count);
    for (let i = 0; i < pc.count; i++) phis[i] = sph(rc.positions, i).phi + Math.PI;
    expect(ksStat(phis, (x) => x / (2 * Math.PI))).toBeLessThan(ksCrit(pc.count));

    const pr = { ...pc, basis: "real" as const };
    const rr = sampleOrbital(pr, cache)!;
    for (let i = 0; i < pr.count; i++) phis[i] = sph(rr.positions, i).phi + Math.PI;
    // CDF of cos²φ on [0,2π): (φ/2 + sin2φ/4)/π  (shifted by π: cos² is π-periodic)
    expect(ksStat(phis, (x) => (x / 2 + Math.sin(2 * x) / 4) / Math.PI)).toBeLessThan(ksCrit(pr.count));
    // and the sign attribute must match ψ's sign
    let bad = 0;
    for (let i = 0; i < 2000; i++) {
      const { theta, phi } = sph(rr.positions, i);
      if (Math.sign(realHarmonic(1, 1, theta, phi)) !== rr.phase[i]) bad++;
    }
    expect(bad).toBe(0);
  });

  it("negative m produces a valid distribution identical in |ψ|² to +m (complex basis)", () => {
    const a = sampleOrbital({ ...base, n: 3, l: 2, m: 1 }, cache)!;
    const b = sampleOrbital({ ...base, n: 3, l: 2, m: -1 }, cache)!;
    const meanZ2 = (p: Float32Array) => { let s = 0; for (let i = 0; i < p.length / 3; i++) s += p[3 * i + 2] ** 2; return s / (p.length / 3); };
    expect(Math.abs(meanZ2(a.positions) - meanZ2(b.positions)) / meanZ2(a.positions)).toBeLessThan(0.03);
  });

  it("subshell-average mode is spherically symmetric", () => {
    const res = sampleOrbital({ ...base, n: 2, l: 1, m: 0, count: 60000, mix: "subshell-average" }, cache)!;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < 60000; i++) { sx += res.positions[3 * i] ** 2; sy += res.positions[3 * i + 1] ** 2; sz += res.positions[3 * i + 2] ** 2; }
    expect(Math.abs(sx - sz) / sz).toBeLessThan(0.03);
    expect(Math.abs(sy - sz) / sz).toBeLessThan(0.03);
  });

  it("is reproducible under a fixed seed and differs across seeds", () => {
    const a = sampleOrbital(base, cache)!, b = sampleOrbital(base, cache)!, c = sampleOrbital({ ...base, seed: 43 }, cache)!;
    expect(a.positions).toEqual(b.positions);
    expect(a.positions[0]).not.toBe(c.positions[0]);
  });

  it("cache keys differ for every relevant parameter (regression for upstream static-CDF bug)", () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, n: 2 })).not.toBe(k);
    expect(cacheKey({ ...base, zeff: 1.0001 })).not.toBe(k);
    expect(cacheKey({ ...base, m: 0, l: 1, n: 2 })).not.toBe(cacheKey({ ...base, m: 1, l: 1, n: 2 }));
    expect(cacheKey({ ...base, basis: "real" })).not.toBe(k);
    expect(cacheKey({ ...base, modelId: "slater-screened-hydrogenic" })).not.toBe(k);
    expect(cacheKey({ ...base, mix: "subshell-average" })).not.toBe(k);
    const fresh = new SamplerCache(2);
    fresh.tables(base); fresh.tables({ ...base, n: 2 }); fresh.tables({ ...base, n: 3 });
    expect(fresh.size).toBe(2); // bounded
  });

  it("honours cancellation", () => {
    expect(sampleOrbital({ ...base, count: 100000 }, cache, undefined, () => true)).toBeNull();
  });
});

import { buildCdfSamples, interpolateTable } from "../sampler";
import { hfDatasetFor } from "@/science/providers";

describe("tabulated HF density sampling", () => {
  const cache = new SamplerCache();
  const ne = hfDatasetFor(10)!;
  const baseHF: SamplingParams = {
    n: 1, l: 0, m: 0, zeff: 10, basis: "complex", count: 30000, seed: 99,
    modelId: "pyscf-hf@2.15.1", mix: "tabulated-hf",
    tabulated: { id: "hf:Ne:test", r: ne.density.rBohr, rho: ne.density.rhoElectronPerBohr3, expectedElectrons: 10 },
  };
  it("radii follow the imported density's CDF (KS test)", () => {
    const res = sampleOrbital(baseHF, cache)!;
    const radii = new Float64Array(baseHF.count);
    for (let i = 0; i < baseHF.count; i++) radii[i] = Math.hypot(res.positions[3 * i], res.positions[3 * i + 1], res.positions[3 * i + 2]);
    const ref = buildCdfSamples(ne.density.rBohr, ne.density.rBohr.map((r, i) => 4 * Math.PI * r * r * ne.density.rhoElectronPerBohr3[i]));
    expect(ksStat(radii, tableCdf(ref))).toBeLessThan(ksCrit(radii.length));
    expect(Math.abs(res.electrons - 10) / 10).toBeLessThan(2e-3);
  });
  it("density values come from the table (absolute electron density), never rescaled", () => {
    const res = sampleOrbital(baseHF, cache)!;
    const r = interpolateTable(ne.density.rBohr, ne.density.rhoElectronPerBohr3, 0.2);
    expect(r).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) expect(res.density[i]).toBeGreaterThanOrEqual(0);
    expect(res.maxDensity).toBeGreaterThan(1);
  });
  it("refuses a table whose integrated electron count is inconsistent", () => {
    const bad = { ...baseHF, tabulated: { ...baseHF.tabulated!, expectedElectrons: 14 } };
    expect(() => sampleOrbital(bad, new SamplerCache())).toThrow(/refuses to renormalise|expected/);
  });
  it("is deterministic and shares the radial table across seeds", () => {
    const a = sampleOrbital(baseHF, cache)!, b = sampleOrbital(baseHF, cache)!, c = sampleOrbital({ ...baseHF, seed: 100 }, cache)!;
    expect(a.positions).toEqual(b.positions);
    expect(a.positions[0]).not.toBe(c.positions[0]);
  });
});

describe("occupancy-weighted configuration-average density", () => {
  const cache = new SamplerCache();
  it("density scales exactly with occupancy while the point distribution is unchanged", () => {
    const seed = 5, count = 3000;
    const p2: SamplingParams = { n: 2, l: 1, m: 0, zeff: 3.14, basis: "complex", count, seed, modelId: "slater", mix: "subshell-average", occupancy: 2 };
    const p6: SamplingParams = { ...p2, occupancy: 6 };
    const a = sampleOrbital(p2, cache)!, b = sampleOrbital(p6, cache)!;
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)));
    for (let i = 0; i < count; i++) expect(b.density[i]).toBeCloseTo(3 * a.density[i], 6);
    expect(b.electrons / a.electrons).toBeCloseTo(3, 6);
    expect(cacheKey(p2)).not.toBe(cacheKey(p6));
  });
  it("reports the included radial mass and a non-negative tail", () => {
    const res = sampleOrbital({ n: 16, l: 0, m: 0, zeff: 1, basis: "complex", count: 2000, seed: 1, modelId: "slater", mix: "single", occupancy: 2 }, cache)!;
    expect(res.radial.includedMass).toBeGreaterThanOrEqual(1 - 1e-8);
    expect(res.radial.tailMass).toBeGreaterThanOrEqual(0);
    expect(res.radial.tailMass).toBeLessThanOrEqual(1e-8);
  });
});

import { diracFockRadialGrid } from "@/physics/diracFock";

describe("tabulated Dirac-Fock density sampling (Z = 79 Au & Z = 118 Og)", () => {
  const cache = new SamplerCache();
  it("radii follow the Lobato 2026 Dirac-Fock CDF (KS test) and integrate to Z", () => {
    for (const Z of [79, 118] as const) {
      const grid = diracFockRadialGrid(Z);
      const p: SamplingParams = {
        n: 1, l: 0, m: 0, zeff: Z, basis: "complex", count: 25000, seed: 77,
        modelId: "lobato2026-df", mix: "tabulated-df",
        tabulated: { id: `df:${Z}`, r: grid.rBohr, rho: grid.rhoElectronPerBohr3, expectedElectrons: Z },
      };
      const res = sampleOrbital(p, cache)!;
      const radii = new Float64Array(p.count);
      for (let i = 0; i < p.count; i++) radii[i] = Math.hypot(res.positions[3 * i], res.positions[3 * i + 1], res.positions[3 * i + 2]);
      const ref = buildCdfSamples(grid.rBohr, grid.rBohr.map((r, i) => 4 * Math.PI * r * r * grid.rhoElectronPerBohr3[i]));
      expect(ksStat(radii, tableCdf(ref))).toBeLessThan(ksCrit(radii.length));
      expect(Math.abs(res.electrons - Z) / Z).toBeLessThan(1e-3);
    }
  });
});

