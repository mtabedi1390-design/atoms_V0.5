import { describe, expect, it } from "vitest";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState } from "@/domain/quantum";
import { ExperimentRunner, IndexedDBExperimentStore, createExperimentDefinition } from "@/experiments";
import { createInMemoryIDBFactory } from "@/experiments/__tests__/idbShim";
import { hydrogenicEnergy_eV, radialR } from "@/physics/hydrogenic";
import { CONSTANTS_VERSION, EXTENDED_CONSTANTS } from "@/physics/units";
import { createDefaultProviderRegistry } from "../providers/registry";
import {
  DIRAC_PROVIDER_ID,
  checkDiracCoulombDomain,
  computeDiracEnergy,
  diracCoulombV6Provider,
  diracRadialPQ,
  evaluateDiracSpinor,
  integrateDiracExpectationValues,
  spinAngularOmega,
} from "../providers/dirac";

describe("Phase 4 Relativistic Point-Coulomb Dirac Provider", () => {
  it("computes exact Dirac total/binding energies and separates rest-mass m_e c^2 cleanly", async () => {
    const h = createAtomicSystem({ Z: 1, N: 1 });
    const s1s = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });

    const res = await diracCoulombV6Provider.calculate(
      { system: h, state: s1s, observables: ["bound-energy", "total-energy", "spinor-wavefunction"] },
      {},
    );
    expect(res.ok).toBe(true);
    expect(res.provenance.evidenceClass).toBe("analytic-exact-within-stated-Hamiltonian");
    expect(res.provenance.constantsVersion).toBe(CONSTANTS_VERSION);

    const e = res.data.energy;
    // Exact Sommerfeld formula check: E_total - m_e c^2 = E_bind
    expect(e.totalEnergy_eV - e.restMassEnergy_eV).toBeCloseTo(e.bindingEnergy_eV, 6);
    expect(e.bindingEnergy_eV).toBeLessThan(-13.605); // Relativistic correction lowers 1s1/2 slightly below -Ry
    expect(e.bindingEnergy_eV).toBeGreaterThan(-13.607);
    expect(e.gamma).toBeCloseTo(Math.sqrt(1 - EXTENDED_CONSTANTS.alpha ** 2), 12);

    // At Z=92 (U91+ 1s1/2), relativistic deepening is ~20% beyond nonrelativistic Z^2 Ry!
    const nr1sU = hydrogenicEnergy_eV(1, 92, 1);
    const dirac1sU = computeDiracEnergy(1, -1, 92, 1);
    expect(Math.abs(dirac1sU.bindingEnergy_eV)).toBeGreaterThan(Math.abs(nr1sU) * 1.13);
    expect(dirac1sU.gamma).toBeCloseTo(Math.sqrt(1 - (92 * EXTENDED_CONSTANTS.alpha) ** 2), 12);
  });

  it("satisfies the exact coupled radial Dirac ODEs via independent 4th-order finite-difference checks", () => {
    const cases: Array<{ Z: number; n: number; kappa: number; r: number }> = [
      { Z: 1, n: 1, kappa: -1, r: 1.2 },
      { Z: 1, n: 2, kappa: 1, r: 3.8 },
      { Z: 1, n: 2, kappa: -2, r: 4.5 },
      { Z: 79, n: 3, kappa: 2, r: 0.14 },
      { Z: 92, n: 2, kappa: -1, r: 0.05 },
    ];
    const alpha = EXTENDED_CONSTANTS.alpha;
    const c = 1 / alpha;
    const mc2 = 1 / (alpha * alpha);

    for (const { Z, n, kappa, r } of cases) {
      const E_tot = computeDiracEnergy(n, kappa, Z, 1).totalEnergy_Ha;
      const h = r * 1e-4;
      const f = (x: number) => diracRadialPQ(n, kappa, x, Z, 1);
      const c0 = f(r);
      const pm1 = f(r + h);
      const mm1 = f(r - h);
      const pm2 = f(r + 2 * h);
      const mm2 = f(r - 2 * h);

      const dP = (-pm2.P + 8 * pm1.P - 8 * mm1.P + mm2.P) / (12 * h);
      const dQ = (-pm2.Q + 8 * pm1.Q - 8 * mm1.Q + mm2.Q) / (12 * h);

      // Exact coupled Dirac ODEs in atomic units (V = -Z/r, so -V/c = +Z*alpha/r):
      // dP/dr + (kappa/r)P = ((E + mc^2)/c + Z*alpha/r) Q
      // dQ/dr - (kappa/r)Q = -((E - mc^2)/c + Z*alpha/r) P
      const lhs1 = dP + (kappa / r) * c0.P;
      const rhs1 = ((E_tot + mc2) / c + (Z * alpha) / r) * c0.Q;
      const lhs2 = dQ - (kappa / r) * c0.Q;
      const rhs2 = -((E_tot - mc2) / c + (Z * alpha) / r) * c0.P;

      expect(Math.abs(lhs1 - rhs1)).toBeLessThan(1e-7 * (Math.abs(rhs1) + 1));
      expect(Math.abs(lhs2 - rhs2)).toBeLessThan(1e-7 * (Math.abs(rhs2) + 1));
    }
  });

  it("verifies spinor radial normalization ∫(|P|^2 + |Q|^2)dr = 1 and Hellmann–Feynman <r^-1> across Z=1..118", () => {
    const states: Array<{ Z: number; n: number; kappa: number }> = [
      { Z: 1, n: 1, kappa: -1 },
      { Z: 1, n: 2, kappa: 1 },
      { Z: 1, n: 3, kappa: -3 },
      { Z: 79, n: 2, kappa: -1 },
      { Z: 92, n: 1, kappa: -1 },
      { Z: 118, n: 1, kappa: -1 },
      { Z: 118, n: 2, kappa: 1 },
    ];
    for (const { Z, n, kappa } of states) {
      const exp = integrateDiracExpectationValues(n, kappa, Z, 1);
      expect(exp.totalSpinorNorm).toBeCloseTo(1, 6);
      expect(exp.normError).toBeLessThan(1e-5);
      expect(exp.invRError).toBeLessThan(1e-5);
      expect(exp.smallComponentNorm).toBeGreaterThan(0);
      expect(exp.largeComponentNorm + exp.smallComponentNorm).toBeCloseTo(1, 6);
    }
    // At Z=118 1s1/2, small component contribution is relativistic (> 20%!)
    const og1s = integrateDiracExpectationValues(1, -1, 118, 1);
    expect(og1s.smallComponentNorm).toBeGreaterThan(0.2);
  });

  it("demonstrates fine-structure 2p3/2 - 2p1/2 splitting and 2s1/2-2p1/2 Dirac degeneracy", async () => {
    const h = createAtomicSystem({ Z: 1, N: 1 });
    const s2s12 = createRelativisticState({ n: 2, kappa: -1, m_j: 0.5 });
    const s2p12 = createRelativisticState({ n: 2, kappa: 1, m_j: 0.5 });
    const s2p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 1.5 });

    const out2s = await diracCoulombV6Provider.calculate({ system: h, state: s2s12, observables: ["bound-energy"] }, {});
    const out2p1 = await diracCoulombV6Provider.calculate({ system: h, state: s2p12, observables: ["bound-energy", "fine-structure"] }, {});
    const out2p3 = await diracCoulombV6Provider.calculate({ system: h, state: s2p32, observables: ["bound-energy", "fine-structure"] }, {});

    // Point-Coulomb Dirac predicts exact degeneracy for equal (n, |kappa|): 2s_1/2 and 2p_1/2
    expect(out2s.data.energy.bindingEnergy_eV).toBeCloseTo(out2p1.data.energy.bindingEnergy_eV, 12);

    // Classic Hydrogen 2p_3/2 - 2p_1/2 fine-structure splitting ~ 10.95 GHz (~0.3652 cm^-1, ~4.528e-5 eV)
    expect(out2p1.data.fineStructure?.splitting_cm1).toBeCloseTo(0.3652, 3);
    expect(out2p1.data.fineStructure?.splitting_GHz).toBeCloseTo(10.95, 1);
    expect(out2p3.data.energy.bindingEnergy_eV).toBeGreaterThan(out2p1.data.energy.bindingEnergy_eV); // j=3/2 lies higher (less negative) than j=1/2
  });

  it("verifies spin-angular normalization, spherical j=1/2 symmetry, and anisotropic j=3/2 density", () => {
    // 2p1/2 density must be spherically symmetric (independent of theta)
    const p12 = createRelativisticState({ n: 2, kappa: 1, m_j: 0.5 });
    const rho1 = evaluateDiracSpinor(p12, 1, 1, 2.0, 0.2, 0.4).density;
    const rho2 = evaluateDiracSpinor(p12, 1, 1, 2.0, Math.PI / 2, 1.9).density;
    expect(rho1).toBeCloseTo(rho2, 12);

    // 2p3/2 |m_j|=3/2 vanishes at theta=0 and peaks at theta=pi/2 (sin^2 theta)
    const p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 1.5 });
    const pole = evaluateDiracSpinor(p32, 1, 1, 2.0, 1e-6, 0).density;
    const eq = evaluateDiracSpinor(p32, 1, 1, 2.0, Math.PI / 2, 0).density;
    expect(pole).toBeLessThan(eq * 1e-8);

    // Numerical integral of |Omega|^2 over sphere = 1
    let surf = 0;
    const nt = 200;
    const dt = Math.PI / nt;
    for (let i = 0; i <= nt; i++) {
      const th = (i / nt) * Math.PI;
      const w = i === 0 || i === nt ? 0.5 : 1;
      const om = spinAngularOmega(-2, 0.5, th, 0.3);
      const dens = om[0].re ** 2 + om[0].im ** 2 + om[1].re ** 2 + om[1].im ** 2;
      surf += w * dens * Math.sin(th) * 2 * Math.PI * dt;
    }
    expect(surf).toBeCloseTo(1, 4);
  });

  it("converges monotonically to Schrödinger–Coulomb in the nonrelativistic limit alpha -> 0", () => {
    const alpha0 = EXTENDED_CONSTANTS.alpha;
    const alphas = [alpha0, alpha0 * 0.1, alpha0 * 0.01, alpha0 * 0.001];
    const nrE = hydrogenicEnergy_eV(2, 10, 1);

    let prevErr = Infinity;
    let prevSmall = Infinity;
    for (const a of alphas) {
      const eDirac = computeDiracEnergy(2, 1, 10, 1, a).bindingEnergy_eV;
      const err = Math.abs(eDirac - nrE);
      expect(err).toBeLessThan(prevErr);
      prevErr = err;

      const exp = integrateDiracExpectationValues(2, 1, 10, 1, a);
      expect(exp.smallComponentNorm).toBeLessThan(prevSmall);
      prevSmall = exp.smallComponentNorm;

      // Large radial component P_{2,+1}(r) converges to r * R_{2,1}(r) (up to overall sign convention)
      const { P } = diracRadialPQ(2, 1, 0.6, 10, 1, a);
      const rR = 0.6 * radialR(2, 1, 0.6, 10, 1);
      if (a === alphas[alphas.length - 1]) {
        expect(Math.abs(Math.abs(P) - Math.abs(rR))).toBeLessThan(1e-5);
      }
    }
    expect(prevErr / Math.abs(nrE)).toBeLessThan(1e-8);
    expect(prevSmall).toBeLessThan(1e-9);
  });

  it("enforces point-Coulomb domain (0 < Z*alpha < |kappa|), N=1, finite-nucleus rejection, and ExperimentRunner integration", async () => {
    expect(checkDiracCoulombDomain(138, -1).valid).toBe(false);
    expect(checkDiracCoulombDomain(138, -2).valid).toBe(true); // |kappa|=2 -> Z < 274

    const h = createAtomicSystem({ Z: 1, N: 1 });
    const s2p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

    // Rejects N=2 (He or H-), bare N=0, NR states, finite-fermi
    expect(diracCoulombV6Provider.supports(createAtomicSystem({ Z: 2, N: 2 }), s2p32).supported).toBe(false);
    expect(diracCoulombV6Provider.supports(createAtomicSystem({ Z: 1, N: 2 }), s2p32).supported).toBe(false);
    expect(diracCoulombV6Provider.supports(h, createNonRelativisticState({ n: 2, l: 1, m_l: 0 })).supported).toBe(false);
    expect(
      diracCoulombV6Provider.supports(
        createAtomicSystem({
          Z: 79,
          N: 1,
          nuclearModel: createNuclearModelForIsotope("finite-fermi", defaultIsotopeForZ(79), { rmsRadius_fm: 5.437, skinThickness_fm: 0.52 }),
        }),
        s2p32,
      ).supported,
    ).toBe(false);

    // Execute through ExperimentRunner + IndexedDB
    const registry = createDefaultProviderRegistry();
    expect(registry.getById(DIRAC_PROVIDER_ID)).toBeDefined();
    const store = new IndexedDBExperimentStore({ idbFactory: createInMemoryIDBFactory() });
    const runner = new ExperimentRunner({ providerRegistry: registry, store });
    const exp = createExperimentDefinition({
      kind: "single-state",
      title: "1H 2p3/2 Point-Coulomb Dirac Calculation",
      system: h,
      quantumStates: [s2p32],
      providerId: DIRAC_PROVIDER_ID,
      providerVersion: "0.6.0",
      observables: ["bound-energy", "spinor-wavefunction", "fine-structure"],
    });
    const out = await runner.run(exp, { mode: "direct", persist: true }).completion;
    expect(out.execution.status).toBe("completed");
    expect(out.result?.providerId).toBe(DIRAC_PROVIDER_ID);
    store.close();
  });
});
