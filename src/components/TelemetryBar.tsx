import type { ElementRecord, Subshell } from "@/data/elements";
import { BOHR_PM, hydrogenicEnergy_eV, meanRadiusAnalytic } from "@/physics/hydrogenic";
import { slaterZeff, type ModelId } from "@/physics/models";
import type { SceneStats } from "@/render/OrbitalScene";

interface Props {
  element: ElementRecord;
  sub: Subshell;
  m: number;
  model: ModelId;
  mode: "single" | "atom";
  samples: number;
  stats: SceneStats;
  sampleMs: number | null;
  progress: number | null;
  workerError: string | null;
  densitySource: string;
  isTotalDensityOnly: boolean;
  totalMeanRadiusPm?: number | null;
  electrons: number | null;
}

function Item({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col border-r border-zinc-800 px-3 last:border-r-0">
      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{k}</span>
      <span className="truncate font-mono text-xs text-zinc-100 tabular-nums">{v}</span>
      {sub && <span className="truncate text-[9px] text-zinc-500">{sub}</span>}
    </div>
  );
}

export function TelemetryBar({
  element: e,
  sub,
  m,
  model,
  mode,
  samples,
  stats,
  sampleMs,
  progress,
  workerError,
  densitySource,
  isTotalDensityOnly,
  totalMeanRadiusPm,
  electrons,
}: Props) {
  const exact = model === "hydrogenic-exact";
  const sl = exact ? null : slaterZeff(e, sub);
  const zeff = exact ? e.Z : sl!.zeff;
  const E = exact ? hydrogenicEnergy_eV(sub.n, e.Z) : sl!.energyEstimate_eV;
  const rMean = meanRadiusAnalytic(sub.n, sub.l, zeff) * BOHR_PM;
  const fpsState = stats.fps >= 55 ? "optimal" : stats.fps >= 30 ? "ok" : stats.fps > 0 ? "degraded" : "—";

  const stateVal = mode === "atom" ? `all ${e.Z} e⁻ (${e.subshells.length} subshells)` : `${sub.label} (n,l,m)=(${sub.n},${sub.l},${m})`;
  const stateSub =
    mode === "atom"
      ? e.isOpenShell
        ? `open-shell (${e.groundTerm.value ?? "term n/a"}) · spherical avg`
        : `closed-shell (${e.groundTerm.value ?? "1S0"})`
      : `${sub.occupancy} e⁻ in subshell`;

  return (
    <header className="flex h-12 items-stretch overflow-x-auto border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-2 border-r border-zinc-800 px-3">
        <span className="font-mono text-2xl font-semibold text-amber-300">{e.symbol}</span>
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-zinc-100">{e.name}</span>
          <span className="font-mono text-[10px] text-zinc-500">
            Z = {e.Z} · {e.massKind === "standard atomic weight" ? `${e.mass.value} u` : `[${e.mass.value}] (A)`} · {e.groundTerm.value ?? "term n/a"}
          </span>
        </div>
      </div>
      <Item k="state" v={stateVal} sub={stateSub} />
      {mode === "atom" && isTotalDensityOnly ? (
        <>
          <Item k="representation" v="total ρ(r)" sub="spherical average (no R_nl)" />
          <Item k="⟨r⟩ per e⁻" v={totalMeanRadiusPm ? `${totalMeanRadiusPm.toFixed(1)} pm` : "numerical grid"} sub={totalMeanRadiusPm ? `${(totalMeanRadiusPm / BOHR_PM).toFixed(2)} a0 · numeric` : "total density"} />
          <Item k="nodes" v="n/a (total ρ)" sub="shell peaks in P_total(r)" />
        </>
      ) : (
        <>
          <Item k="Z_eff" v={exact ? `${e.Z} (${e.Z === 1 ? "H" : "bare nucleus"})` : zeff.toFixed(3)} sub={exact ? "Model A (1-e⁻ ion)" : "Slater estimate (Model B)"} />
          <Item k="energy" v={`${E.toFixed(E > -100 ? 3 : 1)} eV`} sub={exact ? "exact E_n (1-e⁻)" : "−13.6 Z_eff²/n*² estimate"} />
          <Item k="⟨r⟩" v={`${rMean.toFixed(1)} pm`} sub={`${(rMean / BOHR_PM).toFixed(2)} a0 · analytic`} />
          <Item k="nodes" v={`${sub.n - sub.l - 1} radial · ${sub.l} angular`} sub={`${sub.l - Math.abs(m)} conical + ${Math.abs(m)} planar`} />
        </>
      )}
      <Item
        k="density source"
        v={mode === "atom" ? densitySource : model === "hydrogenic-exact" ? "exact hydrogenic" : "Slater estimate"}
        sub={mode === "atom" && electrons !== null ? `∫ρ = ${electrons.toFixed(3)} e` : "one-electron model"}
      />
      <Item
        k="samples"
        v={samples.toLocaleString()}
        sub={progress !== null && progress < 1 ? `sampling ${(progress * 100).toFixed(0)}%` : sampleMs !== null ? `worker ${sampleMs.toFixed(0)} ms · upload ${stats.gpuUploadMs.toFixed(1)} ms` : "—"}
      />
      <Item k="render" v={`${stats.fps.toFixed(0)} fps · ${stats.drawCalls} draws`} sub={`${stats.points.toLocaleString()} pts · ${fpsState}`} />
      {workerError && <Item k="error" v={workerError} />}
    </header>
  );
}
