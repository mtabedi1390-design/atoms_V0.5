# ATOMS v0.6.0 — TypeScript Module & API Reference

All pure scientific modules under `src/domain/`, `src/physics/`, `src/experiments/`, `src/numerics/`, and `src/workers/` have zero React or Three.js dependencies and can be imported cleanly in Node, tests, or Web Workers.

---

## 1. Atomic Domain (`src/domain/atomic/index.ts`)
- `createAtomicSystem({ Z, N?, massNumber?, nuclearModel? })`: Validates `1 <= Z <= 118`, `N >= 0`, computes charge `q = Z - N`, links isotope `nuclearMass_u` vs `neutralAtomicMass_u`, and calculates `reducedMassRatio`.
- `validateAtomicSystem(system)`: Returns structured `ValidationResult`.
- `listIsotopesForZ(Z)` / `defaultIsotopeForZ(Z, massNumber?)` / `createNuclearModelForIsotope(kind, isotope)`.

## 2. Quantum States (`src/domain/quantum/index.ts`)
- `createNonRelativisticState({ n, l, m_l, m_s, basis })`
- `createRelativisticState({ n, kappa, m_j })`
- `createSuperpositionState({ terms, basisKind })`
- `createConfigurationAverageState(elementZ, groundTerm, isOpenShell, subshells)`
- Bijections: `jFromKappa(k)`, `lFromKappa(k)`, `lSmallFromKappa(k)`, `parityFromKappa(k)`, `kappaFromLJ(l, j)`
- `validateQuantumState(state)`

## 3. Units & Constants (`src/physics/units.ts`)
- `CONSTANTS_VERSION` (`"CODATA-2018"`), `CODATA_2018`, `EXTENDED_CONSTANTS`
- `quantity(value, unit)` -> `TypedQuantity<U>`
- `convertLength`, `convertEnergy`, `convertMass`, `convertCharge`, `convertFrequency`
- `energyEvToWavelengthNm(eV)` (vacuum), `wavelengthNmToEnergyEv(nm)`, `energyEvToWavenumberCm1(eV)`, `energyEvToFrequencyHz(eV)`

## 4. Physics Providers (`src/physics/providers/`)
- `createDefaultProviderRegistry()` (`registry.ts`) -> `PhysicsProviderRegistry`
  - `assessAll(system, state)` / `selectForSystem(system, state, requiredCapability)`
- **Schrödinger (`schrodinger/index.ts`)**:
  - `schrodingerCoulombV6Provider`
  - `evaluateSchrodingerState(state, Z, reducedMassRatio, rBohr, theta, phi)`
  - `meanInvRAnalytic`, `meanInvRSquaredAnalytic`, `meanInvRCubedAnalytic`
- **Dirac (`dirac/index.ts`)**:
  - `diracCoulombV6Provider`
  - `checkDiracCoulombDomain(Z, kappa)`
  - `computeDiracEnergy(n, kappa, Z, reducedMassRatio, alphaOverride?)`
  - `diracRadialPQ(n, kappa, rBohr, Z, reducedMassRatio, alphaOverride?)`
  - `evaluateDiracSpinor(state, Z, reducedMassRatio, rBohr, theta, phi, alphaOverride?)`
  - `integrateDiracExpectationValues(n, kappa, Z, reducedMassRatio, alphaOverride?, intervals?)`
- **Legacy v0.5 Adapters (`legacyAdapters.ts`)**:
  - `lobatoDFV6Provider`, `pyscfHFV6Provider`, `slaterV6Provider`, `datatomsMCDFProvider`, `graspMCDHFProvider`

## 5. E1 Transitions & Spectroscopy (`src/physics/transitions/`, `src/physics/spectroscopy/`)
- `wigner3j(j1, j2, j3, m1, m2, m3)` / `wigner6j(j1, j2, j3, j4, j5, j6)` (`src/numerics/specialFunctions/wigner.ts`)
- `evaluateNonRelativisticE1SelectionRules(initial, final)`
- `calculateNonRelativisticE1Transition(system, initial, final, options?)`
- `evaluateRelativisticE1SelectionRules(initial, final)`
- `calculateRelativisticE1Transition(system, initial, final, options?)`
- `generateHydrogenLikeSpectrum(system, options)` (`src/physics/spectroscopy/index.ts`)
- `compareNonRelativisticAndDiracSpectra(system, options)` / `compareLinesWithNist(...)`

## 6. Visualization Numerics & Samplers (`src/numerics/`, `src/sampling/`)
- `extractStateIsosurface(state, Z, reducedMassRatio, spec)` (`marchingTetrahedra.ts`)
- `evaluate2DSlice(state, Z, reducedMassRatio, opts)` (`marchingTetrahedra.ts`)
- `sampleDiracSpinorCloud(req)` (`diracSampler.ts`)
- `sampleOrbital(params, cache, onProgress, shouldCancel)` (`sampler.ts`)

## 7. Experiment Platform & Workers (`src/experiments/`, `src/workers/`)
- `createExperimentDefinition(opts)` (`schema/index.ts`)
- `createDefaultExperimentRegistry()` (`registry/index.ts`)
- `validateExperimentDefinition(def, providerRegistry)` (`validation/index.ts`)
- `ExperimentRunner` (`execution/runner.ts`) -> `.run(def, opts)`, `.rerun(def, opts)`, `.loadStoredExperiment(id)`
- `ExperimentScheduler` (`execution/scheduler.ts`) & `assertStructuredCloneSafe(value)`
- `IndexedDBExperimentStore` / `MemoryExperimentStore` (`persistence/store.ts`)
- `ExperimentSerializer` (`persistence/serializer.ts`) -> `.exportEntry(...)`, `.importFromJson(...)`, `.importIntoFreshRecord(...)`
- `ExperimentWorkerClient` (`workers/experimentClient.ts`) & `VisualizationWorkerClient` (`workers/visualizationClient.ts`)
