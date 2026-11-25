/**
 * ExperimentRegistry — authoritative catalog of supported experiment kinds
 * and their structural/observable contracts (ATOMS v0.6.0 Phase 2).
 */
import type { ProviderCapability } from "@/domain/observables";
import type { ExperimentKind } from "../schema";

export interface ExperimentKindDescriptor {
  readonly kind: ExperimentKind;
  readonly label: string;
  readonly description: string;
  readonly minStates: number;
  readonly maxStates: number;
  readonly requiresTransition: boolean;
  readonly defaultObservables: readonly ProviderCapability[];
  readonly implementedInCurrentRelease: boolean;
  readonly plannedPhaseNote?: string;
}

const BUILTIN_EXPERIMENT_DESCRIPTORS: readonly ExperimentKindDescriptor[] = [
  {
    kind: "total-density",
    label: "Total Atomic Electron Density",
    description: "Spherically averaged total electron density ρ(r) and radial probability 4πr²ρ(r) for neutral atoms.",
    minStates: 1,
    maxStates: 1,
    requiresTransition: false,
    defaultObservables: ["total-spherical-density", "radial-probability"],
    implementedInCurrentRelease: true,
  },
  {
    kind: "single-state",
    label: "Single Quantum State Evaluation",
    description: "Evaluate bound-state energy, radial/spinor wavefunction, probability density, and expectation values for one quantum state.",
    minStates: 1,
    maxStates: 1,
    requiresTransition: false,
    defaultObservables: ["bound-energy", "radial-wavefunction", "spatial-density", "expectation-values"],
    implementedInCurrentRelease: true,
    plannedPhaseNote: "Analytical Schrödinger (Phase 3) and Dirac–Coulomb (Phase 4) providers will activate physics solvers for this kind.",
  },
  {
    kind: "energy-spectrum",
    label: "Atomic Energy Structure",
    description: "Compute a set of bound-state energy levels and splittings across specified quantum states.",
    minStates: 1,
    maxStates: 128,
    requiresTransition: false,
    defaultObservables: ["bound-energy"],
    implementedInCurrentRelease: true,
    plannedPhaseNote: "Hydrogen-like Schrödinger & Dirac energy structure engines arrive in Phases 3–4.",
  },
  {
    kind: "e1-transition",
    label: "Electric-Dipole (E1) Transition",
    description: "Evaluate E1 selection rules, radial/angular dipole matrix elements, oscillator strength, and Einstein A.",
    minStates: 0,
    maxStates: 2,
    requiresTransition: true,
    defaultObservables: ["e1-transitions"],
    implementedInCurrentRelease: true,
  },
  {
    kind: "spectroscopy-series",
    label: "Spectral Series Generation",
    description: "Construct emission/absorption spectra from calculated transition ensembles.",
    minStates: 0,
    maxStates: 256,
    requiresTransition: false,
    defaultObservables: ["spectroscopy", "e1-transitions"],
    implementedInCurrentRelease: true,
  },
  {
    kind: "multi-electron-hf",
    label: "Multi-Electron Hartree–Fock SCF",
    description: "Self-consistent RHF, UHF, ROHF, or spherically averaged atomic HF calculation returning orbitals, electron/spin densities, energy decomposition, and SCF convergence history.",
    minStates: 1,
    maxStates: 1,
    requiresTransition: false,
    defaultObservables: [
      "multi-electron-hf",
      "total-energy",
      "orbital-resolved-hf",
      "total-spherical-density",
      "radial-probability",
      "scf-diagnostics",
    ],
    implementedInCurrentRelease: true,
  },
  {
    kind: "ls-term-ci",
    label: "Atomic LS-Term Structure & Fixed-Orbital CI",
    description: "Russell–Saunders (L^2, S^2, Π)-coupled multiconfiguration CI using SO(3)-symmetric AtomSphAverageRHF radial orbitals.",
    minStates: 1,
    maxStates: 1,
    requiresTransition: false,
    defaultObservables: ["ls-term-ci", "ls-term-enumeration", "total-energy"],
    implementedInCurrentRelease: true,
  },
  {
    kind: "electron-correlation",
    label: "Post-HF Electron Correlation (MP2 / CISD / FCI)",
    description: "Wavefunction electron correlation beyond Hartree–Fock via PySCF RMP2/UMP2/ROMP2, RCISD/UCISD, and bounded iterative Full CI.",
    minStates: 1,
    maxStates: 1,
    requiresTransition: false,
    defaultObservables: ["electron-correlation", "total-energy", "scf-diagnostics"],
    implementedInCurrentRelease: true,
  },
];

export class ExperimentRegistry {
  private readonly map = new Map<ExperimentKind, ExperimentKindDescriptor>();

  constructor(initial: readonly ExperimentKindDescriptor[] = BUILTIN_EXPERIMENT_DESCRIPTORS) {
    for (const d of initial) this.register(d);
  }

  register(descriptor: ExperimentKindDescriptor): void {
    if (this.map.has(descriptor.kind)) {
      throw new Error(`Duplicate experiment kind registered: ${descriptor.kind}`);
    }
    this.map.set(descriptor.kind, descriptor);
  }

  get(kind: ExperimentKind): ExperimentKindDescriptor | undefined {
    return this.map.get(kind);
  }

  listAll(): readonly ExperimentKindDescriptor[] {
    return [...this.map.values()];
  }
}

export function createDefaultExperimentRegistry(): ExperimentRegistry {
  return new ExperimentRegistry();
}
