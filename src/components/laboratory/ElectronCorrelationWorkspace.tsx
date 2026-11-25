import { useEffect, useMemo, useState } from "react";
import { ELEMENTS } from "@/data/elements";
import type { SavedExperimentEntry } from "@/app/useAtomsLaboratory";
import type { ExperimentExecution, ExperimentResultRecord } from "@/experiments/schema";
import {
  HF_BASIS_CATALOG,
  isBasisSupportedForZ,
  proposeDefaultConfiguration,
  type HFBasisId,
  type HFSCFOptions,
} from "@/physics/hf";
import {
  CORRELATION_BENCHMARKS,
  CORRELATION_METHOD_CATALOG,
  allowedMethodsForReference,
  buildCorrelationComparisonKey,
  estimateCorrelationDimensions,
  nobleCoreFrozenCount,
  validateReferenceAndMethodCompatibility,
  type CorrelationCalculationResponse,
  type CorrelationCapabilitiesResponse,
  type CorrelationMethodId,
  type CorrelationOptions,
  type CorrelationReferenceMethod,
  type FrozenCoreMode,
} from "@/physics/correlation";
import { PYSCF_CORRELATION_PROVIDER_ID } from "@/physics/providers/correlation";
import { Panel, Row } from "@/components/ui";

function StatusBadge({
  tone,
  children,
  "data-testid": testId,
}: {
  readonly tone: "emerald" | "red" | "amber" | "sky" | "zinc";
  readonly children: string;
  readonly "data-testid"?: string;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
      : tone === "red"
        ? "border-red-700 bg-red-950/40 text-red-300"
        : tone === "amber"
          ? "border-amber-700 bg-amber-950/40 text-amber-300"
          : tone === "sky"
            ? "border-sky-700 bg-sky-950/40 text-sky-300"
            : "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span
      data-testid={testId}
      className={`rounded-sm border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

interface Props {
  readonly initialZ: number;
  readonly capabilities: CorrelationCapabilitiesResponse | null;
  readonly probing: boolean;
  readonly executions: readonly ExperimentExecution[];
  readonly selectedResult: ExperimentResultRecord | null;
  readonly history: readonly SavedExperimentEntry[];
  readonly onRefreshCapabilities: (refresh?: boolean) => void;
  readonly onCancelExecution: (executionId: string) => void;
  readonly onRunCorrelation: (params: {
    readonly Z: number;
    readonly N: number;
    readonly spin2S: number;
    readonly basis: HFBasisId;
    readonly referenceMethod: CorrelationReferenceMethod;
    readonly correlationMethod: CorrelationMethodId;
    readonly frozenCoreMode: FrozenCoreMode;
    readonly nRoots: number;
    readonly fixSpin: boolean;
    readonly scfOptions?: HFSCFOptions;
    readonly correlationOptions?: CorrelationOptions;
  }) => Promise<unknown>;
}

const REFERENCE_CARDS: readonly {
  readonly id: CorrelationReferenceMethod | "atom-sph-avg";
  readonly label: string;
  readonly summary: string;
  readonly disabledAlways?: boolean;
  readonly disabledReason?: string;
}[] = [
  {
    id: "rhf",
    label: "RHF (det)",
    summary: "Closed-shell singlet determinant (2S = 0 only)",
  },
  {
    id: "uhf",
    label: "UHF (det)",
    summary: "Unrestricted α/β determinant (any valid 2S)",
  },
  {
    id: "rohf",
    label: "ROHF (det)",
    summary: "Restricted open-shell determinant (2S ≥ 1; spin-pure)",
  },
  {
    id: "atom-sph-avg",
    label: "AtomSphAvg",
    summary: "Disabled: fractional spherical ensemble",
    disabledAlways: true,
    disabledReason:
      "AtomSphAverageRHF is a fractional-occupation spherical ensemble, not a canonical single determinant for MP2/CISD/FCI.",
  },
];

function validSpin2SValues(N: number): number[] {
  const vals: number[] = [];
  for (let s2 = N % 2; s2 <= Math.min(N, 8); s2 += 2) {
    vals.push(s2);
  }
  return vals;
}

export function ElectronCorrelationWorkspace({
  initialZ,
  capabilities,
  probing,
  executions,
  selectedResult,
  history,
  onRefreshCapabilities,
  onCancelExecution,
  onRunCorrelation,
}: Props) {
  const clampedInitialZ = Math.max(1, Math.min(54, initialZ));
  const initialDefault = useMemo(
    () => proposeDefaultConfiguration(clampedInitialZ, clampedInitialZ),
    [clampedInitialZ],
  );

  const [Z, setZ] = useState<number>(clampedInitialZ);
  const [N, setN] = useState<number>(clampedInitialZ);
  const [spin2S, setSpin2S] = useState<number>(initialDefault.spin2S);
  const [basis, setBasis] = useState<HFBasisId>("cc-pvdz");
  const [referenceMethod, setReferenceMethod] = useState<CorrelationReferenceMethod>(
    initialDefault.spin2S === 0 ? "rhf" : "uhf",
  );
  const [correlationMethod, setCorrelationMethod] = useState<CorrelationMethodId>(
    initialDefault.spin2S === 0 ? "rmp2" : "ump2",
  );
  const [frozenCoreMode, setFrozenCoreMode] = useState<FrozenCoreMode>("none");
  const [nRoots, setNRoots] = useState<number>(1);
  const [fixSpin, setFixSpin] = useState<boolean>(true);
  const [scfMaxCycle, setScfMaxCycle] = useState<number>(100);
  const [scfConvTol, setScfConvTol] = useState<number>(1e-10);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sessionResults, setSessionResults] = useState<readonly CorrelationCalculationResponse[]>([]);

  useEffect(() => {
    const nextZ = Math.max(1, Math.min(54, initialZ));
    const def = proposeDefaultConfiguration(nextZ, nextZ);
    setZ(nextZ);
    setN(nextZ);
    setSpin2S(def.spin2S);
    const nextRef: CorrelationReferenceMethod = def.spin2S === 0 ? "rhf" : "uhf";
    setReferenceMethod(nextRef);
    setCorrelationMethod(nextRef === "rhf" ? "rmp2" : "ump2");
  }, [initialZ]);

  const elementMeta = useMemo(() => ELEMENTS.find((e) => e.Z === Z) ?? ELEMENTS[0], [Z]);
  const spinOptions = useMemo(() => validSpin2SValues(N), [N]);

  const handleChangeZ = (nextZ: number) => {
    const clamped = Math.max(1, Math.min(54, nextZ));
    const def = proposeDefaultConfiguration(clamped, clamped);
    setZ(clamped);
    setN(clamped);
    setSpin2S(def.spin2S);
    const nextRef: CorrelationReferenceMethod = def.spin2S === 0 ? "rhf" : "uhf";
    setReferenceMethod(nextRef);
    setCorrelationMethod((prev) => {
      const allowed = allowedMethodsForReference(nextRef);
      return allowed.includes(prev) ? prev : allowed[0];
    });
  };

  const handleChangeN = (nextN: number) => {
    const clamped = Math.max(1, Math.min(Z + 4, nextN));
    const def = proposeDefaultConfiguration(Z, clamped);
    setN(clamped);
    const nextSpin = (clamped - spin2S) % 2 === 0 && spin2S <= clamped ? spin2S : def.spin2S;
    setSpin2S(nextSpin);
    const nextRef: CorrelationReferenceMethod =
      nextSpin === 0 ? "rhf" : referenceMethod === "rhf" ? "uhf" : referenceMethod;
    setReferenceMethod(nextRef);
    setCorrelationMethod((prev) => {
      const allowed = allowedMethodsForReference(nextRef);
      return allowed.includes(prev) ? prev : allowed[0];
    });
  };

  const handleChangeSpin = (next2S: number) => {
    setSpin2S(next2S);
    const nextRef: CorrelationReferenceMethod =
      next2S === 0 ? "rhf" : referenceMethod === "rhf" ? "uhf" : referenceMethod;
    setReferenceMethod(nextRef);
    setCorrelationMethod((prev) => {
      const allowed = allowedMethodsForReference(nextRef);
      return allowed.includes(prev) ? prev : allowed[0];
    });
  };

  const handleSelectReference = (nextRef: CorrelationReferenceMethod) => {
    setReferenceMethod(nextRef);
    const allowed = allowedMethodsForReference(nextRef);
    if (!allowed.includes(correlationMethod)) {
      setCorrelationMethod(allowed[0]);
    }
    if (nextRef === "uhf" && correlationMethod === "fci" && frozenCoreMode === "noble-core") {
      setFrozenCoreMode("none");
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const p = CORRELATION_BENCHMARKS.find((b) => b.id === presetId);
    if (!p) return;
    setZ(p.Z);
    setN(p.N);
    setSpin2S(p.spin2S);
    setBasis(p.basis);
    setReferenceMethod(p.referenceMethod);
    setCorrelationMethod(p.correlationMethod);
    setFrozenCoreMode(p.frozenCoreMode);
    setNRoots(1);
    setLocalError(null);
  };

  const basisSupport = useMemo(() => isBasisSupportedForZ(basis, Z, capabilities), [basis, Z, capabilities]);

  const compatibility = useMemo(
    () =>
      validateReferenceAndMethodCompatibility({
        Z,
        N,
        spin2S,
        referenceMethod,
        correlationMethod,
        frozenCoreMode,
      }),
    [Z, N, spin2S, referenceMethod, correlationMethod, frozenCoreMode],
  );

  const preflight = useMemo(
    () =>
      estimateCorrelationDimensions({
        Z,
        N,
        spin2S,
        basis,
        referenceMethod,
        correlationMethod,
        frozenCoreMode,
        nRoots: correlationMethod === "fci" ? nRoots : 1,
        capabilities,
      }),
    [Z, N, spin2S, basis, referenceMethod, correlationMethod, frozenCoreMode, nRoots, capabilities],
  );

  const activeExec = useMemo(
    () => executions.find((ex) => ex.status === "running" || ex.status === "queued") ?? null,
    [executions],
  );

  const latestFailedExec = useMemo(() => {
    if (executions.length === 0) return null;
    const top = executions[0];
    return top.status === "failed" || top.status === "unsupported" ? top : null;
  }, [executions]);

  const corrResultRecord = useMemo(() => {
    if (!selectedResult || selectedResult.providerId !== PYSCF_CORRELATION_PROVIDER_ID) return null;
    return selectedResult;
  }, [selectedResult]);

  const corrPayload = (corrResultRecord?.payload ?? null) as CorrelationCalculationResponse | null;
  const backendAvailable = capabilities?.available === true;
  const methodCapability = capabilities?.methods?.[correlationMethod];
  const methodAvailableInBackend = methodCapability ? methodCapability.available : true;

  const canRun =
    backendAvailable &&
    methodAvailableInBackend &&
    basisSupport.supported &&
    compatibility.valid &&
    preflight.withinLimits &&
    !submitting;

  const handleRun = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      const outcome = (await onRunCorrelation({
        Z,
        N,
        spin2S,
        basis,
        referenceMethod,
        correlationMethod,
        frozenCoreMode,
        nRoots: correlationMethod === "fci" ? nRoots : 1,
        fixSpin,
        scfOptions: { maxCycle: scfMaxCycle, convTol: scfConvTol },
      })) as { execution?: ExperimentExecution; result?: ExperimentResultRecord } | undefined;

      if (outcome?.result?.payload) {
        const res = outcome.result.payload as CorrelationCalculationResponse;
        setSessionResults((prev) => [res, ...prev.slice(0, 24)]);
      } else if (outcome?.execution?.error) {
        setLocalError(outcome.execution.error.message);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Aggregate all correlation runs from persisted ExperimentHistory + current session
  // and strictly enforce matched (Z, N, 2S, basis, frozenCoreMode) for comparison!
  const allCorrelationRuns = useMemo(() => {
    const seen = new Set<string>();
    const out: {
      readonly key: string;
      readonly compKey: string;
      readonly sourceLabel: string;
      readonly payload: CorrelationCalculationResponse;
    }[] = [];

    const pushPayload = (p: CorrelationCalculationResponse, sourceLabel: string) => {
      if (!p.ok || !p.system || !p.basis || !p.orbitals || !p.reference || !p.correlation) return;
      const compKey = buildCorrelationComparisonKey({
        Z: p.system.Z,
        N: p.system.N,
        spin2S: p.system.spin2S,
        basis: p.basis,
        frozenCoreMode: p.orbitals.frozenCoreMode,
      });
      const uniqueSig = `${compKey}|${p.reference.method}|${p.correlation.requestedMethod}`;
      if (seen.has(uniqueSig)) return;
      seen.add(uniqueSig);
      out.push({ key: uniqueSig, compKey, sourceLabel, payload: p });
    };

    if (corrPayload) pushPayload(corrPayload, corrResultRecord?.source ?? "computed");
    for (const s of sessionResults) pushPayload(s, "session");
    for (const entry of history) {
      if (entry.definition.kind !== "electron-correlation" || !entry.latestResult) continue;
      pushPayload(entry.latestResult.payload as CorrelationCalculationResponse, entry.latestResult.source);
    }
    return out;
  }, [corrPayload, corrResultRecord, sessionResults, history]);

  const activeCompKey = useMemo(() => {
    if (corrPayload?.system && corrPayload.basis && corrPayload.orbitals) {
      return buildCorrelationComparisonKey({
        Z: corrPayload.system.Z,
        N: corrPayload.system.N,
        spin2S: corrPayload.system.spin2S,
        basis: corrPayload.basis,
        frozenCoreMode: corrPayload.orbitals.frozenCoreMode,
      });
    }
    return buildCorrelationComparisonKey({ Z, N, spin2S, basis, frozenCoreMode });
  }, [corrPayload, Z, N, spin2S, basis, frozenCoreMode]);

  const matchedRuns = useMemo(
    () => allCorrelationRuns.filter((r) => r.compKey === activeCompKey),
    [allCorrelationRuns, activeCompKey],
  );
  const mismatchedRuns = useMemo(
    () => allCorrelationRuns.filter((r) => r.compKey !== activeCompKey),
    [allCorrelationRuns, activeCompKey],
  );
  const matchedFciTotal = useMemo(() => {
    const fciRun = matchedRuns.find((r) => r.payload.correlation?.requestedMethod === "fci");
    return fciRun?.payload.correlation?.eTotal_Ha ?? null;
  }, [matchedRuns]);
  const matchedFciCorr = useMemo(() => {
    const fciRun = matchedRuns.find((r) => r.payload.correlation?.requestedMethod === "fci");
    return fciRun?.payload.correlation?.eCorr_Ha ?? null;
  }, [matchedRuns]);

  const nobleCoreCount = nobleCoreFrozenCount(Z);
  const nobleCoreDisabledForSystem =
    nobleCoreCount === 0 ||
    Math.floor((N + spin2S) / 2) <= nobleCoreCount ||
    Math.floor((N - spin2S) / 2) < nobleCoreCount ||
    (correlationMethod === "fci" && referenceMethod === "uhf");

  return (
    <div
      data-testid="workspace-electron-correlation"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-black text-zinc-200"
    >
      {/* Top Banner: Engine Status & Scientific Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/90 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-amber-300">
            Post-HF Electron Correlation
          </span>
          {backendAvailable ? (
            <StatusBadge tone="emerald" data-testid="corr-engine-badge">
              {`PySCF ${capabilities?.engine?.version ?? "2.15.1"} · Live Correlation Active`}
            </StatusBadge>
          ) : (
            <StatusBadge tone="red" data-testid="corr-engine-badge">
              PySCF Correlation Offline
            </StatusBadge>
          )}
          <span className="font-mono text-[10px] text-zinc-500">
            MP2 (RMP2/UMP2/ROMP2) · CISD (RCISD/UCISD) · Bounded Direct FCI/CASCI
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CORRELATION_BENCHMARKS.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid={`corr-preset-${b.id}`}
              onClick={() => handleApplyPreset(b.id)}
              title={b.note}
              className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:border-amber-500/60 hover:text-amber-200"
            >
              {b.symbol} {b.correlationMethod.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            data-testid="corr-refresh-cap-btn"
            disabled={probing}
            onClick={() => onRefreshCapabilities(true)}
            className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {probing ? "Probing…" : "Re-probe PySCF"}
          </button>
        </div>
      </div>

      {!backendAvailable && (
        <div
          data-testid="corr-offline-banner"
          className="border-b border-red-900/70 bg-red-950/40 px-4 py-2 text-xs text-red-200"
        >
          <strong>Post-HF Correlation Engine Unavailable:</strong>{" "}
          {capabilities?.blocker ??
            "Local PySCF Express computational backend (/api/correlation/capabilities) did not respond with JSON. Start ATOMS via `npm run dev` or `npm start` with Python + PySCF installed."}
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[370px_1fr]">
        {/* Left Control Rail */}
        <aside className="overflow-y-auto border-b border-zinc-800 bg-zinc-950/70 lg:border-b-0 lg:border-r">
          <Panel title="1. Atomic System & Basis">
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="corr-z-select">
                  Element (Z = 1..54)
                </label>
                <select
                  id="corr-z-select"
                  data-testid="corr-z-select"
                  value={Z}
                  onChange={(e) => handleChangeZ(Number(e.target.value))}
                  className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                >
                  {ELEMENTS.filter((el) => el.Z <= 54).map((el) => (
                    <option key={el.Z} value={el.Z}>
                      Z={el.Z} · {el.symbol} ({el.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="corr-n-input">
                    Electrons N (q={Z - N >= 0 ? `+${Z - N}` : Z - N})
                  </label>
                  <input
                    id="corr-n-input"
                    data-testid="corr-n-input"
                    type="number"
                    min={1}
                    max={Z + 4}
                    value={N}
                    onChange={(e) => handleChangeN(Number(e.target.value))}
                    className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="corr-spin-select">
                    Spin 2S (2S+1 = {spin2S + 1})
                  </label>
                  <select
                    id="corr-spin-select"
                    data-testid="corr-spin-select"
                    value={spin2S}
                    onChange={(e) => handleChangeSpin(Number(e.target.value))}
                    className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                  >
                    {spinOptions.map((s2) => (
                      <option key={s2} value={s2}>
                        2S={s2} (mult {s2 + 1})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="corr-basis-select">
                  Gaussian Basis Set (BSE / PySCF)
                </label>
                <select
                  id="corr-basis-select"
                  data-testid="corr-basis-select"
                  value={basis}
                  onChange={(e) => setBasis(e.target.value as HFBasisId)}
                  className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                >
                  {HF_BASIS_CATALOG.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.family})
                    </option>
                  ))}
                </select>
                {!basisSupport.supported && (
                  <p className="mt-1 text-[10px] text-red-300" data-testid="corr-basis-error">
                    {basisSupport.reason}
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="2. HF Reference Determinant">
            <div className="grid grid-cols-2 gap-1.5">
              {REFERENCE_CARDS.map((card) => {
                const isRHFBlocked = card.id === "rhf" && spin2S !== 0;
                const isROHFBlocked = card.id === "rohf" && spin2S === 0;
                const disabled = Boolean(card.disabledAlways) || isRHFBlocked || isROHFBlocked;
                const selected = referenceMethod === card.id;
                const title =
                  card.disabledReason ??
                  (isRHFBlocked
                    ? `RHF requires singlet 2S=0 (current 2S=${spin2S}).`
                    : isROHFBlocked
                      ? "ROHF is for open-shell 2S >= 1; use RHF for 2S=0."
                      : card.summary);

                return (
                  <button
                    key={card.id}
                    type="button"
                    data-testid={`corr-ref-${card.id}`}
                    disabled={disabled}
                    title={title}
                    onClick={() => {
                      if (!disabled && card.id !== "atom-sph-avg") {
                        handleSelectReference(card.id);
                      }
                    }}
                    className={`rounded-sm border p-2 text-left transition-colors ${
                      selected
                        ? "border-amber-400 bg-amber-950/40 text-amber-100"
                        : disabled
                          ? "cursor-not-allowed border-zinc-800 bg-zinc-950/60 text-zinc-600"
                          : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    <div className="font-mono text-[11px] font-semibold">{card.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-zinc-400">{card.summary}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">
              <code>AtomSphAverageRHF</code> is a spin-unpolarized fractional ensemble and cannot serve as a single determinant reference for MP2, CISD, or FCI.
            </p>
          </Panel>

          <Panel title="3. Correlation Method & Active Space">
            <div className="space-y-1.5">
              {CORRELATION_METHOD_CATALOG.map((m) => {
                const refAllowed = m.compatibleReferences.includes(referenceMethod);
                const capAvail = capabilities?.methods?.[m.id]?.available ?? true;
                const disabled = !refAllowed || !capAvail;
                const selected = correlationMethod === m.id;

                let disabledNote = "";
                if (!capAvail) {
                  disabledNote = capabilities?.methods?.[m.id]?.reason ?? "Unavailable in PySCF probe.";
                } else if (!refAllowed) {
                  if (referenceMethod === "rohf" && (m.id === "rcisd" || m.id === "ucisd")) {
                    disabledNote = "PySCF has no spin-restricted ROCISD (converts ROHF→UCISD).";
                  } else {
                    disabledNote = `Requires ${m.compatibleReferences.map((r) => r.toUpperCase()).join("/")} reference.`;
                  }
                }

                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`corr-method-${m.id}`}
                    disabled={disabled}
                    title={disabledNote || m.description}
                    onClick={() => {
                      if (!disabled) setCorrelationMethod(m.id);
                    }}
                    className={`flex w-full items-start justify-between gap-2 rounded-sm border px-2.5 py-1.5 text-left transition-colors ${
                      selected
                        ? "border-amber-400 bg-amber-950/40 text-amber-100"
                        : disabled
                          ? "cursor-not-allowed border-zinc-800/80 bg-zinc-950/40 text-zinc-600"
                          : "border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500"
                    }`}
                  >
                    <div>
                      <div className="font-mono text-[11px] font-semibold">{m.label}</div>
                      <div className="text-[10px] leading-snug text-zinc-400">
                        {disabled ? disabledNote : m.caveat}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[9px] uppercase text-zinc-500">
                      {m.family}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-2.5">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Frozen Core</span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    noble core = {nobleCoreCount} orb ({nobleCoreCount * 2} e⁻)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="corr-frozen-none"
                    onClick={() => setFrozenCoreMode("none")}
                    className={`rounded-sm border px-2 py-1 font-mono text-[11px] ${
                      frozenCoreMode === "none"
                        ? "border-amber-400 bg-amber-950/40 text-amber-100"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    none (all-e⁻)
                  </button>
                  <button
                    type="button"
                    data-testid="corr-frozen-noble"
                    disabled={nobleCoreDisabledForSystem}
                    title={
                      nobleCoreDisabledForSystem
                        ? correlationMethod === "fci" && referenceMethod === "uhf"
                          ? "Frozen-core FCI (CASCI) requires RHF or ROHF shared spatial orbitals."
                          : "Requires > 0 noble-core orbitals and active valence electrons."
                        : "Freeze closed noble-gas inner shell orbitals"
                    }
                    onClick={() => setFrozenCoreMode("noble-core")}
                    className={`rounded-sm border px-2 py-1 font-mono text-[11px] ${
                      frozenCoreMode === "noble-core"
                        ? "border-amber-400 bg-amber-950/40 text-amber-100"
                        : nobleCoreDisabledForSystem
                          ? "cursor-not-allowed border-zinc-800 bg-zinc-950 text-zinc-600"
                          : "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    noble-core
                  </button>
                </div>
              </div>

              {correlationMethod === "fci" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400" htmlFor="corr-fci-nroots">
                      FCI Roots (1..5)
                    </label>
                    <input
                      id="corr-fci-nroots"
                      data-testid="corr-fci-nroots"
                      type="number"
                      min={1}
                      max={5}
                      value={nRoots}
                      onChange={(e) => setNRoots(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                      className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300">
                      <input
                        type="checkbox"
                        data-testid="corr-fci-fixspin"
                        checked={fixSpin}
                        disabled={referenceMethod === "uhf"}
                        onChange={(e) => setFixSpin(e.target.checked)}
                      />
                      <span>fix_spin_ (RHF/ROHF)</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="font-mono text-[10px] text-zinc-400 hover:text-zinc-200"
                >
                  {showAdvanced ? "▾ Hide Advanced SCF Tolerances" : "▸ Show Advanced SCF Tolerances"}
                </button>
                {showAdvanced && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-zinc-400" htmlFor="corr-scf-maxcycle">
                        SCF maxCycle
                      </label>
                      <input
                        id="corr-scf-maxcycle"
                        type="number"
                        min={1}
                        max={300}
                        value={scfMaxCycle}
                        onChange={(e) => setScfMaxCycle(Math.max(1, Math.min(300, Number(e.target.value) || 100)))}
                        className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-zinc-400" htmlFor="corr-scf-convtol">
                        SCF convTol (Ha)
                      </label>
                      <select
                        id="corr-scf-convtol"
                        value={scfConvTol}
                        onChange={(e) => setScfConvTol(Number(e.target.value))}
                        className="w-full rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                      >
                        <option value={1e-8}>1e-8</option>
                        <option value={1e-9}>1e-9</option>
                        <option value={1e-10}>1e-10</option>
                        <option value={1e-11}>1e-11</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* Preflight Resource Estimate Panel */}
          <Panel title="4. Preflight Resource Estimate">
            {preflight.estimate ? (
              <div className="space-y-1 text-xs" data-testid="corr-preflight-panel">
                <Row label="Spatial orbitals (active / total)">
                  {`${preflight.estimate.activeSpatialOrbitals} / ${preflight.estimate.nSpatialOrbitals}`}
                </Row>
                <Row label="Active electrons (α, β)">
                  {`(${preflight.estimate.nAlphaActive}, ${preflight.estimate.nBetaActive})`}
                </Row>
                {correlationMethod === "fci" && (
                  <Row label="FCI determinants N_det">
                    {`${preflight.estimate.fciDeterminantCount.toLocaleString()} / ${preflight.estimate.fciDeterminantLimit.toLocaleString()}`}
                  </Row>
                )}
                {(correlationMethod === "rcisd" || correlationMethod === "ucisd") &&
                  preflight.estimate.cisdAmplitudeDimension !== null && (
                    <Row label="CISD vector dimension">
                      {`${preflight.estimate.cisdAmplitudeDimension.toLocaleString()} / ${preflight.estimate.cisdAmplitudeLimit.toLocaleString()}`}
                    </Row>
                  )}
                <Row label="Estimated peak memory">
                  {`~${preflight.estimate.estimatedMemoryMB.toFixed(1)} MB`}
                </Row>
                <div className="pt-1">
                  {preflight.withinLimits ? (
                    <StatusBadge tone="emerald" data-testid="corr-preflight-status">
                      Within Preflight Bounds
                    </StatusBadge>
                  ) : (
                    <div
                      data-testid="corr-preflight-limit-error"
                      className="rounded-sm border border-red-800 bg-red-950/50 p-2 text-[11px] text-red-200"
                    >
                      <strong>Resource Limit Exceeded:</strong> {preflight.limitReason}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                data-testid="corr-preflight-limit-error"
                className="rounded-sm border border-red-800 bg-red-950/50 p-2 text-[11px] text-red-200"
              >
                {preflight.limitReason ?? "Cannot estimate orbital dimensions for this selection."}
              </div>
            )}

            {!compatibility.valid && (
              <div
                data-testid="corr-compat-error"
                className="mt-2 rounded-sm border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-200"
              >
                {compatibility.reason}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                data-testid="corr-run-btn"
                disabled={!canRun}
                onClick={() => void handleRun()}
                className="flex-1 rounded-sm bg-amber-400 px-3 py-1.5 font-mono text-xs font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {submitting
                  ? "Running PySCF…"
                  : `Run ${referenceMethod.toUpperCase()} + ${correlationMethod.toUpperCase()}`}
              </button>
              {activeExec && (
                <button
                  type="button"
                  data-testid="corr-cancel-btn"
                  onClick={() => onCancelExecution(activeExec.executionId)}
                  className="rounded-sm border border-red-700 bg-red-950/50 px-2.5 py-1.5 font-mono text-xs text-red-200 hover:bg-red-900/60"
                >
                  Cancel
                </button>
              )}
            </div>

            {(localError || latestFailedExec?.error) && (
              <div
                data-testid="corr-error-box"
                className="mt-2 rounded-sm border border-red-800 bg-red-950/60 p-2 text-[11px] text-red-200"
              >
                <strong>Execution Error:</strong>{" "}
                {localError ?? latestFailedExec?.error?.message}
              </div>
            )}
          </Panel>
        </aside>

        {/* Right Result & Comparison Canvas */}
        <section className="min-h-0 overflow-y-auto bg-black p-4 space-y-4">
          {/* Active Calculation Result */}
          {corrPayload && corrPayload.ok && corrPayload.correlation && corrPayload.reference && corrPayload.orbitals ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-amber-300" data-testid="corr-result-title">
                    {corrPayload.system?.symbol} (Z={corrPayload.system?.Z}, N={corrPayload.system?.N}, 2S={corrPayload.system?.spin2S}) ·{" "}
                    {corrPayload.reference.method.toUpperCase()} /{" "}
                    {corrPayload.correlation.requestedMethod.toUpperCase()} · {corrPayload.basis}
                  </span>
                  <StatusBadge tone="emerald">Converged</StatusBadge>
                  <StatusBadge tone={corrPayload.correlation.isVariational ? "sky" : "amber"}>
                    {corrPayload.correlation.isVariational ? "Variational" : "Non-Variational"}
                  </StatusBadge>
                  <StatusBadge tone={corrPayload.correlation.isSizeExtensive ? "emerald" : "red"}>
                    {corrPayload.correlation.isSizeExtensive ? "Size-Extensive" : "Not Size-Extensive"}
                  </StatusBadge>
                  <StatusBadge tone="zinc">Not LS-Term Resolved</StatusBadge>
                </div>
                <div className="font-mono text-[10px] text-zinc-400">
                  {corrResultRecord?.source === "loaded-from-store"
                    ? "Loaded from Store"
                    : corrResultRecord?.source === "imported-json"
                      ? "Imported JSON"
                      : `Computed · ${corrPayload.runtime?.totalMs.toFixed(0) ?? "?"} ms · ${corrPayload.runtime?.peakMemoryMB.toFixed(1) ?? "?"} MB`}
                </div>
              </div>

              {/* Energy Summary Cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="corr-energy-cards">
                <div className="rounded-sm border border-zinc-800 bg-zinc-950/90 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Reference SCF ({corrPayload.reference.method.toUpperCase()})
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-zinc-100" data-testid="corr-ehf-val">
                    {corrPayload.correlation.eHf_Ha.toFixed(8)} Ha
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">
                    {corrPayload.correlation.eHf_eV.toFixed(6)} eV · {corrPayload.reference.cycles} cycles
                  </div>
                </div>

                <div className="rounded-sm border border-amber-500/40 bg-amber-950/15 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300/90">
                    Correlation Energy (E_corr)
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-amber-300" data-testid="corr-ecorr-val">
                    {corrPayload.correlation.eCorr_Ha >= 0 ? "+" : ""}
                    {corrPayload.correlation.eCorr_Ha.toFixed(8)} Ha
                  </div>
                  <div className="font-mono text-[11px] text-zinc-300">
                    {corrPayload.correlation.eCorr_eV.toFixed(6)} eV
                    {matchedFciCorr !== null && Math.abs(matchedFciCorr) > 1e-12
                      ? ` · ${((corrPayload.correlation.eCorr_Ha / matchedFciCorr) * 100).toFixed(2)}% of matched FCI`
                      : ""}
                  </div>
                </div>

                <div className="rounded-sm border border-zinc-800 bg-zinc-950/90 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Total Energy (E_HF + E_corr)
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold text-emerald-300" data-testid="corr-etotal-val">
                    {corrPayload.correlation.eTotal_Ha.toFixed(8)} Ha
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">
                    {corrPayload.correlation.eTotal_eV.toFixed(6)} eV · err{" "}
                    {corrPayload.correlation.energyIdentityError_Ha.toExponential(1)} Ha
                  </div>
                </div>
              </div>

              {/* Method-Specific Diagnostics */}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <Panel title="Orbitals, Spin & Solver Diagnostics">
                  <div className="space-y-1 text-xs">
                    <Row label="PySCF Solver Class">{corrPayload.correlation.actualPyscfClass}</Row>
                    <Row label="Frozen / Active Orbitals">
                      {`${corrPayload.orbitals.frozenOrbitals} frozen · ${corrPayload.orbitals.activeSpatialOrbitals} active (${corrPayload.orbitals.correlatedElectrons} e⁻)`}
                    </Row>
                    <Row label="Symmetry / Density Fitting">{`${corrPayload.symmetryGroup ?? "C1"} · DF disabled`}</Row>
                    <Row label="Reference <S²> vs S(S+1)">
                      {`${(corrPayload.reference.spinDiagnostics.sSquared ?? 0).toFixed(6)} / ${(corrPayload.reference.spinDiagnostics.sSquaredExact ?? 0).toFixed(4)}`}
                    </Row>
                    {corrPayload.correlation.eCorrSameSpin_Ha !== null && (
                      <Row label="MP2 Same-Spin / Opp-Spin">
                        {`${corrPayload.correlation.eCorrSameSpin_Ha.toFixed(6)} / ${(corrPayload.correlation.eCorrOppositeSpin_Ha ?? 0).toFixed(6)} Ha`}
                      </Row>
                    )}
                    {corrPayload.correlation.eCorrSingles_Ha !== null && (
                      <Row label="ROMP2 Singles Term (e_corr_singles)">
                        {`${corrPayload.correlation.eCorrSingles_Ha.toExponential(4)} Ha`}
                      </Row>
                    )}
                    {corrPayload.correlation.referenceWeightSq !== null && (
                      <Row label="CISD Reference Weight |c₀|²">
                        {corrPayload.correlation.referenceWeightSq.toFixed(6)}
                      </Row>
                    )}
                    {corrPayload.correlation.denominatorDiagnostics && (
                      <Row label="MP2 Min 2p-2h / 1p-1h Gap">
                        {corrPayload.correlation.denominatorDiagnostics.available
                          ? `${corrPayload.correlation.denominatorDiagnostics.minDoubleGap_Ha?.toFixed(4) ?? "?"} / ${corrPayload.correlation.denominatorDiagnostics.minSingleGap_Ha?.toFixed(4) ?? "?"} Ha${corrPayload.correlation.denominatorDiagnostics.nearDegenerate ? " (NEAR-DEGENERATE)" : ""}`
                          : corrPayload.correlation.denominatorDiagnostics.reason ?? "N/A"}
                      </Row>
                    )}
                    {corrPayload.correlation.spinDiagnostics && (
                      <Row label="Correlated Spin Diagnostic">
                        {corrPayload.correlation.spinDiagnostics.available
                          ? `<S²> = ${corrPayload.correlation.spinDiagnostics.sSquared?.toFixed(6)} (${corrPayload.correlation.spinDiagnostics.spinStatus ?? (corrPayload.correlation.spinDiagnostics.spinPure ? "spin-pure" : "mixed")})`
                          : corrPayload.correlation.spinDiagnostics.unavailableReason ?? "Unavailable"}
                      </Row>
                    )}
                  </div>
                </Panel>

                {/* FCI Roots or Scientific Warnings */}
                <Panel title={corrPayload.correlation.roots ? "FCI Eigenstates & Spin Purity" : "Scientific Warnings & Method Notes"}>
                  {corrPayload.correlation.roots ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-[11px]" data-testid="corr-fci-roots-table">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-500">
                            <th className="py-1 pr-2">Root</th>
                            <th className="py-1 pr-2">E_total (Ha)</th>
                            <th className="py-1 pr-2">ΔE (eV)</th>
                            <th className="py-1 pr-2">&lt;S²&gt;</th>
                            <th className="py-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {corrPayload.correlation.roots.map((r) => (
                            <tr key={r.rootIndex} className="border-b border-zinc-900">
                              <td className="py-1 pr-2 text-amber-300">#{r.rootIndex}</td>
                              <td className="py-1 pr-2 text-zinc-100">{r.eTotal_Ha.toFixed(8)}</td>
                              <td className="py-1 pr-2 text-zinc-300">{r.excitation_eV.toFixed(4)}</td>
                              <td className="py-1 pr-2 text-zinc-300">{r.sSquared.toFixed(6)}</td>
                              <td className="py-1">
                                <StatusBadge tone={r.spinPure ? "emerald" : "amber"}>{r.spinStatus}</StatusBadge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[10px] text-zinc-500">
                        {corrPayload.correlation.spinDiagnostics?.lSquaredUnavailableReason}
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5 text-[11px] text-zinc-300">
                      {(corrPayload.methodNotes ?? []).map((n, idx) => (
                        <li key={idx} className="leading-snug text-zinc-300">
                          • {n}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              {(corrPayload.warnings ?? []).length > 0 && (
                <div className="rounded-sm border border-zinc-800 bg-zinc-950/80 p-3" data-testid="corr-warnings-box">
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                    Scientific Guardrails & Caveats
                  </div>
                  <ul className="space-y-1 text-[11px] text-zinc-300">
                    {corrPayload.warnings!.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div
              data-testid="corr-empty-state"
              className="rounded-sm border border-zinc-800 bg-zinc-950/70 p-5 text-xs text-zinc-300"
            >
              <div className="font-mono text-sm font-semibold text-amber-300">
                Select a System, Reference, and Correlation Method ({elementMeta.symbol}, Z={Z})
              </div>
              <p className="mt-1.5 leading-relaxed text-zinc-400">
                Compute real post-Hartree–Fock correlation energies in PySCF across MP2 (RMP2/UMP2/ROMP2), CISD (RCISD/UCISD), and bounded direct Full CI / CASCI. Choose a quick preset above or run multiple methods on matching{" "}
                <code className="text-zinc-200">(Z, N, 2S, basis, frozenCore)</code> to populate the exact cross-method comparison table below.
              </p>
            </div>
          )}

          {/* Matched Cross-Method Comparison Table */}
          <Panel
            title={`Matched Cross-Method Comparison · Key (${activeCompKey})`}
          >
            {matchedRuns.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No completed runs yet for matched key <code>{activeCompKey}</code>. Run MP2, CISD, and FCI on the same element, electron count, spin, basis, and frozen-core setting to compare them directly.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-left font-mono text-[11px]"
                  data-testid="corr-comparison-table"
                >
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="py-1.5 pr-3">Ref</th>
                      <th className="py-1.5 pr-3">Method</th>
                      <th className="py-1.5 pr-3">E_HF (Ha)</th>
                      <th className="py-1.5 pr-3">E_corr (Ha)</th>
                      <th className="py-1.5 pr-3">E_total (Ha)</th>
                      <th className="py-1.5 pr-3">Variational</th>
                      <th className="py-1.5 pr-3">Size-Ext</th>
                      <th className="py-1.5 pr-3">Δ vs FCI (mHa)</th>
                      <th className="py-1.5">Origin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedRuns.map((row) => {
                      const c = row.payload.correlation!;
                      const r = row.payload.reference!;
                      const deltaMHa =
                        matchedFciTotal !== null ? (c.eTotal_Ha - matchedFciTotal) * 1000 : null;
                      return (
                        <tr key={row.key} className="border-b border-zinc-900 text-zinc-200">
                          <td className="py-1.5 pr-3 uppercase">{r.method}</td>
                          <td className="py-1.5 pr-3 font-semibold text-amber-300 uppercase">
                            {c.requestedMethod}
                          </td>
                          <td className="py-1.5 pr-3">{c.eHf_Ha.toFixed(8)}</td>
                          <td className="py-1.5 pr-3">{c.eCorr_Ha.toFixed(8)}</td>
                          <td className="py-1.5 pr-3 text-emerald-300">{c.eTotal_Ha.toFixed(8)}</td>
                          <td className="py-1.5 pr-3">{c.isVariational ? "Yes" : "No"}</td>
                          <td className="py-1.5 pr-3">{c.isSizeExtensive ? "Yes" : "No"}</td>
                          <td className="py-1.5 pr-3">
                            {deltaMHa === null ? "—" : `${deltaMHa >= 0 ? "+" : ""}${deltaMHa.toFixed(4)}`}
                          </td>
                          <td className="py-1.5 text-zinc-400">{row.sourceLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {mismatchedRuns.length > 0 && (
              <div className="mt-3 border-t border-zinc-800 pt-2">
                <div className="font-mono text-[10px] text-zinc-500">
                  Other Saved Correlation Runs (Non-Comparable — Different Z / N / 2S / Basis / Frozen-Core):
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5" data-testid="corr-mismatched-list">
                  {mismatchedRuns.map((row) => (
                    <span
                      key={row.key}
                      className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
                    >
                      {row.payload.system?.symbol} {row.payload.reference?.method.toUpperCase()}/
                      {row.payload.correlation?.requestedMethod.toUpperCase()} ({row.payload.basis},{" "}
                      {row.payload.orbitals?.frozenCoreMode}):{" "}
                      {row.payload.correlation?.eTotal_Ha.toFixed(6)} Ha
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}
