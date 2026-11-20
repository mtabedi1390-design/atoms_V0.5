import { describe, expect, it } from "vitest";
import { createAtomicSystem } from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState } from "@/domain/quantum";
import {
  CONSTANTS_VERSION,
  convertCharge,
  convertEnergy,
  convertLength,
  convertMass,
  energyEvToFrequencyHz,
  energyEvToWavelengthNm,
  quantity,
  wavelengthNmToEnergyEv,
} from "../units";
import { createDefaultProviderRegistry } from "../providers/registry";

describe("Centralized units & CODATA 2018 constants (Phase 1)", () => {
  it("converts lengths, energies, masses, charges, and photon wavelengths consistently", () => {
    expect(CONSTANTS_VERSION).toBe("CODATA-2018");
    expect(convertEnergy(1, "Ha", "eV")).toBeCloseTo(27.211386245988, 9);
    expect(convertEnergy(convertEnergy(13.605693122994, "eV", "Ha"), "Ha", "eV")).toBeCloseTo(13.605693122994, 9);
    expect(convertEnergy(1, "eV", "cm-1")).toBeCloseTo(8065.543937, 2);

    expect(convertLength(1, "a0", "pm")).toBeCloseTo(52.9177210903, 9);
    expect(convertLength(1, "angstrom", "nm")).toBeCloseTo(0.1, 12);
    expect(convertLength(1, "m", "fm") / 1e15).toBeCloseTo(1, 12);
    expect(convertLength(1e-15, "m", "fm")).toBeCloseTo(1, 12);

    expect(convertMass(1, "u", "kg")).toBeCloseTo(1.6605390666e-27, 36);
    expect(convertCharge(1, "e", "C")).toBeCloseTo(1.602176634e-19, 28);

    // Hydrogen Lyman-alpha: infinite-mass Rydberg (~121.502 nm) vs 1H reduced-mass (~121.568 nm)
    const dEInf = 13.605693122994 * (1 - 0.25);
    const lambdaInf = energyEvToWavelengthNm(dEInf);
    expect(lambdaInf).toBeCloseTo(121.502, 2);
    expect(wavelengthNmToEnergyEv(lambdaInf)).toBeCloseTo(dEInf, 10);
    expect(energyEvToFrequencyHz(dEInf) / 1e15).toBeCloseTo(2.467381, 4);

    const muRatioH1 = 1 / (1 + 5.48579909065e-4 / 1.007276466621);
    const dEH1 = dEInf * muRatioH1;
    expect(energyEvToWavelengthNm(dEH1)).toBeCloseTo(121.568, 2);
    expect(energyEvToFrequencyHz(dEH1) / 1e15).toBeCloseTo(2.466039, 4);
    expect(quantity(dEH1, "eV").constantsVersion).toBe("CODATA-2018");
  });
});

describe("PhysicsProviderRegistry & v0.5 adapters (Phase 1)", () => {
  const reg = createDefaultProviderRegistry();

  it("executes Lobato 2026 Dirac-Fock & PySCF HF only on valid neutral configuration-average systems", async () => {
    const ne = createAtomicSystem({ Z: 10, N: 10 });
    const cfg = { kind: "configuration-average" as const, Z: 10, densitySource: "dirac-fock" as const };
    const supporting = reg.listSupporting(ne, cfg, ["total-spherical-density"]);
    expect(supporting.map((s) => s.provider.id)).toEqual(["lobato2026-df", "pyscf-hf", "browser-slater"]);

    const dfProv = reg.getById("lobato2026-df")!;
    const out = await dfProv.calculate(
      { system: ne, state: cfg, observables: ["total-spherical-density"] },
      {},
    );
    expect(out.ok).toBe(true);
    expect(out.provenance.constantsVersion).toBe("CODATA-2018");
    expect(out.provenance.numericalQuality.relativeChargeError).toBeLessThan(1e-3);
  });

  it("rejects negative ions, charged ions, and orbital/spinor states on total-density providers", () => {
    const hMinus = createAtomicSystem({ Z: 1, N: 2 });
    const hePlus = createAtomicSystem({ Z: 2, N: 1 });
    const nr = createNonRelativisticState({ n: 2, l: 1, m_l: 0 });
    const rel = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

    const dfProv = reg.getById("lobato2026-df")!;
    expect(dfProv.supports(hMinus, { kind: "configuration-average", Z: 1, densitySource: "dirac-fock" }).supported).toBe(false);
    expect(dfProv.supports(hePlus, { kind: "configuration-average", Z: 2, densitySource: "dirac-fock" }).supported).toBe(false);
    expect(dfProv.supports(createAtomicSystem({ Z: 1, N: 1 }), nr).supported).toBe(false);
    expect(dfProv.supports(createAtomicSystem({ Z: 1, N: 1 }), rel).supported).toBe(false);

    // Unavailable providers remain visible with explicit blockers
    expect(reg.getById("datatoms-2026-mcdf")?.available).toBe(false);
    expect(reg.getById("grasp-mcdhf")?.available).toBe(false);
  });

  it("supports calculation cancellation via AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();
    const dfProv = reg.getById("lobato2026-df")!;
    await expect(
      dfProv.calculate(
        {
          system: createAtomicSystem({ Z: 6, N: 6 }),
          state: { kind: "configuration-average", Z: 6, densitySource: "dirac-fock" },
          observables: ["total-spherical-density"],
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/i);
  });
});
