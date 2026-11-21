/**
 * Pure CPU compute microbenchmarks for ATOMS v0.6.0 physics & numerics.
 * Runs via `npx tsx scripts/bench_compute.ts` and prints JSON summary on stdout.
 */
import { createAtomicSystem } from "../src/domain/atomic";
import { createNonRelativisticState, createRelativisticState } from "../src/domain/quantum";
import { evaluateSchrodingerState } from "../src/physics/providers/schrodinger";
import { evaluateDiracSpinor, integrateDiracExpectationValues } from "../src/physics/providers/dirac";
import { calculateNonRelativisticE1Transition } from "../src/physics/transitions/nonrelativisticE1";
import { calculateRelativisticE1Transition } from "../src/physics/transitions/relativisticE1";
import { extractStateIsosurface } from "../src/numerics/isosurface/marchingTetrahedra";
import { SamplerCache, sampleOrbital } from "../src/sampling/sampler";
import { sampleDiracSpinorCloud } from "../src/sampling/diracSampler";

function bench(name: string, iterations: number, fn: () => void) {
  // Warmup
  for (let i = 0; i < Math.min(3, iterations); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - t0;
  return {
    name,
    iterations,
    totalMs: Number(totalMs.toFixed(2)),
    meanMs: Number((totalMs / iterations).toFixed(4)),
  };
}

const H = createAtomicSystem({ Z: 1, N: 1 });
const nr1s = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5, basis: "real" });
const nr2p = createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5, basis: "real" });
const nr3d = createNonRelativisticState({ n: 3, l: 2, m_l: 1, m_s: 0.5, basis: "real" });
const d1s = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
const d2p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 0.5 });

const results = [
  bench("Schrödinger ψ_3d evaluation (10,000 points)", 10, () => {
    for (let i = 0; i < 10000; i++) {
      evaluateSchrodingerState(nr3d, 1, H.reducedMassRatio, 1.5 + (i % 100) * 0.1, 1.1, 0.7);
    }
  }),
  bench("Dirac 4-spinor Ψ_2p3/2 evaluation (10,000 points)", 10, () => {
    for (let i = 0; i < 10000; i++) {
      evaluateDiracSpinor(d2p32, 79, 1, 0.1 + (i % 100) * 0.02, 1.1, 0.7);
    }
  }),
  bench("Dirac radial expectation quadrature (N_grid = 2,000, Au78+)", 50, () => {
    integrateDiracExpectationValues(2, -2, 79, 1, undefined, 2000);
  }),
  bench("NR E1 transition matrix element (2p -> 1s, 4,000 intervals)", 25, () => {
    calculateNonRelativisticE1Transition(H, nr2p, nr1s, { quadratureIntervals: 4000 });
  }),
  bench("Dirac E1 transition matrix element (2p_3/2 -> 1s_1/2, 4,000 intervals)", 25, () => {
    calculateRelativisticE1Transition(H, d2p32, d1s, { quadratureIntervals: 4000 });
  }),
  bench("Marching Tetrahedra isosurface (3d real, 24^3 grid)", 5, () => {
    extractStateIsosurface(nr3d, 1, H.reducedMassRatio, {
      resolution: 24,
      extentBohr: 22,
      isoFraction: 0.25,
      quantity: "wavefunction-signed",
    });
  }),
  bench("Marching Tetrahedra isosurface (Dirac 2p_3/2, 32^3 grid)", 3, () => {
    extractStateIsosurface(d2p32, 1, H.reducedMassRatio, {
      resolution: 32,
      extentBohr: 14,
      isoFraction: 0.25,
      quantity: "dirac-total-density",
    });
  }),
  bench("Schrödinger Monte Carlo sampling (50,000 pts)", 3, () => {
    const cache = new SamplerCache();
    sampleOrbital({
      n: 3,
      l: 2,
      m: 0,
      zeff: 1,
      basis: "real",
      count: 50000,
      seed: 1337,
      modelId: "hydrogenic-exact",
      mix: "single",
    }, cache);
  }),
  bench("Dirac 4-spinor Monte Carlo sampling (50,000 pts)", 3, () => {
    sampleDiracSpinorCloud({
      state: d2p32,
      Z: 79,
      reducedMassRatio: 1,
      count: 50000,
      seed: 1337,
      componentView: "total",
    });
  }),
];

console.log(JSON.stringify(results));
