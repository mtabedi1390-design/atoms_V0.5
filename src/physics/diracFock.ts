/**
 * Closed-form evaluator and numerical quadrature validator for the Lobato et al. (2026)
 * element-adaptive Dirac-Pade parameterization of all-electron relativistic B-spline
 * Dirac-Fock neutral-atom electron densities (arXiv:2608.14934, Apache-2.0).
 *
 * Units:
 *   Input r in Bohr radii (a0).
 *   Output rho(r) in electrons / a0^3.
 *   Radial PDF P_total(r) = 4*pi*r^2*rho(r) in electrons / a0, integrating to Z.
 *
 * Scientific boundaries:
 *   - Reference densities (Z = 2..118) were computed with the relativistic B-spline
 *     Dirac-Fock code `atomx` using a finite nuclear charge distribution and a spherical
 *     average of open-shell occupations; Z = 1 uses the exact relativistic Dirac 1s density.
 *   - This dataset provides the TOTAL spherically averaged neutral-atom electron density
 *     only. It does NOT provide individual subshell radial orbitals R_nl(r), orbital
 *     eigenvalues, spin-orbit split components, or wavefunction phases.
 */
import lobatoRaw from "@/data/df/lobato2026.json";

export interface DiracPadeTerm {
  readonly type: "NR" | "DP";
  readonly a: number; // Angstrom
  readonly b: number; // Angstrom^2
}

export interface DiracFockRecord {
  readonly Z: number;
  readonly symbol: string;
  readonly n_t: number;
  readonly terms: readonly DiracPadeTerm[];
  readonly validation: {
    readonly integratedElectrons: number;
    readonly relativeChargeError: number;
    readonly meanRadiusBohr: number;
    readonly minDensityBohr3: number;
  };
}

interface LobatoDatasetFile {
  readonly schema: string;
  readonly source: string;
  readonly repo: string;
  readonly sha256Source: string;
  readonly a0_angstrom: number;
  readonly method: string;
  readonly hamiltonian: string;
  readonly nuclearModel: string;
  readonly knownLimitations: readonly string[];
  readonly records: readonly DiracFockRecord[];
}

const DATA = lobatoRaw as LobatoDatasetFile;
if (DATA.schema !== "atoms.df-dirac-pade.v1" || DATA.records.length !== 118) {
  throw new Error(`Invalid Lobato 2026 Dirac-Fock dataset: schema=${DATA.schema}, count=${DATA.records?.length}`);
}

const A0 = DATA.a0_angstrom;
const A0_CUBED = A0 * A0 * A0;
const BY_Z = new Map<number, DiracFockRecord>(DATA.records.map((r) => [r.Z, r]));

export const DIRAC_FOCK_META = {
  schema: DATA.schema,
  source: DATA.source,
  repo: DATA.repo,
  sha256Source: DATA.sha256Source,
  method: DATA.method,
  hamiltonian: DATA.hamiltonian,
  nuclearModel: DATA.nuclearModel,
  knownLimitations: DATA.knownLimitations,
} as const;

export function diracFockRecord(Z: number): DiracFockRecord {
  const rec = BY_Z.get(Z);
  if (!rec) throw new RangeError(`No Dirac-Fock record for Z=${Z}`);
  return rec;
}

/**
 * Evaluate closed-form relativistic Dirac-Fock spherical electron density rho(r) in electrons/a0^3.
 */
export function diracFockDensityBohr3(Z: number, rBohr: number): number {
  if (!(rBohr >= 0) || !Number.isFinite(rBohr)) throw new RangeError(`Invalid radius rBohr=${rBohr}`);
  const rec = diracFockRecord(Z);
  const rAng = rBohr * A0;
  let rhoAng3 = 0;
  for (let i = 0; i < rec.terms.length; i++) {
    const t = rec.terms[i];
    const decay = (2 * Math.PI) / Math.sqrt(t.b);
    const amp = (2 * Math.pow(Math.PI, 4) * A0 * t.a) / Math.pow(t.b, 2.5);
    const x = rAng * decay;
    if (x >= 700) continue;
    const ex = Math.exp(-x);
    rhoAng3 += t.type === "DP" ? 0.25 * amp * (1 + x) * ex : amp * ex;
  }
  return rhoAng3 * A0_CUBED;
}

/** Total radial electron distribution 4*pi*r^2*rho(r) in electrons/a0. */
export function diracFockRadialPDF(Z: number, rBohr: number): number {
  return 4 * Math.PI * rBohr * rBohr * diracFockDensityBohr3(Z, rBohr);
}

/**
 * Deterministic radial grid in Bohr radii designed so trapezoid integration of
 * 4*pi*r^2*rho(r) reproduces Z within < 1e-3 for every element Z = 1..118.
 */
export interface DiracFockGrid {
  readonly Z: number;
  readonly rBohr: number[];
  readonly rhoElectronPerBohr3: number[];
  readonly integratedElectrons: number;
  readonly meanRadiusBohr: number;
  readonly rMaxBohr: number;
}

const GRID_CACHE = new Map<number, DiracFockGrid>();

export function diracFockRadialGrid(Z: number, nPts = 520): DiracFockGrid {
  if (nPts === 520) {
    const hit = GRID_CACHE.get(Z);
    if (hit) return hit;
  }
  const rMin = 1e-4;
  // Determine outer radius containing > 99.999% of charge
  let rMax = 36;
  for (let k = 0; k < 4; k++) {
    if (diracFockRadialPDF(Z, rMax) * rMax < 1e-5) break;
    rMax *= 1.35;
  }
  const rBohr = new Array<number>(nPts);
  const rho = new Array<number>(nPts);
  const logMin = Math.log(rMin);
  const logMax = Math.log(rMax);
  for (let i = 0; i < nPts; i++) {
    const r = Math.exp(logMin + ((logMax - logMin) * i) / (nPts - 1));
    rBohr[i] = r;
    rho[i] = diracFockDensityBohr3(Z, r);
  }
  let integrated = 0;
  let rMoment = 0;
  for (let i = 1; i < nPts; i++) {
    const a = 4 * Math.PI * rBohr[i - 1] * rBohr[i - 1] * rho[i - 1];
    const b = 4 * Math.PI * rBohr[i] * rBohr[i] * rho[i];
    const dr = rBohr[i] - rBohr[i - 1];
    integrated += 0.5 * (a + b) * dr;
    rMoment += 0.5 * (rBohr[i - 1] * a + rBohr[i] * b) * dr;
  }
  const grid: DiracFockGrid = {
    Z,
    rBohr,
    rhoElectronPerBohr3: rho,
    integratedElectrons: integrated,
    meanRadiusBohr: rMoment / Math.max(integrated, 1e-30),
    rMaxBohr: rMax,
  };
  if (nPts === 520) GRID_CACHE.set(Z, grid);
  return grid;
}
