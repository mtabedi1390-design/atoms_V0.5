import { describe, expect, it } from "vitest";
import {
  computeReducedMassRatio,
  createAtomicSystem,
  formatIonLabel,
  listIsotopesForZ,
  validateAtomicSystem,
} from "../atomic";
import { EXTENDED_CONSTANTS } from "@/physics/units";

describe("AtomicSystem domain (Phase 1)", () => {
  it("represents neutral atoms, positive ions, and negative ions with q = Z - N", () => {
    const hNeutral = createAtomicSystem({ Z: 1, N: 1 });
    expect(hNeutral.q).toBe(0);
    expect(formatIonLabel(hNeutral)).toBe("H");

    const hePlus = createAtomicSystem({ Z: 2, N: 1 });
    expect(hePlus.q).toBe(1);
    expect(formatIonLabel(hePlus)).toBe("He⁺");

    // Negative ions (N > Z) must be representable without artificial N <= Z restriction
    const hMinus = createAtomicSystem({ Z: 1, N: 2 });
    expect(hMinus.q).toBe(-1);
    expect(formatIonLabel(hMinus)).toBe("H⁻");
    const vHMinus = validateAtomicSystem(hMinus);
    expect(vHMinus.valid).toBe(true);
    expect(vHMinus.issues.some((i) => i.code === "NEGATIVE_ION" && i.severity === "info")).toBe(true);

    const oMinus = createAtomicSystem({ Z: 8, N: 9 });
    expect(oMinus.q).toBe(-1);
    expect(validateAtomicSystem(oMinus).valid).toBe(true);
  });

  it("supports isotopes and point-finite-mass reduced-mass scaling", () => {
    const hIsos = listIsotopesForZ(1);
    expect(hIsos.map((i) => i.massNumber)).toEqual([1, 2, 3]);

    const protiumInf = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: { kind: "point-infinite-mass" },
    });
    expect(protiumInf.reducedMassRatio).toBe(1);

    const protiumFin = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: {
        kind: "point-finite-mass",
        nuclearMass_u: EXTENDED_CONSTANTS.m_p_u,
        source: "CODATA 2018",
      },
    });
    const deutFin = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 2,
      nuclearModel: {
        kind: "point-finite-mass",
        nuclearMass_u: EXTENDED_CONSTANTS.m_d_u,
        source: "CODATA 2018",
      },
    });
    expect(protiumFin.reducedMassRatio).toBeCloseTo(1 / (1 + EXTENDED_CONSTANTS.m_e_u / EXTENDED_CONSTANTS.m_p_u), 12);
    expect(deutFin.reducedMassRatio).toBeGreaterThan(protiumFin.reducedMassRatio);
    expect(deutFin.reducedMassRatio).toBeLessThan(1);
  });

  it("supports finite-uniform and finite-fermi nuclear model schemas and validates invariants", () => {
    const auFermi = createAtomicSystem({
      Z: 79,
      N: 79,
      nuclearModel: { kind: "finite-fermi", rmsRadius_fm: 5.437, skinThickness_fm: 0.52, nuclearMass_u: 196.92 },
    });
    expect(validateAtomicSystem(auFermi).valid).toBe(true);
    expect(computeReducedMassRatio(auFermi.nuclearModel)).toBeLessThan(1);

    expect(() => createAtomicSystem({ Z: 0, N: 0 })).toThrow();
    expect(() => createAtomicSystem({ Z: 1, N: -1 })).toThrow();
    const broken = { ...auFermi, q: 12 };
    expect(validateAtomicSystem(broken).valid).toBe(false);
  });

  it("distinguishes bare nuclear mass from neutral atomic mass and warns on accidental neutral-mass substitution", () => {
    const [h1, h2] = listIsotopesForZ(1);
    // Neutral 1H atomic mass (~1.007825 u) exceeds bare proton mass (~1.007276 u) by ~1 electron mass
    expect(h1.neutralAtomicMass_u - h1.nuclearMass_u).toBeCloseTo(EXTENDED_CONSTANTS.m_e_u, 6);
    expect(h2.neutralAtomicMass_u - h2.nuclearMass_u).toBeCloseTo(EXTENDED_CONSTANTS.m_e_u, 6);

    const sysWithNeutralMistake = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: {
        kind: "point-finite-mass",
        nuclearMass_u: h1.neutralAtomicMass_u,
        source: "test-neutral-substitution",
      },
    });
    const val = validateAtomicSystem(sysWithNeutralMistake);
    expect(val.issues.some((i) => i.code === "NEUTRAL_ATOMIC_MASS_USED_FOR_NUCLEUS" && i.severity === "warning")).toBe(true);
  });
});
