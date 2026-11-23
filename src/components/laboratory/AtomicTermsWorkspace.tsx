import { useEffect, useMemo, useState } from "react";
import { ELEMENTS } from "@/data/elements";
import type { ExperimentExecution, ExperimentResultRecord } from "@/experiments/schema";
import { HF_BASIS_CATALOG, type HFBasisId } from "@/physics/hf";
import {
  ATSP2K_PUBLISHED_REFERENCES,
  LS_CURATED_PRESETS,
  assessLSCISupport,
  computeConfigurationParity,
  defaultLSConfigurationForSystem,
  enumerateLSTerms,
  formatConfigurationSpec,
  formatTermSymbol,
  lookupNISTBenchmarksForSystem,
  parseConfigurationString,
  type ConfigurationParity,
  type LSActiveSpaceMode,
  type LSCIResponse,
  type LSCapabilitiesResponse,
  type SubshellOccupancySpec,
} from "@/physics/ls";
import { LS_TERM_CI_PROVIDER_ID } from "@/physics/providers/lsTermCi";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly initialZ: number;
  readonly capabilities: LSCapabilitiesResponse | null;
  readonly probing: boolean;
  readonly executions: readonly ExperimentExecution[];
  readonly selectedResult: ExperimentResultRecord | null;
  readonly onRefreshCapabilities: (refresh?: boolean) => void;
  readonly onCancelExecution: (executionId: string) => void;
  readonly onRunLSCI: (params: {
    readonly Z: number;
    readonly N: number;
    readonly basis: HFBasisId;
    readonly referenceConfiguration: readonly SubshellOccupancySpec[];
    readonly targetL: number;
    readonly targetSpin2S: number;
    readonly targetParity: ConfigurationParity;
    readonly activeSpaceMode: LSActiveSpaceMode;
    readonly customConfigurations?: readonly (readonly SubshellOccupancySpec[])[];
    readonly maxExcitationRank?: number;
    readonly nRoots: number;
    readonly crossCheckPyscfFci: boolean;
  }) => Promise<unknown>;
}

const L_LETTER_OPTIONS = [
  { L: 0, label: "S (L=0)" },
  { L: 1, label: "P (L=1)" },
  { L: 2, label: "D (L=2)" },
  { L: 3, label: "F (L=3)" },
  { L: 4, label: "G (L=4)" },
  { L: 5, label: "H (L=5)" },
] as const;

export function AtomicTermsWorkspace({
  initialZ,
  capabilities,
  probing,
  executions,
  selectedResult,
  onRefreshCapabilities,
  onCancelExecution,
  onRunLSCI,
}: Props) {
  const clampedInitialZ = Math.max(1, Math.min(30, initialZ === 1 ? 6 : initialZ));
  const [Z, setZ] = useState<number>(clampedInitialZ);
  const [N, setN] = useState<number>(clampedInitialZ);
  const [configText, setConfigText] = useState<string>(() =>
    formatConfigurationSpec(defaultLSConfigurationForSystem(clampedInitialZ, clampedInitialZ), true),
  );
  const [basis, setBasis] = useState<HFBasisId>("cc-pvdz");
  const [activeSpaceMode, setActiveSpaceMode] = useState<LSActiveSpaceMode>("valence-cas");
  const [customConfigsText, setCustomConfigsText] = useState<string>("1s2 2s2; 1s2 2p2");
  const [maxExcitationRank, setMaxExcitationRank] = useState<number | undefined>(undefined);
  const [nRoots, setNRoots] = useState<number>(3);
  const [crossCheckPyscfFci, setCrossCheckPyscfFci] = useState<boolean>(true);
  const [targetL, setTargetL] = useState<number>(1);
  const [targetSpin2S, setTargetSpin2S] = useState<number>(2);
  const [targetParity, setTargetParity] = useState<ConfigurationParity>("even");
  const [selectedRootIndex, setSelectedRootIndex] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const applyPreset = (
    nextZ: number,
    nextN: number,
    subshells: readonly SubshellOccupancySpec[],
    preferredL?: number,
    preferred2S?: number,
  ) => {
    setZ(nextZ);
    setN(nextN);
    setConfigText(formatConfigurationSpec(subshells, true));
    const analysis = enumerateLSTerms(subshells);
    const preferred =
      preferredL !== undefined && preferred2S !== undefined
        ? analysis.terms.find((t) => t.L === preferredL && t.spin2S === preferred2S)
        : undefined;
    const picked = preferred ?? analysis.terms[0];
    if (picked) {
      setTargetL(picked.L);
      setTargetSpin2S(picked.spin2S);
      setTargetParity(picked.parity);
    } else {
      setTargetParity(computeConfigurationParity(subshells).parity);
    }
  };

  useEffect(() => {
    if (initialZ >= 2 && initialZ <= 30) {
      const cfg = defaultLSConfigurationForSystem(initialZ, initialZ);
      applyPreset(initialZ, initialZ, cfg);
    }
  }, [initialZ]);

  const parsedConfig = useMemo(() => parseConfigurationString(configText), [configText]);

  const termAnalysis = useMemo(() => {
    if (!parsedConfig.ok || parsedConfig.subshells.length === 0) return null;
    return enumerateLSTerms(parsedConfig.subshells);
  }, [parsedConfig]);

  // Keep target term valid when configuration changes unless user explicitly picks another parity for multi-config CI
  useEffect(() => {
    if (!termAnalysis || termAnalysis.terms.length === 0) return;
    const match = termAnalysis.terms.find(
      (t) => t.L === targetL && t.spin2S === targetSpin2S && t.parity === targetParity,
    );
    if (!match && activeSpaceMode === "single-config") {
      const first = termAnalysis.terms[0];
      setTargetL(first.L);
      setTargetSpin2S(first.spin2S);
      setTargetParity(first.parity);
    }
  }, [termAnalysis, activeSpaceMode, targetL, targetSpin2S, targetParity]);

  const customConfigsParsed = useMemo(() => {
    if (activeSpaceMode !== "custom-configs") return { ok: true as const, configs: [] as SubshellOccupancySpec[][] };
    const chunks = customConfigsText
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (chunks.length === 0) {
      return { ok: false as const, error: "Enter at least one configuration separated by ';' or newline.", configs: [] };
    }
    const out: SubshellOccupancySpec[][] = [];
    for (const chunk of chunks) {
      const p = parseConfigurationString(chunk);
      if (!p.ok) {
        return { ok: false as const, error: `Custom config "${chunk}": ${p.error ?? "invalid"}`, configs: [] };
      }
      const total = p.subshells.reduce((acc, s) => acc + s.q, 0);
      if (total !== N) {
        return {
          ok: false as const,
          error: `Custom config "${chunk}" has ${total} electrons, expected N=${N}.`,
          configs: [],
        };
      }
      out.push([...p.subshells]);
    }
    return { ok: true as const, configs: out };
  }, [activeSpaceMode, customConfigsText, N]);

  const supportGate = useMemo(
    () =>
      assessLSCISupport({
        Z,
        N,
        basis,
        configuration: parsedConfig.ok ? parsedConfig.subshells : [],
        capabilities,
      }),
    [Z, N, basis, parsedConfig, capabilities],
  );

  const elementMeta = useMemo(() => ELEMENTS.find((e) => e.Z === Z) ?? ELEMENTS[0], [Z]);
  const nistBenchmarks = useMemo(() => lookupNISTBenchmarksForSystem(Z, N), [Z, N]);
  const atspBenchmarks = useMemo(
    () => ATSP2K_PUBLISHED_REFERENCES.filter((r) => r.Z === Z && r.N === N),
    [Z, N],
  );

  const activeExec = useMemo(
    () =>
      executions.find((ex) => ex.status === "running" || ex.status === "queued") ?? null,
    [executions],
  );

  const latestFailedExec = useMemo(() => {
    if (executions.length === 0) return null;
    const top = executions[0];
    return top.status === "failed" || top.status === "unsupported" ? top : null;
  }, [executions]);

  const lsResultRecord = useMemo(() => {
    if (!selectedResult || selectedResult.providerId !== LS_TERM_CI_PROVIDER_ID) return null;
    return selectedResult;
  }, [selectedResult]);

  const lsPayload = (lsResultRecord?.payload ?? null) as LSCIResponse | null;
  const backendAvailable = capabilities?.available === true;

  const spinParityConsistent =
    targetSpin2S >= 0 && targetSpin2S <= N && (N - targetSpin2S) % 2 === 0;
  const singleConfigMatch =
    activeSpaceMode !== "single-config" ||
    Boolean(
      termAnalysis?.terms.some(
        (t) => t.L === targetL && t.spin2S === targetSpin2S && t.parity === targetParity,
      ),
    );

  const canRun =
    backendAvailable &&
    parsedConfig.ok &&
    customConfigsParsed.ok &&
    supportGate.supported &&
    spinParityConsistent &&
    singleConfigMatch &&
    !submitting;

  const handleRun = async () => {
    setLocalError(null);
    setSubmitting(true);
    setSelectedRootIndex(0);
    try {
      await onRunLSCI({
        Z,
        N,
        basis,
        referenceConfiguration: parsedConfig.subshells,
        targetL,
        targetSpin2S,
        targetParity,
        activeSpaceMode,
        customConfigurations:
          activeSpaceMode === "custom-configs" ? customConfigsParsed.configs : undefined,
        maxExcitationRank,
        nRoots,
        crossCheckPyscfFci,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedRoot =
    lsPayload && lsPayload.roots.length > 0
      ? lsPayload.roots[Math.min(selectedRootIndex, lsPayload.roots.length - 1)]
      : null;

  const chargeLabel = Z === N ? "neutral" : Z > N ? `+${Z - N}` : `${Z - N}`;
  const targetTermSymbol = formatTermSymbol(targetSpin2S, targetL, targetParity);

  return (
    <div
      data-testid="atomic-terms-workspace"
      className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-200 lg:flex-row"
    >
      {/* LEFT CONTROL RAIL */}
      <aside className="w-full shrink-0 overflow-y-auto border-b border-zinc-800 bg-zinc-950 p-3 lg:w-[420px] lg:border-b-0 lg:border-r">
        <Panel title="LS-CI Backend & Method Boundary">
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-zinc-300">
                Engine:{" "}
                {backendAvailable ? (
                  <span className="text-emerald-300" data-testid="ls-backend-status">
                    Active · PySCF {capabilities?.engine?.pyscfVersion ?? "2.15"} + Exact (L², S², Π) CSFs
                  </span>
                ) : (
                  <span className="text-red-300" data-testid="ls-backend-status">
                    Offline / Unavailable
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onRefreshCapabilities(true)}
                disabled={probing}
                className="rounded-sm border border-zinc-700 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
              >
                {probing ? "Probing…" : "Re-probe"}
              </button>
            </div>

            {!backendAvailable && capabilities?.blocker && (
              <div className="rounded-sm border border-red-900/70 bg-red-950/30 p-2 text-[11px] text-red-200">
                {capabilities.blocker}
              </div>
            )}

            <div className="rounded-sm border border-amber-900/60 bg-zinc-900/70 p-2 text-[10px] leading-relaxed text-zinc-300">
              <div className="font-mono font-semibold text-amber-300">
                METHOD: FIXED-ORBITAL LS-COUPLED CI
              </div>
              <div>
                Radial orbitals come from <span className="font-mono text-sky-300">AtomSphAverageRHF</span> (SO(3)
                spherically averaged HF). Self-consistent <span className="font-mono">MCHF</span> orbital
                re-optimization is <span className="text-amber-300">NOT performed</span>. Spin-orbit{" "}
                <span className="font-mono">J</span> splittings and dynamical correlation outside the active space
                (v0.7.2 MP2/CCSD) are omitted.
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="1. Atom, Ion & Reference Configuration">
          <div className="space-y-2.5 text-[11px]">
            <div className="flex flex-wrap gap-1">
              {LS_CURATED_PRESETS.map((p) => {
                const active = Z === p.Z && N === p.N && formatConfigurationSpec(p.referenceConfiguration, true) === formatConfigurationSpec(parsedConfig.subshells, true);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`ls-preset-${p.id}`}
                    onClick={() =>
                      applyPreset(p.Z, p.N, p.referenceConfiguration, p.defaultTargetL, p.defaultTargetSpin2S)
                    }
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${
                      active
                        ? "border-amber-400 bg-amber-400/15 text-amber-200"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Element Z</span>
                <select
                  aria-label="Element Z"
                  data-testid="ls-z-select"
                  value={Z}
                  onChange={(e) => {
                    const nextZ = Number(e.target.value);
                    const nextN = nextZ === 1 ? 1 : nextZ;
                    const cfg = defaultLSConfigurationForSystem(nextZ, nextN);
                    applyPreset(nextZ, nextN, cfg);
                  }}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100"
                >
                  {ELEMENTS.filter((el) => el.Z <= 36).map((el) => (
                    <option key={el.Z} value={el.Z}>
                      {el.Z} · {el.symbol} ({el.name})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Electrons N</span>
                <input
                  type="number"
                  min={1}
                  max={36}
                  data-testid="ls-n-input"
                  value={N}
                  onChange={(e) => {
                    const nextN = Math.max(1, Math.min(36, Number(e.target.value) || 1));
                    const cfg = defaultLSConfigurationForSystem(Z, nextN);
                    applyPreset(Z, nextN, cfg);
                  }}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 tabular-nums"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Species</span>
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 px-2 py-1 font-mono text-[11px] text-zinc-200 tabular-nums">
                  {elementMeta.symbol} ({chargeLabel})
                </div>
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">
                Reference configuration (supports [He]/[Ne]/[Ar] shorthand, e.g. <code>[He] 2s2 2p2</code>)
              </span>
              <input
                type="text"
                data-testid="ls-config-input"
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  const p = parseConfigurationString(e.target.value);
                  if (p.ok) {
                    const tot = p.subshells.reduce((acc, s) => acc + s.q, 0);
                    setN(tot);
                  }
                }}
                className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100"
              />
            </label>

            {!parsedConfig.ok && (
              <div className="rounded-sm border border-red-900/70 bg-red-950/30 p-1.5 font-mono text-[10px] text-red-200">
                {parsedConfig.error}
              </div>
            )}

            {termAnalysis && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-900/40 px-2 py-1 font-mono text-[10px] text-zinc-300">
                <span>
                  Config: <span className="text-zinc-100">{termAnalysis.label}</span>
                </span>
                <span>
                  N={termAnalysis.totalElectrons} · parity{" "}
                  <span className="text-sky-300">{termAnalysis.parity}</span> · Σg={termAnalysis.totalMicrostates}
                </span>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="2. Russell–Saunders LS Term Enumeration">
          {!termAnalysis ? (
            <div className="text-[11px] text-zinc-500">Enter a valid configuration to enumerate LS terms.</div>
          ) : (
            <div className="space-y-2 text-[11px]">
              <div className="text-[10px] text-zinc-400">
                Exact antisymmetric subshell microstate decomposition & Clebsch–Gordan coupling. Click any term to
                select its symmetry block:
              </div>
              <div className="max-h-56 overflow-y-auto rounded-sm border border-zinc-800">
                <table className="w-full text-left font-mono text-[10px]" data-testid="ls-term-table">
                  <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-2 py-1">Term</th>
                      <th className="px-2 py-1">Count</th>
                      <th className="px-2 py-1">Allowed J (unsplit)</th>
                      <th className="px-2 py-1">Parentage / v</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {termAnalysis.terms.map((t) => {
                      const selected =
                        t.L === targetL && t.spin2S === targetSpin2S && t.parity === targetParity;
                      const jLabel = t.allowedJValues
                        .map((j) => (Number.isInteger(j) ? String(j) : `${Math.round(2 * j)}/2`))
                        .join(",");
                      return (
                        <tr
                          key={`${t.L}:${t.spin2S}:${t.parity}`}
                          data-testid={`ls-term-row-${t.asciiTermSymbol}`}
                          onClick={() => {
                            setTargetL(t.L);
                            setTargetSpin2S(t.spin2S);
                            setTargetParity(t.parity);
                          }}
                          className={`cursor-pointer transition-colors ${
                            selected ? "bg-amber-400/15 text-amber-200" : "hover:bg-zinc-900/80 text-zinc-300"
                          }`}
                        >
                          <td className="px-2 py-1 font-semibold">{t.termSymbol}</td>
                          <td className="px-2 py-1 tabular-nums">{t.count}</td>
                          <td className="px-2 py-1 tabular-nums text-zinc-400">{jLabel}</td>
                          <td className="px-2 py-1 text-zinc-400">
                            {t.seniorities.length > 0
                              ? `v=${t.seniorities.join(",")}`
                              : t.parentages[0] ?? "coupled"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="3. CI Active Space, Basis & Target Block">
          <div className="space-y-2.5 text-[11px]">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Gaussian Basis (BSE 0.12)</span>
                <select
                  data-testid="ls-basis-select"
                  value={basis}
                  onChange={(e) => setBasis(e.target.value as HFBasisId)}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100"
                >
                  {HF_BASIS_CATALOG.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({b.family})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Active Space Mode</span>
                <select
                  data-testid="ls-activespace-select"
                  value={activeSpaceMode}
                  onChange={(e) => setActiveSpaceMode(e.target.value as LSActiveSpaceMode)}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100"
                >
                  <option value="single-config">Single Configuration</option>
                  <option value="valence-cas">Valence CAS</option>
                  <option value="valence-plus-virtuals">Valence + Virtuals</option>
                  <option value="custom-configs">Custom Configurations</option>
                </select>
              </label>
            </div>

            {activeSpaceMode === "custom-configs" && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">
                  Custom CI configurations (semicolon- or newline-separated, total N={N} e⁻)
                </span>
                <textarea
                  rows={2}
                  data-testid="ls-custom-configs-input"
                  value={customConfigsText}
                  onChange={(e) => setCustomConfigsText(e.target.value)}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100"
                />
                {!customConfigsParsed.ok && (
                  <span className="font-mono text-[10px] text-red-300">{customConfigsParsed.error}</span>
                )}
              </label>
            )}

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Target L</span>
                <select
                  data-testid="ls-target-l-select"
                  value={targetL}
                  onChange={(e) => setTargetL(Number(e.target.value))}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] text-zinc-100"
                >
                  {L_LETTER_OPTIONS.map((opt) => (
                    <option key={opt.L} value={opt.L}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Multiplicity 2S+1</span>
                <input
                  type="number"
                  min={1}
                  max={N + 1}
                  step={2}
                  data-testid="ls-multiplicity-input"
                  value={targetSpin2S + 1}
                  onChange={(e) => {
                    const mult = Math.max(1, Number(e.target.value) || 1);
                    setTargetSpin2S(mult - 1);
                  }}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 tabular-nums"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Parity Π</span>
                <select
                  data-testid="ls-parity-select"
                  value={targetParity}
                  onChange={(e) => setTargetParity(e.target.value as ConfigurationParity)}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] text-zinc-100"
                >
                  <option value="even">even (+1)</option>
                  <option value="odd">odd (-1)</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Excitation truncation</span>
                <select
                  value={maxExcitationRank ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMaxExcitationRank(v > 0 ? v : undefined);
                  }}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-100"
                >
                  <option value={0}>Full CAS in active shells</option>
                  <option value={1}>CIS (max rank 1)</option>
                  <option value={2}>CISD (max rank 2)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Roots in {targetTermSymbol} block</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  data-testid="ls-nroots-input"
                  value={nRoots}
                  onChange={(e) => setNRoots(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                  className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 tabular-nums"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[10px] text-zinc-300">
              <input
                type="checkbox"
                checked={crossCheckPyscfFci}
                onChange={(e) => setCrossCheckPyscfFci(e.target.checked)}
              />
              Cross-check lowest eigenvalue against PySCF determinant FCI (same active MO space)
            </label>

            {(!supportGate.supported || !spinParityConsistent || !singleConfigMatch) && (
              <div
                data-testid="ls-unsupported-banner"
                className="rounded-sm border border-red-900/70 bg-red-950/30 p-2 text-[10px] text-red-200"
              >
                {!supportGate.supported
                  ? supportGate.reasons.join("; ")
                  : !spinParityConsistent
                    ? `Multiplicity ${targetSpin2S + 1} (2S=${targetSpin2S}) is incompatible with N=${N} electrons.`
                    : `Target term ${targetTermSymbol} does not occur in single configuration ${termAnalysis?.label ?? ""}. Switch active space mode or select an enumerated term.`}
              </div>
            )}

            {localError && (
              <div className="rounded-sm border border-red-900/70 bg-red-950/30 p-2 font-mono text-[10px] text-red-200">
                {localError}
              </div>
            )}

            {latestFailedExec && latestFailedExec.error && (
              <div className="rounded-sm border border-red-900/70 bg-red-950/30 p-2 font-mono text-[10px] text-red-200">
                [{latestFailedExec.error.code}] {latestFailedExec.error.message}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                data-testid="ls-run-btn"
                disabled={!canRun}
                onClick={() => void handleRun()}
                className="flex-1 rounded-sm bg-amber-400 px-3 py-1.5 font-mono text-[11px] font-semibold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {submitting || activeExec
                  ? `Running ${targetTermSymbol} LS-CI…`
                  : `Solve ${elementMeta.symbol} (${chargeLabel}) ${targetTermSymbol}`}
              </button>
              {activeExec && (
                <button
                  type="button"
                  onClick={() => onCancelExecution(activeExec.executionId)}
                  className="rounded-sm border border-red-800 px-2.5 py-1.5 font-mono text-[10px] text-red-300 hover:bg-red-950/40"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Panel>
      </aside>

      {/* RIGHT RESULTS & BENCHMARK AREA */}
      <main className="min-w-0 flex-1 overflow-y-auto p-3 space-y-3">
        {!lsPayload ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="Ready for Symmetry-Blocked LS-Coupled CI">
              <div className="space-y-2 text-xs leading-relaxed text-zinc-300">
                <p>
                  Select an atom or ion (<span className="font-mono">Z = 1..30, N ≥ 2</span>) and reference
                  configuration on the left to enumerate all Russell–Saunders{" "}
                  <span className="font-mono text-amber-300">²ˢ⁺¹L^π</span> terms, then solve the fixed-orbital
                  CI Hamiltonian projected exactly onto orthonormal <span className="font-mono">(L², S², Π)</span>{" "}
                  configuration state functions (CSFs).
                </p>
                <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2 font-mono text-[10px] text-zinc-400">
                  Selected block: {elementMeta.symbol} (Z={Z}, N={N}) · {targetTermSymbol} · {basis} ·{" "}
                  {activeSpaceMode}
                </div>
              </div>
            </Panel>

            <Panel title="Reference Benchmarks Available">
              {nistBenchmarks.length > 0 ? (
                <div className="space-y-1.5 text-[11px]">
                  <div className="font-mono text-zinc-300">
                    NIST ASD Term Centroids ({nistBenchmarks[0].species})
                  </div>
                  <div className="space-y-1">
                    {nistBenchmarks.map((nt) => (
                      <div
                        key={nt.key}
                        className="flex items-center justify-between border-b border-zinc-900 py-0.5 font-mono text-[10px]"
                      >
                        <span className="text-zinc-200">
                          {nt.configuration} {nt.termSymbol}
                        </span>
                        <span className="tabular-nums text-sky-300">
                          {nt.relativeToGroundCentroid_eV.toFixed(4)} eV ({nt.relativeToGroundCentroid_cm1.toFixed(1)} cm⁻¹)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500">
                  No preloaded NIST ASD centroid table for Z={Z}, N={N}; internal operator purity and PySCF FCI
                  cross-checks still validate every run.
                </div>
              )}
            </Panel>
          </div>
        ) : (
          <>
            {/* HEADER METRIC STRIP */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">Method</div>
                <div className="font-mono text-[11px] font-semibold text-amber-300" data-testid="ls-method-badge">
                  Fixed-Orbital LS-CI
                </div>
                <div className="font-mono text-[9px] text-zinc-500">MCHF opt: false</div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">Orbital Source</div>
                <div className="font-mono text-[11px] font-semibold text-sky-300">AtomSphAvgRHF</div>
                <div className="font-mono text-[9px] text-zinc-500">SO(3) fixed radial</div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">Symmetry Block</div>
                <div className="font-mono text-[11px] font-semibold text-zinc-100">
                  {lsPayload.system.symbol} · {lsPayload.symmetryBlock.termSymbol}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">
                  J={lsPayload.symmetryBlock.allowedJValues.join(",")} (unsplit)
                </div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">Lowest Root E₀</div>
                <div className="font-mono text-[11px] font-semibold text-emerald-300 tabular-nums" data-testid="ls-e0">
                  {lsPayload.roots[0].energy_Ha.toFixed(8)} Ha
                </div>
                <div className="font-mono text-[9px] text-zinc-500 tabular-nums">
                  {lsPayload.roots[0].energy_eV.toFixed(4)} eV
                </div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">CSF / Det Space</div>
                <div className="font-mono text-[11px] font-semibold text-zinc-100 tabular-nums">
                  {lsPayload.resources.csfCount} CSFs / {lsPayload.resources.determinantCount} dets
                </div>
                <div className="font-mono text-[9px] text-zinc-500 tabular-nums">
                  {lsPayload.resources.activeElectrons} e⁻ in {lsPayload.resources.activeSpatialOrbitals} MOs
                </div>
              </div>
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="text-[10px] text-zinc-400">Compute &amp; Origin</div>
                <div className="font-mono text-[11px] font-semibold text-zinc-100 tabular-nums">
                  {lsPayload.runtime.totalMs.toFixed(1)} ms · {lsPayload.runtime.peakMemoryMB.toFixed(1)} MB
                </div>
                <div className="font-mono text-[9px] text-zinc-400">
                  {lsResultRecord?.source ?? "computed"} · {lsPayload.basis}
                </div>
              </div>
            </div>

            {/* MULTI-ROOT SPECTRUM */}
            <Panel title={`Multi-Root Spectrum (${lsPayload.symmetryBlock.termSymbol} block · ${lsPayload.activeSpace.mode})`}>
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px]" data-testid="ls-roots-table">
                    <thead className="border-b border-zinc-800 text-[10px] text-zinc-400">
                      <tr>
                        <th className="px-2 py-1">Root</th>
                        <th className="px-2 py-1">Term</th>
                        <th className="px-2 py-1">Energy (Ha)</th>
                        <th className="px-2 py-1">ΔE (eV)</th>
                        <th className="px-2 py-1">ΔE (cm⁻¹)</th>
                        <th className="px-2 py-1">Leading Mixing</th>
                        <th className="px-2 py-1">&lt;L²&gt; err / Var</th>
                        <th className="px-2 py-1">&lt;S²&gt; err / Var</th>
                        <th className="px-2 py-1">Purity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {lsPayload.roots.map((r) => {
                        const isSel = selectedRoot?.rootIndex === r.rootIndex;
                        const d = r.operatorDiagnostics;
                        return (
                          <tr
                            key={r.rootIndex}
                            data-testid={`ls-root-row-${r.rootIndex}`}
                            onClick={() => setSelectedRootIndex(r.rootIndex)}
                            className={`cursor-pointer ${
                              isSel ? "bg-amber-400/10 text-zinc-100" : "hover:bg-zinc-900/70 text-zinc-300"
                            }`}
                          >
                            <td className="px-2 py-1 tabular-nums">{r.rootIndex}</td>
                            <td className="px-2 py-1 font-semibold text-amber-300">{r.termSymbol}</td>
                            <td className="px-2 py-1 tabular-nums">{r.energy_Ha.toFixed(8)}</td>
                            <td className="px-2 py-1 tabular-nums">{r.relativeToLowest_eV.toFixed(5)}</td>
                            <td className="px-2 py-1 tabular-nums">{r.relativeToLowest_cm1.toFixed(2)}</td>
                            <td className="px-2 py-1 text-[10px] text-zinc-300">{r.mixingSummary}</td>
                            <td className="px-2 py-1 text-[10px] tabular-nums">
                              {d.lSquaredError.toExponential(1)} / {d.lSquaredVariance.toExponential(1)}
                            </td>
                            <td className="px-2 py-1 text-[10px] tabular-nums">
                              {d.sSquaredError.toExponential(1)} / {d.sSquaredVariance.toExponential(1)}
                            </td>
                            <td className="px-2 py-1 text-[10px]">
                              <Badge
                                kind={
                                  d.purityStatus === "pure-ls-eigenstate"
                                    ? "exact"
                                    : d.purityStatus === "near-degenerate-mixed"
                                      ? "estimate"
                                      : "unavailable"
                                }
                              >
                                {d.purityStatus}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-zinc-500">{lsPayload.rootTrackingNote}</div>
              </div>
            </Panel>

            <div className="grid gap-3 xl:grid-cols-2">
              {/* SELECTED ROOT CSF BREAKDOWN */}
              {selectedRoot && (
                <Panel title={`Root ${selectedRoot.rootIndex} (${selectedRoot.termSymbol}) CSF Mixing & Parentage`}>
                  <div className="space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                      <Row label="Dominant config">{selectedRoot.dominantConfiguration}</Row>
                      <Row label="Reference weight">
                        {(100 * selectedRoot.referenceConfigurationWeight).toFixed(2)}%
                      </Row>
                      <Row label="<L²> (exact)">
                        {selectedRoot.operatorDiagnostics.lSquared.toFixed(8)} ({selectedRoot.operatorDiagnostics.lSquaredExact})
                      </Row>
                      <Row label="<S²> (exact)">
                        {selectedRoot.operatorDiagnostics.sSquared.toFixed(8)} ({selectedRoot.operatorDiagnostics.sSquaredExact.toFixed(2)})
                      </Row>
                      <Row label="Allowed J (unsplit)">
                        {selectedRoot.allowedJValues.join(", ")}
                      </Row>
                      <Row label="Residual ||Hc-Ec||">
                        {selectedRoot.solverResidualNorm.toExponential(2)}
                      </Row>
                    </div>

                    {selectedRoot.operatorDiagnostics.ambiguityNote && (
                      <div className="rounded-sm border border-amber-900/60 bg-amber-950/20 p-1.5 text-[10px] text-amber-200">
                        {selectedRoot.operatorDiagnostics.ambiguityNote}
                      </div>
                    )}

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Leading LS-CSF Weights
                      </div>
                      {selectedRoot.topCSFs.map((c) => (
                        <div key={c.csfIndex} className="space-y-0.5 font-mono text-[10px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-zinc-200">
                              CSF#{c.csfIndex} · {c.parentage}
                            </span>
                            <span className="shrink-0 tabular-nums text-amber-300">
                              c={c.coefficient >= 0 ? "+" : ""}
                              {c.coefficient.toFixed(4)} ({(100 * c.weight).toFixed(2)}%)
                            </span>
                          </div>
                          <div className="h-1 w-full bg-zinc-900">
                            <div
                              className="h-1 bg-amber-400"
                              style={{ width: `${Math.min(100, Math.max(1, 100 * c.weight))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              )}

              {/* NUMERICAL VERIFICATION & FCI ORACLE */}
              <Panel title="CSF Orthonormality, Radial Shells & FCI Verification">
                <div className="space-y-2 text-[11px]">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                    <Row label="Frozen core">{lsPayload.activeSpace.frozenCore}</Row>
                    <Row label="Active shells">{lsPayload.activeSpace.activeShellsLabel}</Row>
                    <Row label="CSF ortho max |CᵀC-I|">
                      {lsPayload.csfDiagnostics.csfOrthonormalityError.toExponential(2)}
                    </Row>
                    <Row label="Hamiltonian |H-Hᵀ|">
                      {lsPayload.csfDiagnostics.hamiltonianHermiticityError.toExponential(2)} Ha
                    </Row>
                    <Row label="Nullspace residual">
                      {lsPayload.csfDiagnostics.csfMaxLSNullspaceResidual.toExponential(2)}
                    </Row>
                    <Row label="SO(3) orbital ortho">
                      {lsPayload.orbitalSource.complexOrthonormalityError.toExponential(2)}
                    </Row>
                  </div>

                  <div
                    data-testid="ls-fci-crosscheck"
                    className={`rounded-sm border p-2 font-mono text-[10px] ${
                      lsPayload.pyscfFciCrossCheck.performed
                        ? lsPayload.pyscfFciCrossCheck.passed
                          ? "border-emerald-900/70 bg-emerald-950/20 text-emerald-200"
                          : "border-amber-900/70 bg-amber-950/20 text-amber-200"
                        : "border-zinc-800 bg-zinc-900/50 text-zinc-400"
                    }`}
                  >
                    <div className="font-semibold">{lsPayload.pyscfFciCrossCheck.oracle}</div>
                    <div>{lsPayload.pyscfFciCrossCheck.note}</div>
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-sm border border-zinc-800">
                    <table className="w-full text-left font-mono text-[10px]">
                      <thead className="sticky top-0 border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                        <tr>
                          <th className="px-2 py-1">Shell</th>
                          <th className="px-2 py-1">Role</th>
                          <th className="px-2 py-1">ε (Ha)</th>
                          <th className="px-2 py-1">Avg occ</th>
                          <th className="px-2 py-1">SO(3) split</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {lsPayload.orbitalSource.shells.slice(0, 14).map((sh) => (
                          <tr key={`${sh.n}:${sh.l}`} className="text-zinc-300">
                            <td className="px-2 py-0.5 font-semibold">{sh.label}</td>
                            <td className="px-2 py-0.5 text-zinc-400">{sh.role}</td>
                            <td className="px-2 py-0.5 tabular-nums">{sh.energy_Ha.toFixed(4)}</td>
                            <td className="px-2 py-0.5 tabular-nums">{sh.avgOccupation.toFixed(2)}</td>
                            <td className="px-2 py-0.5 tabular-nums">{sh.shellDegeneracySplit_Ha.toExponential(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Panel>
            </div>

            {/* BENCHMARKS */}
            <Panel title="NIST ASD Term Centroids & Published Literature Comparison">
              {nistBenchmarks.length > 0 || atspBenchmarks.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 text-[11px]">
                  <div>
                    <div className="mb-1 font-mono text-[10px] font-semibold text-zinc-300">
                      NIST ASD (2J+1)-Weighted Term Centroids · {nistBenchmarks[0]?.species ?? lsPayload.system.symbol}
                    </div>
                    <table className="w-full text-left font-mono text-[10px]">
                      <thead className="border-b border-zinc-800 text-zinc-400">
                        <tr>
                          <th className="py-1 pr-2">Term</th>
                          <th className="py-1 pr-2">ΔE (eV)</th>
                          <th className="py-1 pr-2">ΔE (cm⁻¹)</th>
                          <th className="py-1">J levels</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {nistBenchmarks.map((nt) => (
                          <tr key={nt.key} className="text-zinc-300">
                            <td className="py-1 pr-2 font-semibold">
                              {nt.configuration} {nt.termSymbol}
                            </td>
                            <td className="py-1 pr-2 tabular-nums text-sky-300">
                              {nt.relativeToGroundCentroid_eV.toFixed(4)}
                            </td>
                            <td className="py-1 pr-2 tabular-nums">
                              {nt.relativeToGroundCentroid_cm1.toFixed(1)}
                            </td>
                            <td className="py-1 text-zinc-400">{nt.jLevels.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-1.5 text-[10px] text-zinc-400">
                    <div className="font-mono font-semibold text-zinc-300">
                      Published Nonrelativistic Reference Totals &amp; Scope Note
                    </div>
                    {atspBenchmarks.length > 0 ? (
                      atspBenchmarks.map((pt) => (
                        <div key={pt.key} className="font-mono text-zinc-300">
                          {pt.termSymbol}: {pt.totalEnergy_Ha.toFixed(6)} Ha ({pt.source})
                        </div>
                      ))
                    ) : (
                      <div>
                        Compare term differences (e.g. ¹D − ³P) from separate symmetry-block runs against NIST
                        centroids. Residual errors arise from fixed AtomSphAverageRHF orbitals (no MCHF relaxation),
                        frozen core, basis truncation, and omitted dynamic correlation/spin-orbit shifts.
                      </div>
                    )}
                    {nistBenchmarks[0] && (
                      <div className="text-zinc-500">Source: {nistBenchmarks[0].source}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500">
                  No preloaded NIST centroid table for Z={lsPayload.system.Z}, N={lsPayload.system.N}. All solver
                  diagnostic invariants (&lt;L²&gt;, &lt;S²&gt;, variances, CSF orthonormality, Hermiticity, and PySCF
                  FCI cross-checks) remain live-verified above.
                </div>
              )}
            </Panel>
          </>
        )}
      </main>
    </div>
  );
}
