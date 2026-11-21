/**
 * Integration test executing real ATOMS v0.5.0 Hydrogen calculations
 * (Lobato 2026 Dirac-Fock & PySCF aug-cc-pVTZ) through the Phase 2 Experiment Platform.
 */
import { describe, expect, it } from "vitest";
import { createAtomicSystem } from "@/domain/atomic";
import { createDefaultProviderRegistry } from "@/physics/providers/registry";
import { CONSTANTS_VERSION } from "@/physics/units";
import {
  ExperimentRunner,
  ExperimentSerializer,
  MemoryExperimentStore,
  createExperimentDefinition,
} from "../index";

describe("Phase 2 Real v0.5 Provider Integration (Hydrogen)", () => {
  it("runs a real Hydrogen total-density experiment (PySCF + Lobato DF), persists, reloads, exports JSON, and reruns", async () => {
    const registry = createDefaultProviderRegistry();
    const store = new MemoryExperimentStore();
    const runner = new ExperimentRunner({ providerRegistry: registry, store });

    const hAtom = createAtomicSystem({ Z: 1, N: 1 });
    const pyscfExp = createExperimentDefinition({
      kind: "total-density",
      title: "Hydrogen Ground-State RHF Density (PySCF aug-cc-pVTZ)",
      system: hAtom,
      quantumStates: [{ kind: "configuration-average", Z: 1, densitySource: "hf" }],
      providerId: "pyscf-hf",
      providerVersion: "2.15.1",
      observables: ["total-spherical-density", "total-energy"],
    });

    const { execution, result } = await runner.run(pyscfExp, { mode: "direct", persist: true }).completion;
    expect(execution.status).toBe("completed");
    expect(result).toBeDefined();
    expect(result!.source).toBe("computed");
    expect(result!.constantsVersion).toBe(CONSTANTS_VERSION);
    expect(result!.providerId).toBe("pyscf-hf");
    expect(result!.provenance.evidenceClass).toBe("computed-basis-limited");
    expect(result!.validationChecks.every((c) => c.passed)).toBe(true);

    // Reload stored result (replay)
    const reloaded = await runner.loadStoredExperiment(pyscfExp.id);
    expect(reloaded.latestResult?.source).toBe("loaded-from-store");
    expect(reloaded.latestResult?.computedAtIso).toBe(result!.computedAtIso);

    // Export and import into fresh record
    const exported = ExperimentSerializer.exportEntry({
      definition: reloaded.definition!,
      executions: reloaded.executions,
      results: [reloaded.latestResult!],
    });
    const imported = ExperimentSerializer.importIntoFreshRecord(exported);
    expect(imported.ok).toBe(true);

    // Lobato 2026 DF Hydrogen
    const lobatoExp = createExperimentDefinition({
      kind: "total-density",
      title: "Hydrogen Dirac-Fock Density (Lobato 2026)",
      system: hAtom,
      quantumStates: [{ kind: "configuration-average", Z: 1, densitySource: "dirac-fock" }],
      providerId: "lobato2026-df",
      providerVersion: "arXiv:2608.14934",
      observables: ["total-spherical-density"],
    });
    const lobatoOut = await runner.run(lobatoExp, { mode: "direct", persist: true }).completion;
    expect(lobatoOut.execution.status).toBe("completed");
    expect(lobatoOut.result?.provenance.numericalQuality.relativeChargeError).toBeLessThan(5e-4);
  });
});
