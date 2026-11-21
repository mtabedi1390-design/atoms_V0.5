import { useEffect, useMemo, useState } from "react";
import { ELEMENTS } from "@/data/elements";
import type { ExperimentExecution, ExperimentResultRecord } from "@/experiments/schema";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import {
  formatSubshellConfiguration,
  HF_BASIS_CATALOG,
  isBasisSupportedForZ,
  lookupHFBenchmark,
  proposeAufbauConfiguration,
  proposeDefaultConfiguration,
  validateMethodForSpin,
  validateSubshellOccupations,
  type HFBasisId,
  type HFCalculationResponse,
  type HFCapabilitiesResponse,
  type HFDiisMode,
  type HFInitGuess,
  type HFMethod,
  type HFOccupationMode,
  type HFVolumeQuantity,
  type SubshellOccupation,
} from "@/physics/hf";
import type { HFWorkbenchOverlay } from "@/app/useAtomsLaboratory";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly initialZ: number;
  readonly capabilities: HFCapabilitiesResponse | null;
  readonly probing: boolean;
  readonly executions: readonly ExperimentExecution[];
  readonly selectedResult: ExperimentResultRecord | null;
  readonly activeOverlay: HFWorkbenchOverlay | null;
  readonly onRefreshCapabilities: () => void;
  readonly onCancelExecution: (executionId: string) => void;
  readonly onRunHF: (params: {
    readonly Z: number;
    readonly N: number;
    readonly spin2S: number;
    readonly method: HFMethod;
    readonly basis: HFBasisId;
    readonly occupationMode: HFOccupationMode;
    readonly subshellOccupations: readonly SubshellOccupation[];
    readonly useSymmetry: boolean;
    readonly scfOptions: {
      readonly convTol: number;
      readonly maxCycle: number;
      readonly initGuess: HFInitGuess;
      readonly diis: HFDiisMode;
      readonly damp: number;
      readonly levelShift: number;
      readonly runStability: boolean;
    };
    readonly volumeGrid?: {
      readonly enabled: boolean;
      readonly gridN: number;
      readonly extentBohr: number;
      readonly quantity: HFVolumeQuantity;
      readonly orbitalIndex: number;
      readonly spinChannel: "alpha" | "beta";
    };
  }) => Promise<unknown>;
  readonly onProjectToWorkbench: (overlay: HFWorkbenchOverlay) => void;
  readonly onClearWorkbenchOverlay: () => void;
}

const METHOD_CARDS: readonly {
  readonly id: HFMethod;
  readonly label: string;
  readonly summary: string;
}[] = [
  { id: "rhf", label: "RHF", summary: "Closed-shell spin-restricted singlet (2S = 0 only)" },
  { id: "uhf", label: "UHF", summary: "Unrestricted α/β spatial orbitals + spin density" },
  { id: "rohf", label: "ROHF", summary: "Restricted open-shell Roothaan effective Fock" },
  { id: "atom-sph-avg", label: "AtomSphAvg", summary: "PySCF AtomSphAverageRHF (spherical fractional avg)" },
];

export function HartreeFockWorkspace({
  initialZ,
  capabilities,
  probing,
  executions,
  selectedResult,
  activeOverlay,
  onRefreshCapabilities,
  onCancelExecution,
  onRunHF,
  onProjectToWorkbench,
  onClearWorkbenchOverlay,
}: Props) {
  const [Z, setZ] = useState(initialZ);
  const [N, setN] = useState(initialZ);
  const [occupationMode, setOccupationMode] = useState<HFOccupationMode>("curated-ground");
  const initialDefault = useMemo(() => proposeDefaultConfiguration(initialZ, initialZ), [initialZ]);
  const [spin2S, setSpin2S] = useState(initialDefault.spin2S);
  const [subshells, setSubshells] = useState<readonly SubshellOccupation[]>(initialDefault.subshells);
  const [method, setMethod] = useState<HFMethod>(initialDefault.spin2S === 0 ? "rhf" : "uhf");
  const [basis, setBasis] = useState<HFBasisId>("cc-pvdz");
  const [useSymmetry, setUseSymmetry] = useState(true);

  const [convTol, setConvTol] = useState(1e-9);
  const [maxCycle, setMaxCycle] = useState(80);
  const [initGuess, setInitGuess] = useState<HFInitGuess>("minao");
  const [diis, setDiis] = useState<HFDiisMode>("cdiis");
  const [damp, setDamp] = useState(0);
  const [levelShift, setLevelShift] = useState(0);
  const [runStability, setRunStability] = useState(false);

  const [volumeEnabled, setVolumeEnabled] = useState(true);
  const [volumeQuantity, setVolumeQuantity] = useState<HFVolumeQuantity>("mo-signed");
  const [volumeOrbitalIndex, setVolumeOrbitalIndex] = useState(0);
  const [volumeSpinChannel, setVolumeSpinChannel] = useState<"alpha" | "beta">("alpha");
  const [volumeGridN, setVolumeGridN] = useState(24);
  const [volumeExtentBohr, setVolumeExtentBohr] = useState(8);

  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const applyPresetConfig = (nextZ: number, nextN: number, mode: "curated-ground" | "aufbau") => {
    const proposed =
      mode === "aufbau" || nextN !== nextZ
        ? proposeAufbauConfiguration(nextN)
        : proposeDefaultConfiguration(nextZ, nextN);
    setSubshells(proposed.subshells);
    setSpin2S(proposed.spin2S);
    setMethod((prev) => {
      if (proposed.spin2S !== 0 && prev === "rhf") return "uhf";
      if (proposed.spin2S === 0 && prev === "uhf") return "rhf";
      return prev;
    });
  };

  useEffect(() => {
    setZ(initialZ);
    setN(initialZ);
    setOccupationMode("curated-ground");
    applyPresetConfig(initialZ, initialZ, "curated-ground");
  }, [initialZ]);

  const elementMeta = useMemo(() => ELEMENTS.find((e) => e.Z === Z) ?? ELEMENTS[0], [Z]);
  const basisMeta = useMemo(() => HF_BASIS_CATALOG.find((b) => b.id === basis) ?? HF_BASIS_CATALOG[0], [basis]);
  const basisSupport = useMemo(() => isBasisSupportedForZ(basis, Z, capabilities), [basis, Z, capabilities]);

  const occValidation = useMemo(
    () => validateSubshellOccupations(N, spin2S, subshells),
    [N, spin2S, subshells],
  );
  const methodValidation = useMemo(() => validateMethodForSpin(method, spin2S), [method, spin2S]);
  const benchmark = useMemo(() => lookupHFBenchmark(Z, N, spin2S), [Z, N, spin2S]);

  const activeHFExec = useMemo(
    () =>
      executions.find(
        (ex) =>
          (ex.status === "running" || ex.status === "queued") &&
          ex.executionId,
      ) ?? null,
    [executions],
  );

  const latestFailedExec = useMemo(() => {
    if (executions.length === 0) return null;
    const top = executions[0];
    return top.status === "failed" || top.status === "unsupported" ? top : null;
  }, [executions]);

  const hfResultRecord = useMemo(() => {
    if (!selectedResult) return null;
    if (selectedResult.providerId !== "pyscf-hf-live") return null;
    return selectedResult;
  }, [selectedResult]);

  const hfPayload = (hfResultRecord?.payload ?? null) as HFCalculationResponse | null;
  const backendAvailable = capabilities?.available === true;
  const canRun =
    backendAvailable &&
    basisSupport.supported &&
    occValidation.valid &&
    methodValidation.valid &&
    !submitting;

  const handleRun = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      await onRunHF({
        Z,
        N,
        spin2S,
        method,
        basis,
        occupationMode,
        subshellOccupations: subshells,
        useSymmetry,
        scfOptions: {
          convTol,
          maxCycle,
          initGuess,
          diis,
          damp,
          levelShift,
          runStability,
        },
        volumeGrid: volumeEnabled
          ? {
              enabled: true,
              gridN: volumeGridN,
              extentBohr: volumeExtentBohr,
              quantity: volumeQuantity,
              orbitalIndex: volumeOrbitalIndex,
              spinChannel: volumeSpinChannel,
            }
          : undefined,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const updateSubshellCell = (idx: number, field: "alpha" | "beta", val: number) => {
    setOccupationMode("custom");
    const next = subshells.map((s, i) => {
      if (i !== idx) return s;
      const cap = 2 * s.l + 1;
      const clamped = Math.max(0, Math.min(cap, Math.round(val) || 0));
      return { ...s, [field]: clamped };
    });
    setSubshells(next);
    const totalA = next.reduce((acc, s) => acc + s.alpha, 0);
    const totalB = next.reduce((acc, s) => acc + s.beta, 0);
    const nextN = totalA + totalB;
    const next2S = Math.abs(totalA - totalB);
    setN(nextN);
    setSpin2S(next2S);
    if (next2S !== 0 && method === "rhf") {
      setMethod("uhf");
    }
  };

  const addNextVirtualSubshell = () => {
    setOccupationMode("custom");
    const existing = new Set(subshells.map((s) => `${s.n}:${s.l}`));
    const candidates: [number, number][] = [
      [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1],
    ];
    for (const [n, l] of candidates) {
      if (!existing.has(`${n}:${l}`)) {
        setSubshells([...subshells, { n, l, alpha: 0, beta: 0 }]);
        return;
      }
    }
  };

  const resultBenchmark = useMemo(() => {
    if (!hfPayload?.system) return null;
    return lookupHFBenchmark(hfPayload.system.Z, hfPayload.system.N, hfPayload.system.spin2S) ?? null;
  }, [hfPayload]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 xl:grid-cols-12">
      {/* Left Configuration Column */}
      <div className="flex flex-col gap-3 xl:col-span-5">
        <Panel title="Multi-Electron Hartree–Fock Solver Status">
          <div data-testid="hf-backend-status" className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge kind={backendAvailable ? "evaluated" : "unavailable"}>
                  {probing ? "probing..." : backendAvailable ? "PySCF active" : "backend offline"}
                </Badge>
                {backendAvailable && capabilities?.engine && (
                  <span className="font-mono text-[11px] text-zinc-300">
                    PySCF {capabilities.engine.version} · BSE {capabilities.engine.bseVersion} · NumPy {capabilities.engine.numpyVersion}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onRefreshCapabilities}
                className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Re-probe
              </button>
            </div>
            {!backendAvailable && (
              <div className="rounded-sm border border-red-900/70 bg-red-950/25 p-2 text-[11px] text-red-200">
                <p className="font-semibold">Live Multi-Electron Solver Unavailable</p>
                <p className="mt-0.5 text-red-300/90">
                  {capabilities?.blocker ?? "Probing local `/api/hf/capabilities` endpoint..."}
                </p>
                <p className="mt-1 font-mono text-[10px] text-zinc-400">
                  ATOMS never fabricates or simulates HF results offline. Start the Express+PySCF backend (`npm run dev` or `npm start`).
                </p>
              </div>
            )}
            {backendAvailable && capabilities?.engine && (
              <p className="text-[10px] text-zinc-500">
                Non-relativistic fixed point-infinite-mass Hamiltonian · libcint integrals ({capabilities.engine.license}) · BSE ({capabilities.engine.bseLicense}). Does NOT include electron correlation (MP2/CC) or Dirac–Fock relativity.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="1. Atom, Charge State & Spin Occupation">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Element (Z)</span>
              <select
                aria-label="HF Atomic number"
                data-testid="hf-select-z"
                value={Z}
                onChange={(e) => {
                  const nextZ = Number(e.target.value);
                  setZ(nextZ);
                  setN(nextZ);
                  setOccupationMode("curated-ground");
                  applyPresetConfig(nextZ, nextZ, "curated-ground");
                }}
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
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Electrons N</span>
              <input
                type="number"
                aria-label="HF Electron count N"
                data-testid="hf-input-n"
                min={1}
                max={Z + 4}
                value={N}
                onChange={(e) => {
                  const nextN = Math.max(1, Math.min(Z + 4, Math.round(Number(e.target.value) || 1)));
                  setN(nextN);
                  const mode = nextN === Z ? "curated-ground" : "aufbau";
                  setOccupationMode(mode);
                  applyPresetConfig(Z, nextN, mode);
                }}
                className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
              />
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Spin Excess 2S (N_α − N_β)</span>
              <input
                type="number"
                aria-label="HF Spin 2S"
                data-testid="hf-input-2s"
                min={0}
                max={N}
                step={1}
                value={spin2S}
                onChange={(e) => {
                  const next2S = Math.max(0, Math.min(N, Math.round(Number(e.target.value) || 0)));
                  setSpin2S(next2S);
                  if (next2S !== 0 && method === "rhf") setMethod("uhf");
                }}
                className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Occupation Source</span>
              <select
                aria-label="HF Occupation Mode"
                data-testid="hf-occupation-mode"
                value={occupationMode}
                onChange={(e) => {
                  const m = e.target.value as HFOccupationMode;
                  setOccupationMode(m);
                  if (m === "curated-ground" || m === "aufbau") {
                    applyPresetConfig(Z, N, m);
                  }
                }}
                className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
              >
                <option value="curated-ground" disabled={N !== Z}>
                  Curated NIST Ground {N !== Z ? "(neutral only)" : ""}
                </option>
                <option value="aufbau">Aufbau + Hund Proposal</option>
                <option value="custom">User Custom Subshells</option>
              </select>
            </div>
          </div>

          <div className="mt-2 rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
            <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
              <span>
                Species: <strong className="text-zinc-200">{elementMeta.symbol}{Z - N === 0 ? "" : Z - N > 0 ? `+${Z - N}` : Z - N}</strong> (q={Z - N}, {formatSubshellConfiguration(subshells) || "empty"})
              </span>
              <button
                type="button"
                onClick={addNextVirtualSubshell}
                className="rounded-sm border border-zinc-700 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-zinc-800"
              >
                + Subshell
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-zinc-500">
              <span>Subshell</span>
              <span>Cap</span>
              <span>α spin</span>
              <span>β spin</span>
            </div>
            <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
              {subshells.map((s, idx) => (
                <div key={`${s.n}:${s.l}`} className="grid grid-cols-4 items-center gap-1 text-xs font-mono">
                  <span className="text-zinc-200">{s.n}{SUBSHELL_LETTERS[s.l] ?? `l${s.l}`}</span>
                  <span className="text-zinc-500">{2 * (2 * s.l + 1)}</span>
                  <input
                    type="number"
                    aria-label={`${s.n}${SUBSHELL_LETTERS[s.l]} alpha`}
                    min={0}
                    max={2 * s.l + 1}
                    value={s.alpha}
                    onChange={(e) => updateSubshellCell(idx, "alpha", Number(e.target.value))}
                    className="h-6 rounded-sm border border-zinc-700 bg-zinc-950 px-1 text-zinc-100"
                  />
                  <input
                    type="number"
                    aria-label={`${s.n}${SUBSHELL_LETTERS[s.l]} beta`}
                    min={0}
                    max={2 * s.l + 1}
                    value={s.beta}
                    onChange={(e) => updateSubshellCell(idx, "beta", Number(e.target.value))}
                    className="h-6 rounded-sm border border-zinc-700 bg-zinc-950 px-1 text-zinc-100"
                  />
                </div>
              ))}
            </div>
            {!occValidation.valid && (
              <p className="mt-1.5 text-[11px] text-red-400">
                {occValidation.issues.map((i) => i.message).join(" ")}
              </p>
            )}
          </div>
          {benchmark && (
            <p className="mt-1.5 text-[10px] text-emerald-300/90">
              Pinned independent benchmark available: {benchmark.speciesLabel} ({benchmark.term}) HF limit = {benchmark.hfLimit_Ha.toFixed(7)} Ha ({benchmark.source}).
            </p>
          )}
        </Panel>

        <Panel title="2. HF Formalism, Gaussian Basis & SCF Controls">
          <div className="grid grid-cols-2 gap-1.5">
            {METHOD_CARDS.map((mc) => {
              const disabledRHF = mc.id === "rhf" && spin2S !== 0;
              const selected = method === mc.id;
              return (
                <button
                  key={mc.id}
                  type="button"
                  data-testid={`hf-method-${mc.id}`}
                  disabled={disabledRHF}
                  title={disabledRHF ? "RHF requires closed-shell singlet (2S = 0)" : mc.summary}
                  onClick={() => setMethod(mc.id)}
                  className={`rounded-sm border p-1.5 text-left transition-colors ${
                    disabledRHF
                      ? "cursor-not-allowed border-zinc-800 bg-zinc-950 opacity-40"
                      : selected
                        ? "border-amber-400 bg-zinc-900"
                        : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-zinc-100">{mc.label}</span>
                    {disabledRHF && <span className="text-[9px] text-red-300">2S≠0</span>}
                  </div>
                  <p className="text-[10px] text-zinc-400">{mc.summary}</p>
                </button>
              );
            })}
          </div>
          {!methodValidation.valid && (
            <p className="mt-1 text-[11px] text-red-400">
              {methodValidation.issues.map((i) => i.message).join(" ")}
            </p>
          )}

          <div className="mt-2.5 flex flex-col gap-1 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Gaussian Basis Set (BSE v1)</span>
            <select
              aria-label="HF Gaussian Basis"
              data-testid="hf-select-basis"
              value={basis}
              onChange={(e) => setBasis(e.target.value as HFBasisId)}
              className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
            >
              {HF_BASIS_CATALOG.map((b) => {
                const ok = isBasisSupportedForZ(b.id, Z, capabilities).supported;
                return (
                  <option key={b.id} value={b.id}>
                    {b.label} — {b.family} {ok ? "✓" : `(no Z=${Z})`}
                  </option>
                );
              })}
            </select>
            {!basisSupport.supported ? (
              <p className="text-[11px] text-red-400">{basisSupport.reason}</p>
            ) : (
              <p className="text-[10px] text-zinc-500">{basisMeta.description}</p>
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">conv_tol (Ha)</span>
              <select
                value={convTol}
                onChange={(e) => setConvTol(Number(e.target.value))}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              >
                <option value={1e-6}>1e-6</option>
                <option value={1e-8}>1e-8</option>
                <option value={1e-9}>1e-9 (default)</option>
                <option value={1e-11}>1e-11 (tight)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">max_cycle</span>
              <input
                type="number"
                aria-label="SCF maxCycle"
                min={1}
                max={300}
                value={maxCycle}
                onChange={(e) => setMaxCycle(Math.max(1, Math.min(300, Math.round(Number(e.target.value) || 80))))}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">DIIS</span>
              <select
                value={diis}
                onChange={(e) => setDiis(e.target.value as HFDiisMode)}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              >
                <option value="cdiis">CDIIS</option>
                <option value="ediis">EDIIS</option>
                <option value="adiis">ADIIS</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">Initial Guess</span>
              <select
                value={initGuess}
                onChange={(e) => setInitGuess(e.target.value as HFInitGuess)}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              >
                <option value="minao">minao</option>
                <option value="1e">1e (core)</option>
                <option value="atom">atom</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">Damp</span>
              <input
                type="number"
                min={0}
                max={0.95}
                step={0.05}
                value={damp}
                onChange={(e) => setDamp(Math.max(0, Math.min(0.95, Number(e.target.value) || 0)))}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">Level Shift</span>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={levelShift}
                onChange={(e) => setLevelShift(Math.max(0, Math.min(2, Number(e.target.value) || 0)))}
                className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[11px]"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-300">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={useSymmetry} onChange={(e) => setUseSymmetry(e.target.checked)} />
              SO₃ Atomic Symmetry &amp; Subshell Mapping
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={runStability} onChange={(e) => setRunStability(e.target.checked)} />
              Stability Check
            </label>
          </div>

          <div className="mt-2.5 rounded-sm border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
            <label className="flex items-center justify-between text-[11px] font-medium text-zinc-200">
              <span className="flex items-center gap-1.5">
                <input type="checkbox" checked={volumeEnabled} onChange={(e) => setVolumeEnabled(e.target.checked)} />
                Evaluate 3D Volumetric Grid for Workbench / 2D Slice
              </span>
              <span className="font-mono text-[10px] text-zinc-500">{volumeGridN}³ pts</span>
            </label>
            {volumeEnabled && (
              <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11px]">
                <select
                  aria-label="HF 3D Quantity"
                  value={volumeQuantity}
                  onChange={(e) => setVolumeQuantity(e.target.value as HFVolumeQuantity)}
                  className="col-span-2 h-7 rounded-sm border border-zinc-700 bg-zinc-950 px-1.5 text-zinc-100"
                >
                  <option value="mo-signed">Signed MO ψᵢ(r)</option>
                  <option value="mo-density">MO Density |ψᵢ(r)|²</option>
                  <option value="total-density">Total ρ(r)</option>
                  <option value="spin-density">Spin ρ_α−ρ_β</option>
                </select>
                <label className="flex items-center gap-1 font-mono">
                  MO#
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={volumeOrbitalIndex}
                    onChange={(e) => setVolumeOrbitalIndex(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    className="h-7 w-12 rounded-sm border border-zinc-700 bg-zinc-950 px-1"
                  />
                </label>
                <select
                  value={volumeSpinChannel}
                  onChange={(e) => setVolumeSpinChannel(e.target.value as "alpha" | "beta")}
                  disabled={method !== "uhf"}
                  className="h-7 rounded-sm border border-zinc-700 bg-zinc-950 px-1 disabled:opacity-40"
                >
                  <option value="alpha">α</option>
                  <option value="beta">β</option>
                </select>
                <label className="col-span-2 flex items-center gap-1 text-[10px] text-zinc-400">
                  Grid N:
                  <select
                    value={volumeGridN}
                    onChange={(e) => setVolumeGridN(Number(e.target.value))}
                    className="h-6 rounded-sm border border-zinc-700 bg-zinc-950 px-1 font-mono"
                  >
                    <option value={20}>20³</option>
                    <option value={24}>24³</option>
                    <option value={28}>28³</option>
                    <option value={32}>32³</option>
                  </select>
                </label>
                <label className="col-span-2 flex items-center gap-1 text-[10px] text-zinc-400">
                  ±Extent (a₀):
                  <input
                    type="number"
                    min={3}
                    max={20}
                    step={1}
                    value={volumeExtentBohr}
                    onChange={(e) => setVolumeExtentBohr(Math.max(3, Math.min(20, Number(e.target.value) || 8)))}
                    className="h-6 w-12 rounded-sm border border-zinc-700 bg-zinc-950 px-1 font-mono"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="hf-run-btn"
              disabled={!canRun}
              onClick={handleRun}
              className="rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Running PySCF SCF..." : "Run Hartree–Fock SCF"}
            </button>
            {activeHFExec && (
              <button
                type="button"
                data-testid="hf-cancel-btn"
                onClick={() => onCancelExecution(activeHFExec.executionId)}
                className="rounded-sm border border-red-700 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950"
              >
                Cancel Running SCF
              </button>
            )}
            {activeOverlay && (
              <button
                type="button"
                onClick={onClearWorkbenchOverlay}
                className="rounded-sm border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Clear 3D HF Overlay
              </button>
            )}
          </div>

          {(localError || latestFailedExec?.error) && (
            <div data-testid="hf-error-banner" className="mt-2 rounded-sm border border-red-800 bg-red-950/30 p-2 text-xs text-red-300">
              {localError ?? `[${latestFailedExec?.error?.code}] ${latestFailedExec?.error?.message}`}
            </div>
          )}
        </Panel>
      </div>

      {/* Right Results Column */}
      <div className="flex flex-col gap-3 xl:col-span-7" data-testid="hf-results-panel">
        {!hfPayload || !hfPayload.energy || !hfPayload.scf ? (
          <Panel title="Hartree–Fock Results & Diagnostics">
            <p className="py-8 text-center text-xs text-zinc-500">
              Configure an atom or ion and click <span className="text-amber-300">Run Hartree–Fock SCF</span> (or replay a saved HF experiment from Experiment History) to inspect orbitals, electron/spin density, Coulomb &amp; exchange breakdown, and SCF convergence.
            </p>
          </Panel>
        ) : (
          <>
            <Panel title={`HF Result: ${hfPayload.system?.symbol ?? ""} (${hfPayload.method?.toUpperCase()} / ${hfPayload.basis})`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge kind={hfPayload.scf.converged ? "exact" : "unavailable"}>
                    {hfPayload.scf.converged
                      ? `Converged (${hfPayload.scf.cycles}/${hfPayload.scf.maxCycle} cycles)`
                      : "SCF NOT CONVERGED"}
                  </Badge>
                  <Badge kind={hfResultRecord?.source === "computed" ? "evaluated" : "estimate"}>
                    source: {hfResultRecord?.source ?? "computed"}
                  </Badge>
                  <span className="font-mono text-[10px] text-zinc-400">
                    sym={hfPayload.symmetryGroup} · N_AO={hfPayload.aoCount} · {hfPayload.basisSource}
                  </span>
                </div>
                {hfPayload.volumeGrid && (
                  <button
                    type="button"
                    data-testid="hf-view-3d-btn"
                    onClick={() =>
                      onProjectToWorkbench({
                        title: `${hfPayload.system?.symbol} ${hfPayload.method?.toUpperCase()}/${hfPayload.basis}`,
                        method: hfPayload.method!,
                        basis: hfPayload.basis!,
                        symbol: hfPayload.system?.symbol ?? "",
                        grid: hfPayload.volumeGrid!,
                      })
                    }
                    className="rounded-sm bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-sky-400"
                  >
                    Visualize 3D Isosurface in Workbench
                  </button>
                )}
              </div>

              {hfPayload.rohfConvention && (
                <p className="mb-2 rounded-sm border border-sky-900/60 bg-sky-950/20 px-2 py-1 text-[11px] text-sky-200">
                  ROHF convention: {hfPayload.rohfConvention}
                </p>
              )}

              <div data-testid="hf-energy-table" className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs md:grid-cols-2">
                <Row label="Total Energy E_HF">
                  <span className="font-mono font-semibold text-amber-300">
                    {hfPayload.energy.eTotal_Ha.toFixed(9)} Ha
                  </span>
                </Row>
                <Row label="Total Energy (eV)">
                  <span className="font-mono">{hfPayload.energy.eTotal_eV.toFixed(6)} eV</span>
                </Row>
                <Row label="Kinetic Energy T">
                  <span className="font-mono">{hfPayload.energy.eKinetic_Ha.toFixed(8)} Ha</span>
                </Row>
                <Row label="Nuclear Attraction V_ne">
                  <span className="font-mono">{hfPayload.energy.eNuclear_Ha.toFixed(8)} Ha</span>
                </Row>
                <Row label="Coulomb J (½ Tr P J)">
                  <span className="font-mono">{hfPayload.energy.eCoulomb_Ha.toFixed(8)} Ha</span>
                </Row>
                <Row label="Exchange K (−½ Tr P K)">
                  <span className="font-mono text-emerald-300">{hfPayload.energy.eExchange_Ha.toFixed(8)} Ha</span>
                </Row>
                <Row label="|E_tot − (T+V+J+K)|">
                  <span className="font-mono">{hfPayload.energy.energyConsistencyError_Ha.toExponential(2)} Ha</span>
                </Row>
                <Row label="Virial ratio −V/T">
                  <span className="font-mono">
                    {hfPayload.energy.virialRatio !== null ? hfPayload.energy.virialRatio.toFixed(6) : "—"}
                  </span>
                </Row>
                <Row label="Trace Tr(P S) / α / β">
                  <span className="font-mono">
                    {hfPayload.energy.tracePS.toFixed(6)} ({hfPayload.energy.traceAlpha.toFixed(3)} / {hfPayload.energy.traceBeta.toFixed(3)})
                  </span>
                </Row>
                <Row label="max |Cᵀ S C − I| / κ(S)">
                  <span className="font-mono">
                    {(hfPayload.orthonormalityError ?? 0).toExponential(2)} / {hfPayload.energy.overlapConditionNumber.toExponential(2)}
                  </span>
                </Row>
                {hfPayload.spinDiagnostics && (
                  <Row label="<S²> vs S(S+1)">
                    <span className="font-mono">
                      {hfPayload.spinDiagnostics.sSquared.toFixed(6)} vs {hfPayload.spinDiagnostics.sSquaredExact.toFixed(6)} (Δ={hfPayload.spinDiagnostics.spinContamination.toExponential(2)})
                    </span>
                  </Row>
                )}
                {hfPayload.runtime && (
                  <Row label="Runtime / Peak Mem">
                    <span className="font-mono">
                      {hfPayload.runtime.totalMs.toFixed(1)} ms (SCF {hfPayload.runtime.scfMs.toFixed(1)} ms) · {hfPayload.runtime.peakMemoryMB} MB
                    </span>
                  </Row>
                )}
              </div>

              {resultBenchmark && (
                <div className="mt-2 rounded-sm border border-emerald-900/60 bg-emerald-950/15 p-2 text-[11px] text-zinc-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300">
                      Independent Numerical Limit Reference ({resultBenchmark.source})
                    </span>
                    <span className="font-mono">
                      E_limit = {resultBenchmark.hfLimit_Ha.toFixed(9)} Ha
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    ΔE(basis − limit) = {(hfPayload.energy.eTotal_Ha - resultBenchmark.hfLimit_Ha).toFixed(7)} Ha ({((hfPayload.energy.eTotal_Ha - resultBenchmark.hfLimit_Ha) * 1000).toFixed(4)} mHa). Note: finite GTO basis error is positive for variational RHF/ROHF; UHF spin polarization can lie slightly below ROHF limits.
                  </p>
                </div>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Panel title="Orbital Energies & Spin Occupations">
                <div className="max-h-64 overflow-y-auto">
                  <table data-testid="hf-orbitals-table" className="w-full text-left font-mono text-[11px]">
                    <thead className="border-b border-zinc-800 text-[10px] text-zinc-500">
                      <tr>
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Spin</th>
                        <th className="py-1 pr-2">Irrep</th>
                        <th className="py-1 pr-2">Occ</th>
                        <th className="py-1 pr-2">ε (Ha)</th>
                        {hfPayload.method === "rohf" && <th className="py-1">⟨Fα⟩ / ⟨Fβ⟩</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {(hfPayload.orbitals ?? []).map((orb) => (
                        <tr key={`${orb.spin}:${orb.index}`} className={orb.occupation > 0 ? "text-zinc-200" : "text-zinc-500"}>
                          <td className="py-0.5 pr-2">{orb.index}</td>
                          <td className="py-0.5 pr-2">{orb.spin}</td>
                          <td className="py-0.5 pr-2">{orb.irrep}</td>
                          <td className="py-0.5 pr-2">{orb.occupation.toFixed(2)}</td>
                          <td className="py-0.5 pr-2">{orb.energy_Ha.toFixed(6)}</td>
                          {hfPayload.method === "rohf" && (
                            <td className="py-0.5 text-[10px]">
                              {orb.fockAlpha_Ha !== undefined ? `${orb.fockAlpha_Ha.toFixed(4)} / ${orb.fockBeta_Ha?.toFixed(4)}` : "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="SCF Convergence History">
                <div className="max-h-64 overflow-y-auto">
                  <table data-testid="hf-scf-table" className="w-full text-left font-mono text-[11px]">
                    <thead className="border-b border-zinc-800 text-[10px] text-zinc-500">
                      <tr>
                        <th className="py-1 pr-2">Cyc</th>
                        <th className="py-1 pr-2">E_tot (Ha)</th>
                        <th className="py-1 pr-2">ΔE (Ha)</th>
                        <th className="py-1">|∇orb|</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {hfPayload.scf.history.map((h) => (
                        <tr key={h.cycle} className="text-zinc-300">
                          <td className="py-0.5 pr-2">{h.cycle}</td>
                          <td className="py-0.5 pr-2">{h.eTotal_Ha.toFixed(9)}</td>
                          <td className="py-0.5 pr-2">{h.dE_Ha.toExponential(2)}</td>
                          <td className="py-0.5">{h.gradNorm.toExponential(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            {hfPayload.radialProfiles && (
              <Panel title="Sphericalized Radial Density 4πr²ρ(r) & Spin Density (110-pt Lebedev)">
                <HFRadialSVG profiles={hfPayload.radialProfiles} expectedN={hfPayload.system?.N ?? N} />
              </Panel>
            )}

            {hfResultRecord && (
              <Panel title="Automated Scientific Validation Checks">
                <div className="grid grid-cols-1 gap-1 text-[11px] md:grid-cols-2">
                  {hfResultRecord.validationChecks.map((c) => (
                    <div key={c.name} className="flex items-start gap-1.5">
                      <span className={c.passed ? "text-emerald-400" : "text-red-400"}>{c.passed ? "✓" : "✗"}</span>
                      <span className="text-zinc-300">
                        <strong className="font-mono">{c.name}:</strong> {c.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HFRadialSVG({
  profiles,
  expectedN,
}: {
  readonly profiles: NonNullable<HFCalculationResponse["radialProfiles"]>;
  readonly expectedN: number;
}) {
  const W = 620;
  const H = 180;
  const padL = 42;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const rMaxPlot = Math.min(profiles.rBohr[profiles.rBohr.length - 1] ?? 10, 10);
  const pts: { r: number; pr: number; pspin: number }[] = [];
  let maxY = 1e-6;
  for (let i = 0; i < profiles.rBohr.length; i++) {
    const r = profiles.rBohr[i];
    if (r > rMaxPlot) break;
    const pr = profiles.radialProbTotal[i];
    const pspin = 4 * Math.PI * r * r * profiles.rhoSpin[i];
    pts.push({ r, pr, pspin });
    if (pr > maxY) maxY = pr;
    if (Math.abs(pspin) > maxY) maxY = Math.abs(pspin);
  }

  const toX = (r: number) => padL + (r / rMaxPlot) * plotW;
  const toY = (val: number) => padT + plotH - (val / maxY) * plotH;

  const pathTot = pts
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${toX(p.r).toFixed(1)},${toY(p.pr).toFixed(1)}`)
    .join(" ");
  const hasSpin = Math.abs(profiles.integratedSpin) > 1e-4;
  const pathSpin = hasSpin
    ? pts
        .map((p, idx) => `${idx === 0 ? "M" : "L"}${toX(p.r).toFixed(1)},${toY(Math.max(0, p.pspin)).toFixed(1)}`)
        .join(" ")
    : "";

  return (
    <div className="flex flex-col gap-1">
      <svg data-testid="hf-radial-svg" viewBox={`0 0 ${W} ${H}`} className="w-full rounded-sm border border-zinc-800 bg-black">
        <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#3f3f46" strokeWidth={1} />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#3f3f46" strokeWidth={1} />
        <path d={pathTot} fill="none" stroke="#38bdf8" strokeWidth={1.8} />
        {hasSpin && <path d={pathSpin} fill="none" stroke="#f59e0b" strokeWidth={1.4} strokeDasharray="4 2" />}
        <text x={padL} y={H - 6} fill="#a1a1aa" fontSize={10}>0 a₀</text>
        <text x={W - 44} y={H - 6} fill="#a1a1aa" fontSize={10}>{rMaxPlot.toFixed(1)} a₀</text>
        <text x={padL + 6} y={padT + 12} fill="#38bdf8" fontSize={10}>4πr²ρ_tot(r)</text>
        {hasSpin && <text x={padL + 95} y={padT + 12} fill="#f59e0b" fontSize={10}>4πr²(ρ_α−ρ_β)</text>}
      </svg>
      <div className="flex flex-wrap justify-between font-mono text-[10px] text-zinc-400">
        <span>∫4πr²ρ_tot dr = {profiles.integratedElectrons.toFixed(6)} e (expected {expectedN})</span>
        <span>∫4πr²ρ_spin dr = {profiles.integratedSpin.toFixed(6)}</span>
        <span>⟨r⟩ = {profiles.meanRadiusBohr.toFixed(4)} a₀</span>
      </div>
    </div>
  );
}
