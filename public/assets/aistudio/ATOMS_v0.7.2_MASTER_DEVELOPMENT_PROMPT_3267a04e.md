# ATOMS v0.7.2 — Electron Correlation
## Master Development Prompt for an Autonomous Senior Scientific-Software Engineering Agent

**Project:** ATOMS — Atomic Physics Laboratory  
**Target release:** `v0.7.2`  
**Release theme:** Post-Hartree–Fock Electron Correlation  
**Starting point:** The completed `v0.7.1 — Atomic Term Structure & Fixed-Orbital LS-Coupled Multiconfiguration CI` codebase  
**Primary scientific stack:** Python, PySCF, NumPy/SciPy; existing TypeScript/React application and Node.js API  
**Deployment architecture to preserve:** Render Web Service + Docker + Node.js server + Python/PySCF backend

---

# 0. EXECUTION DIRECTIVE

You are operating as the senior scientific-software architect, computational atomic physicist, numerical-methods engineer, Python/PySCF specialist, TypeScript/React engineer, and release-validation engineer responsible for delivering ATOMS v0.7.2.

Your task is to **extend the existing ATOMS repository in place**. Do not create a replacement application, a parallel prototype, or a new project. Do not merely provide a plan, a code review, or a list of suggestions. Inspect the actual repository, formulate an implementation plan internally, and then execute the work through completion.

Work autonomously in carefully controlled phases. Do not stop after writing the plan. Do not ask the user to approve routine implementation decisions. When an environment limitation prevents a check, complete every other possible check and report the limitation precisely. Never fabricate test results, benchmark values, successful deployment status, or repository operations.

**The release is complete only when the scientific methods, API, UI, persistence integration, documentation, tests, and production build are implemented and verified.**

## Absolute preservation rules

1. Preserve all functioning v0.7.1 capabilities and regressions. The v0.7.1 implementation is a foundation, not disposable scaffolding.
2. Preserve the existing application architecture: React + TypeScript frontend, Three.js visualizations, Node.js server, Python scientific backend, PySCF, and Render/Docker deployment.
3. Preserve every existing public API route, especially `/api/hf/*` and `/api/ls/*`, including origin validation and current request/response contracts.
4. Do not replace PySCF with Gemini, an LLM, a remote chemistry service, a mock engine, or a hand-written approximate substitute.
5. Do not remove, bypass, weaken, or silently skip existing tests. Do not weaken tolerances just to make a test pass.
6. Do not redesign unrelated UI, replace the existing visualization engine, change the hosting platform, or introduce a new database/service unless a demonstrated technical requirement makes it necessary.
7. Do not perform destructive Git operations, force-push, overwrite the user's work, or deploy to production without an already-authorized project workflow.
8. Do not commit secrets, API keys, personal data, machine-specific paths, or local cache files.

## Required first action

Inspect the real repository and its current state before editing anything. Do not assume that earlier reports perfectly describe the current checkout. Determine:

- actual branch, commit, working-tree status, and repository root (when Git metadata is available);
- actual package version and version displayed in the application;
- current application architecture and navigation/workspace registration;
- exact v0.7.1 source files and current test commands;
- exact PySCF version installed or pinned in `science/requirements.txt` and the production image;
- how `server.ts` invokes Python, validates local API origins, handles timeouts, and serializes errors;
- how the HF and LS-CI backends build atoms, basis sets, SCF references, molecular orbitals, and integrals;
- how providers, workers, experiment states, IndexedDB persistence, and browser tests are registered;
- current Dockerfile, `.dockerignore`, Render port binding, health checks, and build workflow.

Read the relevant implementation, not only documentation. Build a concise baseline report internally and record the baseline test status before making changes. Do not rewrite healthy code merely to make the structure look different.

---

# 1. RELEASE OBJECTIVE

Deliver a dependable **Electron Correlation** capability for atomic systems. Users must be able to start from a clearly defined Hartree–Fock reference and calculate, inspect, compare, and persist post-HF correlation results using real PySCF computations.

The v0.7.2 release focuses on:

1. Restricted MP2 / RMP2 for supported closed-shell references.
2. Unrestricted MP2 / UMP2 for supported open-shell references.
3. Restricted and unrestricted CISD where the installed PySCF version and reference type support them.
4. Full Configuration Interaction (FCI) for deliberately small orbital spaces and systems, with strict resource estimation and pre-allocation safeguards.
5. A coherent comparison of HF, MP2, CISD, and FCI energies using identical physical and numerical settings wherever a comparison is shown.
6. Honest diagnostics for spin, convergence, reference suitability, finite-basis limitations, and computational cost.

The target is not to claim that every correlated method is appropriate for every atom or term. The application must reject, disable, or explicitly qualify calculations outside the validated domain.

## Explicitly out of scope for v0.7.2

Do **not** silently expand this release into any of the following:

- CCSD, CCSD(T), EOM-CC, or other coupled-cluster methods;
- NEVPT2, CASPT2, MRPT, or other multireference perturbation theories;
- MCHF radial-orbital reoptimization;
- LS-adapted MP2 or LS-adapted CISD;
- a new MCDHF, Dirac–Fock, or relativistic CI implementation;
- Breit, QED, Lamb-shift, recoil, or finite-nuclear-size corrections;
- plasma, collision, or collisional-radiative models;
- Gemini or any other generative-AI feature;
- a mandatory cloud account, paid service, external database, or third-party compute service.

You may document these as future directions, but do not implement them in v0.7.2. In particular, **do not label ordinary determinant-based PySCF CISD or FCI as LS-coupled CSF calculations**.

---

# 2. SCIENTIFIC CONTRACT — NON-NEGOTIABLE

The implementation must follow the physics and mathematical meaning of each method. A polished UI does not compensate for an invalid wavefunction or an incorrect energy convention.

## 2.1 Hartree–Fock reference and correlation energy

For each calculation, preserve the identity

\[
E_{\mathrm{total}}^{\mathrm{method}} = E_{\mathrm{HF}} + E_{\mathrm{corr}}^{\mathrm{method}},
\]

with all energies expressed in the same convention and including the same applicable constant contributions. For an isolated atom, do not add a nonexistent nuclear–nuclear repulsion term. If any backend convention includes a constant energy shift, document and account for it consistently.

Record at least:

- atom / ion, atomic number, charge, electron count;
- requested multiplicity and corresponding spin convention;
- basis-set name and basis-function count;
- reference method (`RHF`, `UHF`, or a specifically verified alternative);
- SCF convergence status and final HF energy;
- number of spatial orbitals and alpha/beta electrons;
- frozen-orbital/core convention, if used;
- correlated method and its actual implementation class;
- correlation energy and correlated total energy;
- method convergence status, iteration count where available, runtime, and diagnostic warnings.

Never infer a converged result from a nonzero energy field alone. Never return a plausible-looking energy when a solver failed.

## 2.2 MP2 / RMP2 / UMP2

MP2 is a single-reference, second-order perturbative correction to a specified HF reference. It is not a universal correction for every atomic state.

Implement:

- RMP2 for supported restricted closed-shell references;
- UMP2 for supported unrestricted references;
- optional ROHF-based MP2 only if the installed PySCF version exposes a documented, tested implementation and the numerical validation is successful. Do not claim ROMP2 merely because a class name appears in an index.

Use the actual supported PySCF public API and inspect the installed version. PySCF documents `mp.MP2(mf)` as a constructor that can infer restricted, unrestricted, or general spin treatment from the mean-field object. Verify the behavior in the exact dependency version used by ATOMS rather than relying on an API from another release.

Scientific requirements:

- distinguish `E_corr(MP2)` from `E_total(MP2)`;
- expose reference type and spin treatment in the result;
- preserve the reference orbitals and basis used by the SCF calculation;
- handle zero-virtual-orbital and no-correlation edge cases without crashing;
- detect non-finite energies, failed convergence, and problematic small orbital-energy denominators;
- report denominator diagnostics where practical; do not silently clip denominators or alter the method to force convergence;
- do not force the MP2 correlation energy to be negative. It is commonly negative for well-behaved cases, but the implementation must report the computed value honestly;
- disclose that MP2 is not variational and must not be subjected to an FCI variational-bound assertion;
- for UMP2, report the UHF reference's spin diagnostic when available and clearly identify possible spin contamination;
- do not interpret an unstable, strongly spin-contaminated, or near-degenerate reference as a reliable high-accuracy atomic result.

An atom-spherically-averaged fractional-occupation HF ensemble is **not automatically a valid canonical single-determinant MP2 reference**. Do not pass fractional occupations into ordinary MP2 merely because the existing HF layer supports a spherical average. Disable this combination unless a mathematically correct, independently validated ensemble/reference formulation is implemented and documented. Such a formulation is outside the default v0.7.2 scope.

## 2.3 CISD

CISD is a determinant-based configuration-interaction method that includes single and double excitations relative to a specified reference determinant. In PySCF, restricted and unrestricted implementations are available; general spin-mixed support must be considered only when it is genuinely supported and validated in the installed dependency.

Scientific requirements:

- identify the reference determinant and reference SCF method;
- distinguish the CISD correlation energy from the total CISD energy;
- expose the number of correlated electrons, active orbitals, frozen orbitals, and excitation-space settings;
- use the PySCF implementation rather than writing a second unverified CISD engine;
- estimate determinant/excitation-space size before expensive allocations and enforce configurable resource limits;
- report convergence and solver diagnostics;
- explain in the UI and documentation that CISD is **not size-extensive**;
- do not describe CISD energy as an exact result;
- do not claim that an unrestricted CISD eigenvector is automatically a pure spin eigenstate;
- do not claim LS term resolution unless explicit, validated angular-momentum adaptation is actually performed.

A CISD calculation built on one HF determinant is not interchangeable with the multi-configuration LS-CI calculation already available in v0.7.1. Keep their scientific roles distinct.

## 2.4 FCI

FCI includes all allowed Slater determinants in a specified finite one-electron orbital space and selected electron/spin sector. It is exact only **within that finite Hamiltonian/orbital space**, not an exact solution of the physical atom in an infinite basis.

Implement FCI only for a conservatively bounded domain:

- use PySCF's appropriate direct FCI solver;
- select electron counts and spin sectors explicitly;
- calculate and display the dimension/resource estimate before invoking the solver;
- use matrix-free/direct iterative algorithms for production calculations; do not build a dense determinant Hamiltonian for ordinary user requests;
- enforce hard limits before determinant vectors or large integral tensors are allocated;
- make limits configurable internally but keep safe production defaults;
- support a deliberate `nroots` limit only if the solver path is validated;
- report spin diagnostics using PySCF's documented spin-square functionality;
- when a target spin is required, use a supported, verified spin-selection or spin-penalty strategy (for example PySCF's documented `fci.addons.fix_spin_`) and confirm the resulting \(\langle S^2\rangle\). Do not rely solely on the alpha/beta electron count to prove a unique total-spin eigenstate;
- if spin purity cannot be confirmed, mark the state as unresolved or contaminated rather than silently labeling it with the requested multiplicity.

FCI is variational for the same Hamiltonian, orbital basis, electron count, and symmetry sector. It may be used to validate lower-level energies only when those settings truly match. It must not be presented as a universal lower bound across different basis sets, frozen-core choices, spin sectors, or Hamiltonians.

Do not claim that determinant-space FCI automatically gives a pure atomic \(L^2\) eigenstate. A fixed \(M_S\) sector or a point-group irrep is not equivalent to full rotational \(SO(3)\) symmetry. An \(S^2\) diagnostic is not an \(L^2\) diagnostic.

## 2.5 Relationship to v0.7.1 LS-CI

The existing v0.7.1 solver performs fixed-orbital LS-coupled multiconfiguration CI using its explicit CSF machinery. Preserve it.

For v0.7.2:

- keep the Atomic Terms & CI workspace and `/api/ls/*` routes unchanged except for strictly necessary, backward-compatible shared utilities;
- expose the new correlation methods in a separate Electron Correlation workflow;
- do not feed LS-CI eigenvalues into ordinary single-reference MP2 as if they were HF reference energies;
- do not add an MP2 correction to an arbitrary LS-CI root without a well-defined and validated multireference perturbation theory;
- clearly distinguish determinant-based correlation results from LS-CSF results;
- where a comparison is displayed, state whether states have matching electron count, spin, orbital space, and symmetry treatment.

Multireference perturbation theory and term-resolved correlation are future work, not implied by v0.7.2.

## 2.6 Atomic degeneracy and reference suitability

Atomic open-shell p, d, and f configurations can be degenerate or near-degenerate. A single determinant can break spherical or rotational symmetry. UHF may also break spin symmetry.

Therefore:

- do not assume that a converged SCF determinant is a pure Russell–Saunders term;
- do not infer an atomic term symbol from a determinant solely from its occupancy;
- do not interpret an anisotropic density as a physical nondegenerate atom without qualification;
- display warnings when the selected reference has an unresolved orbital degeneracy, strong fractional occupation, large spin contamination, or known multireference character;
- provide conservative disable/warning behavior rather than false confidence;
- do not use `AtomSphAverageRHF` fractional-occupation orbitals as a standard MP2/CISD reference unless a separate valid implementation is supplied and independently tested.

For a first validated domain, prioritize closed-shell ground-state atoms and simple open-shell s-state systems. Expand to more challenging open-shell p/d/f systems only with explicit benchmarks and diagnostics.

---

# 3. SUPPORTED SCIENTIFIC DOMAIN AND METHOD GATING

Implement capability detection rather than a hard-coded claim that every method works for every element.

## 3.1 Initial benchmark and smoke-test systems

Use a small, deliberately selected set of isolated atoms/ions. At minimum investigate and, where the installed basis and solver permit, validate:

- He, neutral, \(1s^2\), singlet \(^1S\): closed-shell RMP2, CISD, and small-space FCI benchmark;
- Be, neutral, \(1s^2 2s^2\), singlet \(^1S\): closed-shell correlation test;
- Li, neutral, \(1s^2 2s\), doublet \(^2S\): simple open-shell UMP2/CISD/FCI path where validated;
- H or a one-electron ion: zero-electron-correlation edge case;
- a larger closed-shell atom such as Ne only for methods whose cost is safely bounded; do not force FCI for it.

Use a supported BSE basis such as STO-3G for edge/small-space tests and cc-pVDZ (or another justified small correlation-consistent basis) for meaningful virtual-space correlation tests. Do not present STO-3G with no virtual orbitals as a meaningful demonstration of nonzero MP2 correlation.

Do not hard-code unverified literature energies into tests. If numerical reference values are added, record their exact source, basis, frozen-core convention, spin sector, and energy convention. Prefer multiple independent numerical checks over a single copied number.

## 3.2 Reference and method support matrix

Create a data-driven capability table that answers, for the actual installed PySCF version:

- which reference types can be constructed for a requested atom/ion;
- which correlation methods accept each reference type;
- whether the reference has integer or fractional occupations;
- whether spin diagnostics are available;
- whether FCI spin selection is available;
- whether the requested FCI dimension fits the configured resource budget.

Return explicit unsupported reasons. Never silently fall back from RMP2 to UMP2, or from CISD to a different solver, without reporting that substitution and the resulting method name.

---

# 4. BACKEND DESIGN AND API CONTRACT

## 4.1 Python backend

Inspect `science/hf_backend.py` and `science/ls_ci_backend.py` before designing the new module. Reuse their validated atom construction, basis-set lookup, electron-count validation, SCF options, error normalization, and resource-limit conventions.

Create a focused backend such as:

- `science/correlation_backend.py`

The exact file layout may follow existing conventions, but do not duplicate the entire HF implementation. If shared SCF construction needs extraction, refactor minimally, preserve the existing public behavior, and run all HF/LS regressions immediately afterward.

The backend must:

1. validate the element/ion, charge, electron count, multiplicity, basis, reference method, and correlation method;
2. construct a valid integer-occupation reference compatible with the requested method;
3. run or reuse the exact intended HF reference;
4. check SCF convergence before post-HF execution;
5. build the correct PySCF MP2/CISD/FCI object through public supported APIs;
6. estimate computational resources and reject oversized FCI/CISD jobs before large allocations;
7. run with bounded memory and time;
8. normalize method energies, convergence, diagnostics, spin information, and metadata;
9. return structured, JSON-safe output;
10. return an explicit structured error if the calculation is unsupported, unconverged, exceeds limits, or fails.

Do not return raw PySCF objects, NumPy arrays, complex values, NaN, Infinity, tracebacks, or large CI vectors through the HTTP API. Keep large scientific arrays on the backend unless a specific display/export feature requires a bounded representation.

## 4.2 Node.js server integration

Add new routes alongside existing routes, following established patterns:

- `GET /api/correlation/capabilities`
- `POST /api/correlation/calculate`

You may add a separate bounded estimate/validation endpoint only if it materially improves the UX. Avoid endpoint proliferation.

Requirements:

- preserve `/api/hf/*` and `/api/ls/*` without breaking changes;
- apply the same `validateLocalApiOrigin` protections used by existing local scientific APIs;
- validate request schema, input sizes, enum values, integer ranges, and payload length at the server boundary;
- use the established Python execution mechanism and avoid shell-string interpolation;
- set bounded subprocess timeouts and bounded output handling;
- return stable error codes/messages and appropriate HTTP status codes;
- never expose filesystem paths, environment variables, subprocess command lines, secrets, or Python tracebacks to ordinary clients;
- ensure the route binds through the existing dynamic `PORT` and `0.0.0.0` production behavior;
- do not introduce a new cloud dependency.

The capabilities endpoint must report the installed PySCF version, available methods, method/reference compatibility, resource limits, and relevant restrictions. It must not claim a method is available until a small real backend smoke test has succeeded.

## 4.3 Suggested request/response concepts

Design the request schema to match existing project conventions. It will likely need:

- atom symbol or atomic number;
- ionic charge;
- multiplicity or explicit spin convention;
- basis-set identifier;
- reference method;
- correlation method (`RMP2`, `UMP2`, supported CISD variant, or `FCI`);
- optional frozen-core/orbital selection, if implemented and validated;
- optional bounded FCI root count;
- validated SCF and correlation convergence settings within safe ranges.

The response should distinguish at least:

- requested method versus actual PySCF solver class;
- reference energy and reference convergence;
- correlation energy;
- correlated total energy;
- electron and orbital counts;
- basis and reference provenance;
- spin diagnostics and their availability;
- FCI determinant-space estimate and configured limit;
- method convergence and warnings;
- elapsed time and reproducibility metadata.

Use stable TypeScript types generated/maintained alongside backend schemas. Do not let frontend types drift from Python response payloads.

---

# 5. RESOURCE MANAGEMENT AND NUMERICAL ROBUSTNESS

The currently reported runtime environment is memory-constrained. Treat FCI as a high-cost method and protect the production service.

## 5.1 Preflight estimates

Before starting FCI, calculate the relevant determinant-space size using the selected number of spatial orbitals and alpha/beta electron counts, for example:

\[
N_{\mathrm{det}} = \binom{n_{\mathrm{orb}}}{n_\alpha}
                 \binom{n_{\mathrm{orb}}}{n_\beta}.
\]

Use the correct dimension for the specific PySCF solver and symmetry restriction. Do not label this product as an LS-CSF dimension. Check integer overflow and extreme values before allocation.

For CISD, estimate the excitation-vector dimension using the selected reference and orbital/electron counts, or obtain a safe estimate from a documented public API before launching expensive work.

## 5.2 Hard safeguards

- Set conservative, configurable maximum FCI and CISD dimensions based on the actual Render/runtime memory and benchmark measurements.
- Enforce limits before constructing large CI vectors or tensors.
- Use direct iterative PySCF solvers; no dense production Hamiltonian construction.
- Bound `nroots`, memory, iteration count, and wall-clock time.
- Prevent two simultaneous resource-intensive calculations from exhausting the process. Follow existing queue/concurrency patterns or add a minimal bounded semaphore if necessary.
- On timeout or cancellation, terminate the child process safely and release resources.
- Return a clear “calculation exceeds configured resource limit” response with the estimate and limit; do not crash the Node server.

## 5.3 Numerical integrity

- reject NaN/Infinity at every API boundary;
- preserve Hartree precision internally and round only in display formatting;
- use tolerances justified by the algorithm and reference;
- detect unconverged iterative solvers;
- report small denominators and near-degeneracy warnings instead of silently regularizing them;
- do not compare energies computed with different basis sets, frozen-core spaces, active spaces, electron counts, or spin sectors as if they were direct method differences;
- document whether density fitting is active and do not mix fitted and unfitted results without labeling it;
- retain convergence diagnostics and relevant PySCF warnings in a sanitized form.

---

# 6. FRONTEND — ELECTRON CORRELATION WORKSPACE

Add a dedicated **Electron Correlation** workspace as the next laboratory workspace, following existing workspace registration and design conventions. Do not replace the current Hartree–Fock or Atomic Terms & CI workspaces.

Inspect `HartreeFockWorkspace`, `AtomicTermsWorkspace`, current navigation, provider registration, state models, experiment workers, and IndexedDB ledger before making changes.

## 6.1 Workspace structure

The workspace should provide a clear, scientifically honest workflow:

1. **System setup:** atom/ion, charge, multiplicity, and basis set.
2. **Reference setup:** RHF/UHF and any other reference specifically verified for the requested methods.
3. **Method selection:** RMP2, UMP2, supported CISD variant, and FCI where its resource estimate is accepted.
4. **Preflight:** show compatibility, reference suitability, orbital/electron counts, FCI/CISD dimension estimate, and warnings before execution.
5. **Execution:** clear loading, progress/elapsed time when available, cancellation if supported by existing architecture, and recoverable error presentation.
6. **Results:** method energy table, correlation energy, total energy, diagnostics, convergence, and provenance.
7. **Comparison:** compare only calculations with matched atom/ion, charge, multiplicity/spin sector, basis, frozen-core and orbital-space settings. Clearly mark unmatched results as non-comparable.
8. **Experiment history:** persist results through the existing experiment ledger/IndexedDB path.

## 6.2 Required result presentation

At minimum show:

- `E_HF`;
- `E_corr` for the selected post-HF method;
- `E_total`;
- method label and reference type;
- convergence status;
- basis and orbital-space details;
- spin diagnostic (for example \(\langle S^2\rangle\)) when actually available;
- warnings about single-reference suitability, spin contamination, near-degeneracy, and method limitations;
- resource estimate for FCI/CISD when applicable.

Use Hartree as the canonical unit. If eV or other units are shown, use a single verified conversion constant and identify the displayed unit. Preserve full precision in stored results.

Add clear educational explanations in context:

- MP2 is perturbative and non-variational;
- CISD includes single/double excitations and is not size-extensive;
- FCI is complete only in the chosen finite orbital space;
- unrestricted methods may exhibit spin contamination;
- determinant-based correlation results are not automatically LS-term-resolved.

Avoid decorative visualizations that imply unsupported wavefunction properties. If showing a chart, plot computed energies and label the basis/reference consistently. Do not invent smooth curves or interpolated scientific data.

## 6.3 State, provider, worker, and persistence integration

Follow the project's established patterns. Add only the registrations genuinely needed, potentially including:

- `ElectronCorrelationState` or an equivalent typed state;
- an `electron-correlation` provider;
- a worker for expensive/replayable client-side orchestration if consistent with existing workers;
- IndexedDB experiment ledger support;
- serialization/deserialization and schema-version migration if required.

Do not duplicate an existing experiment persistence mechanism. Test that saved results replay correctly after reload and that old v0.5–v0.7.1 experiment records still load.

---

# 7. VALIDATION AND TEST STRATEGY

Scientific validation is a release requirement, not an optional final polish.

## 7.1 Baseline regression protection

Before changes, run or record all existing checks that are available. At minimum preserve the current reported baseline categories:

- TypeScript typecheck;
- lint/applet lint;
- Vitest suite;
- Native C++17 tests in Debug and Release;
- production build;
- applet compile;
- Playwright browser tests;
- direct production server smoke tests;
- HF and LS-CI live backend tests.

After implementation, rerun all available tests. Existing failures must be classified as pre-existing or introduced using the recorded baseline; never hide them.

## 7.2 New Python/backend tests

Add automated tests for at least the following:

### MP2
- He singlet, cc-pVDZ (or another verified basis with virtual orbitals): finite RMP2 correlation and correct energy identity;
- one-electron H: zero correlation within numerical tolerance;
- no-virtual-orbital/minimal-space edge case: safe zero/unsupported behavior;
- Li doublet: real UMP2 execution and spin/reference diagnostics where supported;
- compare backend wrapper energies against direct calls to the exact installed PySCF public API;
- invalid atom/charge/multiplicity/basis/reference combinations are rejected;
- SCF non-convergence is not reported as a successful MP2 calculation;
- non-finite values and denominator warnings are handled safely.

### CISD
- He small basis: RCISD executes and reports consistent `E_total = E_HF + E_corr`;
- Li small basis: UCISD executes if supported by the installed PySCF/reference path;
- for a matching Hamiltonian, basis, electron count, spin sector, and orbital space, verify the expected variational ordering `E_FCI <= E_CISD <= E_HF` within numerical tolerance where the chosen reference/subspace assumptions make that comparison valid;
- document/test that CISD is not size-extensive rather than asserting size consistency;
- validate resource rejection before large allocation.

### FCI
- He: FCI executes in a tiny basis and agrees with an independently configured direct PySCF FCI calculation;
- Li: open-shell FCI executes with explicit electron/spin sector and verified \(\langle S^2\rangle\) where the solver supports it;
- compute an independent tiny-space check (for example an explicitly constructed small Hamiltonian or a second compatible solver path) rather than relying exclusively on the same wrapper call twice;
- verify root count, spin selection, convergence, finite values, and energy identity;
- verify oversized spaces are rejected before solver allocation;
- verify timeout/failure is returned as a structured error and does not crash the server.

### Cross-method consistency

For identical basis/orbital spaces and the same state sector where valid:

- HF energy must match the reference HF result;
- MP2, CISD, and FCI correlation-energy conventions must be consistent;
- FCI should be no higher than the corresponding variational HF/CISD subspaces within numerical tolerance;
- do not impose variational ordering on MP2;
- do not compare results with unmatched spin or orbital spaces.

Use independent small-system checks and analytic/structural invariants where practical. A successful call to PySCF is not by itself proof of scientific correctness.

## 7.3 Frontend and browser tests

Add tests for:

- workspace navigation and correct version label;
- capability-driven method gating;
- request validation and unsupported reference/method combinations;
- FCI preflight showing dimension and limit;
- resource-limit rejection before request submission where possible and backend enforcement regardless;
- correct energy labels and units;
- warning display for spin contamination, near-degeneracy, unsupported LS interpretation, and non-variational MP2;
- IndexedDB save/replay and reload persistence;
- errors, timeouts, and unavailable backend behavior;
- existing HF and Atomic Terms & CI workflows remain intact.

## 7.4 Production smoke and deployment checks

Run the application with `NODE_ENV=production` and a non-default `PORT`. Verify:

- `/api/hf/capabilities` still returns the expected response;
- `/api/ls/capabilities` still returns the expected response;
- `/api/correlation/capabilities` reports real available methods;
- a small real `/api/correlation/calculate` request succeeds;
- invalid and oversized requests return safe errors;
- server binds to `0.0.0.0` and honors `PORT`;
- no browser console errors, unhandled promise rejections, worker failures, or regression in existing workspaces.

Build the Docker image if Docker is available. If Docker or Git CLI is absent in the environment, do not claim the operation passed. Perform all available static/build checks, inspect the Dockerfile and dependency installation path, and report the exact blocker and the remaining verification step.

---

# 8. DOCUMENTATION AND VERSIONING

Update the actual package/application version from `0.7.1` to `0.7.2` using the repository's existing versioning conventions. Keep every displayed version and release document consistent.

Create focused documentation, following existing documentation style. Suggested files:

- `ELECTRON_CORRELATION_METHODS.md` — methods, equations, assumptions, supported references, limits, and method boundaries;
- `ELECTRON_CORRELATION_VALIDATION.md` — benchmarks, numerical tolerances, tests, reference values, and reproducibility details;
- `ELECTRON_CORRELATION_USER_GUIDE.md` — workflow, method selection, warnings, units, and result interpretation.

Also update the relevant existing scope document, scientific guide, validation document, changelog, and release notes. Do not duplicate entire documents or leave contradictory v0.7.1 claims in the current release scope.

Documentation must explain:

- RMP2 vs UMP2 and the reference determinant;
- MP2's perturbative and non-variational nature;
- CISD's singles/doubles space and lack of size extensivity;
- FCI's finite-orbital-space meaning and resource scaling;
- spin contamination and open-shell caveats;
- why spherical fractional-occupation HF is not automatically a standard MP2 reference;
- why these methods do not automatically yield LS-resolved term energies;
- the exact PySCF version used for validation;
- all accepted limitations and unsupported cases.

Include authoritative technical references, with exact links and an access/version note. Start from the official PySCF documentation:

- MP2: https://pyscf.org/user/mp.html
- CISD and FCI: https://pyscf.org/user/ci.html
- PySCF `pyscf.fci` API: https://pyscf.org/pyscf_api_docs/pyscf.fci.html
- PySCF `pyscf.ci` API: https://pyscf.org/pyscf_api_docs/pyscf.ci.html
- PySCF use/version workflow: https://pyscf.org/user/using.html

Do not cite documentation as evidence for a calculation that was not run. Record actual benchmark commands, software versions, basis sets, and output values from the runtime.

---

# 9. SECURITY, RELIABILITY, AND PRODUCTION INTEGRATION

- Keep the current local-origin validation and request hardening.
- Do not permit arbitrary Python code, shell commands, filesystem paths, or serialized Python objects from the browser.
- Validate every user-controlled scientific parameter on both Node and Python boundaries.
- Use fixed method enumerations and allowlisted basis-set identifiers consistent with existing BSE handling.
- Avoid logging full untrusted request payloads if they can become large.
- Normalize errors without leaking tracebacks or local environment details.
- Bound subprocess output, memory, wall-clock time, and concurrent heavy jobs.
- Ensure a failed correlation calculation does not corrupt the HF state, LS-CI state, experiment ledger, or server process.
- Preserve the Python virtual environment and Docker multi-stage deployment architecture.
- Do not change the Render hosting architecture or require Vercel/serverless migration.
- Keep dependencies pinned/reproducible according to the existing lock/requirements strategy. Do not invent a new lockfile strategy without examining the repository's current npm/bun setup.

---

# 10. AUTONOMOUS IMPLEMENTATION PHASES

Execute these phases in order. You may make small engineering adjustments when the actual repository requires them, but preserve the release objective and scientific contract.

## Phase A — Repository and v0.7.1 baseline audit

1. Inspect repository state, architecture, scripts, source, and dependency versions.
2. Run baseline checks that are practical in the environment.
3. Review the existing HF and LS-CI Python backends and their TypeScript contracts.
4. Identify exactly how the code represents RHF/UHF/ROHF and fractional spherical-average occupation.
5. Run minimal isolated PySCF probes for RMP2, UMP2, CISD variants, and FCI using the exact installed version.
6. Record which combinations are genuinely supported; do not assume API availability from an online index.
7. Produce a short internal implementation plan and continue immediately.

## Phase B — Scientific implementation and validation core

1. Implement the Python correlation backend using shared, validated SCF construction.
2. Implement RMP2 and UMP2 first, including energy bookkeeping and diagnostics.
3. Implement supported CISD variants and resource preflight.
4. Implement bounded FCI with explicit spin-sector handling and diagnostics.
5. Add method/reference capability detection.
6. Add Python tests and independent small-system numerical checks.
7. Do not begin large UI work until small real calculations are validated.

## Phase C — API integration

1. Add `/api/correlation/capabilities` and `/api/correlation/calculate`.
2. Preserve origin validation, existing subprocess patterns, timeouts, and stable error handling.
3. Validate request/response schemas across Node and Python.
4. Run direct API smoke tests with real PySCF calculations and invalid/oversized inputs.
5. Rerun HF and LS route regressions immediately.

## Phase D — Frontend and experiment integration

1. Add the Electron Correlation workspace.
2. Add method/reference gating driven by backend capabilities.
3. Add preflight estimates and warning states.
4. Display correctly labeled energies, spin diagnostics, method provenance, and limitations.
5. Integrate existing provider/worker/IndexedDB architecture without duplicating it.
6. Add browser tests and experiment save/replay coverage.

## Phase E — Documentation and release identity

1. Update package/application version to `0.7.2`.
2. Add the method, user, and validation documentation.
3. Update scope, guide, validation, changelog, and release notes.
4. Audit every UI and document claim against actual implemented behavior.

## Phase F — Full verification and release readiness

1. Run the complete available test suite.
2. Run the production build and applet compilation.
3. Run Playwright/browser tests.
4. Run production server smoke tests with non-default `PORT`.
5. Build Docker if possible; otherwise report the exact blocker and do not claim success.
6. Inspect the final diff for accidental deletions, unrelated changes, secrets, and misleading claims.
7. Confirm v0.7.1 APIs and features remain operational.
8. Produce the final release report described below.

Do not stop at the first failed test. Diagnose and repair regressions introduced by your changes. If a failure is demonstrably pre-existing or environment-blocked, preserve the evidence and report it without hiding it.

---

# 11. ACCEPTANCE CRITERIA — ALL REQUIRED

The v0.7.2 release may be declared complete only if all applicable criteria below are satisfied:

### Scientific

- [ ] RMP2 works for at least one validated closed-shell atomic reference with a nontrivial virtual space.
- [ ] UMP2 works for at least one validated simple open-shell atomic reference, with honest spin diagnostics.
- [ ] Unsupported fractional-occupation spherical-average references are safely gated.
- [ ] CISD works for the validated supported closed-shell case and at least one supported open-shell case, or the unsupported method/reference combination is explicitly documented and gated.
- [ ] FCI works for at least one small closed-shell atom and one small open-shell atom/ion where the spin sector is validated.
- [ ] Energy identities, convergence states, units, and method labels are correct.
- [ ] FCI resource estimates and hard limits are enforced before expensive allocation.
- [ ] No method is falsely described as LS-CSF or exact beyond its finite orbital space.

### Backend and API

- [ ] New capabilities and calculate endpoints work with real PySCF.
- [ ] Input validation, origin validation, timeouts, error normalization, and resource limits work.
- [ ] Existing `/api/hf/*` and `/api/ls/*` routes remain backward-compatible.
- [ ] No API returns NaN, Infinity, Python objects, unbounded arrays, or internal tracebacks.

### Frontend and persistence

- [ ] Electron Correlation workspace is reachable and uses actual backend capabilities.
- [ ] Method selection, preflight, results, warnings, units, and diagnostics are clear.
- [ ] Experiment save/replay works.
- [ ] Existing workspaces and old experiment records remain usable.

### Quality and release

- [ ] Typecheck and lint pass.
- [ ] Existing and new Vitest tests pass.
- [ ] Native C++ tests pass in Debug and Release if available.
- [ ] Production build and applet compile pass.
- [ ] Playwright/browser suite passes.
- [ ] Production HTTP smoke tests pass.
- [ ] Docker image build passes, or its exact environment blocker is reported without false success.
- [ ] Documentation, package version, application version, and changelog agree on `0.7.2`.
- [ ] Final diff contains no unrelated destructive changes or secrets.

Do not mark a checkbox complete without corresponding evidence.

---

# 12. FINAL REPORT FORMAT

When implementation is complete, provide a concise but evidence-based report with these sections:

1. **Release status:** complete, partially complete, or blocked.
2. **Implemented capabilities:** exact methods, reference types, and limits actually supported.
3. **Scientific architecture:** which PySCF APIs/solvers are used and how spin/reference suitability is handled.
4. **Files changed:** grouped by backend, API, frontend, tests, and documentation.
5. **Validation results:** exact commands, pass/fail counts, runtime versions, representative benchmark systems, basis sets, and numerical results.
6. **Deployment status:** production build, server smoke checks, Docker result, Render/Git status; explicitly distinguish local tests from an actual production deployment.
7. **Known limitations:** unsupported atoms/references/method combinations and all remaining blockers.
8. **Regression confirmation:** evidence that HF, LS-CI, existing visualizations, workers, persistence, and prior tests remain functional.
9. **Next logical release:** a brief recommendation for v0.8.0 or any justified remaining v0.7.x work. Do not implement that next release as part of this task.

Never report “verified,” “production-ready,” “Docker passed,” or “deployed” unless the corresponding operation actually ran and succeeded.

---

# 13. FINAL OPERATING PRINCIPLE

ATOMS is a scientific instrument implemented in software. The objective is not to maximize the number of menu items or to produce impressive-looking energy values. The objective is to produce physically meaningful results with traceable assumptions, validated numerics, controlled computational cost, reproducible execution, and honest limitations.

**Preserve what works. Inspect before changing. Implement real methods. Validate independently. Document the boundaries. Finish the release.**
