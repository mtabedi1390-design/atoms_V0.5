/**
 * Scientific Validation, Physics Invariant, Guardrail, & Platform Integration Tests
 * for ATOMS v0.7.2 Post-Hartree–Fock Electron Correlation (MP2, CISD, FCI).
 *
 * Executes REAL calculations via `science/correlation_backend.py` (PySCF 2.15.1 + libcint + BSE)
 * and validates domain boundaries, preflight determinant/amplitude limits, energy identities,
 * size-extensivity / variational properties, Worker execution, and ExperimentStore replay.
 */
import { describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createAtomicSystem,
  createNuclearModelForIsotope,
  defaultIsotopeForZ,
} from "@/domain/atomic";
import { createElectronCorrelationState } from "@/domain/quantum";
import {
  createDefaultExperimentRegistry,
  createExperimentDefinition,
} from "@/experiments";
import { ExperimentRunner } from "@/experiments/execution/runner";
import { ExperimentSerializer } from "@/experiments/persistence/serializer";
import { MemoryExperimentStore } from "@/experiments/persistence/store";
import { PhysicsProviderRegistry } from "@/physics/providers/registry";
import {
  createPyscfCorrelationProvider,
  PYSCF_CORRELATION_PROVIDER_ID,
  PYSCF_CORRELATION_PROVIDER_VERSION,
} from "@/physics/providers/correlation";
import {
  buildCorrelationComparisonKey,
  estimateCorrelationDimensions,
  validateReferenceAndMethodCompatibility,
  type CorrelationCalculateRequest,
  type CorrelationCalculationResponse,
  type CorrelationCapabilitiesResponse,
  type CorrelationTransport,
} from "@/physics/correlation";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import {
  createExperimentWorkerRuntime,
  type ExperimentWorkerInbound,
  type WorkerLike,
} from "@/workers/protocol";

const ROOT = process.cwd();
const CORR_SCRIPT = path.resolve(ROOT, "science", "correlation_backend.py");

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
      const out = execFileSync(exe, [CORR_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      const parsed = JSON.parse(out) as CorrelationCapabilitiesResponse;
      if (parsed.available) return exe;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const PYTHON_EXE = resolvePythonExe();

function createNodeSubprocessCorrelationTransport(pythonExe: string): CorrelationTransport {
  return {
    async getCapabilities(): Promise<CorrelationCapabilitiesResponse> {
      const out = execFileSync(pythonExe, [CORR_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      return JSON.parse(out) as CorrelationCapabilitiesResponse;
    },

    async calculate(
      request: CorrelationCalculateRequest,
      signal?: AbortSignal,
    ): Promise<CorrelationCalculationResponse> {
      return await new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Calculation aborted", "AbortError"));
          return;
        }
        const child = execFile(
          pythonExe,
          [CORR_SCRIPT],
          { maxBuffer: 32 * 1024 * 1024, timeout: 90000 },
          (err, stdout, stderr) => {
            if (signal?.aborted) {
              reject(new DOMException("Calculation aborted", "AbortError"));
              return;
            }
            if (stdout && stdout.trim().startsWith("{")) {
              try {
                const parsed = JSON.parse(stdout) as CorrelationCalculationResponse;
                if (!parsed.ok && parsed.error) {
                  reject(new Error(parsed.error));
                  return;
                }
                resolve(parsed);
                return;
              } catch {
                // fall through
              }
            }
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            reject(new Error("Invalid JSON from Correlation Python backend"));
          },
        );
        const onAbort = () => child.kill("SIGTERM");
        signal?.addEventListener("abort", onAbort, { once: true });
        child.stdin?.write(JSON.stringify({ ...request, action: "calculate" }));
        child.stdin?.end();
      });
    },
  };
}

function makeSystem(Z: number, N = Z) {
  const iso = defaultIsotopeForZ(Z);
  return createAtomicSystem({
    Z,
    N,
    massNumber: iso.massNumber,
    nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
  });
}

describe("Electron Correlation Domain, Guardrails, & Preflight Estimator (v0.7.2)", () => {
  it("rejects AtomSphAverageRHF, ROHF+CISD, UHF+noble-core FCI, and invalid spin states at domain boundary", () => {
    expect(() =>
      createElectronCorrelationState({
        N: 6,
        spin2S: 2,
        basis: "cc-pvdz",
        referenceMethod: "atom-sph-avg" as unknown as "rhf",
        correlationMethod: "fci",
        frozenCoreMode: "none",
      }),
    ).toThrow(/AtomSphAverageRHF|referenceMethod/i);

    expect(() =>
      createElectronCorrelationState({
        N: 3,
        spin2S: 1,
        basis: "cc-pvdz",
        referenceMethod: "rohf",
        correlationMethod: "ucisd",
        frozenCoreMode: "none",
      }),
    ).toThrow(/ROCISD|UCISD/i);

    expect(() =>
      createElectronCorrelationState({
        N: 3,
        spin2S: 1,
        basis: "cc-pvdz",
        referenceMethod: "rohf",
        correlationMethod: "rcisd",
        frozenCoreMode: "none",
      }),
    ).toThrow(/RCISD/i);

    expect(() =>
      createElectronCorrelationState({
        N: 5,
        spin2S: 1,
        basis: "cc-pvdz",
        referenceMethod: "uhf",
        correlationMethod: "fci",
        frozenCoreMode: "noble-core",
      }),
    ).toThrow(/Frozen-core FCI|CASCI/i);

    expect(() =>
      createElectronCorrelationState({
        N: 4,
        spin2S: 2,
        basis: "cc-pvdz",
        referenceMethod: "rhf",
        correlationMethod: "rmp2",
        frozenCoreMode: "none",
      }),
    ).toThrow(/2S=0/i);

    const compat = validateReferenceAndMethodCompatibility({
      Z: 6,
      N: 6,
      spin2S: 2,
      referenceMethod: "atom-sph-avg",
      correlationMethod: "fci",
      frozenCoreMode: "none",
    });
    expect(compat.valid).toBe(false);
    expect(compat.reason).toMatch(/AtomSphAverageRHF/);
  });

  it("computes exact FCI determinant counts and enforces resource ceilings pre-allocation", () => {
    // Ne (10e) in cc-pVDZ (14 spatial orbitals): C(14,5)^2 = 2002^2 = 4,008,004 > 200,000
    const neFull = estimateCorrelationDimensions({
      Z: 10,
      N: 10,
      spin2S: 0,
      basis: "cc-pvdz",
      referenceMethod: "rhf",
      correlationMethod: "fci",
      frozenCoreMode: "none",
    });
    expect(neFull.estimate?.nSpatialOrbitals).toBe(14);
    expect(neFull.estimate?.fciDeterminantCount).toBe(4_008_004);
    expect(neFull.withinLimits).toBe(false);
    expect(neFull.limitReason).toMatch(/4,008,004/);

    // Ne noble-core FCI: C(13,4)^2 = 715^2 = 511,225 -> still > 200,000!
    const neFrozen = estimateCorrelationDimensions({
      Z: 10,
      N: 10,
      spin2S: 0,
      basis: "cc-pvdz",
      referenceMethod: "rhf",
      correlationMethod: "fci",
      frozenCoreMode: "noble-core",
    });
    expect(neFrozen.estimate?.frozenOrbitals).toBe(1);
    expect(neFrozen.estimate?.fciDeterminantCount).toBe(511_225);
    expect(neFrozen.withinLimits).toBe(false);

    // Be (4e) noble-core FCI in cc-pVDZ (14 orbs -> 13 active orbs, 1 alpha, 1 beta -> 169 dets)
    const beFrozen = estimateCorrelationDimensions({
      Z: 4,
      N: 4,
      spin2S: 0,
      basis: "cc-pvdz",
      referenceMethod: "rhf",
      correlationMethod: "fci",
      frozenCoreMode: "noble-core",
    });
    expect(beFrozen.estimate?.fciDeterminantCount).toBe(169);
    expect(beFrozen.withinLimits).toBe(true);

    // Comparison key strictly matches only identical Z, N, 2S, basis, frozenCoreMode
    expect(
      buildCorrelationComparisonKey({
        Z: 4,
        N: 4,
        spin2S: 0,
        basis: "cc-pvdz",
        frozenCoreMode: "none",
      }),
    ).not.toBe(
      buildCorrelationComparisonKey({
        Z: 4,
        N: 4,
        spin2S: 0,
        basis: "cc-pvdz",
        frozenCoreMode: "noble-core",
      }),
    );
  });
});

describe.skipIf(!PYTHON_EXE)("Live PySCF Post-HF Electron Correlation Engine & Platform Integration", () => {
  const transport = createNodeSubprocessCorrelationTransport(PYTHON_EXE!);
  const liveProvider = createPyscfCorrelationProvider(transport);

  it("reports real capabilities and rejects offline/unreached backend without fabricating energies", async () => {
    const caps = await transport.getCapabilities();
    expect(caps.available).toBe(true);
    expect(caps.engine?.name).toBe("PySCF");
    expect(caps.methods?.rmp2?.available).toBe(true);
    expect(caps.methods?.romp2?.available).toBe(true);
    expect(caps.methods?.rcisd?.available).toBe(true);
    expect(caps.methods?.ucisd?.available).toBe(true);
    expect(caps.methods?.fci?.available).toBe(true);
    expect(caps.referenceCompatibility?.["atom-sph-avg"]?.supported).toBe(false);

    const offlineProvider = createPyscfCorrelationProvider({
      async getCapabilities() {
        return { available: false, blocker: "Simulated offline correlation backend" };
      },
      async calculate() {
        throw new Error("Simulated offline HTML fallback");
      },
    });

    await expect(
      offlineProvider.calculate(
        {
          system: makeSystem(2, 2),
          state: createElectronCorrelationState({
            N: 2,
            spin2S: 0,
            basis: "cc-pvdz",
            referenceMethod: "rhf",
            correlationMethod: "rmp2",
            frozenCoreMode: "none",
          }),
          observables: ["electron-correlation", "total-energy"],
        },
        {},
      ),
    ).rejects.toThrow(/Simulated offline/);
  });

  it("validates 2-electron exactness (He RCISD === FCI), Li ROMP2/UCISD, Be frozen-core, B multi-root FCI, and Ne preflight/MP2", async () => {
    const run = (params: {
      Z: number;
      N?: number;
      spin2S: number;
      basis: "sto-3g" | "6-31g" | "cc-pvdz";
      referenceMethod: "rhf" | "uhf" | "rohf";
      correlationMethod: "rmp2" | "ump2" | "romp2" | "rcisd" | "ucisd" | "fci";
      frozenCoreMode?: "none" | "noble-core";
      nRoots?: number;
      fixSpin?: boolean;
    }) =>
      liveProvider.calculate(
        {
          system: makeSystem(params.Z, params.N ?? params.Z),
          state: createElectronCorrelationState({
            N: params.N ?? params.Z,
            spin2S: params.spin2S,
            basis: params.basis,
            referenceMethod: params.referenceMethod,
            correlationMethod: params.correlationMethod,
            frozenCoreMode: params.frozenCoreMode ?? "none",
            nRoots: params.nRoots ?? 1,
            fixSpin: params.fixSpin ?? false,
          }),
          observables: ["electron-correlation", "total-energy"],
        },
        {},
      );

    // 1. He/cc-pVDZ: 2 electrons -> RCISD == FCI exactly, RMP2 ~ -0.0258 Ha
    const heRmp2 = await run({ Z: 2, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "rmp2" });
    const heRcisd = await run({ Z: 2, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "rcisd" });
    const heFci = await run({ Z: 2, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "fci" });

    expect(heRmp2.ok).toBe(true);
    expect(heRcisd.ok).toBe(true);
    expect(heFci.ok).toBe(true);
    expect(heRcisd.data.correlation!.eCorr_Ha).toBeCloseTo(heFci.data.correlation!.eCorr_Ha, 9);
    expect(heRcisd.data.correlation!.eTotal_Ha).toBeCloseTo(heFci.data.correlation!.eTotal_Ha, 9);
    expect(heRmp2.data.correlation!.eCorr_Ha).toBeGreaterThan(heFci.data.correlation!.eCorr_Ha);
    expect(heRmp2.data.correlation!.energyIdentityError_Ha).toBeLessThan(1e-12);

    // 2. Li/cc-pVDZ: ROMP2 includes singles, UCISD finds true negative ground correlation (no Davidson excited root jump!)
    const liRomp2 = await run({ Z: 3, spin2S: 1, basis: "cc-pvdz", referenceMethod: "rohf", correlationMethod: "romp2" });
    const liUcisd = await run({ Z: 3, spin2S: 1, basis: "cc-pvdz", referenceMethod: "uhf", correlationMethod: "ucisd" });
    expect(liRomp2.ok).toBe(true);
    expect(liRomp2.data.correlation!.eCorr_Ha).toBeLessThan(0);
    expect(liRomp2.data.correlation!.eCorrSingles_Ha).not.toBeNull();
    expect(liUcisd.ok).toBe(true);
    expect(liUcisd.data.correlation!.eCorr_Ha).toBeLessThan(0);
    expect(liUcisd.data.correlation!.referenceWeightSq!).toBeGreaterThan(0.99);

    // 3. Be/cc-pVDZ: variational hierarchy FCI(all-e) <= RCISD(all-e) < HF, and all-e captures more correlation than noble-core
    const beRcisd = await run({ Z: 4, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "rcisd" });
    const beFciAll = await run({ Z: 4, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "fci" });
    const beFciCore = await run({
      Z: 4,
      spin2S: 0,
      basis: "cc-pvdz",
      referenceMethod: "rhf",
      correlationMethod: "fci",
      frozenCoreMode: "noble-core",
    });
    expect(beFciAll.data.correlation!.eTotal_Ha).toBeLessThan(beRcisd.data.correlation!.eTotal_Ha);
    expect(beFciAll.data.correlation!.eCorr_Ha).toBeLessThan(beFciCore.data.correlation!.eCorr_Ha);

    // 4. B/cc-pVDZ ROHF noble-core FCI multi-root with fixSpin=true maintains pure <S^2> = 0.75
    const bFciMulti = await run({
      Z: 5,
      spin2S: 1,
      basis: "cc-pvdz",
      referenceMethod: "rohf",
      correlationMethod: "fci",
      frozenCoreMode: "noble-core",
      nRoots: 2,
      fixSpin: true,
    });
    expect(bFciMulti.ok).toBe(true);
    expect(bFciMulti.data.correlation!.roots).toHaveLength(2);
    expect(bFciMulti.data.correlation!.roots![0].sSquared).toBeCloseTo(0.75, 6);
    expect(bFciMulti.data.correlation!.roots![1].eTotal_Ha).toBeGreaterThan(
      bFciMulti.data.correlation!.roots![0].eTotal_Ha,
    );

    // 5. Ne/cc-pVDZ: RMP2 is non-variational (overshoots RCISD), while FCI is cleanly blocked by preflight
    const neRmp2 = await run({ Z: 10, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "rmp2" });
    const neRcisd = await run({ Z: 10, spin2S: 0, basis: "cc-pvdz", referenceMethod: "rhf", correlationMethod: "rcisd" });
    expect(neRmp2.data.correlation!.eCorr_Ha).toBeLessThan(neRcisd.data.correlation!.eCorr_Ha);

    const neFciBlocked = liveProvider.supports(
      makeSystem(10, 10),
      createElectronCorrelationState({
        N: 10,
        spin2S: 0,
        basis: "cc-pvdz",
        referenceMethod: "rhf",
        correlationMethod: "fci",
        frozenCoreMode: "none",
      }),
    );
    expect(neFciBlocked.supported).toBe(false);
    expect(neFciBlocked.reasons[0]).toMatch(/4,008,004/);
  }, 60000);

  it("integrates with ExperimentRunner, Worker runtime, MemoryExperimentStore replay, and Serializer export", async () => {
    const reg = new PhysicsProviderRegistry([liveProvider]);
    const expReg = createDefaultExperimentRegistry();
    const store = new MemoryExperimentStore();

    const workerClient = new ExperimentWorkerClient(() => {
      let runtimeRef: ReturnType<typeof createExperimentWorkerRuntime> | null = null;
      const fakeWorker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(msg: unknown) {
          queueMicrotask(() => runtimeRef?.receive(msg as ExperimentWorkerInbound));
        },
        terminate() {},
      };
      runtimeRef = createExperimentWorkerRuntime(
        reg,
        (out) => fakeWorker.onmessage?.({ data: out }),
        expReg,
      );
      return fakeWorker;
    });

    const runner = new ExperimentRunner({
      providerRegistry: reg,
      experimentRegistry: expReg,
      store,
      workerClient,
    });

    const def = createExperimentDefinition({
      kind: "electron-correlation",
      title: "He RCISD/cc-pVDZ benchmark",
      system: makeSystem(2, 2),
      quantumStates: [
        createElectronCorrelationState({
          N: 2,
          spin2S: 0,
          basis: "cc-pvdz",
          referenceMethod: "rhf",
          correlationMethod: "rcisd",
          frozenCoreMode: "none",
        }),
      ],
      providerId: PYSCF_CORRELATION_PROVIDER_ID,
      providerVersion: PYSCF_CORRELATION_PROVIDER_VERSION,
      observables: ["electron-correlation", "cisd-ci", "total-energy"],
    });

    const handle = runner.run(def, { mode: "worker", persist: true });
    const { execution, result } = await handle.completion;
    expect(execution.status).toBe("completed");
    expect(result?.source).toBe("computed");

    const payload = result?.payload as CorrelationCalculationResponse;
    expect(payload.correlation?.actualPyscfClass).toMatch(/RCISD/);
    expect(payload.correlation?.eCorr_Ha).toBeCloseTo(-0.03243435, 6);

    // Load / Replay distinguishes stored replay vs live recomputation
    const loaded = await runner.loadStoredExperiment(def.id);
    expect(loaded.latestResult?.source).toBe("loaded-from-store");

    const rerunHandle = runner.rerun(def, { mode: "direct", persist: true });
    const rerunOutcome = await rerunHandle.completion;
    expect(rerunOutcome.result?.recomputedCount).toBe(1);
    expect(rerunOutcome.result?.source).toBe("computed");

    // Serializer round-trip
    const bundle = await store.loadExperimentBundle(def.id);
    const json = ExperimentSerializer.exportEntry({
      definition: bundle.definition!,
      executions: bundle.executions,
      results: bundle.results,
    });
    const imported = ExperimentSerializer.importIntoFreshRecord(json);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.imported[0].definition.kind).toBe("electron-correlation");
    }

    workerClient.dispose();
  }, 60000);
});
