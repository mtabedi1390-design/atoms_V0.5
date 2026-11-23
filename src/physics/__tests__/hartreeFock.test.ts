/**
 * Scientific Validation, Physics Invariant, Convergence, & Platform Integration
 * Tests for ATOMS v0.7.0 Multi-Electron Hartree–Fock.
 *
 * Executes REAL PySCF + libcint + Basis Set Exchange calculations via
 * `science/hf_backend.py` and validates against independent benchmarks
 * (`compas/sphf` MIT B-spline HF, Koga–Thakkar 1999, and exact 1-e limits).
 */
import { describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createMultiElectronHFState } from "@/domain/quantum";
import {
  extractIsosurfacesFromVolumeGrid,
  slice2DFromVolumeGrid,
} from "@/numerics/isosurface/marchingTetrahedra";
import {
  createExperimentDefinition,
  createDefaultExperimentRegistry,
} from "@/experiments";
import { ExperimentRunner } from "@/experiments/execution/runner";
import { ExperimentSerializer } from "@/experiments/persistence/serializer";
import { MemoryExperimentStore } from "@/experiments/persistence/store";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import { createExperimentWorkerRuntime, type WorkerLike, type ExperimentWorkerInbound } from "@/workers/protocol";
import { PhysicsProviderRegistry } from "@/physics/providers/registry";
import {
  createPyscfLiveProvider,
  PYSCF_LIVE_PROVIDER_ID,
  PYSCF_LIVE_PROVIDER_VERSION,
} from "@/physics/providers/hartreeFock";
import {
  isBasisSupportedForZ,
  lookupHFBenchmark,
  proposeAufbauConfiguration,
  proposeDefaultConfiguration,
  type HFCalculateRequest,
  type HFCalculationResponse,
  type HFCapabilitiesResponse,
  type HFTransport,
} from "@/physics/hf";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const BACKEND_SCRIPT = path.resolve(ROOT, "science", "hf_backend.py");

function resolvePythonExe(): string | null {
  const candidates = [
    process.env.ATOMS_PYTHON,
    path.resolve(ROOT, ".venv", "bin", "python"),
    "/opt/atoms-py/bin/python",
    "python3",
  ].filter((x): x is string => Boolean(x));

  for (const exe of candidates) {
    if (exe.includes(path.sep) && !existsSync(exe)) continue;
    try {
      const out = execFileSync(exe, [BACKEND_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      const parsed = JSON.parse(out) as HFCapabilitiesResponse;
      if (parsed.available) return exe;
    } catch {
      // probe next candidate
    }
  }
  return null;
}

const PYTHON_EXE = resolvePythonExe();

function createNodeSubprocessHFTransport(pythonExe: string): HFTransport {
  return {
    async getCapabilities(): Promise<HFCapabilitiesResponse> {
      const { stdout } = await execFileAsync(pythonExe, [BACKEND_SCRIPT], {
        maxBuffer: 16 * 1024 * 1024,
      }).catch(() => ({ stdout: "{}" }));
      void stdout;
      const out = execFileSync(pythonExe, [BACKEND_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      return JSON.parse(out) as HFCapabilitiesResponse;
    },

    async calculate(request: HFCalculateRequest, signal?: AbortSignal): Promise<HFCalculationResponse> {
      return await new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Calculation aborted", "AbortError"));
          return;
        }
        const child = execFile(
          pythonExe,
          [BACKEND_SCRIPT],
          { maxBuffer: 32 * 1024 * 1024, timeout: 60000 },
          (err, stdout, stderr) => {
            if (signal?.aborted) {
              reject(new DOMException("Calculation aborted", "AbortError"));
              return;
            }
            if (stdout && stdout.trim().startsWith("{")) {
              try {
                resolve(JSON.parse(stdout) as HFCalculationResponse);
                return;
              } catch {
                // fall through
              }
            }
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            reject(new Error("Invalid JSON from Python backend"));
          },
        );
        const onAbort = () => {
          child.kill("SIGTERM");
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        child.stdin?.write(JSON.stringify({ ...request, action: "calculate" }));
        child.stdin?.end();
      });
    },
  };
}

describe("Electronic configurations, spin validation, and BSE basis coverage (Phase 3–4)", () => {
  it("distinguishes curated NIST ground Cr (3d5 4s1, 2S=6) from Aufbau Cr (3d4 4s2, 2S=4)", () => {
    const curated = proposeDefaultConfiguration(24, 24);
    const aufbau = proposeAufbauConfiguration(24);
    expect(curated.source).toBe("curated-ground");
    expect(curated.spin2S).toBe(6);
    expect(aufbau.spin2S).toBe(4);
    const cr4sCur = curated.subshells.find((s) => s.n === 4 && s.l === 0);
    const cr3dCur = curated.subshells.find((s) => s.n === 3 && s.l === 2);
    expect(cr4sCur).toEqual({ n: 4, l: 0, alpha: 1, beta: 0 });
    expect(cr3dCur).toEqual({ n: 3, l: 2, alpha: 5, beta: 0 });
  });

  it("rejects atom-sph-avg for 1-electron systems at the domain validation boundary", () => {
    const hCfg = proposeDefaultConfiguration(1, 1);
    expect(() =>
      createMultiElectronHFState({
        N: 1,
        method: "atom-sph-avg",
        basis: "cc-pvdz",
        occupationMode: "curated-ground",
        spin2S: 1,
        subshellOccupations: hCfg.subshells,
        useSymmetry: false,
      }),
    ).toThrow(/ATOM_SPH_AVG_REQUIRES_MULTI_ELECTRON/i);
  });

  it("enforces exact BSE element gaps and all-electron ECP caps", () => {
    expect(isBasisSupportedForZ("cc-pvdz", 19).supported).toBe(false); // K omitted in cc-pVDZ
    expect(isBasisSupportedForZ("aug-cc-pvtz", 20).supported).toBe(false); // Ca omitted in aug-cc-pVTZ
    expect(isBasisSupportedForZ("def2-svp", 19).supported).toBe(true);
    expect(isBasisSupportedForZ("def2-svp", 37).supported).toBe(false); // def2-ECP >= 37 outside all-electron v0.7.0
    expect(isBasisSupportedForZ("sto-3g", 54).supported).toBe(true);
    expect(isBasisSupportedForZ("sto-3g", 55).supported).toBe(false);
  });
});

describe.skipIf(!PYTHON_EXE)("Live PySCF + libcint + BSE Scientific Validation (Phases 3–8)", () => {
  const transport = createNodeSubprocessHFTransport(PYTHON_EXE!);
  const liveProvider = createPyscfLiveProvider(transport);

  async function runHF(
    Z: number,
    N: number,
    spin2S: number,
    method: "rhf" | "uhf" | "rohf" | "atom-sph-avg",
    basis: "sto-3g" | "6-31g" | "cc-pvdz" | "cc-pvtz" | "aug-cc-pvtz" | "def2-svp" | "def2-tzvp",
    opts?: { maxCycle?: number; subshells?: ReturnType<typeof proposeDefaultConfiguration>["subshells"]; volumeGrid?: boolean },
  ) {
    const iso = defaultIsotopeForZ(Z);
    const system = createAtomicSystem({
      Z,
      N,
      massNumber: iso.massNumber,
      nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
    });
    const cfg = opts?.subshells
      ? { subshells: opts.subshells }
      : N === Z
        ? proposeDefaultConfiguration(Z, N)
        : proposeAufbauConfiguration(N);
    const state = createMultiElectronHFState({
      N,
      method,
      basis,
      occupationMode: N === Z ? "curated-ground" : "aufbau",
      spin2S,
      subshellOccupations: cfg.subshells,
      useSymmetry: method !== "atom-sph-avg",
      scfOptions: { convTol: 1e-10, maxCycle: opts?.maxCycle ?? 80 },
      volumeGrid: opts?.volumeGrid
        ? { enabled: true, gridN: 20, extentBohr: 7, quantity: "mo-signed", orbitalIndex: 1, spinChannel: "alpha" }
        : undefined,
    });
    return liveProvider.calculate(
      {
        system,
        state,
        observables: ["multi-electron-hf", "total-energy", "orbital-resolved-hf"],
      },
      {},
    );
  }

  it("matches 1-electron analytical hydrogenic limit H and He+ as basis increases while honoring finite-basis bounds", async () => {
    const resHePlus = await runHF(2, 1, 1, "uhf", "aug-cc-pvtz");
    expect(resHePlus.ok).toBe(true);
    const d = resHePlus.data;
    // Exact fixed-nucleus He+ = -2.0 Ha (1s Gaussian basis cannot hit nuclear cusp at r=0 identically, slightly above -2.0)
    expect(d.energy!.eTotal_Ha).toBeGreaterThan(-2.0);
    expect(Math.abs(d.energy!.eTotal_Ha - -2.0)).toBeLessThan(2e-3);
    // For N=1, self-Coulomb J and self-exchange K cancel identically: J + K = eTwoElectron_Ha = 0
    expect(d.energy!.eTwoElectron_Ha).toBeCloseTo(0, 11);
    expect(d.energy!.eCoulomb_Ha + d.energy!.eExchange_Ha).toBeCloseTo(0, 11);
    expect(d.energy!.tracePS).toBeCloseTo(1.0, 9);
    expect(d.radialProfiles!.integratedElectrons).toBeCloseTo(1.0, 4);
    expect(d.radialProfiles!.integratedSpin).toBeCloseTo(1.0, 4);
    expect(d.spinDiagnostics!.sSquared).toBeCloseTo(0.75, 10);
  });

  it("converges closed-shell RHF atoms (He, Be, Ne) monotonically toward compas/sphf & Koga-Thakkar limits", async () => {
    const heDz = await runHF(2, 2, 0, "rhf", "cc-pvdz");
    const heTz = await runHF(2, 2, 0, "rhf", "cc-pvtz");
    const heAugTz = await runHF(2, 2, 0, "rhf", "aug-cc-pvtz");
    const heLimit = lookupHFBenchmark(2, 2, 0)!.hfLimit_Ha; // -2.861679995612

    const eDz = heDz.data.energy!.eTotal_Ha;
    const eTz = heTz.data.energy!.eTotal_Ha;
    const eAugTz = heAugTz.data.energy!.eTotal_Ha;
    expect(eDz).toBeGreaterThan(eTz);
    expect(eTz).toBeGreaterThanOrEqual(eAugTz - 1e-6);
    expect(eAugTz).toBeGreaterThan(heLimit);
    expect(Math.abs(eAugTz - heLimit)).toBeLessThan(1.5e-3);

    // Closed-shell UHF must collapse to identical RHF energy with zero spin contamination
    const heUhf = await runHF(2, 2, 0, "uhf", "cc-pvtz");
    expect(Math.abs(heUhf.data.energy!.eTotal_Ha - eTz)).toBeLessThan(1e-10);
    expect(heUhf.data.spinDiagnostics!.spinContamination).toBeCloseTo(0, 10);

    // Be and Ne invariance & benchmark accuracy
    const beTz = await runHF(4, 4, 0, "rhf", "cc-pvtz");
    const beLimit = lookupHFBenchmark(4, 4, 0)!.hfLimit_Ha;
    expect(beTz.data.energy!.eTotal_Ha).toBeGreaterThan(beLimit);
    expect(Math.abs(beTz.data.energy!.eTotal_Ha - beLimit)).toBeLessThan(3e-3);

    const neAugTz = await runHF(10, 10, 0, "rhf", "aug-cc-pvtz");
    const neLimit = lookupHFBenchmark(10, 10, 0)!.hfLimit_Ha;
    expect(neAugTz.data.energy!.eTotal_Ha).toBeGreaterThan(neLimit);
    expect(Math.abs(neAugTz.data.energy!.eTotal_Ha - neLimit)).toBeLessThan(2e-2);
    expect(neAugTz.data.energy!.energyConsistencyError_Ha).toBeLessThan(1e-11);
    expect(neAugTz.data.orthonormalityError!).toBeLessThan(1e-10);
    expect(neAugTz.data.radialProfiles!.integratedElectrons).toBeCloseTo(10.0, 3);
  });

  it("verifies open-shell Li, B, C, N, O, F, Cr matrix, state taxonomy, isotropy, SO(3) degeneracy, and SPHF matching", async () => {
    // Li ROHF vs directly executed compas/sphf numerical HF limit (-7.432726930728 Ha)
    const liRohf = await runHF(3, 3, 1, "rohf", "aug-cc-pvtz");
    const liRef = lookupHFBenchmark(3, 3, 1)!;
    expect(Math.abs(liRohf.data.energy!.eTotal_Ha - liRef.hfLimit_Ha)).toBeLessThan(1e-3);
    const li1s = liRohf.data.orbitals!.find((o) => o.index === 0)!;
    const li2s = liRohf.data.orbitals!.find((o) => o.index === 1)!;
    expect(Math.abs(li1s.energy_Ha - (-2.477751))).toBeLessThan(1e-4);
    expect(Math.abs(li2s.fockAlpha_Ha! - (-0.196323))).toBeLessThan(1e-4);
    expect(liRohf.data.angularDiagnostics!.isSphericallySymmetric).toBe(true);
    expect(liRohf.data.angularDiagnostics!.maxRelativeAnisotropy).toBeLessThan(1e-10);

    // Open-shell validation matrix across s, p, d open shells: Li, B, C, N, O, F, Cr
    const openShellMatrix = [
      { Z: 5, spin2S: 1, basis: "cc-pvtz" as const, halfFilledOrClosed: false },
      { Z: 6, spin2S: 2, basis: "cc-pvtz" as const, halfFilledOrClosed: false },
      { Z: 7, spin2S: 3, basis: "cc-pvtz" as const, halfFilledOrClosed: true },
      { Z: 8, spin2S: 2, basis: "cc-pvtz" as const, halfFilledOrClosed: false },
      { Z: 9, spin2S: 1, basis: "cc-pvtz" as const, halfFilledOrClosed: false },
      { Z: 24, spin2S: 6, basis: "def2-tzvp" as const, halfFilledOrClosed: true },
    ];

    for (const row of openShellMatrix) {
      const rohf = await runHF(row.Z, row.Z, row.spin2S, "rohf", row.basis);
      const uhf = await runHF(row.Z, row.Z, row.spin2S, "uhf", row.basis);
      const sph = await runHF(row.Z, row.Z, row.spin2S, "atom-sph-avg", row.basis);

      // Distinct state character and honest unavailability of term / J / <L^2>
      expect(rohf.data.stateInfo!.stateCharacter).toBe("restricted-open-shell-determinant");
      expect(uhf.data.stateInfo!.stateCharacter).toBe("unrestricted-determinant");
      expect(sph.data.stateInfo!.stateCharacter).toBe("spherical-ensemble-average");
      for (const r of [rohf, uhf, sph]) {
        expect(r.data.stateInfo!.termResolution.supported).toBe(false);
        expect(r.data.stateInfo!.termResolution.termSymbol).toBeNull();
        expect(r.data.stateInfo!.termResolution.totalJ).toBeNull();
        expect(r.data.stateInfo!.termResolution.lSquaredAvailable).toBe(false);
        expect(r.data.angularDiagnostics!.lSquaredAvailable).toBe(false);
        expect(r.data.energy!.tracePS).toBeCloseTo(row.Z, 6);
      }

      // Variational energy ordering: E(UHF) <= E(ROHF) < E(spin-unpolarized AtomSphAverageRHF)
      expect(uhf.data.energy!.eTotal_Ha).toBeLessThanOrEqual(rohf.data.energy!.eTotal_Ha + 1e-8);
      expect(rohf.data.energy!.eTotal_Ha).toBeLessThan(sph.data.energy!.eTotal_Ha);

      // Spin diagnostics: pure S(S+1) for ROHF, >= S(S+1) for UHF, explicitly unavailable for AtomSphAverageRHF
      const exactS2 = (row.spin2S / 2) * (row.spin2S / 2 + 1);
      expect(rohf.data.spinDiagnostics!.available).toBe(true);
      expect(rohf.data.spinDiagnostics!.sSquared).toBeCloseTo(exactS2, 10);
      expect(uhf.data.spinDiagnostics!.available).toBe(true);
      expect(uhf.data.spinDiagnostics!.sSquared!).toBeGreaterThanOrEqual(exactS2 - 1e-9);
      expect(sph.data.spinDiagnostics!.available).toBe(false);
      expect(sph.data.spinDiagnostics!.sSquared).toBeNull();
      expect(sph.data.spinDiagnostics!.multiplicity).toBeNull();

      // 110-pt Lebedev isotropy: AtomSphAverageRHF MUST be spherically isotropic (<1e-10);
      // half-filled shells (N, Cr) are spherical, while oriented p^1/p^2/p^4/p^5 determinants are anisotropic.
      expect(sph.data.angularDiagnostics!.quadraturePoints).toBe(110);
      expect(sph.data.angularDiagnostics!.isSphericallySymmetric).toBe(true);
      expect(sph.data.angularDiagnostics!.maxRelativeAnisotropy).toBeLessThan(1e-10);
      if (row.halfFilledOrClosed) {
        expect(rohf.data.angularDiagnostics!.isSphericallySymmetric).toBe(true);
        expect(rohf.data.angularDiagnostics!.maxRelativeAnisotropy).toBeLessThan(1e-9);
      } else {
        expect(rohf.data.angularDiagnostics!.isSphericallySymmetric).toBe(false);
        expect(rohf.data.angularDiagnostics!.maxRelativeAnisotropy).toBeGreaterThan(0.1);
      }
      if (rohf.data.angularDiagnostics!.equallyOccupiedSubshellSplitMax_Ha !== null) {
        expect(rohf.data.angularDiagnostics!.equallyOccupiedSubshellSplitMax_Ha).toBeLessThan(1e-11);
      }
    }

    // Ion C+ (Z=6, N=5) under AtomSphAverageRHF must respect custom atomic_configuration (tracePS = 5, not neutral 6)
    const cPlusSph = await runHF(6, 5, 1, "atom-sph-avg", "cc-pvdz");
    expect(cPlusSph.data.energy!.tracePS).toBeCloseTo(5.0, 7);
    expect(cPlusSph.data.angularDiagnostics!.isSphericallySymmetric).toBe(true);

    // Cr 7S (3d5 4s1) ROHF/aug-cc-pVTZ vs directly executed compas/sphf (-1043.356376285607 Ha)
    const crAugTz = await runHF(24, 24, 6, "rohf", "aug-cc-pvtz", {
      subshells: proposeDefaultConfiguration(24, 24).subshells,
    });
    const crRef = lookupHFBenchmark(24, 24, 6)!;
    expect(crAugTz.data.energy!.eTotal_Ha).toBeGreaterThan(crRef.hfLimit_Ha);
    expect(Math.abs(crAugTz.data.energy!.eTotal_Ha - crRef.hfLimit_Ha)).toBeLessThan(1.0e-3);

    // Chromium curated 3d5 4s1 (2S=6) vs Aufbau 3d4 4s2 (2S=4) gives distinct converged electronic states
    const crAufbau = await runHF(24, 24, 4, "uhf", "def2-svp", {
      subshells: proposeAufbauConfiguration(24).subshells,
    });
    expect(crAugTz.data.energy!.eTotal_Ha).toBeLessThan(crAufbau.data.energy!.eTotal_Ha);
  });

  it("rejects unconverged SCF, invalid spin/RHF, finite nuclear models, and missing basis elements honestly", async () => {
    // Non-converged maxCycle=1 MUST reject cleanly (never return ok=true)
    await expect(runHF(10, 10, 0, "rhf", "cc-pvtz", { maxCycle: 1 })).rejects.toThrow(/failed to converge/i);

    // Forbidden nuclear model & forbidden RHF open-shell assessments
    const isoC = defaultIsotopeForZ(6);
    const finiteSys = createAtomicSystem({
      Z: 6,
      N: 6,
      massNumber: isoC.massNumber,
      nuclearModel: createNuclearModelForIsotope("finite-uniform", isoC),
    });
    const infSys = createAtomicSystem({
      Z: 6,
      N: 6,
      massNumber: isoC.massNumber,
      nuclearModel: createNuclearModelForIsotope("point-infinite-mass", isoC),
    });
    const cCfg = proposeDefaultConfiguration(6, 6);
    const validState = createMultiElectronHFState({
      N: 6,
      method: "uhf",
      basis: "cc-pvdz",
      occupationMode: "curated-ground",
      spin2S: 2,
      subshellOccupations: cCfg.subshells,
      useSymmetry: true,
    });
    expect(liveProvider.supports(finiteSys, validState).supported).toBe(false);
    expect(liveProvider.supports(infSys, { ...validState, basis: "cc-pvdz" }).supported).toBe(true);
    expect(() =>
      createMultiElectronHFState({
        N: 6,
        method: "rhf",
        basis: "cc-pvdz",
        occupationMode: "curated-ground",
        spin2S: 2,
        subshellOccupations: cCfg.subshells,
        useSymmetry: true,
      }),
    ).toThrow(/RHF/);
  });

  it("integrates with ExperimentRunner, Worker runtime, IndexedDB/MemoryStore, JSON serialization, and 3D/2D grids", async () => {
    const reg = new PhysicsProviderRegistry([liveProvider]);
    const expReg = createDefaultExperimentRegistry();
    const store = new MemoryExperimentStore();

    // Headless in-process WorkerLike running real ExperimentWorkerRuntime
    const workerClient = new ExperimentWorkerClient(() => {
      let runtimeRef: ReturnType<typeof createExperimentWorkerRuntime> | null = null;
      const fakeWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(msg: unknown) {
          runtimeRef?.receive(msg as ExperimentWorkerInbound);
        },
        terminate() {},
      };
      runtimeRef = createExperimentWorkerRuntime(reg, (out) => {
        fakeWorker.onmessage?.({ data: out });
      }, expReg);
      return fakeWorker;
    });

    const runner = new ExperimentRunner({
      providerRegistry: reg,
      experimentRegistry: expReg,
      store,
      workerClient,
    });

    const isoC = defaultIsotopeForZ(6);
    const system = createAtomicSystem({
      Z: 6,
      N: 6,
      massNumber: isoC.massNumber,
      nuclearModel: createNuclearModelForIsotope("point-infinite-mass", isoC),
    });
    const cCfg = proposeDefaultConfiguration(6, 6);
    const state = createMultiElectronHFState({
      N: 6,
      method: "uhf",
      basis: "cc-pvdz",
      occupationMode: "curated-ground",
      spin2S: 2,
      subshellOccupations: cCfg.subshells,
      useSymmetry: true,
      scfOptions: { convTol: 1e-9, maxCycle: 80 },
      volumeGrid: { enabled: true, gridN: 20, extentBohr: 7, quantity: "mo-signed", orbitalIndex: 2, spinChannel: "alpha" },
    });

    const def = createExperimentDefinition({
      kind: "multi-electron-hf",
      title: "C UHF/cc-pVDZ benchmark",
      system,
      quantumStates: [state],
      providerId: PYSCF_LIVE_PROVIDER_ID,
      providerVersion: PYSCF_LIVE_PROVIDER_VERSION,
      observables: ["multi-electron-hf", "total-energy", "orbital-resolved-hf", "spin-density"],
    });

    const handle = runner.run(def, { mode: "worker", persist: true });
    const { execution, result } = await handle.completion;
    expect(execution.status).toBe("completed");
    expect(result).toBeDefined();
    expect(result!.source).toBe("computed");

    const payload = result!.payload as HFCalculationResponse;
    expect(payload.volumeGrid).toBeDefined();
    const iso = extractIsosurfacesFromVolumeGrid(payload.volumeGrid!, 0.25);
    const totalTris = iso.meshes.reduce((a, m) => a + m.triangleCount, 0);
    expect(totalTris).toBeGreaterThan(50);

    const slice = slice2DFromVolumeGrid(payload.volumeGrid!, "xz", 0);
    expect(slice.maxAbs).toBeGreaterThan(0);

    // Replay from store distinguishes source=loaded-from-store from computed
    const replayed = await runner.loadStoredExperiment(def.id);
    expect(replayed.latestResult?.source).toBe("loaded-from-store");

    // Export / Import round-trip validation
    const bundle = await store.loadExperimentBundle(def.id);
    const json = ExperimentSerializer.exportEntry({
      definition: bundle.definition!,
      executions: bundle.executions,
      results: bundle.results,
    });
    const imported = ExperimentSerializer.importIntoFreshRecord(json);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.imported[0].definition.kind).toBe("multi-electron-hf");
    }

    workerClient.dispose();
  });
});
