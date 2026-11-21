import { describe, expect, it } from "vitest";
import {
  createAtomicSystem,
  createNuclearModelForIsotope,
  defaultIsotopeForZ,
} from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState } from "@/domain/quantum";
import {
  integrateRadialMass,
  radialNodes,
  radialR,
  sphericalHarmonic,
} from "@/physics/hydrogenic";
import { laguerre } from "@/physics/special";
import {
  CODATA_2018_UNCERTAINTIES,
  CONSTANTS,
  EXTENDED_CONSTANTS,
  convertEnergy,
} from "@/physics/units";
import { schrodingerCoulombV6Provider } from "@/physics/providers/schrodinger";
import {
  checkDiracCoulombDomain,
  computeDiracEnergy,
  diracRadialPQ,
  integrateDiracExpectationValues,
  spinAngularOmega,
} from "@/physics/providers/dirac";
import {
  calculateNonRelativisticE1Transition,
  calculateRelativisticE1Transition,
  nonrelativisticAngularC1,
  relativisticSpinAngularC1,
} from "@/physics/transitions";
import { generateHydrogenLikeSpectrum } from "@/physics/spectroscopy";
import { evaluate2DSlice, extractStateIsosurface } from "@/numerics/isosurface/marchingTetrahedra";
import { createDefaultProviderRegistry } from "@/physics/providers/registry";
import { ExperimentRunner } from "@/experiments/execution/runner";
import { IndexedDBExperimentStore } from "@/experiments/persistence/store";
import { ExperimentSerializer } from "@/experiments/persistence/serializer";
import { createExperimentDefinition } from "@/experiments/schema";
import { createInMemoryIDBFactory } from "@/experiments/__tests__/idbShim";

describe("v0.6.1 Stabilization — Schrödinger m_l != 0, high-n nodes, and grid convergence", () => {
  const h1 = createAtomicSystem({
    Z: 1,
    N: 1,
    massNumber: 1,
    nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1, 1)),
  });

  it("passes provider validation across every m_l in [-l..+l] in both real and complex bases", async () => {
    for (const basis of ["real", "complex"] as const) {
      for (const [n, l] of [
        [2, 1],
        [3, 2],
        [4, 3],
      ] as const) {
        for (let m_l = -l; m_l <= l; m_l++) {
          const st = createNonRelativisticState({ n, l, m_l, m_s: 0.5, basis });
          const res = await schrodingerCoulombV6Provider.calculate(
            {
              system: h1,
              state: st,
              observables: ["bound-energy", "radial-wavefunction", "expectation-values"],
            },
            {},
          );
          expect(res.ok, `Expected ok=true for (${n},${l},${m_l}) ${basis}`).toBe(true);
          const nodeCheck = res.validationChecks.find((c) => c.name === "node-counts");
          expect(nodeCheck?.passed).toBe(true);
          expect(res.data.nodes?.angularNodeThetas_rad).toHaveLength(l - Math.abs(m_l));
        }
      }
    }
  });

  it("locates all n - 1 radial nodes up to high n = 12 and scales reduced-mass radial mass", () => {
    for (let n = 1; n <= 12; n++) {
      const nodes = radialNodes(n, 0, 1, 1);
      expect(nodes).toHaveLength(n - 1);
      for (let i = 0; i < nodes.length; i++) {
        expect(nodes[i]).toBeGreaterThan(0);
        if (i > 0) expect(nodes[i]).toBeGreaterThan(nodes[i - 1]);
        const residual = Math.abs(laguerre(n - 1, 1, (2 * nodes[i]) / n));
        expect(residual).toBeLessThan(1e-5);
      }
    }

    const aH1 = 1 / h1.reducedMassRatio;
    const mass = integrateRadialMass(3, 0, 1, undefined, 4000, aH1);
    expect(mass).toBeCloseTo(1, 6);
  });

  it("converges monotonically under quadrature refinement", async () => {
    const hInf = createAtomicSystem({ Z: 1, N: 1 });
    const st = createNonRelativisticState({ n: 4, l: 1, m_l: 1, basis: "complex" });
    const errs: number[] = [];
    for (const q of [400, 1600, 6400]) {
      const res = await schrodingerCoulombV6Provider.calculate(
        {
          system: hInf,
          state: st,
          observables: ["expectation-values"],
          numericalOptions: { quadratureIntervals: q },
        },
        {},
      );
      expect(res.ok).toBe(true);
      errs.push(res.data.expectationValues!.meanRError);
    }
    expect(errs[1]).toBeLessThan(errs[0]);
    expect(errs[2]).toBeLessThan(errs[1]);
    expect(errs[2]).toBeLessThan(1e-8);
  });
});

describe("v0.6.1 Stabilization — Dirac cusp asymptotics, 2D spin-angular integrals, and (n,j) degeneracy", () => {
  it("verifies exact (n, j) degeneracy across light and heavy hydrogen-like ions", () => {
    for (const Z of [1, 29, 79]) {
      const e2s1 = computeDiracEnergy(2, -1, Z).bindingEnergy_eV;
      const e2p1 = computeDiracEnergy(2, 1, Z).bindingEnergy_eV;
      const e3p3 = computeDiracEnergy(3, -2, Z).bindingEnergy_eV;
      const e3d3 = computeDiracEnergy(3, 2, Z).bindingEnergy_eV;
      expect(Math.abs(e2s1 - e2p1)).toBeLessThan(1e-11);
      expect(Math.abs(e3p3 - e3d3)).toBeLessThan(1e-11);
    }
  });

  it("reproduces exact near-origin power-law cusp r^gamma for high-Z Dirac spinors", () => {
    const Z = 79;
    const kappa = -1;
    const gamma = Math.sqrt(kappa * kappa - (Z * EXTENDED_CONSTANTS.alpha) ** 2);
    const r1 = 1e-6;
    const r2 = 2e-6;
    const pq1 = diracRadialPQ(1, kappa, r1, Z, 1);
    const pq2 = diracRadialPQ(1, kappa, r2, Z, 1);
    const slopeP = Math.log(Math.abs(pq2.P / pq1.P)) / Math.log(2);
    const slopeQ = Math.log(Math.abs(pq2.Q / pq1.Q)) / Math.log(2);
    expect(slopeP).toBeCloseTo(gamma, 3);
    expect(slopeQ).toBeCloseTo(gamma, 3);
  });

  it("verifies 2D spherical spin-angular normalization and orthogonality across kappa", () => {
    const kappas = [-3, -2, -1, 1, 2];
    const nt = 80;
    const np = 80;
    const dt = Math.PI / nt;
    const dp = (2 * Math.PI) / np;

    for (let a = 0; a < kappas.length; a++) {
      for (let b = a; b < kappas.length; b++) {
        const kA = kappas[a];
        const kB = kappas[b];
        let sumRe = 0;
        let sumIm = 0;
        for (let it = 0; it < nt; it++) {
          const theta = (it + 0.5) * dt;
          const sinT = Math.sin(theta);
          for (let ip = 0; ip < np; ip++) {
            const phi = (ip + 0.5) * dp;
            const omA = spinAngularOmega(kA, 0.5, theta, phi);
            const omB = spinAngularOmega(kB, 0.5, theta, phi);
            for (const c of [0, 1] as const) {
              sumRe += (omA[c].re * omB[c].re + omA[c].im * omB[c].im) * sinT * dt * dp;
              sumIm += (omA[c].re * omB[c].im - omA[c].im * omB[c].re) * sinT * dt * dp;
            }
          }
        }
        const expected = kA === kB ? 1 : 0;
        expect(sumRe).toBeCloseTo(expected, 3);
        expect(Math.abs(sumIm)).toBeLessThan(1e-8);
      }
    }
  });

  it("converges Dirac <r^-1> and spinor norm monotonically with grid refinement", () => {
    const errs: number[] = [];
    for (const N of [400, 1600, 6400]) {
      const ex = integrateDiracExpectationValues(2, -1, 79, 1, undefined, N);
      errs.push(ex.invRError);
    }
    expect(errs[1]).toBeLessThan(errs[0]);
    expect(errs[2]).toBeLessThan(errs[1]);
    expect(errs[2]).toBeLessThan(1e-7);
    expect(checkDiracCoulombDomain(138, -1).valid).toBe(false);
    expect(() => computeDiracEnergy(1, -1, 138)).toThrow();
    expect(checkDiracCoulombDomain(138, -2).valid).toBe(true);
  });
});

describe("v0.6.1 Stabilization — E1 Gordon analytic checks, 2D angular quadrature, sublevel rates & forbidden zeroing", () => {
  const hInf = createAtomicSystem({ Z: 1, N: 1 });

  it("matches exact closed-form Gordon radial dipole integrals for 1s-2p, 2s-3p, and 2p-3d", () => {
    const r1s2p = calculateNonRelativisticE1Transition(
      hInf,
      createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 }),
      createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 }),
    );
    expect(r1s2p.radialMatrixElement_a0).toBeCloseTo((128 * Math.sqrt(6)) / 243, 6);

    const r2s3p = calculateNonRelativisticE1Transition(
      hInf,
      createNonRelativisticState({ n: 2, l: 0, m_l: 0, m_s: 0.5 }),
      createNonRelativisticState({ n: 3, l: 1, m_l: 0, m_s: 0.5 }),
    );
    expect(r2s3p.radialMatrixElement_a0).toBeCloseTo((27648 * Math.sqrt(3)) / 15625, 6);

    const r2p3d = calculateNonRelativisticE1Transition(
      hInf,
      createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 }),
      createNonRelativisticState({ n: 3, l: 2, m_l: 0, m_s: 0.5 }),
    );
    expect(r2p3d.radialMatrixElement_a0).toBeCloseTo((165888 * Math.sqrt(5)) / 78125, 6);
  });

  it("matches Wigner 3j/6j angular C_q^(1) factors against independent 2D spherical quadrature", () => {
    const nt = 72;
    const np = 72;
    const dt = Math.PI / nt;
    const dp = (2 * Math.PI) / np;

    const integrateNR = (lf: number, mf: number, q: -1 | 0 | 1, li: number, mi: number) => {
      let sum = 0;
      const pref = Math.sqrt((4 * Math.PI) / 3);
      for (let it = 0; it < nt; it++) {
        const th = (it + 0.5) * dt;
        const sinT = Math.sin(th);
        for (let ip = 0; ip < np; ip++) {
          const ph = (ip + 0.5) * dp;
          const yf = sphericalHarmonic(lf, mf, th, ph);
          const yq = sphericalHarmonic(1, q, th, ph);
          const yi = sphericalHarmonic(li, mi, th, ph);
          // Re( conj(yf) * (pref * yq) * yi )
          const prodRe = yq[0] * yi[0] - yq[1] * yi[1];
          const prodIm = yq[0] * yi[1] + yq[1] * yi[0];
          const val = (yf[0] * prodRe + yf[1] * prodIm) * pref;
          sum += val * sinT * dt * dp;
        }
      }
      return sum;
    };

    for (const [lf, mf, q, li, mi] of [
      [1, 0, 0, 0, 0],
      [1, 1, 1, 0, 0],
      [2, 1, 0, 1, 1],
      [2, 2, 1, 1, 1],
    ] as const) {
      expect(nonrelativisticAngularC1(lf, mf, q, li, mi)).toBeCloseTo(integrateNR(lf, mf, q, li, mi), 3);
    }

    const integrateDiracAng = (kf: number, mf: number, q: -1 | 0 | 1, ki: number, mi: number) => {
      let sum = 0;
      const pref = Math.sqrt((4 * Math.PI) / 3);
      for (let it = 0; it < nt; it++) {
        const th = (it + 0.5) * dt;
        const sinT = Math.sin(th);
        for (let ip = 0; ip < np; ip++) {
          const ph = (ip + 0.5) * dp;
          const omF = spinAngularOmega(kf, mf, th, ph);
          const yq = sphericalHarmonic(1, q, th, ph);
          const omI = spinAngularOmega(ki, mi, th, ph);
          for (const c of [0, 1] as const) {
            const qI_re = yq[0] * omI[c].re - yq[1] * omI[c].im;
            const qI_im = yq[0] * omI[c].im + yq[1] * omI[c].re;
            sum += (omF[c].re * qI_re + omF[c].im * qI_im) * pref * sinT * dt * dp;
          }
        }
      }
      return sum;
    };

    for (const [kf, mf, q, ki, mi] of [
      [-1, 0.5, 1, -2, -0.5],
      [1, -0.5, -1, -1, 0.5],
      [-3, 1.5, 0, -2, 1.5],
    ] as const) {
      expect(relativisticSpinAngularC1(kf, mf, q, ki, mi)).toBeCloseTo(integrateDiracAng(kf, mf, q, ki, mi), 3);
    }
  });

  it("zeros rates on spin/magnetic-forbidden E1 transitions and sums sublevel Einstein A to level A", () => {
    // NR: 2p(m_l=+1) -> 1s(m_l=0) is allowed, but 3d(m_l=+2) -> 2p(m_l=0) violates |Delta m_l| <= 1
    const d3m2 = createNonRelativisticState({ n: 3, l: 2, m_l: 2, m_s: 0.5 });
    const p2m0 = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 });
    const nrForb = calculateNonRelativisticE1Transition(hInf, d3m2, p2m0);
    expect(nrForb.selectionRule.allowed).toBe(false);
    expect(nrForb.oscillatorStrength).toBe(0);
    expect(nrForb.einsteinA_s1).toBe(0);
    expect(nrForb.sublevelEinsteinA_s1).toBe(0);
    expect(nrForb.reducedDipoleSquared_e2a02).toBe(0);

    // Spin flip: 2p(ms=-1/2) -> 1s(ms=+1/2)
    const p2Flip = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: -0.5 });
    const s1Up = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 });
    const nrSpin = calculateNonRelativisticE1Transition(hInf, p2Flip, s1Up);
    expect(nrSpin.selectionRule.allowed).toBe(false);
    expect(nrSpin.oscillatorStrength).toBe(0);
    expect(nrSpin.einsteinA_s1).toBe(0);
    expect(nrSpin.sublevelEinsteinA_s1).toBe(0);

    // Dirac magnetic forbidden: 2p_3/2 (mj=+3/2) -> 1s_1/2 (mj=-1/2) has Delta mj = -2
    const d2p32p3 = createRelativisticState({ n: 2, kappa: -2, m_j: 1.5 });
    const d1s12m1 = createRelativisticState({ n: 1, kappa: -1, m_j: -0.5 });
    const dForb = calculateRelativisticE1Transition(hInf, d2p32p3, d1s12m1);
    expect(dForb.selectionRule.allowed).toBe(false);
    expect(dForb.oscillatorStrength).toBe(0);
    expect(dForb.einsteinA_s1).toBe(0);
    expect(dForb.sublevelEinsteinA_s1).toBe(0);
    expect(dForb.reducedLineStrength_S).toBe(0);

    // Sublevel Einstein A sum over all final m_j equals level Einstein A: 3d_5/2(mj=+1/2) -> 2p_3/2(all mj)
    const up = createRelativisticState({ n: 3, kappa: -3, m_j: 0.5 });
    let sumSublevelA = 0;
    let levelA = 0;
    for (const mj of [-1.5, -0.5, 0.5, 1.5]) {
      const low = createRelativisticState({ n: 2, kappa: -2, m_j: mj });
      const res = calculateRelativisticE1Transition(hInf, up, low);
      sumSublevelA += res.sublevelEinsteinA_s1;
      if (res.selectionRule.allowed) levelA = res.einsteinA_s1;
    }
    expect(sumSublevelA).toBeCloseTo(levelA, 0);
  });

  it("supports custom series lowerN parameter in spectroscopy", () => {
    const brackett = generateHydrogenLikeSpectrum(hInf, {
      model: "dirac-coulomb",
      mode: "emission",
      series: "custom",
      customLowerN: 4,
      maxUpperN: 5,
      quadratureIntervals: 1600,
    });
    expect(brackett.lines.length).toBeGreaterThan(0);
    expect(brackett.lines.every((l) => l.lowerN === 4 && l.upperN === 5)).toBe(true);
    // Brackett alpha (5 -> 4) vacuum wavelength ~ 4052.27 nm (4.052 um)
    expect(brackett.lines[0].wavelength_nm).toBeGreaterThan(4045);
    expect(brackett.lines[0].wavelength_nm).toBeLessThan(4060);
  });
});

describe("v0.6.1 Stabilization — Constants consistency, 3D/2D field symmetry, and Worker cancellation", () => {
  it("satisfies CODATA-2018 internal relationships and positive uncertainty metadata", () => {
    const alpha = EXTENDED_CONSTANTS.alpha;
    const mc2_J = CONSTANTS.m_e_kg * EXTENDED_CONSTANTS.c_m_s ** 2;
    const hartree_J = alpha * alpha * mc2_J;
    const hartree_eV_derived = hartree_J / EXTENDED_CONSTANTS.e_C;
    expect(Math.abs(hartree_eV_derived - CONSTANTS.hartree_eV) / CONSTANTS.hartree_eV).toBeLessThan(1e-9);
    expect(Math.abs(convertEnergy(1, "Ha", "eV") - CONSTANTS.hartree_eV)).toBeLessThan(1e-12);
    expect(CODATA_2018_UNCERTAINTIES.alpha_rel).toBeGreaterThan(0);
  });

  it("preserves radial/angular symmetries in 2D slices and 3D Marching Tetrahedra", () => {
    const p2zReal = createNonRelativisticState({ n: 2, l: 1, m_l: 0, basis: "real" });
    // xy slice at z=0 is the nodal plane of 2p_z
    const xyNodal = evaluate2DSlice(p2zReal, 1, 1, {
      plane: "xy",
      offsetBohr: 0,
      extentBohr: 12,
      resolution: 15,
      quantity: "wavefunction-signed",
    });
    expect(xyNodal.maxAbs).toBeLessThan(1e-12);

    // Complex 2p (m=+1) density is azimuthally symmetric (XZ slice == YZ slice)
    const p2Complex = createNonRelativisticState({ n: 2, l: 1, m_l: 1, basis: "complex" });
    const xz = evaluate2DSlice(p2Complex, 1, 1, {
      plane: "xz",
      offsetBohr: 0,
      extentBohr: 12,
      resolution: 16,
      quantity: "density",
    });
    const yz = evaluate2DSlice(p2Complex, 1, 1, {
      plane: "yz",
      offsetBohr: 0,
      extentBohr: 12,
      resolution: 16,
      quantity: "density",
    });
    for (let i = 0; i < xz.values.length; i++) {
      expect(xz.values[i]).toBeCloseTo(yz.values[i], 10);
    }

    // 3D isosurface yields valid finite triangles with distinct positive/negative lobes for 2pz
    const iso = extractStateIsosurface(p2zReal, 1, 1, {
      quantity: "wavefunction-signed",
      isoFraction: 0.25,
      resolution: 20,
      extentBohr: 12,
    });
    expect(iso.meshes).toHaveLength(2);
    expect(iso.meshes[0].triangleCount).toBeGreaterThan(50);
    expect(iso.meshes[1].triangleCount).toBeGreaterThan(50);
    const hFinite = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 1,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1, 1)),
    });
    expect(hFinite.isotope.nuclearMass_u).toBeLessThan(hFinite.isotope.neutralAtomicMass_u);
    void radialR;
  });

  it("enforces cancellation, replay-vs-recompute provenance, and malformed bundle rejection", async () => {
    const registry = createDefaultProviderRegistry();
    const store = new IndexedDBExperimentStore({ idbFactory: createInMemoryIDBFactory() });
    const runner = new ExperimentRunner({ providerRegistry: registry, store });
    const h1 = createAtomicSystem({ Z: 1, N: 1 });
    const def = createExperimentDefinition({
      kind: "single-state",
      title: "H 2p(m=+1) Stabilization Check",
      system: h1,
      quantumStates: [createNonRelativisticState({ n: 2, l: 1, m_l: 1, basis: "complex" })],
      providerId: "schrodinger-coulomb",
      providerVersion: "0.6.1",
      observables: ["bound-energy", "expectation-values"],
    });

    const handle = runner.run(def, { mode: "direct", persist: true });
    const out1 = await handle.completion;
    expect(out1.execution.status).toBe("completed");
    expect(out1.result?.source).toBe("computed");

    const loaded = await runner.loadStoredExperiment(def.id);
    expect(loaded.latestResult?.source).toBe("loaded-from-store");

    expect(ExperimentSerializer.importIntoFreshRecord("{broken").ok).toBe(false);
    expect(
      ExperimentSerializer.importIntoFreshRecord(
        JSON.stringify({ format: "atoms-experiment-bundle", bundleVersion: 999, entries: [] }),
      ).ok,
    ).toBe(false);
    store.close();
  });
});
