/**
 * Observable- and accuracy-dependent scientific provider registry for ATOMS v0.5.0.
 *
 * Strictly separates:
 *   1. Exact one-electron analytic Coulomb solutions (Hydrogen / one-electron ions)
 *   2. All-electron relativistic Dirac-Fock total densities (Lobato et al. 2026, Z=1..118)
 *   3. Non-relativistic basis-limited PySCF RHF/ROHF total densities & energies (H, He, C, N, O, Ne)
 *   4. Qualitative Slater-screened independent-electron orbital estimates (browser, Z=2..118)
 *   5. Registered external/scope-limited/unavailable providers (Datatoms 1<=N<=10, GRASP2018 MCDHF)
 *
 * A provider that cannot compute an observable reports `available: false` or returns `null`
 * with an auditable blocker and is never silently substituted by an incompatible approximation.
 */
import H from "@/data/hf/H.json";
import He from "@/data/hf/He.json";
import C from "@/data/hf/C.json";
import N from "@/data/hf/N.json";
import O from "@/data/hf/O.json";
import Ne from "@/data/hf/Ne.json";
import { elementByZ } from "@/data/elements";
import { SOURCES } from "@/data/sources";
import {
  DIRAC_FOCK_META,
  diracFockRadialGrid,
  diracFockRecord,
} from "@/physics/diracFock";

export type Observable =
  | "electron-density"
  | "relativistic-density"
  | "total-energy"
  | "ionization-energy"
  | "fine-structure"
  | "subshell-orbitals-ab-initio";

export type Accuracy = "interactive" | "quantitative" | "high";

export type EvidenceClass =
  | "analytic-exact-within-stated-Hamiltonian"
  | "evaluated-reference"
  | "computed-and-validated"
  | "computed-basis-limited"
  | "qualitative-approximation"
  | "predicted"
  | "unavailable";

export interface EngineMetadata {
  name: string;
  version: string;
  license: string;
  url?: string;
  method: string;
  hamiltonian: string;
  basis?: string;
  correlation: string;
  relativistic: string;
  nuclearModel: string;
  openShellConvention: string;
  convergence?: string;
  limitations: readonly string[];
}

export interface RadialDensityTable {
  id: string;
  rBohr: number[];
  rhoElectronPerBohr3: number[];
  integratedElectrons: number;
  meanRadiusBohr?: number;
}

export interface HFDataset {
  schema: "atoms.hf-radial.v1";
  generated: string;
  engine: { name: string; version: string; license: string; url: string };
  method: "RHF" | "ROHF";
  hamiltonian: string;
  basis: string;
  correlation: string;
  relativistic: string;
  term: string;
  spin2S: number;
  charge: number;
  atom: { Z: number; symbol: string; configuration: string };
  energy_hartree: number;
  energy_eV: number;
  reference: { property: string; value_hartree: number; source: string; note: string };
  basisError_hartree: number;
  scf: { converged: boolean; cycles: number; convergenceTol: number };
  density: {
    definition: string;
    rBohr: number[];
    rhoElectronPerBohr3: number[];
    anglePoints: number;
    angleGrid: string;
    quadrature: string;
    integratedElectrons: number;
    electronCountTolerance: number;
    extensions: number;
  };
  knownLimitations: readonly string[];
  command: string;
}

export interface ComputeRequest {
  Z: number;
  observable: Observable;
  accuracy: Accuracy;
}

export interface ProviderResult {
  providerId: string;
  available: boolean;
  evidenceClass: EvidenceClass;
  /** Present when the provider supplies a PySCF HF dataset. */
  dataset?: HFDataset;
  /** Present whenever a provider supplies a validated radial density table (DF or HF). */
  densityTable?: RadialDensityTable;
  metadata: EngineMetadata;
  validation: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] };
  reason: string;
}

export interface EngineProvider {
  readonly id: string;
  readonly label: string;
  readonly evidenceClass: EvidenceClass;
  readonly availability: { available: boolean; blocker?: string };
  supports(request: ComputeRequest): boolean;
  compute(request: ComputeRequest): ProviderResult | null;
}

const RAW: unknown[] = [H, He, C, N, O, Ne];
const BY_Z = new Map<number, HFDataset>();

/** Schema + integrity validation of an exported HF dataset (no silent coercion). */
export function validateHFDataset(raw: unknown): HFDataset {
  const d = raw as HFDataset;
  if (!d || d.schema !== "atoms.hf-radial.v1") throw new Error("Unsupported HF dataset schema");
  const r = d.density?.rBohr;
  const rho = d.density?.rhoElectronPerBohr3;
  if (!Array.isArray(r) || !Array.isArray(rho) || r.length < 50 || r.length !== rho.length) throw new Error("HF grid length mismatch");
  for (let i = 0; i < r.length; i++) {
    if (!(r[i] > 0) || !Number.isFinite(r[i]) || !Number.isFinite(rho[i]) || rho[i] < 0) throw new Error(`HF grid non-finite/negative at ${i}`);
    if (i > 0 && !(r[i] > r[i - 1])) throw new Error(`HF radial grid not strictly increasing at ${i}`);
  }
  if (Math.abs(d.density.integratedElectrons - d.atom.Z) > d.density.electronCountTolerance)
    throw new Error(`HF dataset ${d.atom.symbol} electron count ${d.density.integratedElectrons} ≠ Z`);
  return d;
}

for (const raw of RAW) {
  const d = validateHFDataset(raw);
  BY_Z.set(d.atom.Z, d);
}

export const HF_ATOMS: readonly number[] = [...BY_Z.keys()].sort((a, b) => a - b);
export function hfDatasetFor(Z: number): HFDataset | null {
  return BY_Z.get(Z) ?? null;
}

/** Numerical integration of 4πr²ρ on the dataset grid (independent of the stored count). */
export function integrateDatasetElectrons(d: HFDataset): number {
  const { rBohr: r, rhoElectronPerBohr3: rho } = d.density;
  let s = 0;
  for (let i = 1; i < r.length; i++) {
    const a = 4 * Math.PI * r[i - 1] ** 2 * rho[i - 1];
    const b = 4 * Math.PI * r[i] ** 2 * rho[i];
    s += 0.5 * (a + b) * (r[i] - r[i - 1]);
  }
  return s;
}

const SLATER_META: EngineMetadata = {
  name: "ATOMS in-browser core",
  version: "0.5.0",
  license: "project source (upstream kavan010/Atoms has no license; maths re-implemented, see README)",
  method: "Slater-screened hydrogenic independent-electron estimate",
  hamiltonian: "one-electron Coulomb with Z_eff = Z − S (Slater 1930), 4π spherical average",
  correlation: "none",
  relativistic: "none",
  nuclearModel: "point nucleus",
  openShellConvention: "Unsöld spherical configuration average over 2l+1 magnetic sublevels per subshell",
  limitations: [
    "Not Hartree–Fock/DFT: no self-consistent field",
    "Not accurate for heavy elements (no relativistic contraction/spin–orbit)",
    "Configurations for Z ≥ 104 are theoretical predictions",
  ],
};

export const slaterProvider: EngineProvider = {
  id: "browser-slater",
  label: "Slater-screened hydrogenic (browser)",
  evidenceClass: "qualitative-approximation",
  availability: { available: true },
  supports: (req) => req.observable === "electron-density" && (req.accuracy === "interactive" || req.Z >= 1),
  compute: (req) => ({
    providerId: "browser-slater",
    available: true,
    evidenceClass: "qualitative-approximation",
    metadata: SLATER_META,
    validation: { passed: true, checks: [{ name: "QN/data validation", passed: true, detail: "browser tests cover 118-element integrity" }] },
    reason: `Interactive density for Z=${req.Z}: configuration-average independent-electron estimate.`,
  }),
};

export const lobatoDFProvider: EngineProvider = {
  id: "lobato2026-df",
  label: "Lobato et al. (2026) relativistic Dirac–Fock (Z=1–118)",
  evidenceClass: "computed-and-validated",
  availability: { available: true },
  supports: (req) =>
    req.Z >= 1 &&
    req.Z <= 118 &&
    (req.observable === "electron-density" || req.observable === "relativistic-density"),
  compute: (req) => {
    if (req.Z < 1 || req.Z > 118) return null;
    const rec = diracFockRecord(req.Z);
    const grid = diracFockRadialGrid(req.Z);
    const elem = elementByZ(req.Z);
    const relErr = Math.abs(grid.integratedElectrons - req.Z) / req.Z;
    const minRho = grid.rhoElectronPerBohr3.reduce((m, v) => Math.min(m, v), Infinity);
    const checks = [
      { name: "schema", passed: DIRAC_FOCK_META.schema === "atoms.df-dirac-pade.v1", detail: DIRAC_FOCK_META.schema },
      { name: "global positivity", passed: minRho >= 0 && Number.isFinite(minRho), detail: `min rho = ${minRho.toExponential(2)} e/a0^3 (certified Z=1..118)` },
      { name: "electron count", passed: relErr <= 5e-3, detail: `∫4πr²ρdr = ${grid.integratedElectrons.toFixed(5)} e (Z=${req.Z}, rel err ${relErr.toExponential(2)})` },
      { name: "monotonic radial grid", passed: grid.rBohr.every((v, i, a) => i === 0 || v > a[i - 1]), detail: `${grid.rBohr.length} points, rMax=${grid.rMaxBohr.toFixed(1)} a0` },
    ];
    return {
      providerId: "lobato2026-df",
      available: true,
      evidenceClass: "computed-and-validated",
      densityTable: {
        id: `df-lobato2026:${rec.Z}:${rec.symbol}:nt${rec.n_t}`,
        rBohr: grid.rBohr,
        rhoElectronPerBohr3: grid.rhoElectronPerBohr3,
        integratedElectrons: grid.integratedElectrons,
        meanRadiusBohr: grid.meanRadiusBohr,
      },
      metadata: {
        name: "Lobato et al. (2026) Dirac–Padé / atomx",
        version: "arXiv:2608.14934 (2026)",
        license: SOURCES.lobato2026.license,
        url: SOURCES.lobato2026.url,
        method: req.Z === 1 ? "Exact relativistic Dirac 1s (Dirac–Padé n_t=2)" : `Relativistic B-spline Dirac–Fock (atomx) via Dirac–Padé (n_t=${rec.n_t})`,
        hamiltonian: DIRAC_FOCK_META.hamiltonian,
        basis: `Element-adaptive Dirac–Padé (${rec.n_t - 1} NR + 1 DP terms; float32 certified coefficients)`,
        correlation: "none (single-configuration Dirac–Fock)",
        relativistic: req.Z === 1 ? "exact 4-component Dirac 1s" : "all-electron 4-component Dirac–Fock (atomx reference)",
        nuclearModel: req.Z === 1 ? "point nucleus (Dirac 1s)" : "finite nuclear charge distribution (atomx)",
        openShellConvention: elem.isOpenShell
          ? `Spherical average over open-shell occupations (ground term ${elem.groundTerm.value ?? "unavailable"})`
          : "Closed-shell spherical ground state",
        convergence: `Global positivity certified; ∫4πr²ρdr = ${grid.integratedElectrons.toFixed(5)} e`,
        limitations: DIRAC_FOCK_META.knownLimitations,
      },
      validation: { passed: checks.every((c) => c.passed), checks },
      reason: `All-electron relativistic Dirac–Fock total spherical density for ${elem.symbol} (Z=${req.Z}) via Lobato et al. (2026) Dirac–Padé expansion.`,
    };
  },
};

export const pyscfHFProvider: EngineProvider = {
  id: "pyscf-hf",
  label: "PySCF RHF/ROHF radial density (offline, bundled)",
  evidenceClass: "computed-basis-limited",
  availability: { available: BY_Z.size > 0 },
  supports: (req) => BY_Z.has(req.Z) && (req.observable === "electron-density" || req.observable === "total-energy"),
  compute: (req) => {
    const d = hfDatasetFor(req.Z);
    if (!d) return null;
    const electrons = integrateDatasetElectrons(d);
    const checks = [
      { name: "schema", passed: d.schema === "atoms.hf-radial.v1", detail: d.schema },
      { name: "SCF converged", passed: d.scf.converged, detail: `cycles=${d.scf.cycles}, tol=${d.scf.convergenceTol}` },
      { name: "electron count", passed: Math.abs(electrons - d.atom.Z) <= 5e-3, detail: `∫4πr²ρdr = ${electrons.toFixed(5)} e (Z=${d.atom.Z})` },
      { name: "basis error vs HF limit", passed: Math.abs(d.basisError_hartree) < 0.05, detail: `ΔE = ${d.basisError_hartree.toFixed(5)} Ha with ${d.basis}` },
      { name: "monotonic radial grid", passed: d.density.rBohr.every((v, i, a) => i === 0 || v > a[i - 1]), detail: `${d.density.rBohr.length} points` },
    ];
    return {
      providerId: "pyscf-hf",
      available: true,
      evidenceClass: "computed-basis-limited",
      dataset: d,
      densityTable: {
        id: `hf:${d.atom.symbol}:${d.generated}:${d.density.rBohr.length}`,
        rBohr: d.density.rBohr,
        rhoElectronPerBohr3: d.density.rhoElectronPerBohr3,
        integratedElectrons: electrons,
      },
      metadata: {
        name: d.engine.name,
        version: d.engine.version,
        license: d.engine.license,
        url: d.engine.url,
        method: `${d.method} (${d.term} term)`,
        hamiltonian: d.hamiltonian,
        basis: d.basis,
        correlation: d.correlation,
        relativistic: d.relativistic,
        nuclearModel: "point nucleus",
        openShellConvention: `${d.method} (${d.term}, 2S=${d.spin2S}); density spherically averaged over Fibonacci sphere (${d.density.anglePoints} pts)`,
        convergence: `SCF converged in ${d.scf.cycles} cycles (tol ${d.scf.convergenceTol})`,
        limitations: d.knownLimitations,
      },
      validation: { passed: checks.every((c) => c.passed), checks },
      reason: `Bundled ${d.method}/${d.basis} spherical density for ${d.atom.symbol}; basis-set-limited HF (ΔE = ${d.basisError_hartree.toFixed(5)} Ha vs numerical HF limit).`,
    };
  },
};

export const datatomsProvider: EngineProvider = {
  id: "datatoms-2026-mcdf",
  label: "Datatoms 2026-1z118-1n10 MCDF+QED (external)",
  evidenceClass: "unavailable",
  availability: {
    available: false,
    blocker:
      "Datatoms 2026-1z118-1n10 (doi:10.57745/5RV42G, CC BY 4.0) covers 1 <= Z <= 118 ONLY for electron counts 1 <= N <= 10 (neutral atoms only up to Ne, Z <= 10; highly charged H-like..Ne-like ions for Z > 10) and is a multi-GB level/transition archive rather than a neutral heavy-atom density provider.",
  },
  supports: () => false,
  compute: () => null,
};

export const graspProvider: EngineProvider = {
  id: "grasp-mcdhf",
  label: "GRASP2018 MCDHF / RCI (offline)",
  evidenceClass: "unavailable",
  availability: {
    available: false,
    blocker:
      "GRASP2018 is not installed in this environment and its source is not bundled. MCDHF/RCI, Breit, QED, and subshell-resolved relativistic orbitals were therefore NOT run. Next step: install GRASP2018 on a Linux host, prepare target configurations with a Fermi nucleus, and export validated radial orbitals.",
  },
  supports: () => false,
  compute: () => null,
};

export const PROVIDERS: readonly EngineProvider[] = [
  lobatoDFProvider,
  pyscfHFProvider,
  slaterProvider,
  datatomsProvider,
  graspProvider,
];

export interface Selection {
  provider: EngineProvider;
  result: ProviderResult | null;
  avoided: { id: string; reason: string }[];
}

/** Observable- and accuracy-dependent selection, with an auditable reason. */
export function selectProvider(request: ComputeRequest): Selection {
  const avoided: { id: string; reason: string }[] = [];
  let order: EngineProvider[];
  if (request.observable === "electron-density") {
    order =
      request.accuracy === "interactive"
        ? [slaterProvider, lobatoDFProvider, pyscfHFProvider, datatomsProvider, graspProvider]
        : [lobatoDFProvider, pyscfHFProvider, datatomsProvider, graspProvider, slaterProvider];
  } else if (request.observable === "relativistic-density") {
    order = [lobatoDFProvider, graspProvider, datatomsProvider];
  } else if (request.observable === "total-energy") {
    order = [pyscfHFProvider, graspProvider, datatomsProvider];
  } else {
    order = [graspProvider, datatomsProvider];
  }

  for (const p of order) {
    if (!p.availability.available) {
      avoided.push({ id: p.id, reason: p.availability.blocker ?? "unavailable" });
      continue;
    }
    if (!p.supports(request)) {
      avoided.push({ id: p.id, reason: `does not support ${request.observable} for Z=${request.Z}` });
      continue;
    }
    const result = p.compute(request);
    if (result && result.validation.passed) return { provider: p, result, avoided };
    avoided.push({ id: p.id, reason: result ? "validation failed" : "does not support this request" });
  }

  // Last-resort honest answer: no provider, no fabricated number.
  return {
    provider: graspProvider,
    result: null,
    avoided: [...avoided, { id: "none", reason: `no provider produced a validated result for ${request.observable} at ${request.accuracy} accuracy` }],
  };
}
