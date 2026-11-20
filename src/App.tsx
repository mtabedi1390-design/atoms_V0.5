import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { ControlRail } from "@/components/ControlRail";
import { EnergyDiagram } from "@/components/EnergyDiagram";
import { Inspector } from "@/components/Inspector";
import { RadialPlot, type TotalRadialDensityView } from "@/components/RadialPlot";
import { TelemetryBar } from "@/components/TelemetryBar";
import { Panel } from "@/components/ui";
import { elementByZ } from "@/data/elements";
import { diracFockRadialGrid } from "@/physics/diracFock";
import { BOHR_PM, radialExtent } from "@/physics/hydrogenic";
import { effectiveZ } from "@/physics/models";
import { hfDatasetFor, selectProvider } from "@/science/providers";
import { OrbitalScene, type SceneStats } from "@/render/OrbitalScene";
import { SamplerClient } from "@/sampling/client";
import type { SamplingParams } from "@/sampling/sampler";
import { activeSubshell, initialState, reducer } from "@/state/appState";

const LAYER_PALETTE = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15", "#60a5fa", "#f472b6", "#4ade80", "#fbbf24", "#22d3ee", "#c084fc", "#fb923c", "#a3e635", "#e879f9", "#2dd4bf", "#f87171", "#818cf8", "#fde047"];

interface LayerSpec {
  key: string;
  params: SamplingParams;
  color: string;
  visible: boolean;
  opacity: number;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const element = useMemo(() => elementByZ(state.Z), [state.Z]);
  const sub = useMemo(() => activeSubshell(state, element), [state, element]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbitalScene | null>(null);
  const clientRef = useRef<SamplerClient | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [stats, setStats] = useState<SceneStats>({ fps: 0, drawCalls: 0, points: 0, gpuUploadMs: 0 });
  const [sampleMs, setSampleMs] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [electrons, setElectrons] = useState<number | null>(null);
  const [tab, setTab] = useState<"radial" | "energy" | "inspector">("radial");
  const [mobilePanel, setMobilePanel] = useState<"controls" | "analysis" | null>(null);
  const lowFpsSince = useRef<number | null>(null);
  const lastParams = useRef(new Map<string, string>());
  const framedExtent = useRef(0);

  const layerColors = useMemo(() => Object.fromEntries(element.subshells.map((s, i) => [s.label, LAYER_PALETTE[i % LAYER_PALETTE.length]])), [element]);
  const hfDataset = useMemo(() => hfDatasetFor(state.Z), [state.Z]);
  const dfGrid = useMemo(() => diracFockRadialGrid(state.Z), [state.Z]);
  const useDF = state.mode === "atom" && state.densitySource === "dirac-fock";
  const useHF = state.mode === "atom" && state.densitySource === "hf" && hfDataset !== null;
  const isTotalDensityOnly = useDF || useHF;
  const providerSelection = useMemo(() => selectProvider({ Z: state.Z, observable: "electron-density", accuracy: "quantitative" }), [state.Z]);
  const peaks = useRef(new Map<string, number>());
  const electronTotals = useRef(new Map<string, number>());

  const totalRadialView: TotalRadialDensityView | null = useMemo(() => {
    if (useDF) {
      return {
        label: `Lobato 2026 Dirac–Fock (${element.symbol})`,
        rBohr: dfGrid.rBohr,
        rhoElectronPerBohr3: dfGrid.rhoElectronPerBohr3,
        integratedElectrons: dfGrid.integratedElectrons,
        expectedElectrons: element.Z,
        limitationsNote:
          "Relativistic B-spline Dirac–Fock (atomx, finite nucleus, spherical average over open-shell occupations; exact Dirac 1s for H). Total spherical density only; individual subshell R_nl(r) orbitals are not resolved.",
      };
    }
    if (useHF && hfDataset) {
      return {
        label: `PySCF ${hfDataset.method}/${hfDataset.basis} (${element.symbol})`,
        rBohr: hfDataset.density.rBohr,
        rhoElectronPerBohr3: hfDataset.density.rhoElectronPerBohr3,
        integratedElectrons: hfDataset.density.integratedElectrons,
        expectedElectrons: hfDataset.atom.Z,
        limitationsNote:
          "Non-relativistic basis-limited RHF/ROHF spherically averaged total density (no correlation). Individual subshell R_nl(r) orbitals are not exported.",
      };
    }
    return null;
  }, [useDF, useHF, dfGrid, hfDataset, element.symbol, element.Z]);

  // ---- layer specification derived from state ----
  const specs: LayerSpec[] = useMemo(() => {
    if (state.mode === "single") {
      return [{
        key: "single",
        params: { n: state.n, l: state.l, m: state.m, zeff: effectiveZ(state.model, element, sub), basis: state.basis, count: state.count, seed: state.seed, modelId: state.model, mix: "single" },
        color: layerColors[sub.label] ?? "#f59e0b",
        visible: true,
        opacity: 1,
      }];
    }
    if (useDF) {
      return [{
        key: "df-total",
        params: {
          n: 1, l: 0, m: 0, zeff: element.Z, basis: "complex" as const, count: state.count, seed: state.seed,
          modelId: "lobato2026-df", mix: "tabulated-df" as const,
          tabulated: { id: `df:${element.Z}:${element.symbol}:${dfGrid.rBohr.length}`, r: dfGrid.rBohr, rho: dfGrid.rhoElectronPerBohr3, expectedElectrons: element.Z },
        },
        color: "#7dd3fc",
        visible: true,
        opacity: 1,
      }];
    }
    if (useHF && hfDataset) {
      return [{
        key: "hf-total",
        params: {
          n: 1, l: 0, m: 0, zeff: element.Z, basis: "complex" as const, count: state.count, seed: state.seed,
          modelId: `pyscf-hf@${hfDataset.engine.version}`, mix: "tabulated-hf" as const,
          tabulated: { id: `hf:${hfDataset.atom.symbol}:${hfDataset.generated}:${hfDataset.density.rBohr.length}`, r: hfDataset.density.rBohr, rho: hfDataset.density.rhoElectronPerBohr3, expectedElectrons: hfDataset.atom.Z },
        },
        color: "#7dd3fc",
        visible: true,
        opacity: 1,
      }];
    }
    const total = element.Z;
    return element.subshells.map((s, i) => {
      const ui = state.layers[s.label] ?? { visible: true, opacity: 1 };
      return {
        key: s.label,
        params: { n: s.n, l: s.l, m: 0, zeff: effectiveZ(state.model, element, s), basis: "complex" as const, count: Math.max(2000, Math.round((state.count * s.occupancy) / total)), seed: state.seed + i, modelId: state.model, mix: "subshell-average" as const, occupancy: s.occupancy },
        color: layerColors[s.label],
        visible: ui.visible,
        opacity: ui.opacity,
      };
    });
  }, [state.mode, state.n, state.l, state.m, state.model, state.basis, state.count, state.seed, state.layers, element, sub, layerColors, useDF, useHF, dfGrid, hfDataset]);

  const extentPm = useMemo(() => {
    if (useDF) {
      // Visual framing covering 99.9% of total density extent (capped sensibly)
      return Math.min(dfGrid.rMaxBohr, 18) * BOHR_PM;
    }
    if (useHF && hfDataset) return Math.min(hfDataset.density.rBohr[hfDataset.density.rBohr.length - 1], 18) * BOHR_PM;
    return Math.max(...specs.map((s) => radialExtent(s.params.n, s.params.l, s.params.zeff))) * BOHR_PM;
  }, [specs, useDF, useHF, dfGrid, hfDataset]);

  // Effective render settings enforcing honest colorMode boundaries
  const effectiveRender = useMemo(() => {
    if (isTotalDensityOnly && state.render.colorMode !== "density") {
      return { ...state.render, colorMode: "density" as const };
    }
    if (state.mode === "atom" && (state.render.colorMode === "phase-real" || state.render.colorMode === "phase-complex")) {
      return { ...state.render, colorMode: "density" as const };
    }
    if (state.mode === "single" && state.render.colorMode === "layer") {
      return { ...state.render, colorMode: "density" as const };
    }
    return state.render;
  }, [state.render, state.mode, isTotalDensityOnly]);

  // ---- scene lifecycle ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: OrbitalScene;
    try {
      scene = new OrbitalScene(canvas, effectiveRender);
    } catch (e) {
      setGlError(e instanceof Error ? e.message : String(e));
      return;
    }
    sceneRef.current = scene;
    scene.onStats = setStats;
    const client = new SamplerClient();
    client.onFatal(setWorkerError);
    clientRef.current = client;
    const ro = new ResizeObserver(() => {
      const { width, height } = canvas.parentElement!.getBoundingClientRect();
      scene.resize(width, height);
    });
    ro.observe(canvas.parentElement!);
    const { width, height } = canvas.parentElement!.getBoundingClientRect();
    scene.resize(width, height);
    return () => {
      ro.disconnect();
      client.dispose();
      scene.dispose();
      sceneRef.current = null;
      clientRef.current = null;
      lastParams.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.applySettings(effectiveRender);
  }, [effectiveRender]);

  // frame camera when element, mode, or density source changes
  const frameKey = `${state.Z}|${state.mode}|${state.model}|${state.densitySource}`;
  useEffect(() => {
    sceneRef.current?.setExtent(extentPm);
    sceneRef.current?.frame(extentPm);
    framedExtent.current = extentPm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);
  useEffect(() => {
    sceneRef.current?.setExtent(extentPm);
    const ratio = framedExtent.current > 0 ? extentPm / framedExtent.current : Infinity;
    if (ratio > 1.6 || ratio < 0.6) {
      framedExtent.current = extentPm;
      sceneRef.current?.frame(extentPm);
    }
  }, [extentPm]);

  // ---- sampling requests ----
  useEffect(() => {
    const scene = sceneRef.current, client = clientRef.current;
    if (!scene || !client) return;
    const keep = new Set(specs.map((s) => s.key));
    scene.removeLayersExcept(keep);
    client.cancelAllExcept(keep);
    for (const k of [...lastParams.current.keys()]) {
      if (!keep.has(k)) {
        lastParams.current.delete(k);
        peaks.current.delete(k);
        electronTotals.current.delete(k);
      }
    }
    if (state.mode === "atom" && peaks.current.size > 0) {
      scene.setSharedMax(Math.max(...peaks.current.values()));
    } else if (state.mode === "single") {
      scene.setSharedMax(null);
    }

    for (const spec of specs) {
      const sig = JSON.stringify(spec.params);
      scene.setLayerState(spec.key, spec.opacity, spec.visible);
      if (lastParams.current.get(spec.key) === sig) continue;
      lastParams.current.set(spec.key, sig);
      peaks.current.delete(spec.key);
      electronTotals.current.delete(spec.key);
      setProgress(0);
      client.request(spec.key, spec.params, {
        onProgress: (f) => setProgress(f),
        onDone: (res) => {
          setProgress(1);
          setSampleMs(res.elapsedMs);
          setWorkerError(null);
          scene.setLayer(spec.key, { positionsBohr: res.positions, density: res.density, phase: res.phase, maxDensity: res.maxDensity, color: spec.color }, spec.opacity, spec.visible);
          if (state.mode === "atom") {
            peaks.current.set(spec.key, res.maxDensity);
            scene.setSharedMax(Math.max(...peaks.current.values()));
          } else {
            scene.setSharedMax(null);
          }
          electronTotals.current.set(spec.key, res.electrons);
          if (state.mode === "atom") setElectrons([...electronTotals.current.values()].reduce((a, b) => a + b, 0));
          else setElectrons(res.electrons);
          if (scene.shaderError) setGlError(`Shader error: ${scene.shaderError}`);
        },
        onError: (msg) => setWorkerError(msg),
      });
    }
    if (state.mode === "atom" && electronTotals.current.size === specs.length) {
      setElectrons([...electronTotals.current.values()].reduce((a, b) => a + b, 0));
    }
  }, [specs, state.mode]);

  // ---- probability current field ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const show = state.showCurrent && state.mode === "single" && state.basis === "complex" && state.m !== 0;
    const zeff = effectiveZ(state.model, element, sub);
    scene.setCurrentField(show ? { q: { n: state.n, l: state.l, m: state.m }, zeff, rMaxBohr: radialExtent(state.n, state.l, zeff) * 0.6 } : null);
  }, [state.showCurrent, state.mode, state.basis, state.n, state.l, state.m, state.model, element, sub]);

  // ---- adaptive quality ----
  useEffect(() => {
    if (!state.adaptiveQuality || stats.fps === 0) return;
    const now = performance.now();
    if (stats.fps < 30 && state.count > 25000) {
      lowFpsSince.current ??= now;
      if (now - lowFpsSince.current > 3000) {
        lowFpsSince.current = null;
        dispatch({ type: "set", patch: { count: Math.max(25000, Math.round(state.count * 0.7 / 5000) * 5000) } });
      }
    } else lowFpsSince.current = null;
  }, [stats, state.adaptiveQuality, state.count]);

  const resetCamera = useCallback(() => sceneRef.current?.resetCamera(), []);

  const zeffActive = effectiveZ(state.model, element, sub);
  const currentNote = state.showCurrent && (state.basis !== "complex" || state.m === 0 || state.mode === "atom");
  const densityLabel = useDF
    ? "Dirac–Fock (Lobato 2026)"
    : useHF
      ? "PySCF HF (bundled)"
      : state.model === "hydrogenic-exact"
        ? "exact hydrogenic"
        : "Slater estimate";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black text-zinc-200" style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <TelemetryBar
        element={element}
        sub={sub}
        m={state.m}
        model={state.model}
        mode={state.mode}
        densitySource={densityLabel}
        isTotalDensityOnly={isTotalDensityOnly}
        totalMeanRadiusPm={useDF ? dfGrid.meanRadiusBohr * BOHR_PM : null}
        electrons={electrons}
        samples={specs.reduce((a, s) => a + (s.visible ? s.params.count : 0), 0)}
        stats={stats}
        sampleMs={sampleMs}
        progress={progress}
        workerError={workerError}
      />
      <div className="flex min-h-0 flex-1">
        <aside className={cn("w-[340px] shrink-0 border-r border-zinc-800 bg-zinc-950 lg:block", mobilePanel === "controls" ? "fixed inset-y-12 left-0 z-20 block w-[88vw] max-w-[340px]" : "hidden")}>
          <ControlRail state={state} element={element} dispatch={dispatch} extentPm={extentPm} layerColors={layerColors} onResetCamera={resetCamera} />
        </aside>
        <main className="relative min-w-0 flex-1 bg-black">
          <div className="absolute right-2 top-2 z-20 flex gap-1 lg:hidden">
            <button onClick={() => setMobilePanel(mobilePanel === "controls" ? null : "controls")} className="rounded-sm border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-[11px] text-zinc-200">Controls</button>
            <button onClick={() => setMobilePanel(mobilePanel === "analysis" ? null : "analysis")} className="rounded-sm border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-[11px] text-zinc-200">Analysis</button>
          </div>
          {mobilePanel && <div className="fixed inset-0 z-10 bg-black/50 lg:hidden" onClick={() => setMobilePanel(null)} />}
          <canvas ref={canvasRef} data-testid="viewport" className="block h-full w-full" />
          {glError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-8">
              <div className="max-w-md border border-red-900 bg-zinc-950 p-4 text-sm">
                <h2 className="mb-2 font-semibold text-red-300">WebGL2 renderer unavailable</h2>
                <p className="font-mono text-xs text-zinc-300">{glError}</p>
                <p className="mt-2 text-xs text-zinc-500">The analytical panels (radial plot, energy diagram, inspector) still work without a GPU context. Try a browser with WebGL2 enabled and hardware acceleration on.</p>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] text-zinc-400">
            <ScaleBar extentPm={extentPm} />
            <span>axes: <span className="text-red-400">x</span> <span className="text-green-400">y</span> <span className="text-blue-400">z (polar)</span> · drag: orbit · right-drag: pan · wheel: zoom · ATOMS v0.5.0</span>
            {effectiveRender.colorMode === "phase-real" && <span><span className="text-orange-400">■ ψ &gt; 0</span> <span className="text-blue-400">■ ψ &lt; 0</span> — sign of the real wavefunction (not density)</span>}
            {effectiveRender.colorMode === "phase-complex" && <span>hue = arg ψ ∈ (−π, π] — complex phase e<sup>imφ</sup>; brightness ∝ log|ψ|²</span>}
            {effectiveRender.colorMode === "density" && <span>colour/brightness ∝ log-relative density (black→violet→red→yellow→white)</span>}
            {state.mode === "atom" && !isTotalDensityOnly && <span>independent-electron density ρ = Σ Nᵢ|Rᵢ|²/(4π) (configuration-average, Unsöld). Brightness uses a <b>shared</b> cross-subshell normalisation; point count ∝ occupancy. Not a correlated many-electron density.</span>}
            {useDF && <span className="text-sky-300">Lobato et al. (2026) relativistic B-spline Dirac–Fock total spherical density (finite nucleus, spherical average). Subshell orbitals &amp; phase are not resolved.</span>}
            {useHF && <span className="text-sky-300">imported PySCF {hfDataset?.method}/{hfDataset?.basis} spherically averaged HF density (basis-set-limited, non-relativistic). Not experimental.</span>}
            {state.mode === "atom" && electrons !== null && <span>∫ρ dV = {electrons.toFixed(3)} e (occupancy/tabulated check)</span>}
            {currentNote && <span className="text-amber-300">j = (ħ/m) Im(ψ*∇ψ) vanishes identically for real stationary orbitals, m = 0, and total-density views; select single-orbital complex basis with m ≠ 0.</span>}
            {state.showCurrent && !currentNote && <span className="text-emerald-300">green segments: probability-current density j ∝ m|ψ|²/(r sinθ) φ̂ (azimuthal circulation about z)</span>}
          </div>
        </main>
        <aside className={cn("w-[360px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 lg:flex", mobilePanel === "analysis" ? "fixed inset-y-12 right-0 z-20 flex w-[92vw] max-w-[360px]" : "hidden")}>
          <div className="flex border-b border-zinc-800 text-[11px]">
            {(["radial", "energy", "inspector"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 uppercase tracking-wider ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t === "radial" ? "Radial P(r)" : t === "energy" ? "Levels" : "Inspector"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "radial" && (
              <Panel title={totalRadialView ? "Total radial density 4πr²ρ(r)" : "Radial probability distribution"}>
                <RadialPlot mode={state.mode} n={state.n} l={state.l} zeff={zeffActive} model={state.model} totalDensity={totalRadialView} />
              </Panel>
            )}
            {tab === "energy" && (
              <Panel title="Subshell level diagram">
                <EnergyDiagram element={element} model={state.model} activeLabel={sub.label} hfDataset={hfDataset} onPick={(n, l) => dispatch({ type: "selectSubshell", n, l })} />
              </Panel>
            )}
            {tab === "inspector" && (
              <Panel title="Scientific inspector">
                <Inspector element={element} model={state.model} sub={sub} m={state.m} basis={state.basis} providerSelection={providerSelection} hfDataset={hfDataset} electrons={electrons} />
              </Panel>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScaleBar({ extentPm }: { extentPm: number }) {
  // nice round length ≈ 1/4 of extent
  const raw = extentPm / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 5, 10].map((k) => k * pow).reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 border-x border-b border-zinc-400" style={{ width: `${(nice / extentPm) * 120}px` }} />
      <span className="font-mono">{nice >= 1000 ? `${nice / 1000} nm` : `${nice} pm`} · view extent ≈ {extentPm.toFixed(0)} pm ({(extentPm / BOHR_PM).toFixed(1)} a0)</span>
    </div>
  );
}
