# ATOMS v0.7.2 — TypeScript & Server API Reference

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
- `createLSTermCIState({ N, basis, referenceConfiguration, targetL, targetSpin2S, targetParity, activeSpaceMode, frozenCoreSubshells?, activeShells?, customConfigurations?, maxExcitationRank?, nRoots, crossCheckPyscfFci })` & `validateLSTermCIState(state)` (`v0.7.1`)
- `createElectronCorrelationState({ N, spin2S, basis, referenceMethod, correlationMethod, frozenCoreMode, nRoots?, fixSpin?, scfOptions?, correlationOptions? })` & `validateElectronCorrelationState(state)` (`v0.7.2`)
- Bijections: `jFromKappa(k)`, `lFromKappa(k)`, `lSmallFromKappa(k)`, `parityFromKappa(k)`, `kappaFromLJ(l, j)`

## 3. Units & Constants (`src/physics/units.ts`)
- `CONSTANTS_VERSION` (`"CODATA-2018"`), `CODATA_2018`, `CODATA_2018_UNCERTAINTIES`, `EXTENDED_CONSTANTS`
- `quantity(value, unit)`, `convertLength`, `convertEnergy`, `convertMass`, `convertCharge`, `convertFrequency`, `energyEvToWavelengthNm`

## 4. Physics Providers, Live HF (`v0.7.0`), LS Term CI (`v0.7.1`), & Post-HF Correlation (`v0.7.2`)
- `createDefaultProviderRegistry()` (`registry.ts`) -> `PhysicsProviderRegistry`
- **Live Post-HF Electron Correlation (`correlation/index.ts`, `physics/correlation/`)**:
  - `createPyscfCorrelationProvider(transport?)` / `pyscfCorrelationProvider` (`id: "pyscf-correlation-live"`, `version: "0.7.2"`)
  - `CORRELATION_METHOD_CATALOG`, `lookupBasisSpatialOrbitals(basis, Z)`, `nobleCoreFrozenCount(Z)`, `estimateCorrelationDimensions(...)`, `validateReferenceAndMethodCompatibility(...)`, `allowedMethodsForReference(...)`, `buildCorrelationComparisonKey(...)` (`catalog.ts`)
  - `CORRELATION_BENCHMARKS` (`benchmarks.ts`)
  - `createHttpCorrelationTransport(baseUrl?)`, `defaultHttpCorrelationTransport`, `probeCorrelationCapabilities(transport?, refresh?, signal?)` (`transport.ts`)
- **Live Fixed-Orbital LS-Coupled CI (`lsTermCi/index.ts`, `ls/`)**:
  - `createLSTermCiProvider(transport?)` / `lsTermCiProvider` (`id: "atoms-ls-term-ci"`, `version: "0.7.1"`)
  - `parseConfigurationString(text)`, `formatConfigurationSpec(...)`, `computeConfigurationParity(...)`, `enumerateEquivalentSubshellTerms(l, q)`, `enumerateLSTerms(subshells)`, `formatTermSymbol(spin2S, L, parity, ascii?)`, `clebschGordan(...)` (`terms.ts`)
  - `LS_CURATED_PRESETS`, `defaultLSConfigurationForSystem(Z, N)`, `assessLSCISupport({ Z, N, basis, configuration, capabilities? })` (`catalog.ts`)
  - `NIST_LS_BENCHMARKS`, `ATSP2K_PUBLISHED_REFERENCES`, `lookupNISTBenchmarksForSystem(Z, N)`, `lookupNISTTermCentroid(...)` (`benchmarks.ts`)
  - `HttpLSTransport`, `defaultHttpLSTransport`, `probeLSCapabilities(signal?, refresh?, baseUrl?)` (`transport.ts` — blob-Worker-safe origin resolution)
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
- `createExperimentDefinition`, `createDefaultExperimentRegistry` (supports `"multi-electron-hf"`, `"ls-term-ci"`, and `"electron-correlation"`), `validateExperimentDefinition`
- `ExperimentRunner`, `ExperimentScheduler`, `assertStructuredCloneSafe`, `IndexedDBExperimentStore` / `MemoryExperimentStore`, `ExperimentSerializer`
- `GET /api/hf/capabilities`, `POST /api/hf/calculate` (`science/hf_backend.py`)
- `GET /api/ls/capabilities` (`?refresh=1`), `POST /api/ls/calculate` (`science/ls_ci_backend.py`)
- `GET /api/correlation/capabilities` (`?refresh=1`), `POST /api/correlation/calculate` (`science/correlation_backend.py`; `422 RESOURCE_LIMIT_EXCEEDED` on pre-allocation cap violation, `429 CONCURRENCY_LIMIT_EXCEEDED` on queue saturation)
