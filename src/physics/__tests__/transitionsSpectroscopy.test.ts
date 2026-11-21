import { describe, expect, it } from "vitest";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState } from "@/domain/quantum";
import { wigner3j, wigner6j } from "@/numerics/specialFunctions/wigner";
import {
  calculateNonRelativisticE1Transition,
  calculateRelativisticE1Transition,
  evaluateRelativisticE1SelectionRules,
} from "@/physics/transitions";
import {
  compareNonRelativisticAndDiracSpectra,
  generateHydrogenLikeSpectrum,
} from "@/physics/spectroscopy";
import { createDefaultProviderRegistry } from "@/physics/providers/registry";
import { createExperimentDefinition } from "@/experiments/schema";
import { ExperimentRunner } from "@/experiments/execution/runner";
import { MemoryExperimentStore } from "@/experiments/persistence/store";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import { createExperimentWorkerRuntime, type WorkerLike } from "@/workers/protocol";
import { EXTENDED_CONSTANTS } from "@/physics/units";

function createInProcessWorker(): WorkerLike {
  const registry = createDefaultProviderRegistry();
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(msg: unknown) {
      queueMicrotask(() => runtime.receive(msg as never));
    },
    terminate() {},
  };
  const runtime = createExperimentWorkerRuntime(registry, (out) => {
    worker.onmessage?.({ data: out });
  });
  return worker;
}

describe("Phase 6 — Wigner 3-j & 6-j Angular Coupling", () => {
  it("matches exact algebraic 3-j values and orthogonality sums", () => {
    expect(wigner3j(1, 1, 0, 0, 0, 0)).toBeCloseTo(-1 / Math.sqrt(3), 12);
    expect(wigner3j(0.5, 0.5, 1, 0.5, 0.5, -1)).toBeCloseTo(-1 / Math.sqrt(3), 12);
    expect(wigner3j(1, 1, 3, 0, 0, 0)).toBe(0); // triangle violation

    // Orthogonality sum for j1 = 3/2, j2 = 1 -> j3, j3' in {1/2, 3/2, 5/2}
    const j1 = 1.5;
    const j2 = 1;
    for (const j3 of [0.5, 1.5, 2.5]) {
      for (const j3p of [0.5, 1.5, 2.5]) {
        const m3 = 0.5;
        let sum = 0;
        for (let m1 = -j1; m1 <= j1; m1 += 1) {
          for (let m2 = -j2; m2 <= j2; m2 += 1) {
            sum += (2 * j3 + 1) * wigner3j(j1, j2, j3, m1, m2, m3) * wigner3j(j1, j2, j3p, m1, m2, m3);
          }
        }
        expect(sum).toBeCloseTo(j3 === j3p ? 1 : 0, 11);
      }
    }
  });

  it("satisfies Wigner 6-j orthogonality for spin-orbit coupling", () => {
    const j1 = 1;
    const j2 = 1;
    const j4 = 0.5;
    const j5 = 1.5;
    // Triangle (j4=1/2, j2=1, j6) limits j6 to {1/2, 3/2}
    expect(wigner6j(j1, j2, 1, j4, j5, 2.5)).toBe(0);
    const j6List = [0.5, 1.5];
    for (const j6 of j6List) {
      for (const j6p of j6List) {
        let sum = 0;
        for (const x of [0, 1, 2]) {
          sum += (2 * x + 1) * (2 * j6 + 1) * wigner6j(j1, j2, x, j4, j5, j6) * wigner6j(j1, j2, x, j4, j5, j6p);
        }
        expect(sum).toBeCloseTo(j6 === j6p ? 1 : 0, 11);
      }
    }
  });
});

describe("Phase 6 — Nonrelativistic E1 Transitions", () => {
  const h1Finite = createAtomicSystem({
    Z: 1,
    N: 1,
    nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1)),
  });
  const hInf = createAtomicSystem({ Z: 1, N: 1 });

  it("enforces Delta l = +-1 and spin-conservation selection rules", () => {
    const s1 = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 });
    const s2 = createNonRelativisticState({ n: 2, l: 0, m_l: 0, m_s: 0.5 });
    const d3 = createNonRelativisticState({ n: 3, l: 2, m_l: 0, m_s: 0.5 });
    const p2Flip = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: -0.5 });

    const rSS = calculateNonRelativisticE1Transition(hInf, s1, s2);
    expect(rSS.selectionRule.allowed).toBe(false);
    expect(rSS.totalDipoleSquared_e2a02).toBe(0);
    expect(rSS.einsteinA_s1).toBe(0);

    const rSD = calculateNonRelativisticE1Transition(hInf, s1, d3);
    expect(rSD.selectionRule.allowed).toBe(false);
    expect(rSD.oscillatorStrength).toBe(0);

    const rSpinFlip = calculateNonRelativisticE1Transition(hInf, s1, p2Flip);
    expect(rSpinFlip.selectionRule.allowed).toBe(false);
    expect(rSpinFlip.selectionRule.spinConserved).toBe(false);
    expect(rSpinFlip.totalDipoleSquared_e2a02).toBe(0);
  });

  it("matches Gordon analytical dipole, oscillator strength, and Einstein A for Lyman-alpha", () => {
    const s1 = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 });
    const p2 = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 });

    // Infinite-mass Gordon formula: <2p|r|1s> = 128 * sqrt(6) / 243 a0
    const gordon = (128 * Math.sqrt(6)) / 243;
    const infRes = calculateNonRelativisticE1Transition(hInf, s1, p2);
    expect(infRes.selectionRule.allowed).toBe(true);
    expect(infRes.radialMatrixElement_a0).toBeCloseTo(gordon, 6);
    expect(infRes.oscillatorStrength).toBeCloseTo(0.4161967, 5);
    expect(infRes.isEmission).toBe(false);

    // 1H finite nuclear mass emission 2p -> 1s
    const h1Emit = calculateNonRelativisticE1Transition(h1Finite, p2, s1);
    expect(h1Emit.isEmission).toBe(true);
    expect(h1Emit.wavelength_nm!).toBeCloseTo(121.5684, 3);
    expect(h1Emit.einsteinA_s1).toBeCloseTo(6.2649e8, -5); // within 1e5 of 6.2649e8 s^-1
  });

  it("scales hydrogen-like Einstein A as Z^4 and satisfies bound TRK oscillator bound", () => {
    const hePlus = createAtomicSystem({ Z: 2, N: 1 });
    const s1 = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 });
    const p2 = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 });
    const hRes = calculateNonRelativisticE1Transition(hInf, p2, s1);
    const heRes = calculateNonRelativisticE1Transition(hePlus, p2, s1);
    expect(heRes.einsteinA_s1 / hRes.einsteinA_s1).toBeCloseTo(16, 4); // 2^4 = 16

    // Discrete 1s -> np partial oscillator sum n=2..8 (~0.565, strictly < 1 due to continuum)
    let sumF = 0;
    for (let n = 2; n <= 8; n++) {
      const pn = createNonRelativisticState({ n, l: 1, m_l: 0, m_s: 0.5 });
      sumF += calculateNonRelativisticE1Transition(hInf, s1, pn).oscillatorStrength;
    }
    expect(sumF).toBeGreaterThan(0.5);
    expect(sumF).toBeLessThan(0.6);
  });
});

describe("Phase 6 — Relativistic Dirac E1 Transitions", () => {
  const h1 = createAtomicSystem({
    Z: 1,
    N: 1,
    nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1)),
  });

  it("enforces parity flip, Delta j = 0, +-1, and 0 -/-> 0 selection rules", () => {
    const s1 = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
    const s2 = createRelativisticState({ n: 2, kappa: -1, m_j: 0.5 });
    const d3_5half = createRelativisticState({ n: 3, kappa: -3, m_j: 2.5 });
    const p2_3half = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

    expect(evaluateRelativisticE1SelectionRules(s1, s2).allowed).toBe(false); // same parity
    expect(evaluateRelativisticE1SelectionRules(s1, d3_5half).allowed).toBe(false); // Delta j = 2
    expect(evaluateRelativisticE1SelectionRules(s1, p2_3half).allowed).toBe(true);

    // Explicitly check 0 -> 0 safeguard helper directly on degenerate mock j=0 payload
    const zeroCheck = evaluateRelativisticE1SelectionRules(
      { ...s1, j: 0, m_j: 0 },
      { ...p2_3half, j: 0, m_j: 0 },
    );
    expect(zeroCheck.zeroToZeroForbidden).toBe(true);
    expect(zeroCheck.allowed).toBe(false);
  });

  it("reproduces exact 1:2 doublet line-strength ratio for H Lyman-alpha and converges to NR limit as alpha -> 0", () => {
    const s1 = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
    const p2_half = createRelativisticState({ n: 2, kappa: 1, m_j: 0.5 });
    const p2_3half = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

    const rHalf = calculateRelativisticE1Transition(h1, s1, p2_half);
    const r3Half = calculateRelativisticE1Transition(h1, s1, p2_3half);

    expect(r3Half.reducedLineStrength_S / rHalf.reducedLineStrength_S).toBeCloseTo(2, 4);
    expect(r3Half.wavelength_nm!).toBeLessThan(rHalf.wavelength_nm!); // 2p3/2 lies higher -> shorter lambda
    expect(rHalf.einsteinA_s1).toBeCloseTo(6.2649e8, -5);
    expect(r3Half.einsteinA_s1).toBeCloseTo(6.2650e8, -5);

    // Nonrelativistic limit alpha -> alpha0 * 0.01 on Einstein A ratio
    const tinyAlpha = EXTENDED_CONSTANTS.alpha * 0.01;
    const hInf = createAtomicSystem({ Z: 1, N: 1 });
    const nrLya = calculateNonRelativisticE1Transition(
      hInf,
      createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5 }),
      createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 }),
    );
    const diracLowAlpha = calculateRelativisticE1Transition(hInf, p2_3half, s1, { alpha: tinyAlpha });
    // Note: Einstein A explicitly contains alpha^3, so compare reduced line strength S against NR max(l)*R^2*g/(2l+1)
    expect(diracLowAlpha.reducedLineStrength_S).toBeCloseTo((4 / 3) * nrLya.reducedDipoleSquared_e2a02, 5);
  });

  it("includes appreciable small-component QQ radial contribution at high Z", () => {
    const snPlus = createAtomicSystem({ Z: 50, N: 1 });
    const s1 = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
    const p2_3half = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });
    const resZ50 = calculateRelativisticE1Transition(snPlus, s1, p2_3half);
    expect(Math.abs(resZ50.radialSmallQQ_a0 / resZ50.radialLargePP_a0)).toBeGreaterThan(0.01);
  });
});

describe("Phase 6 — Dynamic Spectroscopy & Experiment Platform Integration", () => {
  const h1 = createAtomicSystem({
    Z: 1,
    N: 1,
    nuclearModel: createNuclearModelForIsotope("point-finite-mass", defaultIsotopeForZ(1)),
  });

  it("generates Lyman, Balmer, and Paschen series matching NIST 1H vacuum benchmarks", () => {
    for (const series of ["lyman", "balmer", "paschen"] as const) {
      const { nonrelativistic, relativistic } = compareNonRelativisticAndDiracSpectra(h1, {
        mode: "emission",
        series,
        maxUpperN: series === "lyman" ? 4 : 5,
      });

      expect(nonrelativistic.lines.length).toBeGreaterThan(0);
      expect(relativistic.lines.length).toBeGreaterThan(nonrelativistic.lines.length); // spin-orbit splitting
      for (const comp of relativistic.nistComparisons) {
        if (comp.deltaWavelength_nm !== null) {
          expect(Math.abs(comp.deltaWavelength_nm)).toBeLessThan(0.05);
        }
      }
    }

    // Wavelength range filter isolates H-alpha (~656.45 nm) and excludes H-beta (~486.26 nm)
    const filteredBalmer = generateHydrogenLikeSpectrum(h1, {
      model: "dirac-coulomb",
      mode: "absorption",
      series: "balmer",
      minWavelength_nm: 600,
      maxWavelength_nm: 700,
    });
    expect(filteredBalmer.lines.length).toBeGreaterThan(0);
    expect(filteredBalmer.lines.every((l) => l.wavelength_nm >= 600 && l.wavelength_nm <= 700)).toBe(true);
  });

  it("executes e1-transition and spectroscopy-series through Worker ExperimentRunner and rejects multi-electron systems", async () => {
    const registry = createDefaultProviderRegistry();
    const store = new MemoryExperimentStore();
    const workerClient = new ExperimentWorkerClient(() => createInProcessWorker());
    const runner = new ExperimentRunner({ providerRegistry: registry, store, workerClient });

    const s1 = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
    const p2 = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

    const trDef = createExperimentDefinition({
      kind: "e1-transition",
      title: "H 1s1/2 -> 2p3/2 Dirac E1",
      system: h1,
      quantumStates: [],
      transition: { initial: s1, final: p2 },
      providerId: "dirac-coulomb",
      providerVersion: "0.6.0",
      observables: ["e1-transitions"],
    });
    const trOut = await runner.run(trDef, { mode: "worker", persist: true }).completion;
    expect(trOut.execution.status).toBe("completed");
    expect((trOut.result?.payload as { einsteinA_s1: number }).einsteinA_s1).toBeCloseTo(6.265e8, -5);

    const specDef = createExperimentDefinition({
      kind: "spectroscopy-series",
      title: "H Lyman Dirac Spectrum",
      system: h1,
      quantumStates: [],
      providerId: "dirac-coulomb",
      providerVersion: "0.6.0",
      observables: ["spectroscopy"],
      modelParameters: { series: "lyman", mode: "emission", maxUpperN: 3 },
    });
    const specOut = await runner.run(specDef, { mode: "worker", persist: true }).completion;
    expect(specOut.execution.status).toBe("completed");
    expect((specOut.result?.payload as { lines: unknown[] }).lines.length).toBeGreaterThan(2);

    // Neutral He (N = 2) spectroscopy must fail honestly as unsupported
    const heDef = createExperimentDefinition({
      kind: "spectroscopy-series",
      title: "Invalid He Dirac Spectroscopy",
      system: createAtomicSystem({ Z: 2, N: 2 }),
      quantumStates: [],
      providerId: "dirac-coulomb",
      providerVersion: "0.6.0",
      observables: ["spectroscopy"],
    });
    const heOut = await runner.run(heDef, { mode: "worker" }).completion;
    expect(heOut.execution.status).toBe("unsupported");

    workerClient.dispose();
  });
});
