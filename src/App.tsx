import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { ControlRail } from "@/components/ControlRail";
import { EnergyDiagram } from "@/components/EnergyDiagram";
import { Inspector } from "@/components/Inspector";
import { RadialPlot, type DiracRadialView, type TotalRadialDensityView } from "@/components/RadialPlot";
import { TelemetryBar } from "@/components/TelemetryBar";
import { Panel } from "@/components/ui";
import { WorkspaceNav } from "@/components/laboratory/WorkspaceNav";
import { AtomicSystemsWorkspace } from "@/components/laboratory/AtomicSystemsWorkspace";
import { QuantumStatesWorkspace } from "@/components/laboratory/QuantumStatesWorkspace";
import { EnergyStructureWorkspace } from "@/components/laboratory/EnergyStructureWorkspace";
import { TransitionsWorkspace } from "@/components/laboratory/TransitionsWorkspace";
import { SpectroscopyWorkspace } from "@/components/laboratory/SpectroscopyWorkspace";
import { AnalysisWorkspace } from "@/components/laboratory/AnalysisWorkspace";
import { ExperimentHistoryWorkspace } from "@/components/laboratory/ExperimentHistoryWorkspace";
import { HartreeFockWorkspace } from "@/components/laboratory/HartreeFockWorkspace";
import { AtomicTermsWorkspace } from "@/components/laboratory/AtomicTermsWorkspace";
import { useAtomsLaboratory } from "@/app/useAtomsLaboratory";
import { elementByZ } from "@/data/elements";
import { lFromKappa } from "@/domain/quantum";
import {
  extractIsosurfacesFromVolumeGrid,
  type FieldQuantity,
} from "@/numerics/isosurface/marchingTetrahedra";
import { diracFockRadialGrid } from "@/physics/diracFock";
import { BOHR_PM, SUBSHELL_LETTERS, radialExtent } from "@/physics/hydrogenic";
import { effectiveZ } from "@/physics/models";
import {
  checkDiracCoulombDomain,
  diracRadialPQ,
  integrateDiracExpectationValues,
} from "@/physics/providers/dirac";
import { hfDatasetFor, selectProvider } from "@/science/providers";
import { OrbitalScene, type SceneStats } from "@/render/OrbitalScene";
import { SamplerClient } from "@/sampling/client";
import type { SamplingParams } from "@/sampling/sampler";
import { VisualizationWorkerClient } from "@/workers/visualizationClient";
import { activeSubshell, initialState, reducer } from "@/state/appState";
import { EXPERIMENT_BUNDLE_FORMAT, EXPERIMENT_BUNDLE_VERSION } from "@/experiments/persistence/serializer";
import { useFirebase } from "@/firebase/FirebaseProvider";
import type { AtomicBookmarkDoc, CloudExperimentDoc, UserAccountDoc } from "@/firebase/validation";

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

  const lab = useAtomsLaboratory(state.Z, state.n, state.l, state.m, state.basis);
  const firebase = useFirebase();
  const syncedCloudRef = useRef<Map<string, string>>(new Map());
  const pendingBookmarkRef = useRef<{ Z: number; N: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbitalScene | null>(null);
  const clientRef = useRef<SamplerClient | null>(null);
  const visClientRef = useRef<VisualizationWorkerClient | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [isoStatus, setIsoStatus] = useState<{ triangles: number; ms: number } | null>(null);
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
  const useDiracWorkbench =
    state.mode === "single" &&
    lab.config.theoryMode === "dirac" &&
    (lab.atomicSystem.nuclearModel.kind === "point-infinite-mass" ||
      lab.atomicSystem.nuclearModel.kind === "point-finite-mass") &&
    checkDiracCoulombDomain(state.Z, lab.diracState.kappa).valid;
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

  const workbenchDiracRadial: DiracRadialView | null = useMemo(() => {
    if (!useDiracWorkbench) return null;
    const ds = lab.diracState;
    const redMass = lab.atomicSystem.reducedMassRatio;
    const ex = integrateDiracExpectationValues(ds.n, ds.kappa, state.Z, redMass, undefined, 1600);
    const l = lFromKappa(ds.kappa);
    const aScale = 1 / redMass;
    const rMax = Math.max(((3 * ds.n * ds.n - l * (l + 1)) * aScale) / (2 * state.Z) * 5, (10 * ds.n * aScale) / state.Z);
    const rBohr: number[] = [];
    const P_nkappa: number[] = [];
    const Q_nkappa: number[] = [];
    const radialProbability: number[] = [];
    for (let i = 0; i < 200; i++) {
      const r = (i / 199) * rMax;
      const pq = diracRadialPQ(ds.n, ds.kappa, r, state.Z, redMass);
      rBohr.push(r);
      P_nkappa.push(pq.P);
      Q_nkappa.push(pq.Q);
      radialProbability.push(pq.P * pq.P + pq.Q * pq.Q);
    }
    return {
      label: `${ds.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${Math.round(2 * ds.j)}/2`,
      rBohr,
      P_nkappa,
      Q_nkappa,
      radialProbability,
      integratedNorm: ex.totalSpinorNorm,
      smallFraction: ex.smallComponentNorm,
      meanR_a0: ex.meanR_a0,
    };
  }, [useDiracWorkbench, lab.diracState, lab.atomicSystem.reducedMassRatio, state.Z]);

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

  const hfOverlayActive = Boolean(lab.config.showHFVolumeInWorkbench && lab.hfWorkbenchOverlay);

  const extentPm = useMemo(() => {
    if (hfOverlayActive && lab.hfWorkbenchOverlay) {
      return lab.hfWorkbenchOverlay.grid.extentBohr * BOHR_PM;
    }
    if (useDF) {
      return Math.min(dfGrid.rMaxBohr, 18) * BOHR_PM;
    }
    if (useHF && hfDataset) return Math.min(hfDataset.density.rBohr[hfDataset.density.rBohr.length - 1], 18) * BOHR_PM;
    if (useDiracWorkbench) {
      const l = lFromKappa(lab.diracState.kappa);
      return radialExtent(lab.diracState.n, l, state.Z, 1 / lab.atomicSystem.reducedMassRatio) * BOHR_PM;
    }
    return Math.max(...specs.map((s) => radialExtent(s.params.n, s.params.l, s.params.zeff))) * BOHR_PM;
  }, [hfOverlayActive, lab.hfWorkbenchOverlay, specs, useDF, useHF, dfGrid, hfDataset, useDiracWorkbench, lab.diracState, lab.atomicSystem.reducedMassRatio, state.Z]);

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
    const visClient = new VisualizationWorkerClient();
    visClientRef.current = visClient;
    const ro = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      if (width > 0 && height > 0) scene.resize(width, height);
    });
    ro.observe(canvas.parentElement!);
    const { width, height } = canvas.parentElement!.getBoundingClientRect();
    if (width > 0 && height > 0) scene.resize(width, height);
    return () => {
      ro.disconnect();
      client.dispose();
      visClient.dispose();
      scene.dispose();
      sceneRef.current = null;
      clientRef.current = null;
      visClientRef.current = null;
      lastParams.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lab.config.workspace === "workbench") {
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      if (canvas?.parentElement && scene) {
        const { width, height } = canvas.parentElement.getBoundingClientRect();
        if (width > 0 && height > 0) scene.resize(width, height);
      }
    }
  }, [lab.config.workspace]);

  useEffect(() => {
    sceneRef.current?.applySettings(effectiveRender);
  }, [effectiveRender]);

  // frame camera when element, mode, theoryMode, or density source changes
  const frameKey = `${state.Z}|${state.mode}|${state.model}|${state.densitySource}|${useDiracWorkbench}`;
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

  // ---- sampling requests (Schrodinger / Total-density OR Dirac 4-spinor OR PySCF HF volume overlay) ----
  useEffect(() => {
    const scene = sceneRef.current, client = clientRef.current, visClient = visClientRef.current;
    if (!scene || !client) return;

    if (hfOverlayActive) {
      scene.removeLayersExcept(new Set());
      client.cancelAllExcept(new Set());
      lastParams.current.clear();
      setProgress(1);
      setElectrons(null);
      return;
    }

    if (useDiracWorkbench && visClient) {
      const keep = new Set(["single"]);
      scene.removeLayersExcept(keep);
      client.cancelAllExcept(new Set());
      lastParams.current.clear();
      scene.setSharedMax(null);
      setProgress(0.2);
      visClient.sampleDirac(
        {
          state: lab.diracState,
          Z: state.Z,
          reducedMassRatio: lab.atomicSystem.reducedMassRatio,
          count: state.count,
          seed: state.seed,
          componentView: lab.config.diracComponentView,
        },
        (cloud, elapsedMs) => {
          setProgress(1);
          setSampleMs(elapsedMs);
          setWorkerError(null);
          scene.setLayer(
            "single",
            {
              positionsBohr: cloud.positionsBohr,
              density: cloud.density,
              phase: cloud.phase,
              maxDensity: cloud.maxDensity,
              color: "#38bdf8",
            },
            1,
            true,
          );
          setElectrons(1);
          if (scene.shaderError) setGlError(`Shader error: ${scene.shaderError}`);
        },
        (msg) => setWorkerError(msg),
      );
      return;
    }

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
  }, [
    hfOverlayActive,
    specs,
    state.mode,
    useDiracWorkbench,
    lab.diracState,
    lab.atomicSystem.reducedMassRatio,
    lab.config.diracComponentView,
    state.Z,
    state.count,
    state.seed,
  ]);

  // ---- off-thread 3D Marching Tetrahedra Isosurface overlay ----
  useEffect(() => {
    const scene = sceneRef.current;
    const visClient = visClientRef.current;
    if (!scene) return;

    if (hfOverlayActive && lab.hfWorkbenchOverlay) {
      const t0 = performance.now();
      const surface = extractIsosurfacesFromVolumeGrid(lab.hfWorkbenchOverlay.grid, lab.config.isoFraction);
      scene.setIsosurfaceMeshes(surface.meshes, { wireframe: lab.config.isoWireframe, opacity: 0.72 });
      const triangles = surface.meshes.reduce((acc, m) => acc + m.triangleCount, 0);
      setIsoStatus({ triangles, ms: performance.now() - t0 });
      return;
    }

    if (!lab.config.showIsosurface || state.mode !== "single" || !visClient) {
      scene.clearIsosurfaces();
      setIsoStatus(null);
      return;
    }

    const zeffSingle = effectiveZ(state.model, element, sub);
    const quantity: FieldQuantity = useDiracWorkbench
      ? lab.config.diracComponentView === "large"
        ? "dirac-large-density"
        : lab.config.diracComponentView === "small"
          ? "dirac-small-density"
          : "dirac-total-density"
      : state.basis === "real" && effectiveRender.colorMode === "phase-real"
        ? "wavefunction-signed"
        : "density";

    const extentBohr = extentPm / BOHR_PM;
    visClient.extractIsosurface(
      {
        state: useDiracWorkbench ? lab.diracState : lab.nrState,
        Z: useDiracWorkbench ? state.Z : zeffSingle,
        reducedMassRatio: useDiracWorkbench ? lab.atomicSystem.reducedMassRatio : 1,
        quantity,
        isoFraction: lab.config.isoFraction,
        resolution: lab.config.isoResolution,
        extentBohr,
      },
      (surface, elapsedMs) => {
        scene.setIsosurfaceMeshes(surface.meshes, { wireframe: lab.config.isoWireframe, opacity: 0.52 });
        const triangles = surface.meshes.reduce((acc, m) => acc + m.triangleCount, 0);
        setIsoStatus({ triangles, ms: elapsedMs });
      },
      (msg) => setWorkerError(msg),
    );
  }, [
    hfOverlayActive,
    lab.hfWorkbenchOverlay,
    lab.config.showIsosurface,
    lab.config.isoFraction,
    lab.config.isoResolution,
    lab.config.isoWireframe,
    lab.config.diracComponentView,
    state.mode,
    state.model,
    state.basis,
    state.Z,
    effectiveRender.colorMode,
    useDiracWorkbench,
    lab.diracState,
    lab.nrState,
    lab.atomicSystem.reducedMassRatio,
    element,
    sub,
    extentPm,
  ]);

  // ---- probability current field ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const show = !hfOverlayActive && state.showCurrent && state.mode === "single" && !useDiracWorkbench && state.basis === "complex" && state.m !== 0;
    const zeff = effectiveZ(state.model, element, sub);
    scene.setCurrentField(show ? { q: { n: state.n, l: state.l, m: state.m }, zeff, rMaxBohr: radialExtent(state.n, state.l, zeff) * 0.6 } : null);
  }, [state.showCurrent, state.mode, state.basis, state.n, state.l, state.m, state.model, element, sub, useDiracWorkbench]);

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

  // Automatically sync newly completed experiments to Cloud Firestore when authenticated & verified
  useEffect(() => {
    if (!firebase.user || !firebase.user.emailVerified) {
      syncedCloudRef.current.clear();
      return;
    }
    for (const entry of lab.history) {
      const lastExec = entry.executions[entry.executions.length - 1];
      if (!lastExec || lastExec.status !== "completed") continue;
      const sig = `${entry.executions.length}:${entry.latestResult?.resultId ?? "none"}`;
      if (syncedCloudRef.current.get(entry.definition.id) === sig) continue;
      syncedCloudRef.current.set(entry.definition.id, sig);
      void firebase
        .syncExperiment({
          definition: entry.definition,
          executions: entry.executions,
          latestResult: entry.latestResult,
        })
        .catch(() => {
          // Non-fatal: local IndexedDB remains authoritative; allow retry on next update
          syncedCloudRef.current.delete(entry.definition.id);
        });
    }
  }, [firebase, firebase.user, lab.history]);

  // Apply non-neutral electronCount N from a bookmark after useAtomsLaboratory's prevZ reset
  useEffect(() => {
    const pending = pendingBookmarkRef.current;
    if (pending && state.Z === pending.Z) {
      pendingBookmarkRef.current = null;
      if (lab.config.electronCount !== pending.N) {
        lab.patchConfig({ electronCount: pending.N });
      }
    }
  }, [state.Z, lab]);

  const handleApplyBookmark = useCallback(
    (bm: AtomicBookmarkDoc) => {
      pendingBookmarkRef.current = { Z: bm.Z, N: bm.N };
      if (bm.Z !== state.Z) {
        dispatch({ type: "selectElement", Z: bm.Z });
      } else if (lab.config.electronCount !== bm.N) {
        lab.patchConfig({ electronCount: bm.N });
      }
      lab.patchConfig({
        electronCount: bm.N,
        theoryMode: bm.theoryMode,
        workspace: bm.workspace,
      });
    },
    [state.Z, lab],
  );

  const handleApplyCloudPreferences = useCallback(
    (account: UserAccountDoc) => {
      if (account.preferredZ !== state.Z) {
        dispatch({ type: "selectElement", Z: account.preferredZ });
      }
      lab.patchConfig({ theoryMode: account.preferredTheoryMode });
    },
    [state.Z, lab],
  );

  const handleImportCloudExperiment = useCallback(
    async (ce: CloudExperimentDoc) => {
      const bundle = {
        format: EXPERIMENT_BUNDLE_FORMAT,
        bundleVersion: EXPERIMENT_BUNDLE_VERSION,
        exportedAtIso: new Date().toISOString(),
        entries: [
          {
            definition: ce.definition,
            executions: ce.executions,
            results: ce.latestResult ? [ce.latestResult] : [],
          },
        ],
      };
      await lab.importExperimentJson(JSON.stringify(bundle));
    },
    [lab],
  );

  const zeffActive = effectiveZ(state.model, element, sub);
  const currentNote = state.showCurrent && (state.basis !== "complex" || state.m === 0 || state.mode === "atom");
  const densityLabel = useDF
    ? "Dirac–Fock (Lobato 2026)"
    : useHF
      ? "PySCF HF (bundled)"
      : useDiracWorkbench
        ? "Dirac–Coulomb 4-spinor"
        : state.model === "hydrogenic-exact"
          ? "exact hydrogenic"
          : "Slater estimate";

  const activeExecCount = lab.executions.filter((e) => e.status === "queued" || e.status === "running").length;

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

      <WorkspaceNav
        active={lab.config.workspace}
        onSelect={(workspace) => lab.patchConfig({ workspace })}
        activeCount={activeExecCount}
      />

      {/* Workbench keeps its live WebGL2 canvas mounted without losing scene state across workspace switches */}
      <div className={lab.config.workspace === "workbench" ? "flex min-h-0 flex-1" : "hidden"}>
        <aside className={cn("w-[340px] shrink-0 border-r border-zinc-800 bg-zinc-950 lg:block", mobilePanel === "controls" ? "fixed inset-y-20 left-0 z-20 block w-[88vw] max-w-[340px]" : "hidden")}>
          <ControlRail
            state={state}
            element={element}
            dispatch={dispatch}
            extentPm={extentPm}
            layerColors={layerColors}
            onResetCamera={resetCamera}
            labConfig={lab.config}
            onPatchLab={lab.patchConfig}
            electronCount={lab.atomicSystem.N}
          />
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
            <span>axes: <span className="text-red-400">x</span> <span className="text-green-400">y</span> <span className="text-blue-400">z (polar)</span> · drag: orbit · right-drag: pan · wheel: zoom · ATOMS v0.7.1</span>
            {hfOverlayActive && lab.hfWorkbenchOverlay && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-sm border border-sky-800 bg-sky-950/75 px-2 py-1 text-sky-200">
                <span>
                  PySCF {lab.hfWorkbenchOverlay.title} · {lab.hfWorkbenchOverlay.grid.quantity} (MO#{lab.hfWorkbenchOverlay.grid.orbitalIndex}, {lab.hfWorkbenchOverlay.grid.gridN}³ grid, {isoStatus?.triangles.toLocaleString() ?? 0} triangles)
                </span>
                <button
                  type="button"
                  onClick={() => lab.patchConfig({ showHFVolumeInWorkbench: false })}
                  className="rounded-sm border border-sky-600 px-1.5 py-0.5 text-[10px] hover:bg-sky-900"
                >
                  Exit HF Overlay
                </button>
              </div>
            )}
            {effectiveRender.colorMode === "phase-real" && !hfOverlayActive && <span><span className="text-orange-400">■ ψ &gt; 0</span> <span className="text-blue-400">■ ψ &lt; 0</span> — sign of the real wavefunction (not density)</span>}
            {effectiveRender.colorMode === "phase-complex" && !hfOverlayActive && <span>hue = arg ψ ∈ (−π, π] — complex phase e<sup>imφ</sup>; brightness ∝ log|ψ|²</span>}
            {effectiveRender.colorMode === "density" && !hfOverlayActive && <span>colour/brightness ∝ log-relative density (black→violet→red→yellow→white)</span>}
            {state.mode === "atom" && !isTotalDensityOnly && !hfOverlayActive && <span>independent-electron density ρ = Σ Nᵢ|Rᵢ|²/(4π) (configuration-average, Unsöld). Brightness uses a <b>shared</b> cross-subshell normalisation; point count ∝ occupancy. Not a correlated many-electron density.</span>}
            {useDF && !hfOverlayActive && <span className="text-sky-300">Lobato et al. (2026) relativistic B-spline Dirac–Fock total spherical density (finite nucleus, spherical average). Subshell orbitals &amp; phase are not resolved.</span>}
            {useHF && !hfOverlayActive && <span className="text-sky-300">imported PySCF {hfDataset?.method}/{hfDataset?.basis} spherically averaged HF density (basis-set-limited, non-relativistic). Not experimental.</span>}
            {useDiracWorkbench && !hfOverlayActive && <span className="text-sky-300">Dirac–Coulomb 4-spinor sampling ({lab.config.diracComponentView} view): P and Q are coupled spinor components of one eigenstate, not separate orbitals.</span>}
            {lab.config.showIsosurface && !hfOverlayActive && (
              <span className="text-amber-300">
                3D Marching Tetrahedra isosurface at {(lab.config.isoFraction * 100).toFixed(0)}% max ({lab.config.isoResolution}³ grid)
                {isoStatus ? ` · ${isoStatus.triangles.toLocaleString()} triangles extracted in ${isoStatus.ms.toFixed(0)} ms` : " · extracting in worker..."}
                .
              </span>
            )}
            {state.mode === "atom" && electrons !== null && !hfOverlayActive && <span>∫ρ dV = {electrons.toFixed(3)} e (occupancy/tabulated check)</span>}
            {currentNote && !hfOverlayActive && <span className="text-amber-300">j = (ħ/m) Im(ψ*∇ψ) vanishes identically for real stationary orbitals, m = 0, and total-density views; select single-orbital complex basis with m ≠ 0.</span>}
            {state.showCurrent && !currentNote && !hfOverlayActive && <span className="text-emerald-300">green segments: probability-current density j ∝ m|ψ|²/(r sinθ) φ̂ (azimuthal circulation about z)</span>}
          </div>
        </main>
        <aside className={cn("w-[360px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 lg:flex", mobilePanel === "analysis" ? "fixed inset-y-20 right-0 z-20 flex w-[92vw] max-w-[360px]" : "hidden")}>
          <div className="flex border-b border-zinc-800 text-[11px]">
            {(["radial", "energy", "inspector"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 uppercase tracking-wider ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
                {t === "radial" ? "Radial P(r)" : t === "energy" ? "Levels" : "Inspector"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "radial" && (
              <Panel title={totalRadialView ? "Total radial density 4πr²ρ(r)" : workbenchDiracRadial ? "Dirac spinor radial components" : "Radial probability distribution"}>
                <RadialPlot
                  mode={workbenchDiracRadial ? "dirac" : state.mode}
                  n={state.n}
                  l={state.l}
                  zeff={zeffActive}
                  model={state.model}
                  totalDensity={totalRadialView}
                  diracView={workbenchDiracRadial}
                />
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

      {lab.config.workspace === "atomic-systems" && (
        <div className="min-h-0 flex-1">
          <AtomicSystemsWorkspace
            element={element}
            system={lab.atomicSystem}
            activeState={lab.activeQuantumState}
            isotopes={lab.isotopes}
            activeIsotope={lab.activeIsotope}
            config={lab.config}
            assessments={lab.providerAssessments}
            onSelectZ={(Z) => dispatch({ type: "selectElement", Z })}
            onPatchConfig={lab.patchConfig}
            onRunSingleExperiment={() => {
              void lab.runSingleStateExperiment();
              lab.patchConfig({ workspace: "experiment-history" });
            }}
          />
        </div>
      )}

      {lab.config.workspace === "quantum-states" && (
        <div className="min-h-0 flex-1">
          <QuantumStatesWorkspace
            system={lab.atomicSystem}
            config={lab.config}
            nrState={lab.nrState}
            diracState={lab.diracState}
            onPatchConfig={lab.patchConfig}
            onSelectNR={(n, l, m, basis) => {
              dispatch({ type: "selectSubshell", n, l });
              dispatch({ type: "setM", m });
              if (basis) dispatch({ type: "set", patch: { basis } });
            }}
            onRunExperiment={() => {
              void lab.runSingleStateExperiment();
              lab.patchConfig({ workspace: "experiment-history" });
            }}
          />
        </div>
      )}

      {lab.config.workspace === "energy-structure" && (
        <div className="min-h-0 flex-1">
          <EnergyStructureWorkspace element={element} system={lab.atomicSystem} />
        </div>
      )}

      {lab.config.workspace === "transitions" && (
        <div className="min-h-0 flex-1">
          <TransitionsWorkspace
            system={lab.atomicSystem}
            onRunTransitionExperiment={(initial, final, providerId, title) => {
              void lab.runTransitionExperiment(initial, final, providerId, title);
              lab.patchConfig({ workspace: "experiment-history" });
            }}
          />
        </div>
      )}

      {lab.config.workspace === "spectroscopy" && (
        <div className="min-h-0 flex-1">
          <SpectroscopyWorkspace
            system={lab.atomicSystem}
            config={lab.config}
            onPatchConfig={lab.patchConfig}
            onRunSpectroscopyExperiment={(model) => {
              void lab.runSpectroscopyExperiment(model);
              lab.patchConfig({ workspace: "experiment-history" });
            }}
          />
        </div>
      )}

      {lab.config.workspace === "hartree-fock" && (
        <div className="min-h-0 flex-1">
          <HartreeFockWorkspace
            initialZ={state.Z}
            capabilities={lab.hfCapabilities}
            probing={lab.hfProbing}
            executions={lab.executions}
            selectedResult={lab.selectedResult}
            activeOverlay={lab.config.showHFVolumeInWorkbench ? lab.hfWorkbenchOverlay : null}
            onRefreshCapabilities={() => {
              void lab.refreshHFCapabilities();
            }}
            onCancelExecution={lab.cancelExecution}
            onRunHF={lab.runHartreeFockExperiment}
            onProjectToWorkbench={(overlay) => {
              lab.setHfWorkbenchOverlay(overlay);
              lab.patchConfig({ showHFVolumeInWorkbench: true, workspace: "workbench" });
            }}
            onClearWorkbenchOverlay={() => {
              lab.patchConfig({ showHFVolumeInWorkbench: false });
            }}
          />
        </div>
      )}

      {lab.config.workspace === "atomic-terms" && (
        <div className="min-h-0 flex-1">
          <AtomicTermsWorkspace
            initialZ={state.Z}
            capabilities={lab.lsCapabilities}
            probing={lab.lsProbing}
            executions={lab.executions}
            selectedResult={lab.selectedResult}
            onRefreshCapabilities={(refresh) => {
              void lab.refreshLSCapabilities(refresh);
            }}
            onCancelExecution={lab.cancelExecution}
            onRunLSCI={lab.runLSTermCIExperiment}
          />
        </div>
      )}

      {lab.config.workspace === "analysis" && (
        <div className="min-h-0 flex-1">
          <AnalysisWorkspace
            element={element}
            system={lab.atomicSystem}
            sub={sub}
            model={state.model}
            zeff={zeffActive}
            nrState={lab.nrState}
            diracState={lab.diracState}
            config={lab.config}
            providerSelection={providerSelection}
            totalRadialView={totalRadialView}
            electrons={electrons}
            hfWorkbenchOverlay={lab.hfWorkbenchOverlay}
          />
        </div>
      )}

      {lab.config.workspace === "experiment-history" && (
        <div className="min-h-0 flex-1">
          <ExperimentHistoryWorkspace
            history={lab.history}
            executions={lab.executions}
            selectedResult={lab.selectedResult}
            platformNotice={lab.platformNotice}
            currentZ={state.Z}
            currentN={lab.atomicSystem.N}
            currentTheoryMode={lab.config.theoryMode}
            onRunSingleState={() => {
              void lab.runSingleStateExperiment();
            }}
            onCancelExecution={lab.cancelExecution}
            onReplayExperiment={(id) => {
              void lab.replayStoredExperiment(id);
            }}
            onRerunExperiment={(def) => {
              void lab.rerunStoredExperiment(def);
            }}
            onDeleteExperiment={(id) => {
              void lab.deleteStoredExperiment(id);
            }}
            onExportJson={lab.exportExperimentJson}
            onImportJson={lab.importExperimentJson}
            onApplyBookmark={handleApplyBookmark}
            onApplyPreferences={handleApplyCloudPreferences}
            onImportCloudExperiment={handleImportCloudExperiment}
          />
        </div>
      )}
    </div>
  );
}

function ScaleBar({ extentPm }: { extentPm: number }) {
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
