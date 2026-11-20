import { describe, expect, it } from "vitest";
import { laguerre, legendreP, factorial, lnFactorial } from "../special";
import {
  angularDensityComplex, hydrogenicEnergy_eV, isValidQN, meanRadiusAnalytic, radialMoments, radialNodes,
  radialR, realHarmonic, sphericalHarmonic, angularNodeThetas, radialNodeCount, psiComplex, probabilityDensity,
} from "../hydrogenic";
import { probabilityCurrentAnalytic, probabilityCurrentNumeric } from "../current";

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("special functions", () => {
  it("factorials", () => {
    expect(factorial(5)).toBe(120);
    close(Math.exp(lnFactorial(10)), 3628800, 1e-6);
    close(lnFactorial(170), Math.log(7.257415615307994e306), 1e-9);
  });
  it("Laguerre reference values", () => {
    close(laguerre(0, 1, 2.5), 1);
    close(laguerre(1, 1, 2.5), 2 - 2.5); // 1+α−x
    close(laguerre(2, 3, 1.0), 0.5 * (1 - 2 * (3 + 2) * 1 + (3 + 1) * (3 + 2)) ); // L_2^α = (x²−2(α+2)x+(α+1)(α+2))/2
    close(laguerre(3, 0, 1.0), (-1 + 9 - 18 + 6) / 6); // L_3(x)= (−x³+9x²−18x+6)/6
  });
  it("Legendre reference values incl. Condon–Shortley & negative m", () => {
    const x = 0.3;
    close(legendreP(1, 0, x), x);
    close(legendreP(1, 1, x), -Math.sqrt(1 - x * x));
    close(legendreP(2, 0, x), 0.5 * (3 * x * x - 1));
    close(legendreP(2, 1, x), -3 * x * Math.sqrt(1 - x * x));
    close(legendreP(2, 2, x), 3 * (1 - x * x));
    close(legendreP(3, 0, x), 0.5 * (5 * x ** 3 - 3 * x));
    // P_l^{-m} = (-1)^m (l-m)!/(l+m)! P_l^m
    close(legendreP(2, -1, x), -legendreP(2, 1, x) / 6);
    close(legendreP(3, -3, x), -legendreP(3, 3, x) / 720);
  });
});

describe("quantum numbers", () => {
  it("validates", () => {
    expect(isValidQN({ n: 1, l: 0, m: 0 })).toBe(true);
    expect(isValidQN({ n: 2, l: 2, m: 0 })).toBe(false);
    expect(isValidQN({ n: 3, l: 2, m: 3 })).toBe(false);
    expect(isValidQN({ n: 3, l: 2, m: -2 })).toBe(true);
    expect(isValidQN({ n: 0, l: 0, m: 0 })).toBe(false);
  });
});

describe("radial functions", () => {
  const cases: [number, number][] = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 3], [5, 2], [7, 0], [6, 5]];
  it("closed forms for 1s, 2s, 2p (Z=1 and Z=3)", () => {
    for (const Z of [1, 3]) {
      for (const r of [0.1, 0.7, 2.3, 5]) {
        close(radialR(1, 0, r, Z), 2 * Z ** 1.5 * Math.exp(-Z * r), 1e-12);
        close(radialR(2, 0, r, Z), (Z / 2) ** 1.5 * (2 - Z * r) * Math.exp(-Z * r / 2), 1e-12);
        close(radialR(2, 1, r, Z), (Z / 2) ** 1.5 * (Z * r / Math.sqrt(3)) * Math.exp(-Z * r / 2), 1e-12);
      }
    }
  });
  it("normalization ∫r²R²dr = 1 and ⟨r⟩ analytic", () => {
    for (const [n, l] of cases) {
      for (const Z of [1, 2, 26]) {
        const { norm, meanR } = radialMoments(n, l, Z);
        close(norm, 1, 1e-5);
        close(meanR, meanRadiusAnalytic(n, l, Z), 1e-5 * meanRadiusAnalytic(n, l, Z));
      }
    }
  });
  it("radial node count and locations (2s node at r=2/Z, 3s at 1.902, 7.098)", () => {
    expect(radialNodes(2, 0)).toHaveLength(1);
    close(radialNodes(2, 0)[0], 2, 1e-6);
    close(radialNodes(2, 0, 2)[0], 1, 1e-6);
    const n3s = radialNodes(3, 0);
    close(n3s[0], 1.9019, 1e-3);
    close(n3s[1], 7.0981, 1e-3);
    for (const [n, l] of cases) expect(radialNodes(n, l)).toHaveLength(radialNodeCount(n, l));
  });
  it("is finite at origin and large r for high n,l", () => {
    expect(Number.isFinite(radialR(20, 19, 0))).toBe(true);
    expect(Number.isFinite(radialR(20, 0, 1e-12))).toBe(true);
    expect(Math.abs(radialR(10, 3, 5000))).toBeLessThan(1e-100);
  });
});

describe("angular functions", () => {
  const integrateAngular = (f: (t: number, p: number) => number, N = 400) => {
    let s = 0;
    const dt = Math.PI / N,
      dp = (2 * Math.PI) / N;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * dt;
      for (let j = 0; j < N; j++) s += f(t, (j + 0.5) * dp) * Math.sin(t);
    }
    return s * dt * dp;
  };
  it("complex |Y|² normalized over sphere for l≤4, all m", () => {
    for (let l = 0; l <= 4; l++)
      for (let m = -l; m <= l; m++) {
        close(integrateAngular((t, p) => { const [a, b] = sphericalHarmonic(l, m, t, p); return a * a + b * b; }), 1, 2e-3);
      }
  });
  it("real tesseral harmonics normalized & orthogonal", () => {
    close(integrateAngular((t, p) => realHarmonic(2, 1, t, p) ** 2), 1, 2e-3);
    close(integrateAngular((t, p) => realHarmonic(3, -2, t, p) ** 2), 1, 2e-3);
    close(integrateAngular((t, p) => realHarmonic(2, 1, t, p) * realHarmonic(2, -1, t, p)), 0, 2e-3);
    close(integrateAngular((t, p) => realHarmonic(1, 1, t, p) * realHarmonic(1, 0, t, p)), 0, 2e-3);
  });
  it("Y_l^{-m} = (-1)^m conj(Y_l^m)", () => {
    for (const [l, m] of [[1, 1], [2, 2], [3, 1], [4, 3]] as const) {
      const [a, b] = sphericalHarmonic(l, m, 0.7, 1.9);
      const [c, d] = sphericalHarmonic(l, -m, 0.7, 1.9);
      const s = m % 2 === 0 ? 1 : -1;
      close(c, s * a, 1e-12);
      close(d, -s * b, 1e-12);
    }
  });
  it("Y_0^0 and Y_1^0 closed forms; p_x lobe along +x", () => {
    close(sphericalHarmonic(0, 0, 1, 2)[0], Math.sqrt(1 / (4 * Math.PI)));
    close(sphericalHarmonic(1, 0, 0.4, 2)[0], Math.sqrt(3 / (4 * Math.PI)) * Math.cos(0.4));
    expect(realHarmonic(1, 1, Math.PI / 2, 0)).toBeGreaterThan(0); // p_x
    expect(realHarmonic(1, -1, Math.PI / 2, Math.PI / 2)).toBeGreaterThan(0); // p_y
    expect(realHarmonic(2, 2, Math.PI / 2, 0)).toBeGreaterThan(0); // d_x²−y²
  });
  it("angular nodes: count = l−|m| cones", () => {
    expect(angularNodeThetas(2, 0)).toHaveLength(2);
    close(angularNodeThetas(1, 0)[0], Math.PI / 2, 1e-6);
    close(angularNodeThetas(2, 0)[0], Math.acos(1 / Math.sqrt(3)), 1e-6);
    expect(angularNodeThetas(3, 3)).toHaveLength(0);
    expect(angularDensityComplex(2, 1, Math.PI / 2)).toBeLessThan(1e-20);
  });
});

describe("energies and expectation values", () => {
  it("E_n = −13.6057 Z²/n² eV", () => {
    close(hydrogenicEnergy_eV(1, 1), -13.605693122994, 1e-9);
    close(hydrogenicEnergy_eV(2, 1), -3.4014232807485, 1e-9);
    close(hydrogenicEnergy_eV(1, 2), -54.422772491976, 1e-9);
  });
  it("⟨r⟩ 1s = 1.5 a0, 2p = 5 a0, 3d = 10.5 a0", () => {
    close(meanRadiusAnalytic(1, 0), 1.5);
    close(meanRadiusAnalytic(2, 1), 5);
    close(meanRadiusAnalytic(3, 2), 10.5);
  });
  it("full wavefunction normalization ∫|ψ|² d³r = 1 (2p, m=1; 3d, m=-2 real)", () => {
    const integrate = (f: (r: number, t: number, p: number) => number, rMax: number) => {
      const Nr = 300, Nt = 120, Np = 120;
      let s = 0;
      for (let i = 0; i < Nr; i++) {
        const r = (i + 0.5) * (rMax / Nr);
        for (let j = 0; j < Nt; j++) {
          const t = (j + 0.5) * (Math.PI / Nt);
          for (let k = 0; k < Np; k++) s += f(r, t, (k + 0.5) * (2 * Math.PI / Np)) * r * r * Math.sin(t);
        }
      }
      return s * (rMax / Nr) * (Math.PI / Nt) * (2 * Math.PI / Np);
    };
    close(integrate((r, t, p) => { const [a, b] = psiComplex({ n: 2, l: 1, m: 1 }, r, t, p); return a * a + b * b; }, 40), 1, 5e-3);
    close(integrate((r, t, p) => probabilityDensity({ n: 3, l: 2, m: -2 }, "real", r, t, p), 60), 1, 5e-3);
  });
});

describe("probability current", () => {
  it("numeric gradient matches analytic j = m|ψ|²/(r sinθ) φ̂ for 2p m=1, 3d m=-2", () => {
    for (const q of [{ n: 2, l: 1, m: 1 }, { n: 3, l: 2, m: -2 }, { n: 4, l: 3, m: 2 }]) {
      for (const [x, y, z] of [[1.5, 0.7, 0.4], [-2, 1, -0.3], [0.5, -3, 2]]) {
        const a = probabilityCurrentAnalytic(q, x, y, z);
        const n = probabilityCurrentNumeric(q, x, y, z);
        const scale = Math.max(Math.hypot(...a), 1e-12);
        for (let k = 0; k < 3; k++) close(a[k] / scale, n[k] / scale, 1e-5);
      }
    }
  });
  it("vanishes for m=0 and real orbitals and on the z-axis", () => {
    expect(probabilityCurrentNumeric({ n: 2, l: 1, m: 0 }, 1, 1, 1).every((v) => Math.abs(v) < 1e-10)).toBe(true);
    expect(probabilityCurrentAnalytic({ n: 2, l: 1, m: 1 }, 0, 0, 1.3).every((v) => v === 0)).toBe(true);
  });
  it("circulates counter-clockwise (about +z) for m>0", () => {
    const j = probabilityCurrentAnalytic({ n: 2, l: 1, m: 1 }, 2, 0, 0);
    expect(j[1]).toBeGreaterThan(0);
  });
});

import { radialDomainForMass, integrateRadialMass, radialR as radialRRef } from "../hydrogenic";
import { integrateElectronCount, subshellDensity, sharedDensityMax } from "../density";

describe("radial tail control", () => {
  it("meets the tail tolerance for difficult high-n / high-l states and reports mass", () => {
    for (const [n, l, Z] of [[1, 0, 1], [6, 5, 1], [10, 7, 1], [16, 0, 1], [20, 19, 1], [20, 0, 26], [8, 3, 2]] as const) {
      const d = radialDomainForMass(n, l, Z, 1e-8);
      expect(d.includedMass).toBeGreaterThanOrEqual(1 - 1e-8);
      expect(d.tailMass).toBeGreaterThanOrEqual(0);
      expect(d.tailMass).toBeLessThanOrEqual(1e-8);
      expect(Number.isFinite(d.rMax)).toBe(true);
      expect(integrateRadialMass(n, l, Z, d.rMax)).toBeGreaterThanOrEqual(1 - 1e-8);
    }
  });
  it("refuses invalid quantum numbers instead of normalising garbage", () => {
    expect(() => radialDomainForMass(2, 2, 1)).toThrow();
    expect(() => radialDomainForMass(0, 0, 1)).toThrow();
  });
  it("detects truncation: a deliberately short domain carries less than unit mass", () => {
    const mass = integrateRadialMass(1, 0, 1, 0.5);
    expect(mass).toBeLessThan(0.99);
    expect(() => radialDomainForMass(1, 0, 1, 1.1)).toThrow(); // impossible tolerance
  });
});

describe("full-atom electron density normalisation", () => {
  it("closed shell: Ne 2p⁶ contains six electrons", () => {
    const dNe = radialDomainForMass(2, 1, 5.85, 1e-10).rMax;
    expect(integrateElectronCount(2, 1, 6, 5.85, dNe, 20000)).toBeCloseTo(6, 5);
  });
  it("open shell: C 2p² contains two electrons (partial occupation is explicit)", () => {
    const dC = radialDomainForMass(2, 1, 3.14, 1e-10).rMax;
    expect(integrateElectronCount(2, 1, 2, 3.14, dC, 20000)).toBeCloseTo(2, 5);
    expect(integrateElectronCount(2, 1, 1.5, 3.14, dC, 20000)).toBeCloseTo(1.5, 5);
  });
  it("density is positive and spherically averaged (1/4π factor present)", () => {
    const r = 2;
    expect(subshellDensity(2, 1, r, 6, 5.85)).toBeGreaterThan(0);
    expect(subshellDensity(2, 1, r, 6, 5.85)).toBeCloseTo((6 / (4 * Math.PI)) * radialRRef(2, 1, r, 5.85) ** 2, 15);
  });
  it("cross-shell convention: shared maximum is the max of absolute layer peaks, not each layer's own", () => {
    const peaks = [{ key: "1s", peakDensity: 40 }, { key: "2s", peakDensity: 3 }, { key: "2p", peakDensity: 5 }];
    expect(sharedDensityMax(peaks)).toBe(40);
    expect(sharedDensityMax([])).toBe(0);
  });
});
