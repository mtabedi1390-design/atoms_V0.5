# ATOMS v0.7.0 — TypeScript & Server API Reference

All pure scientific modules under `src/domain/`, `src/physics/`, `src/experiments/`, `src/numerics/`, and `src/sampling/` have zero React, Three.js, or Node built-in dependencies (outside `__tests__`) and run cleanly in browsers, Vitest, or Web Workers.

---

## 1. Atomic Domain (`src/domain/atomic/index.ts`)
- `createAtomicSystem({ Z, N?, massNumber?, nuclearModel? })`: Validates `1 <= Z <= 118`, `N >= 0`, computes charge `q = Z - N`, links isotope `nuclearMass_u` vs `neutralAtomicMass_u`, and calculates `reducedMassRatio`.
- `validateAtomicSystem(system)` / `listIsotopesForZ(Z)` / `defaultIsotopeForZ(Z, massNumber?)` / `createNuclearModelForIsotope(kind, isotope)`.

## 2. Quantum States (`src/domain/quantum/index.ts`)
- `createNonRelativisticState({ n, l, m_l, m_s, basis })`
- `createRelativisticState({ n, kappa, m_j })`
- `createSuperpositionState({ terms, basisKind })`
- `createConfigurationAverageState(elementZ, groundTerm, isOpenShell, subshells)`
- `createMultiElectronHFState({ N, method, basis, occupationMode, spin2S, subshellOccupations, useSymmetry, scfOptions, volumeGrid })` & `validateMultiElectronHFState(state)` (`v0.7.0`)
- Bijections: `jFromKappa(k)`, `lFromKappa(k)`, `lSmallFromKappa(k)`, `parityFromKappa(k)`, `kappaFromLJ(l, j)`

## 3. Units & Constants (`src/physics/units.ts`)
- `CONSTANTS_VERSION` (`"CODATA-2018"`), `CODATA_2018`, `CODATA_2018_UNCERTAINTIES`, `EXTENDED_CONSTANTS`
- `quantity(value, unit)`, `convertLength`, `convertEnergy`, `convertMass`, `convertCharge`, `convertFrequency`, `energyEvToWavelengthNm`

## 4. Physics Providers & Live Multi-Electron HF (`src/physics/hf/`, `src/physics/providers/`)
- `createDefaultProviderRegistry()` (`registry.ts`) -> `PhysicsProviderRegistry`
- **Live PySCF Multi-Electron HF (`hartreeFock/index.ts`, `hf/`)**:
  - `createPyscfLiveProvider(transport?)` / `pyscfLiveProvider` (`id: "pyscf-hf-live"`, `version: "0.7.0"`)
  - `HF_BASIS_CATALOG`, `getBasisCatalogEntry(basis)`, `isBasisSupportedForZ(basis, Z, capabilities?)` (`basisCatalog.ts`)
  - `proposeDefaultConfiguration(Z, N)`, `proposeAufbauConfiguration(N)`, `validateSubshellOccupations(...)`, `validateMethodForSpin(...)` (`configurations.ts`)
  - `HF_BENCHMARK_REFERENCES`, `lookupHFBenchmark(Z, N, spin2S)` (`benchmarks.ts`)
  - `createHttpHFTransport(baseUrl?)`, `probeHFCapabilities(transport?, signal?)` (`transport.ts` — blob-Worker-safe origin resolution)
- **Schrödinger (`schrodinger/index.ts`) & Dirac (`dirac/index.ts`)**: `schrodingerCoulombV6Provider`, `diracCoulombV6Provider`
- **Legacy v0.5 Adapters (`legacyAdapters.ts`)**: `lobatoDFV6Provider`, `pyscfHFV6Provider`, `slaterV6Provider`, `datatomsMCDFProvider`, `graspMCDHFProvider`

## 5. E1 Transitions & Spectroscopy (`src/physics/transitions/`, `src/physics/spectroscopy/`)
- `wigner3j`, `wigner6j` (`src/numerics/specialFunctions/wigner.ts`)
- `calculateNonRelativisticE1Transition`, `calculateRelativisticE1Transition`, `generateHydrogenLikeSpectrum`, `compareNonRelativisticAndDiracSpectra`

## 6. Visualization Numerics & Samplers (`src/numerics/`, `src/sampling/`)
- `extractStateIsosurface(state, Z, reducedMassRatio, spec)` (`marchingTetrahedra.ts`)
- `extractIsosurfacesFromVolumeGrid(grid, isoFraction)` & `slice2DFromVolumeGrid(grid, plane, offsetBohr)` (`marchingTetrahedra.ts`, `v0.7.0`)
- `evaluate2DSlice(state, Z, reducedMassRatio, opts)`, `sampleDiracSpinorCloud(req)`, `sampleOrbital(...)`

## 7. Experiment Platform, Workers & Express Server (`src/experiments/`, `src/workers/`, `server.ts`)
- `createExperimentDefinition`, `createDefaultExperimentRegistry` (supports `"multi-electron-hf"`), `validateExperimentDefinition`
- `ExperimentRunner`, `ExperimentScheduler`, `assertStructuredCloneSafe`, `IndexedDBExperimentStore` / `MemoryExperimentStore`, `ExperimentSerializer`
- `GET /api/hf/capabilities` (`?refresh=1`), `POST /api/hf/calculate` (`server.ts` Express 5 local Python PySCF bridge)
