/**
 * ATOMS v0.6.0 Provider Registry.
 *
 * Registers genuinely implemented providers and visibly exposes unavailable external
 * packages/datasets with concrete blockers. Future engines (Schrodinger-Coulomb
 * v0.6 and Dirac-Coulomb v0.6) are added only in Phases 3 and 4 once validated.
 */
import type { AtomicSystem } from "@/domain/atomic";
import type { ProviderCapability } from "@/domain/observables";
import type { QuantumState } from "@/domain/quantum";
import type { SupportAssessment } from "@/domain/validation";
import type { PhysicsProvider } from "./contracts";
import {
  datatomsV6Provider,
  graspV6Provider,
  lobatoDiracFockV6Provider,
  pyscfHartreeFockV6Provider,
  slaterV6Provider,
} from "./legacyAdapters";

export interface ProviderAssessmentEntry {
  readonly provider: PhysicsProvider;
  readonly assessment: SupportAssessment;
}

export class PhysicsProviderRegistry {
  private readonly map = new Map<string, PhysicsProvider>();

  constructor(initial: readonly PhysicsProvider[] = []) {
    for (const p of initial) this.register(p);
  }

  register(provider: PhysicsProvider): void {
    if (this.map.has(provider.id)) {
      throw new Error(`Duplicate provider id: ${provider.id}`);
    }
    this.map.set(provider.id, provider);
  }

  getById(id: string): PhysicsProvider | undefined {
    return this.map.get(id);
  }

  listAll(): readonly PhysicsProvider[] {
    return [...this.map.values()];
  }

  assessAll(system: AtomicSystem, state: QuantumState): readonly ProviderAssessmentEntry[] {
    return this.listAll().map((provider) => ({
      provider,
      assessment: provider.supports(system, state),
    }));
  }

  listSupporting(
    system: AtomicSystem,
    state: QuantumState,
    requiredCapabilities: readonly ProviderCapability[] = [],
  ): readonly ProviderAssessmentEntry[] {
    return this.assessAll(system, state).filter(
      ({ provider, assessment }) =>
        assessment.supported &&
        requiredCapabilities.every((cap) => provider.capabilities.includes(cap)),
    );
  }
}

export function createDefaultProviderRegistry(): PhysicsProviderRegistry {
  return new PhysicsProviderRegistry([
    lobatoDiracFockV6Provider,
    pyscfHartreeFockV6Provider,
    slaterV6Provider,
    datatomsV6Provider,
    graspV6Provider,
  ]);
}
