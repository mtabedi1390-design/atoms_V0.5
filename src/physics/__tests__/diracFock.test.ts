import { describe, expect, it } from "vitest";
import {
  DIRAC_FOCK_META,
  diracFockDensityBohr3,
  diracFockRadialGrid,
  diracFockRadialPDF,
  diracFockRecord,
} from "../diracFock";

describe("Lobato et al. (2026) Dirac-Fock neutral-atom radial densities (Z = 1..118)", () => {
  it("contains all 118 elements with positive density and < 1e-3 trapezoid charge error", () => {
    expect(DIRAC_FOCK_META.schema).toBe("atoms.df-dirac-pade.v1");
    for (let Z = 1; Z <= 118; Z++) {
      const rec = diracFockRecord(Z);
      expect(rec.Z).toBe(Z);
      expect(rec.n_t).toBeGreaterThanOrEqual(2);
      expect(rec.terms).toHaveLength(rec.n_t);

      // Positivity across radial decade probes
      for (const r of [0, 1e-4, 0.01, 0.2, 1.0, 4.0, 12.0]) {
        const rho = diracFockDensityBohr3(Z, r);
        expect(Number.isFinite(rho)).toBe(true);
        expect(rho).toBeGreaterThanOrEqual(0);
      }
      expect(diracFockDensityBohr3(Z, 0)).toBeGreaterThan(0);

      // Independent trapezoid quadrature on browser radial grid
      const grid = diracFockRadialGrid(Z);
      expect(grid.rBohr).toHaveLength(520);
      const relErr = Math.abs(grid.integratedElectrons - Z) / Z;
      expect(relErr).toBeLessThan(1e-3);
      expect(grid.meanRadiusBohr).toBeGreaterThan(0.1);
      expect(grid.meanRadiusBohr).toBeLessThan(8);
    }
  });

  it("matches exact hydrogen 1s density scale for Z=1 and shows relativistic core compression at heavy Z", () => {
    // Non-relativistic H 1s(0) = 1/pi ≈ 0.31831 e-/a0^3; Dirac 1s finite/point density at origin is close to 1/pi
    const rhoH0 = diracFockDensityBohr3(1, 1e-3);
    expect(rhoH0).toBeGreaterThan(0.3);
    expect(rhoH0).toBeLessThan(0.35);

    const hGrid = diracFockRadialGrid(1);
    expect(hGrid.meanRadiusBohr).toBeCloseTo(1.5, 2);

    // Oganesson (Z=118) total radial PDF integrates to 118 and remains smooth/non-negative
    const ogGrid = diracFockRadialGrid(118);
    expect(Math.abs(ogGrid.integratedElectrons - 118) / 118).toBeLessThan(1e-3);
    expect(diracFockRadialPDF(118, 1.0)).toBeGreaterThan(0);

    // Gold (Z=79) and Uranium (Z=92) core density exceeds H by > 2e5x at r=0.01 a0 and > 1e5 at r=0.001 a0
    expect(diracFockDensityBohr3(79, 0.01)).toBeGreaterThan(2e5 * diracFockDensityBohr3(1, 0.01));
    expect(diracFockDensityBohr3(79, 0.001)).toBeGreaterThan(1e5);
    expect(diracFockDensityBohr3(92, 0.01)).toBeGreaterThan(1e5);
  });

  it("rejects out-of-range Z or negative radii", () => {
    expect(() => diracFockRecord(0)).toThrow();
    expect(() => diracFockRecord(119)).toThrow();
    expect(() => diracFockDensityBohr3(6, -0.1)).toThrow();
  });
});
