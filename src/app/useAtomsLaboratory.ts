/**
 * Unified ATOMS Laboratory state & Experiment Platform hook (ATOMS v0.6.0 Phase 7).
 *
 * Bridges:
 *  - Domain model: AtomicSystem (Z, N, q, isotope, nuclearModel), QuantumState (NR & Dirac)
 *  - Physics providers: PhysicsProviderRegistry, NR & Dirac E1 transitions, Spectroscopy
 *  - Experiment Platform: ExperimentRunner, ExperimentWorkerClient, IndexedDBExperimentStore,
 *    ExperimentSerializer (with replay vs recompute tracking)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAtomicSystem,
  createNuclearModelForIsotope,
  defaultIsotopeForZ,
  listIsotopesForZ,
  type AtomicSystem,
  type IsotopeSpec,
  type NuclearModel,
} from "@/domain/atomic";
import {
  createElectronCorrelationState,
  createLSTermCIState,
  createMultiElectronHFState,
  createNonRelativisticState,
  createRelativisticState,
  jFromKappa,
  type NonRelativisticState,
  type QuantumState,
  type RelativisticState,
} from "@/domain/quantum";
import { createDefaultProviderRegistry, type PhysicsProviderRegistry } from "@/physics/providers/registry";
import { DIRAC_PROVIDER_ID } from "@/physics/providers/dirac";
import { SCHRODINGER_PROVIDER_ID } from "@/physics/providers/schrodinger";
import type { SpectralSeriesKind, SpectrumMode } from "@/physics/spectroscopy";
import {
  createExperimentDefinition,
  type ExperimentDefinition,
  type ExperimentExecution,
  type ExperimentResultRecord,
} from "@/experiments/schema";
import { ExperimentRunner } from "@/experiments/execution/runner";
import {
  IndexedDBExperimentStore,
  MemoryExperimentStore,
  type ExperimentStorageBackend,
} from "@/experiments/persistence/store";
import { ExperimentSerializer } from "@/experiments/persistence/serializer";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import { createBrowserExperimentWorker } from "@/workers/browserWorkerFactory";
import {
  defaultHttpHFTransport,
  probeHFCapabilities,
  type HFBasisId,
  type HFCalculationResponse,
  type HFCapabilitiesResponse,
  type HFMethod,
  type HFOccupationMode,
  type HFSCFOptions,
  type HFVolumeGridPayload,
  type HFVolumeGridSpec,
  type SubshellOccupation,
} from "@/physics/hf";
import { PYSCF_LIVE_PROVIDER_ID, PYSCF_LIVE_PROVIDER_VERSION } from "@/physics/providers/hartreeFock";
import {
  formatTermSymbol,
  probeLSCapabilities,
  type ConfigurationParity,
  type LSActiveSpaceMode,
  type LSCapabilitiesResponse,
  type SubshellOccupancySpec,
} from "@/physics/ls";
import { LS_TERM_CI_PROVIDER_ID, LS_TERM_CI_PROVIDER_VERSION } from "@/physics/providers/lsTermCi";
import {
  probeCorrelationCapabilities,
  type CorrelationCapabilitiesResponse,
  type CorrelationMethodId,
  type CorrelationOptions,
  type CorrelationReferenceMethod,
  type FrozenCoreMode,
} from "@/physics/correlation";
import {
  PYSCF_CORRELATION_PROVIDER_ID,
  PYSCF_CORRELATION_PROVIDER_VERSION,
} from "@/physics/providers/correlation";
import type { DiracComponentView } from "@/workers/visualization.worker";

export type WorkspaceId =
  | "workbench"
  | "atomic-systems"
  | "quantum-states"
  | "energy-structure"
  | "transitions"
  | "spectroscopy"
  | "hartree-fock"
  | "atomic-terms"
  | "electron-correlation"
  | "analysis"
  | "experiment-history";

export type QuantumTheoryMode = "schrodinger" | "dirac";

export interface SavedExperimentEntry {
  readonly definition: ExperimentDefinition;
  readonly executions: readonly ExperimentExecution[];
  readonly results: readonly ExperimentResultRecord[];
  readonly latestResult?: ExperimentResultRecord;
}

export interface HFWorkbenchOverlay {
  readonly title: string;
  readonly method: HFMethod;
  readonly basis: HFBasisId;
  readonly symbol: string;
  readonly grid: HFVolumeGridPayload;
}

export interface LaboratoryConfig {
  readonly workspace: WorkspaceId;
  readonly electronCount: number;
  readonly massNumber?: number;
  readonly nuclearModelKind: NuclearModel["kind"];
  readonly theoryMode: QuantumTheoryMode;
  readonly m_s: 0.5 | -0.5;
  readonly diracN: number;
  readonly diracKappa: number;
  readonly diracMj: number;
  readonly diracComponentView: DiracComponentView;
  readonly showIsosurface: boolean;
  readonly isoFraction: number;
  readonly isoResolution: 24 | 32 | 40;
  readonly isoWireframe: boolean;
  readonly showHFVolumeInWorkbench: boolean;
  readonly spectroscopySeries: SpectralSeriesKind;
  readonly spectroscopyMode: SpectrumMode;
  readonly spectroscopyCustomLowerN: number;
  readonly spectroscopyMaxUpperN: number;
  readonly spectroscopyCompareModels: boolean;
  readonly spectroscopyMinNm: number | undefined;
  readonly spectroscopyMaxNm: number | undefined;
}

export function clampKappaForN(n: number, prevKappa: number): number {
  const kAbs = Math.abs(prevKappa);
  if (kAbs >= 1 && kAbs <= n && !(prevKappa === n && n > 0)) {
    // valid Dirac kappa has l = kappa > 0 ? kappa : -kappa - 1 < n
    const l = prevKappa > 0 ? prevKappa : -prevKappa - 1;
    if (l >= 0 && l < n) return prevKappa;
  }
  return -1; // 1s/ns1/2 fallback
}

export function clampMjForKappa(kappa: number, prevMj: number): number {
  const j = jFromKappa(kappa);
  if (Math.abs(prevMj) <= j && Math.abs(Math.round(prevMj - 0.5) - (prevMj - 0.5)) < 1e-6) {
    return prevMj;
  }
  return 0.5;
}

export function useAtomsLaboratory(
  Z: number,
  nrN: number,
  nrL: number,
  nrM: number,
  nrBasis: "real" | "complex",
) {
  const [config, setConfig] = useState<LaboratoryConfig>(() => ({
    workspace: "workbench",
    electronCount: Z,
    massNumber: undefined,
    nuclearModelKind: Z <= 2 ? "point-finite-mass" : "point-infinite-mass",
    theoryMode: "schrodinger",
    m_s: 0.5,
    diracN: 2,
    diracKappa: -2,
    diracMj: 0.5,
    diracComponentView: "total",
    showIsosurface: false,
    isoFraction: 0.25,
    isoResolution: 24,
    isoWireframe: false,
    showHFVolumeInWorkbench: false,
    spectroscopySeries: "balmer",
    spectroscopyMode: "emission",
    spectroscopyCustomLowerN: 4,
    spectroscopyMaxUpperN: 6,
    spectroscopyCompareModels: true,
    spectroscopyMinNm: undefined,
    spectroscopyMaxNm: undefined,
  }));

  // Keep electronCount synced to neutral Z when user picks a new element in the periodic table
  const prevZ = useRef(Z);
  useEffect(() => {
    if (prevZ.current !== Z) {
      prevZ.current = Z;
      setConfig((prev) => ({
        ...prev,
        electronCount: Z,
        massNumber: undefined,
        nuclearModelKind: Z <= 2 ? "point-finite-mass" : "point-infinite-mass",
      }));
    }
  }, [Z]);

  const isotopes: readonly IsotopeSpec[] = useMemo(() => listIsotopesForZ(Z), [Z]);

  const activeIsotope: IsotopeSpec = useMemo(
    () => defaultIsotopeForZ(Z, config.massNumber),
    [Z, config.massNumber],
  );

  const nuclearModel: NuclearModel = useMemo(
    () => createNuclearModelForIsotope(config.nuclearModelKind, activeIsotope),
    [config.nuclearModelKind, activeIsotope],
  );

  const atomicSystem: AtomicSystem = useMemo(
    () =>
      createAtomicSystem({
        Z,
        N: config.electronCount,
        massNumber: activeIsotope.massNumber,
        nuclearModel,
      }),
    [Z, config.electronCount, activeIsotope.massNumber, nuclearModel],
  );

  const nrState: NonRelativisticState = useMemo(
    () =>
      createNonRelativisticState({
        n: nrN,
        l: nrL,
        m_l: nrM,
        m_s: config.m_s,
        basis: nrBasis,
      }),
    [nrN, nrL, nrM, config.m_s, nrBasis],
  );

  const diracState: RelativisticState = useMemo(() => {
    const k = clampKappaForN(config.diracN, config.diracKappa);
    const mj = clampMjForKappa(k, config.diracMj);
    return createRelativisticState({ n: config.diracN, kappa: k, m_j: mj });
  }, [config.diracN, config.diracKappa, config.diracMj]);

  const activeQuantumState: QuantumState =
    config.theoryMode === "dirac" ? diracState : nrState;

  const providerRegistry: PhysicsProviderRegistry = useMemo(
    () => createDefaultProviderRegistry(),
    [],
  );

  const providerAssessments = useMemo(
    () => providerRegistry.assessAll(atomicSystem, activeQuantumState),
    [providerRegistry, atomicSystem, activeQuantumState],
  );

  // ---- Experiment Platform runtime (Runner + Worker + IndexedDB/Memory store) ----
  const storeRef = useRef<ExperimentStorageBackend | null>(null);
  const runnerRef = useRef<ExperimentRunner | null>(null);
  const workerClientRef = useRef<ExperimentWorkerClient | null>(null);

  const [history, setHistory] = useState<readonly SavedExperimentEntry[]>([]);
  const [executions, setExecutions] = useState<readonly ExperimentExecution[]>([]);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<ExperimentResultRecord | null>(null);
  const [platformNotice, setPlatformNotice] = useState<string | null>(null);
  const [hfCapabilities, setHfCapabilities] = useState<HFCapabilitiesResponse | null>(null);
  const [hfProbing, setHfProbing] = useState<boolean>(false);
  const [lsCapabilities, setLsCapabilities] = useState<LSCapabilitiesResponse | null>(null);
  const [lsProbing, setLsProbing] = useState<boolean>(false);
  const [correlationCapabilities, setCorrelationCapabilities] =
    useState<CorrelationCapabilitiesResponse | null>(null);
  const [correlationProbing, setCorrelationProbing] = useState<boolean>(false);
  const [hfWorkbenchOverlay, setHfWorkbenchOverlay] = useState<HFWorkbenchOverlay | null>(null);
  const activeHandles = useRef(new Map<string, { cancel: (reason?: string) => void }>());

  const refreshHFCapabilities = useCallback(async () => {
    setHfProbing(true);
    try {
      const cap = await probeHFCapabilities(defaultHttpHFTransport);
      setHfCapabilities(cap);
      return cap;
    } finally {
      setHfProbing(false);
    }
  }, []);

  const refreshLSCapabilities = useCallback(async (refresh = false) => {
    setLsProbing(true);
    try {
      const cap = await probeLSCapabilities(undefined, refresh);
      setLsCapabilities(cap);
      return cap;
    } finally {
      setLsProbing(false);
    }
  }, []);

  const refreshCorrelationCapabilities = useCallback(async (refresh = false) => {
    setCorrelationProbing(true);
    try {
      const cap = await probeCorrelationCapabilities(undefined, refresh);
      setCorrelationCapabilities(cap);
      return cap;
    } finally {
      setCorrelationProbing(false);
    }
  }, []);

  useEffect(() => {
    void refreshHFCapabilities();
    void refreshLSCapabilities(false);
    void refreshCorrelationCapabilities(false);
  }, [refreshHFCapabilities, refreshLSCapabilities, refreshCorrelationCapabilities]);

  const refreshStore = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    const defs = await store.listExperiments();
    const entries: SavedExperimentEntry[] = [];
    for (const def of defs) {
      const bundle = await store.loadExperimentBundle(def.id);
      const latestResult =
        bundle.results.length > 0 ? bundle.results[bundle.results.length - 1] : undefined;
      entries.push({
        definition: bundle.definition ?? def,
        executions: bundle.executions,
        results: bundle.results,
        latestResult,
      });
    }
    setHistory(entries);
  }, []);

  useEffect(() => {
    const store: ExperimentStorageBackend =
      typeof indexedDB !== "undefined" ? new IndexedDBExperimentStore() : new MemoryExperimentStore();
    storeRef.current = store;

    let workerClient: ExperimentWorkerClient | undefined;
    if (typeof Worker !== "undefined") {
      workerClient = new ExperimentWorkerClient(() => createBrowserExperimentWorker());
      workerClientRef.current = workerClient;
    }

    const runner = new ExperimentRunner({
      providerRegistry,
      store,
      workerClient,
    });
    runnerRef.current = runner;

    void refreshStore();

    return () => {
      for (const h of activeHandles.current.values()) h.cancel("Laboratory unmounted");
      activeHandles.current.clear();
      workerClient?.dispose();
      if (store instanceof IndexedDBExperimentStore) {
        store.close();
      }
    };
  }, [providerRegistry, refreshStore]);

  const submitExperiment = useCallback(
    async (def: ExperimentDefinition, isRerun = false) => {
      const runner = runnerRef.current;
      if (!runner) return;
      setSelectedExperimentId(def.id);
      setPlatformNotice(null);

      const handle = isRerun
        ? runner.rerun(def, { mode: workerClientRef.current ? "worker" : "direct", persist: true })
        : runner.run(def, { mode: workerClientRef.current ? "worker" : "direct", persist: true });

      activeHandles.current.set(handle.execution.executionId, { cancel: handle.cancel });
      setExecutions((prev) => [handle.execution, ...prev.slice(0, 29)]);

      const { execution, result } = await handle.completion;
      activeHandles.current.delete(handle.execution.executionId);
      setExecutions((prev) => [execution, ...prev.filter((e) => e.executionId !== execution.executionId)]);
      if (result) {
        setSelectedResult(result);
      }
      await refreshStore();
      return { execution, result };
    },
    [refreshStore],
  );

  const runSingleStateExperiment = useCallback(async () => {
    const isDirac = config.theoryMode === "dirac";
    const providerId = isDirac ? DIRAC_PROVIDER_ID : SCHRODINGER_PROVIDER_ID;
    const def = createExperimentDefinition({
      kind: "single-state",
      title: `${atomicSystem.species.symbol}${atomicSystem.q === 0 ? "" : `${atomicSystem.q > 0 ? `+${atomicSystem.q}` : atomicSystem.q}`} ${isDirac ? "Dirac" : "Schrödinger"} State`,
      system: atomicSystem,
      quantumStates: [activeQuantumState],
      providerId,
      providerVersion: "0.6.1",
      observables: isDirac
        ? ["bound-energy", "total-energy", "spinor-wavefunction", "expectation-values", "fine-structure"]
        : ["bound-energy", "total-energy", "radial-wavefunction", "expectation-values"],
      numericalParameters: { gridPoints: 512, quadratureIntervals: 4000 },
    });
    return submitExperiment(def);
  }, [atomicSystem, activeQuantumState, config.theoryMode, submitExperiment]);

  const runTransitionExperiment = useCallback(
    async (
      initial: NonRelativisticState | RelativisticState,
      final: NonRelativisticState | RelativisticState,
      providerId: string,
      title: string,
    ) => {
      const def = createExperimentDefinition({
        kind: "e1-transition",
        title,
        system: atomicSystem,
        quantumStates: [],
        transition: { initial, final },
        providerId,
        providerVersion: "0.6.1",
        observables: ["e1-transitions"],
        numericalParameters: { quadratureIntervals: 4000 },
      });
      return submitExperiment(def);
    },
    [atomicSystem, submitExperiment],
  );

  const runSpectroscopyExperiment = useCallback(
    async (model: "schrodinger-coulomb" | "dirac-coulomb") => {
      const def = createExperimentDefinition({
        kind: "spectroscopy-series",
        title: `${atomicSystem.species.symbol} ${config.spectroscopySeries} (${model})`,
        system: atomicSystem,
        quantumStates: [],
        providerId: model,
        providerVersion: "0.6.1",
        observables: ["spectroscopy", "e1-transitions"],
        modelParameters: {
          series: config.spectroscopySeries,
          mode: config.spectroscopyMode,
          ...(config.spectroscopySeries === "custom" ? { customLowerN: config.spectroscopyCustomLowerN } : {}),
          maxUpperN: config.spectroscopyMaxUpperN,
          ...(config.spectroscopyMinNm !== undefined ? { minWavelength_nm: config.spectroscopyMinNm } : {}),
          ...(config.spectroscopyMaxNm !== undefined ? { maxWavelength_nm: config.spectroscopyMaxNm } : {}),
        },
        numericalParameters: { quadratureIntervals: 2400 },
      });
      return submitExperiment(def);
    },
    [atomicSystem, config, submitExperiment],
  );

  const runHartreeFockExperiment = useCallback(
    async (params: {
      readonly Z: number;
      readonly N: number;
      readonly spin2S: number;
      readonly method: HFMethod;
      readonly basis: HFBasisId;
      readonly occupationMode: HFOccupationMode;
      readonly subshellOccupations: readonly SubshellOccupation[];
      readonly useSymmetry: boolean;
      readonly scfOptions: HFSCFOptions;
      readonly volumeGrid?: HFVolumeGridSpec;
    }) => {
      const iso = defaultIsotopeForZ(params.Z);
      const hfSystem = createAtomicSystem({
        Z: params.Z,
        N: params.N,
        massNumber: iso.massNumber,
        nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
      });
      const hfState = createMultiElectronHFState({
        N: params.N,
        method: params.method,
        basis: params.basis,
        occupationMode: params.occupationMode,
        spin2S: params.spin2S,
        subshellOccupations: params.subshellOccupations,
        useSymmetry: params.useSymmetry,
        scfOptions: params.scfOptions,
        volumeGrid: params.volumeGrid,
      });
      const observables = [
        "multi-electron-hf",
        "total-energy",
        "orbital-resolved-hf",
        "total-spherical-density",
        "radial-probability",
        "scf-diagnostics",
        ...(params.method === "uhf" || params.method === "rohf" ? (["spin-density"] as const) : []),
        ...(params.volumeGrid?.enabled ? (["spatial-density"] as const) : []),
      ] as const;

      const chargeTag =
        hfSystem.q === 0 ? "" : hfSystem.q > 0 ? `+${hfSystem.q}` : `${hfSystem.q}`;
      const def = createExperimentDefinition({
        kind: "multi-electron-hf",
        title: `${hfSystem.species.symbol}${chargeTag} ${params.method.toUpperCase()}/${params.basis}`,
        system: hfSystem,
        quantumStates: [hfState],
        providerId: PYSCF_LIVE_PROVIDER_ID,
        providerVersion: PYSCF_LIVE_PROVIDER_VERSION,
        observables: [...observables],
        modelParameters: {
          method: params.method,
          basis: params.basis,
          occupationMode: params.occupationMode,
          spin2S: params.spin2S,
          useSymmetry: params.useSymmetry,
        },
        numericalParameters: {
          convTol: params.scfOptions.convTol ?? 1e-9,
          maxCycle: params.scfOptions.maxCycle ?? 80,
          initGuess: params.scfOptions.initGuess ?? "minao",
          diis: params.scfOptions.diis ?? "cdiis",
        },
      });
      const outcome = await submitExperiment(def);
      if (outcome?.result) {
        const resPayload = outcome.result.payload as HFCalculationResponse;
        if (resPayload.volumeGrid) {
          setHfWorkbenchOverlay({
            title: def.title,
            method: params.method,
            basis: params.basis,
            symbol: hfSystem.species.symbol,
            grid: resPayload.volumeGrid,
          });
        }
      }
      return outcome;
    },
    [submitExperiment],
  );

  const runLSTermCIExperiment = useCallback(
    async (params: {
      readonly Z: number;
      readonly N: number;
      readonly basis: HFBasisId;
      readonly referenceConfiguration: readonly SubshellOccupancySpec[];
      readonly targetL: number;
      readonly targetSpin2S: number;
      readonly targetParity: ConfigurationParity;
      readonly activeSpaceMode: LSActiveSpaceMode;
      readonly frozenCoreSubshells?: readonly SubshellOccupancySpec[];
      readonly activeShells?: readonly { readonly n: number; readonly l: number }[];
      readonly customConfigurations?: readonly (readonly SubshellOccupancySpec[])[];
      readonly maxExcitationRank?: number;
      readonly nRoots: number;
      readonly crossCheckPyscfFci: boolean;
    }) => {
      const iso = defaultIsotopeForZ(params.Z);
      const lsSystem = createAtomicSystem({
        Z: params.Z,
        N: params.N,
        massNumber: iso.massNumber,
        nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
      });
      const lsState = createLSTermCIState({
        N: params.N,
        basis: params.basis,
        referenceConfiguration: params.referenceConfiguration,
        targetL: params.targetL,
        targetSpin2S: params.targetSpin2S,
        targetParity: params.targetParity,
        activeSpaceMode: params.activeSpaceMode,
        frozenCoreSubshells: params.frozenCoreSubshells,
        activeShells: params.activeShells,
        customConfigurations: params.customConfigurations,
        maxExcitationRank: params.maxExcitationRank,
        nRoots: params.nRoots,
        crossCheckPyscfFci: params.crossCheckPyscfFci,
      });

      const chargeTag =
        lsSystem.q === 0 ? "" : lsSystem.q > 0 ? `+${lsSystem.q}` : `${lsSystem.q}`;
      const termSym = formatTermSymbol(params.targetSpin2S, params.targetL, params.targetParity);
      const def = createExperimentDefinition({
        kind: "ls-term-ci",
        title: `${lsSystem.species.symbol}${chargeTag} ${termSym} LS-CI/${params.basis}`,
        system: lsSystem,
        quantumStates: [lsState],
        providerId: LS_TERM_CI_PROVIDER_ID,
        providerVersion: LS_TERM_CI_PROVIDER_VERSION,
        observables: ["ls-term-ci", "ls-term-enumeration", "total-energy"],
        modelParameters: {
          basis: params.basis,
          targetL: params.targetL,
          targetSpin2S: params.targetSpin2S,
          targetParity: params.targetParity,
          activeSpaceMode: params.activeSpaceMode,
          ...(params.maxExcitationRank !== undefined ? { maxExcitationRank: params.maxExcitationRank } : {}),
        },
        numericalParameters: {
          nRoots: params.nRoots,
          crossCheckPyscfFci: params.crossCheckPyscfFci,
        },
      });
      return submitExperiment(def);
    },
    [submitExperiment],
  );

  const runElectronCorrelationExperiment = useCallback(
    async (params: {
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
    }) => {
      const iso = defaultIsotopeForZ(params.Z);
      const corrSystem = createAtomicSystem({
        Z: params.Z,
        N: params.N,
        massNumber: iso.massNumber,
        nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
      });
      const corrState = createElectronCorrelationState({
        N: params.N,
        spin2S: params.spin2S,
        basis: params.basis,
        referenceMethod: params.referenceMethod,
        correlationMethod: params.correlationMethod,
        frozenCoreMode: params.frozenCoreMode,
        nRoots: params.nRoots,
        fixSpin: params.fixSpin,
        scfOptions: params.scfOptions,
        correlationOptions: params.correlationOptions,
      });

      const methodCaps =
        params.correlationMethod === "fci"
          ? (["full-ci"] as const)
          : params.correlationMethod.includes("cisd")
            ? (["cisd-ci"] as const)
            : (["mp2-perturbation"] as const);
      const chargeTag =
        corrSystem.q === 0 ? "" : corrSystem.q > 0 ? `+${corrSystem.q}` : `${corrSystem.q}`;
      const frozenTag = params.frozenCoreMode === "noble-core" ? " [FC]" : "";
      const def = createExperimentDefinition({
        kind: "electron-correlation",
        title: `${corrSystem.species.symbol}${chargeTag} ${params.referenceMethod.toUpperCase()}/${params.correlationMethod.toUpperCase()} (${params.basis}${frozenTag})`,
        system: corrSystem,
        quantumStates: [corrState],
        providerId: PYSCF_CORRELATION_PROVIDER_ID,
        providerVersion: PYSCF_CORRELATION_PROVIDER_VERSION,
        observables: ["electron-correlation", "total-energy", "scf-diagnostics", ...methodCaps],
        modelParameters: {
          basis: params.basis,
          referenceMethod: params.referenceMethod,
          correlationMethod: params.correlationMethod,
          frozenCoreMode: params.frozenCoreMode,
          spin2S: params.spin2S,
          fixSpin: params.fixSpin,
        },
        numericalParameters: {
          nRoots: params.nRoots,
          scfConvTol: params.scfOptions?.convTol ?? 1e-10,
          scfMaxCycle: params.scfOptions?.maxCycle ?? 100,
        },
      });
      return submitExperiment(def);
    },
    [submitExperiment],
  );

  const cancelExecution = useCallback((executionId: string) => {
    activeHandles.current.get(executionId)?.cancel("Cancelled from ATOMS Laboratory UI");
  }, []);

  const replayStoredExperiment = useCallback(async (experimentId: string) => {
    const runner = runnerRef.current;
    if (!runner) return;
    const loaded = await runner.loadStoredExperiment(experimentId);
    setSelectedExperimentId(experimentId);
    if (loaded.latestResult) {
      setSelectedResult(loaded.latestResult);
      setPlatformNotice(
        `Replayed stored result ${loaded.latestResult.resultId} (source=${loaded.latestResult.source}, computed ${loaded.latestResult.computedAtIso}).`,
      );
    } else {
      setPlatformNotice(`Loaded experiment ${experimentId} (no completed result stored).`);
    }
  }, []);

  const rerunStoredExperiment = useCallback(
    async (def: ExperimentDefinition) => {
      const outcome = await submitExperiment(def, true);
      if (outcome?.result) {
        setPlatformNotice(
          `Recomputed fresh result ${outcome.result.resultId} (source=${outcome.result.source}, recomputedCount=${outcome.result.recomputedCount}).`,
        );
      }
    },
    [submitExperiment],
  );

  const deleteStoredExperiment = useCallback(
    async (experimentId: string) => {
      if (!storeRef.current) return;
      await storeRef.current.deleteExperiment(experimentId);
      if (selectedExperimentId === experimentId) {
        setSelectedExperimentId(null);
        setSelectedResult(null);
      }
      await refreshStore();
    },
    [refreshStore, selectedExperimentId],
  );

  const exportExperimentJson = useCallback((entry: SavedExperimentEntry): string => {
    return ExperimentSerializer.exportEntry({
      definition: entry.definition,
      executions: entry.executions,
      results: entry.results,
    });
  }, []);

  const importExperimentJson = useCallback(
    async (jsonText: string) => {
      const store = storeRef.current;
      const runner = runnerRef.current;
      if (!store || !runner) return;
      const outcome = ExperimentSerializer.importIntoFreshRecord(jsonText);
      if (!outcome.ok) {
        throw new Error(outcome.message);
      }
      let lastImportedTitle = "";
      let lastSchemaVersion = "";
      for (const item of outcome.imported) {
        await store.saveExperiment(item.definition);
        for (const exec of item.executions) {
          await store.saveExecution(exec);
        }
        for (const res of item.results) {
          runner.resultRegistry.recordLoaded(res, "imported-json");
          await store.saveResult(res);
          setSelectedResult(res);
        }
        setSelectedExperimentId(item.definition.id);
        lastImportedTitle = item.definition.title;
        lastSchemaVersion = item.definition.schemaVersion;
      }
      await refreshStore();
      setPlatformNotice(
        `Imported ${outcome.imported.length} experiment(s): "${lastImportedTitle}" (${lastSchemaVersion}).`,
      );
    },
    [refreshStore],
  );

  const patchConfig = useCallback((patch: Partial<LaboratoryConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    config,
    patchConfig,
    isotopes,
    activeIsotope,
    nuclearModel,
    atomicSystem,
    nrState,
    diracState,
    activeQuantumState,
    providerRegistry,
    providerAssessments,
    history,
    executions,
    selectedExperimentId,
    selectedResult,
    platformNotice,
    hfCapabilities,
    hfProbing,
    lsCapabilities,
    lsProbing,
    correlationCapabilities,
    correlationProbing,
    hfWorkbenchOverlay,
    setHfWorkbenchOverlay,
    refreshHFCapabilities,
    refreshLSCapabilities,
    refreshCorrelationCapabilities,
    runSingleStateExperiment,
    runTransitionExperiment,
    runSpectroscopyExperiment,
    runHartreeFockExperiment,
    runLSTermCIExperiment,
    runElectronCorrelationExperiment,
    cancelExecution,
    replayStoredExperiment,
    rerunStoredExperiment,
    deleteStoredExperiment,
    exportExperimentJson,
    importExperimentJson,
  };
}
