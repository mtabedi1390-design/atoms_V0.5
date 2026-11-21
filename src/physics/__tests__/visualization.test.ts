import { describe, expect, it } from "vitest";
import { createNonRelativisticState, createRelativisticState } from "@/domain/quantum";
import { BOHR_PM } from "@/physics/hydrogenic";
import { evaluate2DSlice, extractStateIsosurface } from "@/numerics/isosurface/marchingTetrahedra";
import { sampleDiracSpinorCloud } from "@/sampling/diracSampler";

describe("Phase 5 Quantum Visualization & Isosurface Numerics", () => {
  it("extracts positive and negative phase lobes for real 2pz orbital cleanly inside its extent", () => {
    const pz = createNonRelativisticState({ n: 2, l: 1, m_l: 0, basis: "real" });
    const iso = extractStateIsosurface(pz, 1, 1, {
      resolution: 28,
      extentBohr: 12,
      isoFraction: 0.2,
      quantity: "wavefunction-signed",
    });

    expect(iso.meshes).toHaveLength(2);
    const pos = iso.meshes.find((m) => m.polarity === "positive")!;
    const neg = iso.meshes.find((m) => m.polarity === "negative")!;
    expect(pos.triangleCount).toBeGreaterThan(20);
    expect(neg.triangleCount).toBeGreaterThan(20);

    // Positive lobe lies in z > 0, negative lobe in z < 0 for real 2pz
    let posZAvg = 0;
    for (let i = 2; i < pos.positionsPm.length; i += 3) posZAvg += pos.positionsPm[i];
    posZAvg /= pos.positionsPm.length / 3;
    let negZAvg = 0;
    for (let i = 2; i < neg.positionsPm.length; i += 3) negZAvg += neg.positionsPm[i];
    negZAvg /= neg.positionsPm.length / 3;

    expect(posZAvg).toBeGreaterThan(BOHR_PM * 0.5);
    expect(negZAvg).toBeLessThan(-BOHR_PM * 0.5);
  });

  it("extracts Dirac spinor probability-density isosurfaces and evaluates 2D XZ slices", () => {
    const p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 1.5 });
    const iso = extractStateIsosurface(p32, 79, 1, {
      resolution: 24,
      extentBohr: 0.22,
      isoFraction: 0.15,
      quantity: "dirac-total-density",
    });
    expect(iso.meshes).toHaveLength(1);
    expect(iso.meshes[0].triangleCount).toBeGreaterThan(20);

    // 2D XZ slice of real 2pz at y=0 must show antisymmetry z -> -z and zero nodal plane at z=0
    const pz = createNonRelativisticState({ n: 2, l: 1, m_l: 0, basis: "real" });
    const slice = evaluate2DSlice(pz, 1, 1, {
      plane: "xz",
      offsetBohr: 0,
      extentBohr: 10,
      resolution: 33, // odd so center row j=16 is exact z=0
      quantity: "wavefunction-signed",
    });
    expect(slice.isSigned).toBe(true);
    const midRow = 16 * 33;
    for (let i = 0; i < 33; i++) {
      expect(Math.abs(slice.values[midRow + i])).toBeLessThan(1e-12);
    }
    expect(Math.abs(slice.maxVal + slice.minVal)).toBeLessThan(1e-7);
  });

  it("samples Dirac 4-component spinor point clouds matching radial norm = 1", () => {
    const s2p12 = createRelativisticState({ n: 2, kappa: 1, m_j: 0.5 });
    const cloud = sampleDiracSpinorCloud({
      state: s2p12,
      Z: 92,
      reducedMassRatio: 1,
      count: 2048,
      seed: 1234,
      componentView: "total",
    });
    expect(cloud.radialIntegral).toBeCloseTo(1, 3);
    expect(cloud.positionsBohr.length).toBe(2048 * 3);
    expect(cloud.maxDensity).toBeGreaterThan(0);
  });
});
