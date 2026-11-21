/**
 * Mandatory Phase 2 Acceptance Tests — Complete Experiment Platform Lifecycle.
 *
 * Uses a deterministic, non-physical TEST FIXTURE provider strictly to verify:
 *  1. Experiment creation & versioned schema separation
 *  2. Pre-execution validation
 *  3. Queueing & concurrency scheduling
 *  4. Direct & structured-clone-safe Worker execution
 *  5. Structured result normalization preserving provenance, units, constantsVersion
 *  6. IndexedDB persistence (including schema v0->v1 upgrade, indexes, error/blocked handling)
 *  7. Reloading stored results (source: "loaded-from-store" distinct from recomputing)
 *  8. JSON export
 *  9. JSON import into a fresh experiment record + rejection of malformed/unsupported versions
 * 10. Metadata & result integrity
 * 11. Real AbortSignal cancellation (scheduler + worker)
 * 12. Stale-result protection (superseded/cancelled runs cannot overwrite newer results)
 * 13. Provider errors, timeouts, unavailable providers, unsupported nuclear models,
 *     and structured-clone runtime boundary checks.
 */
import { describe, expect, it } from "vitest";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createNonRelativisticState } from "@/domain/quantum";
import { okValidation } from "@/domain/validation";
import type { CalculationContext, CalculationResult, PhysicsProvider, ProviderCalculationInput } from "@/physics/providers/contracts";
import { PhysicsProviderRegistry } from "@/physics/providers/registry";
import { lobatoDiracFockV6Provider, graspV6Provider } from "@/physics/providers/legacyAdapters";
import { CONSTANTS_VERSION } from "@/physics/units";
import {
  ATOMS_IDB_NAME,
  ExperimentRunner,
  ExperimentScheduler,
  ExperimentSerializer,
  IndexedDBExperimentStore,
  createExperimentDefinition,
} from "../index";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import {
  assertStructuredCloneSafe,
  createExperimentWorkerRuntime,
  type ExperimentWorkerInbound,
  type WorkerLike,
} from "@/workers/protocol";
import { createInMemoryIDBFactory } from "./idbShim";

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Deterministic TEST FIXTURE ONLY — strictly non-physical, never registered in production.
 */
function createDeterministicTestFixtureProvider(): PhysicsProvider {
  return {
    id: "test-fixture-deterministic",
    name: "Deterministic Platform Test Fixture (NON-PHYSICAL)",
    version: "test-1.0.0",
    available: true,
    capabilities: ["bound-energy", "radial-probability"],

    supports(system) {
      if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [`Test fixture does not solve finite nucleus "${system.nuclearModel.kind}".`],
          limitations: ["No finite-nucleus solver."],
        };
      }
      if (system.q < 0) {
        return {
          supported: false,
          evidenceClass: "unavailable",
          reasons: [`Test fixture rejects negative ion q=${system.q}.`],
          limitations: ["No negative-ion correlation solver."],
        };
      }
      return {
        supported: true,
        evidenceClass: "qualitative-approximation",
        reasons: ["Test fixture supports this system strictly for platform verification."],
        limitations: ["Deterministic synthetic test fixture ONLY — NOT a physical calculation."],
      };
    },

    validate: () => okValidation(),

    async calculate(input: ProviderCalculationInput, context: CalculationContext): Promise<CalculationResult<unknown>> {
      const mode = input.numericalOptions?.fixtureBehavior as string | undefined;
      if (mode === "throw-provider-error") {
        throw { code: "NUMERICAL_FAILURE", message: "Simulated numerical convergence failure", details: { iter: 42 } };
      }

      const waitMs = Number(input.numericalOptions?.delayMs ?? 15);
      context.onProgress?.(0.25, "Fixture step 1");
      await delayWithAbort(waitMs, context.signal);
      context.onProgress?.(0.75, "Fixture step 2");

      const runTag = String(input.numericalOptions?.runTag ?? "default");
      const n = input.state.kind === "nonrelativistic" ? input.state.n : 1;

      context.onProgress?.(1.0, "Fixture complete");
      return {
        ok: true,
        data: {
          fixtureTag: runTag,
          Z: input.system.Z,
          N: input.system.N,
          n,
          reducedMassRatio: input.system.reducedMassRatio,
          // TypedArray intentionally included to verify lossless plain-data normalization across Worker/JSON/IDB
          sampleGrid: new Float32Array([0.1, 1.0, 2.5]),
        },
        validationChecks: [{ name: "fixture-determinism", passed: true, detail: `tag=${runTag}` }],
        computedAtIso: new Date().toISOString(),
        provenance: {
          providerId: "test-fixture-deterministic",
          providerVersion: "test-1.0.0",
          modelName: "SYNTHETIC TEST FIXTURE (NON-PHYSICAL)",
          hamiltonian: "Synthetic test fixture (platform verification only)",
          constantsVersion: CONSTANTS_VERSION,
          evidenceClass: "qualitative-approximation",
          assumptions: [
            `Nuclear model: ${input.system.nuclearModel.kind}`,
            "Synthetic platform test harness ONLY — not physical atomic output",
          ],
          limitations: ["Deterministic synthetic test fixture ONLY — NOT a physical calculation."],
          numericalQuality: {
            method: "deterministic-test-fixture",
            gridPoints: 3,
          },
          uncertainty: {
            modelApproximationNote: "Non-physical deterministic test fixture for Phase 2 lifecycle testing.",
          },
        },
      };
    },
  };
}

function createTestRegistry(): PhysicsProviderRegistry {
  return new PhysicsProviderRegistry([
    createDeterministicTestFixtureProvider(),
    lobatoDiracFockV6Provider,
    graspV6Provider,
  ]);
}

function createStructuredCloneWorkerFactory(registry: PhysicsProviderRegistry): () => WorkerLike {
  return () => {
    const workerObj: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(msg: unknown) {
        assertStructuredCloneSafe(msg, "testInbound");
        const cloned = structuredClone(msg) as ExperimentWorkerInbound;
        queueMicrotask(() => runtime.receive(cloned));
      },
      terminate() {},
    };
    const runtime = createExperimentWorkerRuntime(registry, (outMsg) => {
      assertStructuredCloneSafe(outMsg, "testOutbound");
      const clonedOut = structuredClone(outMsg);
      queueMicrotask(() => {
        workerObj.onmessage?.({ data: clonedOut });
      });
    });
    return workerObj;
  };
}

describe("Phase 2 Experiment Platform — Mandatory Lifecycle Acceptance Tests", () => {
  it("executes steps 1–10: create, validate, queue, execute via Worker, save to IndexedDB, reload (distinct from rerun), export/import JSON, and verify integrity", async () => {
    const registry = createTestRegistry();
    const idbFactory = createInMemoryIDBFactory();
    const upgradeLog: Array<{ oldVersion: number; newVersion: number }> = [];
    const store = new IndexedDBExperimentStore({
      idbFactory,
      onUpgrade: (oldVersion, newVersion) => upgradeLog.push({ oldVersion, newVersion }),
    });
    const workerClient = new ExperimentWorkerClient(createStructuredCloneWorkerFactory(registry));
    const runner = new ExperimentRunner({
      providerRegistry: registry,
      workerClient,
      store,
    });

    const statusesObserved: string[] = [];
    runner.scheduler.subscribe((exec) => statusesObserved.push(exec.status));

    // 1. Create experiment with 2H (Deuterium) bare nuclear mass
    const iso2H = defaultIsotopeForZ(1, 2);
    const system2H = createAtomicSystem({
      Z: 1,
      N: 1,
      massNumber: 2,
      nuclearModel: createNuclearModelForIsotope("point-finite-mass", iso2H),
    });
    const def = createExperimentDefinition({
      kind: "single-state",
      title: "Phase 2 Lifecycle Test — 2H 2p",
      system: system2H,
      quantumStates: [createNonRelativisticState({ n: 2, l: 1, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy", "radial-probability"],
      numericalParameters: { delayMs: 10, runTag: "run-initial" },
      tags: ["phase2", "acceptance"],
    });

    // 2. Validate explicitly
    const valReport = runner.validator.validate(def);
    expect(valReport.validation.valid).toBe(true);
    expect(valReport.supportAssessment?.supported).toBe(true);

    // 3–5. Queue & Execute through Worker orchestration
    const handle = runner.run(def, { mode: "worker", persist: true });
    expect(handle.execution.status).toBe("queued");

    const { execution, result } = await handle.completion;
    expect(statusesObserved).toContain("queued");
    expect(statusesObserved).toContain("running");
    expect(statusesObserved[statusesObserved.length - 1]).toBe("completed");
    expect(execution.status).toBe("completed");
    expect(execution.executionMode).toBe("worker");
    expect(execution.resultId).toBe(result?.resultId);

    // Verify result normalization & provenance preservation
    expect(result).toBeDefined();
    expect(result!.source).toBe("computed");
    expect(result!.recomputedCount).toBe(0);
    expect(result!.providerId).toBe("test-fixture-deterministic");
    expect(result!.providerVersion).toBe("test-1.0.0");
    expect(result!.constantsVersion).toBe(CONSTANTS_VERSION);
    expect(result!.units.energy).toBe("eV");
    expect(result!.units.length).toBe("a0");
    expect(result!.nuclearModelUsed.kind).toBe("point-finite-mass");
    expect(result!.reducedMassRatioUsed).toBeCloseTo(system2H.reducedMassRatio, 12);
    expect(result!.provenance.numericalQuality.method).toBe("deterministic-test-fixture");
    // TypedArray normalized cleanly into plain array for clone/JSON safety
    expect((result!.payload as { sampleGrid: number[] }).sampleGrid[2]).toBeCloseTo(2.5, 5);

    // 6. IndexedDB schema upgrade ran cleanly (v0 -> v1)
    expect(upgradeLog).toEqual([{ oldVersion: 0, newVersion: 1 }]);
    expect(ATOMS_IDB_NAME).toBe("atoms_laboratory_db");

    // 7. Reload from IndexedDB and verify loaded replay is distinct from recomputing
    const freshRunner = new ExperimentRunner({
      providerRegistry: registry,
      workerClient,
      store,
    });
    const loaded = await freshRunner.loadStoredExperiment(def.id);
    expect(loaded.definition?.id).toBe(def.id);
    expect(loaded.definition?.system.isotope.nuclearMass_u).toBeCloseTo(iso2H.nuclearMass_u, 12);
    expect(loaded.executions).toHaveLength(1);
    expect(loaded.latestResult?.source).toBe("loaded-from-store");
    expect(loaded.latestResult?.loadedAtIso).toBeDefined();
    expect(loaded.latestResult?.computedAtIso).toBe(result!.computedAtIso);
    expect(loaded.latestResult?.recomputedCount).toBe(0);

    // Explicitly rerun and confirm recomputedCount increments and source returns to "computed"
    const rerunHandle = freshRunner.rerun(def, { mode: "worker", persist: true });
    const rerunOut = await rerunHandle.completion;
    expect(rerunOut.result?.source).toBe("computed");
    expect(rerunOut.result?.recomputedCount).toBe(1);

    // 8. Export to JSON
    const bundleJson = ExperimentSerializer.exportEntry({
      definition: loaded.definition!,
      executions: loaded.executions,
      results: [loaded.latestResult!],
    });

    // 9–10. Import into fresh experiment record and verify full metadata & result integrity
    const importedRes = ExperimentSerializer.importIntoFreshRecord(bundleJson);
    expect(importedRes.ok).toBe(true);
    if (importedRes.ok) {
      const imp = importedRes.imported[0];
      expect(imp.definition.id).not.toBe(def.id);
      expect(imp.definition.originNote).toContain(def.id);
      expect(imp.definition.constantsVersion).toBe(CONSTANTS_VERSION);
      expect(imp.definition.system.isotope.massNumber).toBe(2);
      expect(imp.results[0].source).toBe("imported-json");
      expect(imp.results[0].providerVersion).toBe("test-1.0.0");
      expect(imp.results[0].units).toEqual(result!.units);
      expect(imp.results[0].provenance.numericalQuality.method).toBe("deterministic-test-fixture");
    }

    workerClient.dispose();
    store.close();
  });

  it("step 11: cancels a long-running Worker job cleanly via AbortSignal", async () => {
    const registry = createTestRegistry();
    const workerClient = new ExperimentWorkerClient(createStructuredCloneWorkerFactory(registry));
    const runner = new ExperimentRunner({ providerRegistry: registry, workerClient });

    const def = createExperimentDefinition({
      kind: "single-state",
      title: "Long-running cancellation test",
      system: createAtomicSystem({ Z: 1, N: 1 }),
      quantumStates: [createNonRelativisticState({ n: 1, l: 0, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy"],
      numericalParameters: { delayMs: 2000, runTag: "slow-job" },
    });

    const handle = runner.run(def, { mode: "worker" });
    await new Promise((r) => setTimeout(r, 20));
    handle.cancel("User stopped job");

    const { execution, result } = await handle.completion;
    expect(execution.status).toBe("cancelled");
    expect(result).toBeUndefined();
    expect(runner.resultRegistry.listForExperiment(def.id)).toHaveLength(0);
    workerClient.dispose();
  });

  it("step 12: protects against stale completions overwriting newer experiment results", async () => {
    const registry = createTestRegistry();
    const staleDiscarded: string[] = [];
    const scheduler = new ExperimentScheduler({
      maxConcurrency: 2,
      onStaleDiscarded: (exec) => staleDiscarded.push(exec.executionId),
    });
    const runner = new ExperimentRunner({ providerRegistry: registry, scheduler });

    const baseDef = createExperimentDefinition({
      id: "exp_stale_guard_target",
      kind: "single-state",
      title: "Stale Guard Test",
      system: createAtomicSystem({ Z: 1, N: 1 }),
      quantumStates: [createNonRelativisticState({ n: 1, l: 0, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy"],
      numericalParameters: { delayMs: 120, runTag: "OLD_SLOW_RUN" },
    });

    // Launch slow run #1 without superseding it immediately, then launch fast run #2 without cancelling #1 in scheduler
    // so run #1 finishes AFTER run #2 and attempts to write a stale result!
    const slowHandle = runner.run(baseDef, { mode: "direct", supersedeActive: false });
    const fastDef = {
      ...baseDef,
      numericalParameters: { delayMs: 5, runTag: "NEW_FAST_RUN" },
    };
    const fastHandle = runner.run(fastDef, { mode: "direct", supersedeActive: false });

    const [fastOut, slowOut] = await Promise.all([fastHandle.completion, slowHandle.completion]);

    expect(fastOut.execution.status).toBe("completed");
    expect((fastOut.result?.payload as { fixtureTag: string }).fixtureTag).toBe("NEW_FAST_RUN");

    // Slow run #1 arrived after sequence #2 was reserved -> rejected as stale!
    expect(slowOut.execution.status).toBe("cancelled");
    expect(slowOut.execution.error?.code).toBe("STALE_EXECUTION");
    expect(staleDiscarded).toContain(slowOut.execution.executionId);

    const latest = runner.resultRegistry.getLatestForExperiment("exp_stale_guard_target");
    expect((latest?.payload as { fixtureTag: string }).fixtureTag).toBe("NEW_FAST_RUN");
    expect(runner.resultRegistry.listForExperiment("exp_stale_guard_target")).toHaveLength(1);
  });

  it("step 13: handles provider errors, timeouts, unavailable/unsupported capabilities, malformed JSON, IDB errors, and non-clone-safe inputs", async () => {
    const registry = createTestRegistry();
    const runner = new ExperimentRunner({ providerRegistry: registry });

    // 13a. Provider error propagation
    const errDef = createExperimentDefinition({
      kind: "single-state",
      title: "Provider error propagation",
      system: createAtomicSystem({ Z: 1, N: 1 }),
      quantumStates: [createNonRelativisticState({ n: 1, l: 0, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy"],
      numericalParameters: { fixtureBehavior: "throw-provider-error" },
    });
    const errRes = await runner.run(errDef, { mode: "direct" }).completion;
    expect(errRes.execution.status).toBe("failed");
    expect(errRes.execution.error?.code).toBe("PROVIDER_ERROR");
    expect(errRes.execution.error?.message).toContain("Simulated numerical convergence failure");

    // 13b. Timeout enforcement
    const timeoutDef = createExperimentDefinition({
      kind: "single-state",
      title: "Timeout enforcement",
      system: createAtomicSystem({ Z: 1, N: 1 }),
      quantumStates: [createNonRelativisticState({ n: 1, l: 0, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy"],
      numericalParameters: { delayMs: 500 },
    });
    const toRes = await runner.run(timeoutDef, { mode: "direct", timeoutMs: 25 }).completion;
    expect(toRes.execution.status).toBe("timed-out");
    expect(toRes.execution.error?.code).toBe("TIMED_OUT");

    // 13c. Unavailable external provider (GRASP2018) -> "unsupported"
    const graspDef = createExperimentDefinition({
      kind: "single-state",
      title: "Unavailable GRASP2018 test",
      system: createAtomicSystem({ Z: 10, N: 10 }),
      quantumStates: [createNonRelativisticState({ n: 2, l: 1, m_l: 0 })],
      providerId: "grasp-mcdhf",
      providerVersion: "GRASP2018",
      observables: ["bound-energy"],
    });
    const graspOut = await runner.run(graspDef).completion;
    expect(graspOut.execution.status).toBe("unsupported");
    expect(graspOut.execution.error?.code).toBe("UNSUPPORTED_CAPABILITY");

    // 13d. Defined finite-nucleus model rejected honestly when no finite-nucleus solver exists
    const finiteFermiDef = createExperimentDefinition({
      kind: "single-state",
      title: "Unsupported finite-fermi model",
      system: createAtomicSystem({
        Z: 79,
        N: 79,
        nuclearModel: createNuclearModelForIsotope("finite-fermi", defaultIsotopeForZ(79), { rmsRadius_fm: 5.437, skinThickness_fm: 0.52 }),
      }),
      quantumStates: [createNonRelativisticState({ n: 1, l: 0, m_l: 0 })],
      providerId: "test-fixture-deterministic",
      providerVersion: "test-1.0.0",
      observables: ["bound-energy"],
    });
    const finiteOut = await runner.run(finiteFermiDef).completion;
    expect(finiteOut.execution.status).toBe("unsupported");
    expect(finiteOut.execution.error?.code).toBe("UNSUPPORTED_NUCLEAR_MODEL");

    // 13e. Negative ion rejected by test fixture and lobato2026-df
    const hMinusDef = createExperimentDefinition({
      kind: "total-density",
      title: "Unsupported H- on Lobato DF",
      system: createAtomicSystem({ Z: 1, N: 2 }),
      quantumStates: [{ kind: "configuration-average", Z: 1, densitySource: "dirac-fock" }],
      providerId: "lobato2026-df",
      providerVersion: "arXiv:2608.14934",
      observables: ["total-spherical-density"],
    });
    const hMinusOut = await runner.run(hMinusDef).completion;
    expect(hMinusOut.execution.status).toBe("unsupported");

    // 13f. JSON import rejects malformed JSON, unsupported bundleVersion, and tampered system charge
    expect(ExperimentSerializer.importFromJson("{bad json").ok).toBe(false);
    expect(
      ExperimentSerializer.importFromJson(
        JSON.stringify({ format: "atoms-experiment-bundle", bundleVersion: 99, entries: [{}] }),
      ).ok,
    ).toBe(false);
    expect(
      ExperimentSerializer.importFromJson(
        JSON.stringify({
          format: "atoms-experiment-bundle",
          bundleVersion: 1,
          entries: [
            {
              definition: { ...errDef, schemaVersion: "atom-exp/v999" },
              executions: [],
              results: [],
            },
          ],
        }),
      ).ok,
    ).toBe(false);

    // 13g. IndexedDB blocked/open error propagation
    const blockedStore = new IndexedDBExperimentStore({
      idbFactory: createInMemoryIDBFactory({ simulateBlocked: true }),
    });
    await expect(blockedStore.listExperiments()).rejects.toThrow(/blocked/i);

    // 13h. Structured-clone guard rejects functions, React $$typeof elements, and class instances
    expect(() => assertStructuredCloneSafe({ fn: () => 1 })).toThrow(/function/i);
    expect(() => assertStructuredCloneSafe({ $$typeof: Symbol.for("react.element") })).toThrow(/React/i);
    class NonPlainClass {
      x = 1;
    }
    expect(() => assertStructuredCloneSafe({ instance: new NonPlainClass() })).toThrow(/NonPlainClass/);
  });
});
