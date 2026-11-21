/**
 * Dirac 4-component Spinor Importance Sampler (ATOMS v0.6.0 Phase 5).
 *
 * Samples 3D positions strictly from:
 *  - Exact radial PDF P_rad(r) = |P_{n,kappa}(r)|^2 + |Q_{n,kappa}(r)|^2
 *  - Exact spin-angular PDF |Omega_{kappa,m_j}(theta)|^2 sin(theta)
 *  - Azimuthal symmetry in phi (exact for pure (kappa, m_j) spinor eigenstates)
 *
 * Evaluates exact total spinor density Psi^dagger Psi, large/small component
 * densities, and phase at every sample. Never treats P and Q as independent orbitals.
 */
import { lFromKappa, type RelativisticState } from "@/domain/quantum";
import { diracRadialPQ, evaluateDiracSpinor, spinAngularOmega } from "@/physics/providers/dirac";
import { buildCdf, sampleFromCdf, Xoshiro128 } from "./sampler";

export interface DiracSamplingParams {
  readonly state: RelativisticState;
  readonly Z: number;
  readonly reducedMassRatio: number;
  readonly count: number;
  readonly seed: number;
  readonly componentView: "total" | "large" | "small";
}

export interface DiracSampleResult {
  readonly positionsBohr: Float32Array;
  readonly density: Float32Array;
  readonly phase: Float32Array;
  readonly maxDensity: number;
  readonly rMaxBohr: number;
  readonly radialIntegral: number;
}

export function sampleDiracSpinorCloud(params: DiracSamplingParams): DiracSampleResult {
  const { state, Z, reducedMassRatio, count, seed, componentView } = params;
  const aScale = 1 / reducedMassRatio;
  const l = lFromKappa(state.kappa);
  const rMax = Math.max(((3 * state.n * state.n - l * (l + 1)) * aScale) / (2 * Z) * 5, (10 * state.n * aScale) / Z);

  const radialTable = buildCdf(
    (r) => {
      if (r <= 0) return 0;
      const { P, Q } = diracRadialPQ(state.n, state.kappa, r, Z, reducedMassRatio);
      if (componentView === "large") return P * P;
      if (componentView === "small") return Q * Q;
      return P * P + Q * Q;
    },
    0,
    rMax,
    4096,
  );

  const thetaTable = buildCdf(
    (theta) => {
      const om = spinAngularOmega(componentView === "small" ? -state.kappa : state.kappa, state.m_j, theta, 0);
      const dens = om[0].re ** 2 + om[0].im ** 2 + om[1].re ** 2 + om[1].im ** 2;
      return dens * Math.sin(theta);
    },
    0,
    Math.PI,
    1024,
  );

  const rng = new Xoshiro128(seed);
  const positionsBohr = new Float32Array(count * 3);
  const density = new Float32Array(count);
  const phase = new Float32Array(count);
  let maxDensity = 0;

  for (let i = 0; i < count; i++) {
    const r = Math.max(1e-6, sampleFromCdf(radialTable, rng.next()));
    const theta = sampleFromCdf(thetaTable, rng.next());
    const phi = 2 * Math.PI * rng.next();
    const st = Math.sin(theta);

    positionsBohr[3 * i] = r * st * Math.cos(phi);
    positionsBohr[3 * i + 1] = r * st * Math.sin(phi);
    positionsBohr[3 * i + 2] = r * Math.cos(theta);

    const sp = evaluateDiracSpinor(state, Z, reducedMassRatio, r, theta, phi);
    const d =
      componentView === "large"
        ? sp.largeDensity
        : componentView === "small"
          ? sp.smallDensity
          : sp.density;
    density[i] = d;
    phase[i] = Math.atan2(sp.components[0].im, sp.components[0].re);
    if (d > maxDensity) maxDensity = d;
  }

  return {
    positionsBohr,
    density,
    phase,
    maxDensity,
    rMaxBohr: rMax,
    radialIntegral: radialTable.rawMass,
  };
}
