import { describe, expect, it } from "vitest";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState, type SuperpositionState } from "@/domain/quantum";
import { CONSTANTS_VERSION, EXTENDED_CONSTANTS } from "@/physics/units";
import { ExperimentRunner, ExperimentSerializer, IndexedDBExperimentStore, createExperimentDefinition } from "@/experiments";
import { createInMemoryIDBFactory } from "@/experiments/__tests__/idbShim";
import { createDefaultProviderRegistry } from "../providers/registry";
import {
  SCHRODINGER_PROVIDER_ID,
  evaluateSchrodingerState,
  evaluateSchrodingerSuperposition,
  schrodingerCoulombV6Provider,
} from "../providers/schrodinger";

describe("Phase 3 Analytical Schrödinger–Coulomb Provider", () => {
  it("computes exact hydrogenic energies, expectation values, radial grids, and nodes across n, l, Z", async () => {
    const hInf = createAtomicSystem({ Z: 1, N: 1 });
    const state3d = createNonRelativisticState({ n: 3, l: 2, m_l: 0, basis: "complex" });

    const out = await schrodingerCoulombV6Provider.calculate(
      {
        system: hInf,
        state: state3d,
        observables: ["bound-energy", "radial-wavefunction", "expectation-values", "radial-probability"],
      },
      {},
    );

    expect(out.ok).toBe(true);
    expect(out.provenance.evidenceClass).toBe("analytic-exact-within-stated-Hamiltonian");
    expect(out.provenance.constantsVersion).toBe(CONSTANTS_VERSION);
    expect(out.data.energy.bindingEnergy_Ha).toBeCloseTo(-1 / 18, 12);
    expect(out.data.energy.bindingEnergy_eV).toBeCloseTo(-13.605693122994 / 9, 10);
    // <r> = (1/2) * [3*9 - 2*3] = 10.5 a0
    expect(out.data.expectationValues?.meanR_a0).toBeCloseTo(10.5, 12);
    // <r^2> = (9/2) * [45 + 1 - 18] = 126 a0^2
    expect(out.data.expectationValues?.meanR2_a02).toBeCloseTo(126, 12);
    expect(out.data.expectationValues?.meanInvR_a0inv).toBeCloseTo(1 / 9, 12);
    expect(out.data.expectationValues?.meanInvR2_a0inv2).toBeCloseTo(1 / (27 * 2.5), 12);
    expect(out.data.expectationValues?.meanInvR3_a0inv3).toBeCloseTo(1 / (27 * 2 * 2.5 * 3), 12);
    expect(out.data.expectationValues?.normError).toBeLessThan(1e-6);
    expect(out.data.expectationValues?.meanRError).toBeLessThan(1e-6);
    expect(out.data.nodes?.radialNodeCount).toBe(0);
    expect(out.data.nodes?.angularNodeCount).toBe(2);

    // 3s state checks radial nodes = 2 and null <r^-3>
    const state3s = createNonRelativisticState({ n: 3, l: 0, m_l: 0 });
    const out3s = await schrodingerCoulombV6Provider.calculate(
      { system: hInf, state: state3s, observables: ["bound-energy", "expectation-values"] },
      {},
    );
    expect(out3s.data.nodes?.radialNodeCount).toBe(2);
    expect(out3s.data.nodes?.radialNodes_a0).toHaveLength(2);
    // Exact zeros of L_2^1(rho) = (rho^2 - 6*rho + 6)/2 where rho = 2r/3 -> r = 3/2 * (3 ± sqrt(3))
    expect(out3s.data.nodes?.radialNodes_a0[0]).toBeCloseTo(1.5 * (3 - Math.sqrt(3)), 4);
    expect(out3s.data.nodes?.radialNodes_a0[1]).toBeCloseTo(1.5 * (3 + Math.sqrt(3)), 4);
    expect(out3s.data.expectationValues?.meanInvR3_a0inv3).toBeNull();
  });

  it("applies exact bare-nuclear reduced-mass scaling consistently for 1H, 2H, He+, and Li2+", async () => {
    const isoH1 = defaultIsotopeForZ(1, 1);
    const isoH2 = defaultIsotopeForZ(1, 2);
    const protium = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", isoH1),
    });
    const deuterium = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 2,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", isoH2),
    });
    const hePlus = createAtomicSystem({
      Z: 2,
      N: 1,
      massNumber: 4,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(2, 4)),
    });
    const li2Plus = createAtomicSystem({ Z: 3, N: 1 });

    const s1s = createNonRelativisticState({ n: 1, l: 0, m_l: 0 });
    const pOut = await schrodingerCoulombV6Provider.calculate({ system: protium, state: s1s, observables: ["bound-energy", "expectation-values"] }, {});
    const dOut = await schrodingerCoulombV6Provider.calculate({ system: deuterium, state: s1s, observables: ["bound-energy", "expectation-values"] }, {});
    const heOut = await schrodingerCoulombV6Provider.calculate({ system: hePlus, state: s1s, observables: ["bound-energy", "expectation-values"] }, {});
    const liOut = await schrodingerCoulombV6Provider.calculate({ system: li2Plus, state: s1s, observables: ["bound-energy", "expectation-values"] }, {});

    const expectedMuH1 = 1 / (1 + EXTENDED_CONSTANTS.m_e_u / EXTENDED_CONSTANTS.m_p_u);
    expect(pOut.data.energy.bindingEnergy_eV).toBeCloseTo(-13.605693122994 * expectedMuH1, 10);
    // Deuterium is slightly more tightly bound than Protium (~0.027% shift) and has smaller <r>
    expect(Math.abs(dOut.data.energy.bindingEnergy_eV)).toBeGreaterThan(Math.abs(pOut.data.energy.bindingEnergy_eV));
    expect(dOut.data.expectationValues!.meanR_a0).toBeLessThan(pOut.data.expectationValues!.meanR_a0);
    // Ion scaling: He+ ~ 4 * E_H, <r> = 1.5 / 2 * a_mu
    expect(heOut.data.energy.bindingEnergy_eV).toBeCloseTo(-4 * 13.605693122994 * hePlus.reducedMassRatio, 9);
    // Li2+ (Z=3 inf mass) = -9 * 13.605693... eV, <r> = 0.5 a0
    expect(liOut.data.energy.bindingEnergy_eV).toBeCloseTo(-9 * 13.605693122994, 9);
    expect(liOut.data.expectationValues?.meanR_a0).toBeCloseTo(0.5, 12);
  });

  it("evaluates coherent nonrelativistic superpositions and enforces strict N=1 & nuclear model boundaries", async () => {
    const h = createAtomicSystem({ Z: 1, N: 1 });
    const s1 = createNonRelativisticState({ n: 1, l: 0, m_l: 0, basis: "real" });
    const s2 = createNonRelativisticState({ n: 2, l: 1, m_l: 0, basis: "real" });
    const sup: SuperpositionState = {
      kind: "superposition",
      basisKind: "nonrelativistic",
      terms: [
        { state: s1, amplitude: { re: Math.SQRT1_2, im: 0 } },
        { state: s2, amplitude: { re: Math.SQRT1_2, im: 0 } },
      ],
    };

    const res = await schrodingerCoulombV6Provider.calculate(
      { system: h, state: sup, observables: ["bound-energy"] },
      {},
    );
    expect(res.ok).toBe(true);
    // Mean energy = 0.5 * (-1/2) + 0.5 * (-1/8) = -5/16 Ha
    expect(res.data.energy.bindingEnergy_Ha).toBeCloseTo(-5 / 16, 12);

    // Interference check along +z vs -z for 1s + 2pz hybrid
    const posZ = evaluateSchrodingerSuperposition(sup, 1, 1, 2, 0, 0);
    const negZ = evaluateSchrodingerSuperposition(sup, 1, 1, 2, Math.PI, 0);
    const pure1s = evaluateSchrodingerState(s1, 1, 1, 2, 0, 0);
    expect(posZ.density).toBeGreaterThan(negZ.density);
    expect(pure1s.density).toBeGreaterThan(0);

    // Rejections: H- negative ion, He neutral (N=2), bare nucleus (N=0), relativistic state, finite nucleus
    expect(schrodingerCoulombV6Provider.supports(createAtomicSystem({ Z: 1, N: 2 }), s1).supported).toBe(false);
    expect(schrodingerCoulombV6Provider.supports(createAtomicSystem({ Z: 2, N: 2 }), s1).supported).toBe(false);
    expect(schrodingerCoulombV6Provider.supports(createAtomicSystem({ Z: 1, N: 0 }), s1).supported).toBe(false);
    expect(
      schrodingerCoulombV6Provider.supports(h, createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 })).supported,
    ).toBe(false);
    expect(
      schrodingerCoulombV6Provider.supports(
        createAtomicSystem({
          Z: 1,
          N: 1,
          nuclearModel: createNuclearModelForIsotope("finite-uniform", defaultIsotopeForZ(1, 1), { rmsRadius_fm: 0.8414 }),
        }),
        s1,
      ).supported,
    ).toBe(false);
  });

  it("integrates seamlessly with the Phase 2 ExperimentRunner, IndexedDB store, and JSON serializer", async () => {
    const registry = createDefaultProviderRegistry();
    expect(registry.getById(SCHRODINGER_PROVIDER_ID)).toBeDefined();

    const store = new IndexedDBExperimentStore({ idbFactory: createInMemoryIDBFactory() });
    const runner = new ExperimentRunner({ providerRegistry: registry, store });

    const h1 = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1, 1)),
    });
    const exp = createExperimentDefinition({
      kind: "single-state",
      title: "1H 2p Schrödinger–Coulomb Exact Calculation",
      system: h1,
      quantumStates: [createNonRelativisticState({ n: 2, l: 1, m_l: 0 })],
      providerId: SCHRODINGER_PROVIDER_ID,
      providerVersion: "0.6.0",
      observables: ["bound-energy", "radial-wavefunction", "expectation-values"],
    });

    const out = await runner.run(exp, { mode: "direct", persist: true }).completion;
    expect(out.execution.status).toBe("completed");
    expect(out.result?.source).toBe("computed");

    const reloaded = await runner.loadStoredExperiment(exp.id);
    expect(reloaded.latestResult?.source).toBe("loaded-from-store");
    const json = ExperimentSerializer.exportEntry({
      definition: reloaded.definition!,
      executions: reloaded.executions,
      results: [reloaded.latestResult!],
    });
    expect(ExperimentSerializer.importIntoFreshRecord(json).ok).toBe(true);
    store.close();
  });
});
