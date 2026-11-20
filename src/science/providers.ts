/**
 * Provider-based method selection.
 *
 * The browser path (Slater-screened hydrogenic shapes) and the offline PySCF
 * Hartree–Fock path are independent providers.  Selection is observable- and
 * accuracy-dependent; a provider that is not runnable reports `available: false`
 * with the exact blocker and is never silently substituted.
 */
import H from "@/data/hf/H.json";
import He from "@/data/hf/He.json";
import C from "@/data/hf/C.json";
import N from "@/data/hf/N.json";
import O from "@/data/hf/O.json";
import Ne from "@/data/hf/Ne.json";

export type Observable = "electron-density" | "total-energy" | "ionization-energy" | "fine-structure";
export type Accuracy = "interactive" | "quantitative" | "high";

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
  convergence?: string;
  limitations: readonly string[];
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
  /** Only present when the provider actually produced a dataset. */
  dataset?: HFDataset;
  metadata: EngineMetadata;
  validation: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] };
  reason: string;
}

export interface EngineProvider {
  readonly id: string;
  readonly label: string;
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
  version: "1.1.0",
  license: "project source (upstream has no license; maths re-implemented, see README)",
  method: "Slater-screened hydrogenic independent-electron estimate",
  hamiltonian: "one-electron Coulomb with Z_eff = Z − S (Slater 1930), 4π spherical average",
  correlation: "none",
  relativistic: "none",
  nuclearModel: "point nucleus",
  limitations: [
    "Not Hartree–Fock/DFT: no self-consistent field",
    "Not accurate for heavy elements (no relativistic contraction/spin–orbit)",
    "Configurations for Z ≥ 104 are theoretical predictions",
  ],
};

export const slaterProvider: EngineProvider = {
  id: "browser-slater",
  label: "Slater-screened hydrogenic (browser)",
  availability: { available: true },
  supports: (req) => req.observable === "electron-density" && (req.accuracy === "interactive" || !BY_Z.has(req.Z)),
  compute: (req) => ({
    providerId: "browser-slater",
    available: true,
    metadata: SLATER_META,
    validation: { passed: true, checks: [{ name: "QN/data validation", passed: true, detail: "browser tests cover 118-element integrity" }] },
    reason: `Interactive density for Z=${req.Z}: configuration-average independent-electron estimate.`,
  }),
};

export const pyscfHFProvider: EngineProvider = {
  id: "pyscf-hf",
  label: "PySCF RHF/ROHF radial density (offline, bundled)",
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
      dataset: d,
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
        convergence: `SCF converged in ${d.scf.cycles} cycles (tol ${d.scf.convergenceTol})`,
        limitations: d.knownLimitations,
      },
      validation: { passed: checks.every((c) => c.passed), checks },
      reason: `Bundled ${d.method}/${d.basis} spherical density for ${d.atom.symbol}; basis-set-limited HF (ΔE = ${d.basisError_hartree.toFixed(5)} Ha vs numerical HF limit).`,
    };
  },
};

export const graspProvider: EngineProvider = {
  id: "grasp-mcdhf",
  label: "GRASP2018 MCDHF / RCI (offline)",
  availability: {
    available: false,
    blocker: "GRASP2018 is not installed in this environment and its source is not bundled. MCDHF/RCI, Breit and QED corrections were therefore NOT run. Next step: install GRASP2018 on a Linux host, prepare a Cs-like case with a Fermi nucleus, and export radial orbitals in the atoms.hf-radial.v1 format.",
  },
  supports: () => false,
  compute: () => null,
};

export const PROVIDERS: readonly EngineProvider[] = [pyscfHFProvider, slaterProvider, graspProvider];

export interface Selection {
  provider: EngineProvider;
  result: ProviderResult | null;
  avoided: { id: string; reason: string }[];
}

/** Observable- and accuracy-dependent selection, with an auditable reason. */
export function selectProvider(request: ComputeRequest): Selection {
  const avoided: { id: string; reason: string }[] = [];
  const order: EngineProvider[] =
    request.accuracy === "interactive" ? [slaterProvider, pyscfHFProvider, graspProvider] : [pyscfHFProvider, graspProvider, slaterProvider];
  for (const p of order) {
    if (!p.availability.available) {
      avoided.push({ id: p.id, reason: p.availability.blocker ?? "unavailable" });
      continue;
    }
    if (!p.supports(request)) continue;
    const result = p.compute(request);
    if (result && result.validation.passed) return { provider: p, result, avoided };
    avoided.push({ id: p.id, reason: result ? "validation failed" : "does not support this request" });
  }
  // Last-resort honest answer: no provider, no fabricated number.
  return {
    provider: slaterProvider,
    result: null,
    avoided: [...avoided, { id: "browser-slater", reason: `no provider produced a validated result for ${request.observable} at ${request.accuracy} accuracy` }],
  };
}
