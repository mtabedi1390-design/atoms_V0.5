import { ELEMENTS, type ElementRecord } from "@/data/elements";
import type { AtomicSystem, IsotopeSpec, NuclearModel } from "@/domain/atomic";
import type { QuantumState } from "@/domain/quantum";
import type { ProviderAssessmentEntry } from "@/physics/providers/registry";
import type { LaboratoryConfig } from "@/app/useAtomsLaboratory";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly element: ElementRecord;
  readonly system: AtomicSystem;
  readonly activeState: QuantumState;
  readonly isotopes: readonly IsotopeSpec[];
  readonly activeIsotope: IsotopeSpec;
  readonly config: LaboratoryConfig;
  readonly assessments: readonly ProviderAssessmentEntry[];
  readonly onSelectZ: (Z: number) => void;
  readonly onPatchConfig: (patch: Partial<LaboratoryConfig>) => void;
  readonly onRunSingleExperiment: () => void;
}

const NUCLEAR_MODELS: ReadonlyArray<{
  readonly kind: NuclearModel["kind"];
  readonly label: string;
  readonly description: string;
  readonly solverSupported: boolean;
}> = [
  {
    kind: "point-infinite-mass",
    label: "Point nucleus (infinite mass)",
    description: "Fixed point Coulomb potential V(r) = −Ze²/(4πε₀r) with μ/mₑ = 1.",
    solverSupported: true,
  },
  {
    kind: "point-finite-mass",
    label: "Point nucleus (finite nuclear mass)",
    description: "Point Coulomb with bare-nuclear reduced mass μ = mₑ·M_nuc / (mₑ + M_nuc).",
    solverSupported: true,
  },
  {
    kind: "finite-uniform",
    label: "Finite uniform sphere",
    description: "Nuclear charge radius model only — NOT silently mapped to point Coulomb.",
    solverSupported: false,
  },
  {
    kind: "finite-fermi",
    label: "Finite Fermi (Woods–Saxon) distribution",
    description: "Nuclear charge radius model only — requires dedicated finite-nucleus radial solver.",
    solverSupported: false,
  },
];

export function AtomicSystemsWorkspace({
  element,
  system,
  activeState,
  isotopes,
  activeIsotope,
  config,
  assessments,
  onSelectZ,
  onPatchConfig,
  onRunSingleExperiment,
}: Props) {
  const chargeLabel =
    system.q === 0
      ? "neutral"
      : system.q > 0
        ? `cation (+${system.q})`
        : `anion (${system.q})`;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel title="Atom & Ion Specification (Z = 1..118, N >= 0)">
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Atomic number Z</span>
              <select
                aria-label="Atomic number selector"
                value={system.Z}
                onChange={(e) => onSelectZ(Number(e.target.value))}
                className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
              >
                {ELEMENTS.map((el) => (
                  <option key={el.Z} value={el.Z}>
                    {el.Z} — {el.symbol} ({el.name})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Electron count N (q = Z − N)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  aria-label="Electron count N"
                  min={0}
                  max={system.Z + 4}
                  value={config.electronCount}
                  onChange={(e) =>
                    onPatchConfig({ electronCount: Math.max(0, Math.min(system.Z + 4, Math.round(Number(e.target.value) || 0))) })
                  }
                  className="h-8 w-20 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => onPatchConfig({ electronCount: 1 })}
                  className="h-8 rounded-sm border border-zinc-700 px-2 text-[11px] text-amber-300 hover:bg-zinc-800"
                >
                  H-like (N=1)
                </button>
                <button
                  type="button"
                  onClick={() => onPatchConfig({ electronCount: system.Z })}
                  className="h-8 rounded-sm border border-zinc-700 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  Neutral (N=Z)
                </button>
              </div>
            </label>
          </div>
          <Row label="System ID">
            <span className="font-mono text-amber-300">{system.id}</span>
          </Row>
          <Row label="Species / Charge">
            {element.name} ({element.symbol}) · Z={system.Z}, N={system.N}, q={system.q > 0 ? `+${system.q}` : system.q} ({chargeLabel})
          </Row>
          <Row label="One-electron domain">
            {system.N === 1
              ? "Eligible for analytical Schrödinger & Dirac point-Coulomb solvers"
              : system.N === system.Z
                ? "Neutral multi-electron atom (exact total-density datasets where available)"
                : system.q < 0
                  ? "Negative ion: representable in domain; one-electron & neutral-atom solvers reject anions honestly"
                  : `Partially ionized multi-electron ion (N=${system.N}): requires general multi-electron solver`}
          </Row>
        </Panel>

        <Panel title="Isotope & Nuclear Mass Distinction">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {isotopes.map((iso) => {
              const active = iso.massNumber === activeIsotope.massNumber;
              return (
                <button
                  key={iso.massNumber}
                  type="button"
                  onClick={() => onPatchConfig({ massNumber: iso.massNumber })}
                  className={`rounded-sm border px-2 py-1 font-mono text-xs ${
                    active ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {iso.label}
                </button>
              );
            })}
          </div>
          <Row label="Bare nuclear mass m_nuc">{activeIsotope.nuclearMass_u.toFixed(9)} u</Row>
          <Row label="Neutral atomic mass m_atom">{activeIsotope.neutralAtomicMass_u.toFixed(9)} u</Row>
          <Row label="Mass source">{activeIsotope.source}</Row>
          <Row label="Active reduced-mass ratio μ / mₑ">
            <span className="font-mono text-emerald-300">{system.reducedMassRatio.toFixed(10)}</span>
          </Row>
          <p className="mt-1 text-[10px] text-zinc-500">
            Reduced-mass scaling strictly uses the bare nuclear mass m_nuc (never neutral atomic mass). Point-infinite-mass sets μ/mₑ = 1.
          </p>
        </Panel>

        <Panel title="Nuclear Charge Distribution Model">
          <div className="flex flex-col gap-1.5">
            {NUCLEAR_MODELS.map((nm) => {
              const selected = config.nuclearModelKind === nm.kind;
              return (
                <button
                  key={nm.kind}
                  type="button"
                  onClick={() => onPatchConfig({ nuclearModelKind: nm.kind })}
                  className={`flex flex-col items-start rounded-sm border p-2 text-left transition-colors ${
                    selected ? "border-amber-400 bg-zinc-900" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-100">{nm.label}</span>
                    <Badge kind={nm.solverSupported ? "exact" : "unavailable"}>
                      {nm.solverSupported ? "solver active" : "unsupported solver"}
                    </Badge>
                  </div>
                  <span className="mt-0.5 text-[11px] text-zinc-400">{nm.description}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title={`Physics Provider Compatibility Matrix (Active state: ${activeState.kind})`}>
          <p className="mb-2 text-[11px] text-zinc-400">
            Evaluated dynamically by <span className="font-mono text-zinc-200">PhysicsProviderRegistry.assessAll(system, state)</span>.
            Unsupported systems, non-point nuclear models, and unavailable external packages are blocked transparently.
          </p>
          <div className="flex flex-col gap-2">
            {assessments.map(({ provider, assessment }) => (
              <div
                key={provider.id}
                className={`rounded-sm border p-2.5 text-xs ${
                  assessment.supported ? "border-emerald-900/70 bg-emerald-950/15" : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-zinc-100">{provider.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-zinc-500">
                      {provider.id}@{provider.version}
                    </span>
                  </div>
                  <Badge kind={assessment.supported ? "evaluated" : "unavailable"}>
                    {assessment.supported ? "supported" : provider.available ? "unsupported" : "unavailable"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-zinc-300">{assessment.reasons.join(" ")}</p>
                {assessment.limitations.length > 0 && (
                  <p className="mt-1 text-[10px] text-zinc-500">Limits: {assessment.limitations[0]}</p>
                )}
                <div className="mt-1 font-mono text-[10px] text-zinc-500">
                  Capabilities: {provider.capabilities.join(", ")}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
            <span className="text-[11px] text-zinc-400">
              Submit current AtomicSystem &amp; QuantumState as a reproducible Worker experiment:
            </span>
            <button
              type="button"
              onClick={onRunSingleExperiment}
              className="rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Run State Experiment
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
