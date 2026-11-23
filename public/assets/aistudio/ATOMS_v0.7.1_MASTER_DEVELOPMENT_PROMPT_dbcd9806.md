# ATOMS v0.7.1 — Atomic Term Structure & LS-Coupled Multiconfiguration CI

## Master Development, Solver-Integration, Scientific Validation, and Release Assignment

**Target release:** `ATOMS v0.7.1`  
**Baseline:** the currently deployed and validated `ATOMS v0.7.0 — Multi-Electron Atomic Structure & Hartree–Fock`  
**Primary scientific objective:** move from single-determinant Hartree–Fock descriptions to explicitly identified nonrelativistic atomic terms and validated LS-coupled multiconfiguration wavefunctions for a carefully defined set of atoms and ions.

---

# 0. Executive mission

You are acting as a principal computational atomic physicist, atomic-structure theorist, scientific-software architect, numerical-methods specialist, and senior application engineer.

Your task is to develop **ATOMS v0.7.1 — Atomic Term Structure & LS-Coupled Multiconfiguration CI** by extending the existing ATOMS v0.7.0 project.

This is a focused scientific capability release. It is not a rewrite, a redesign of the whole application, or a license to start unrelated roadmap work.

The central objective is to make ATOMS capable of representing and, for a defined validated domain, computing **atomic states with good total orbital angular momentum L, total spin S, and parity**, rather than treating every open-shell Hartree–Fock determinant as though it were already a spectroscopic term eigenstate.

The release should establish a reliable path from:

1. an atomic electronic configuration;
2. a physically valid set of antisymmetrized configuration-state functions (CSFs);
3. an LS- and parity-resolved Hamiltonian block;
4. a multiconfiguration eigenvalue problem;
5. term-resolved energies, wavefunctions, mixing coefficients, and diagnostics;
6. inspectable results in the existing ATOMS laboratory.

**Search before coding. Reuse before reimplementing. Validate before labeling a state.** The scientific correctness of term identification and LS coupling takes priority over the number of elements or configurations exposed in the UI.

---

# 1. Current project baseline and preservation rules

The project has reached v0.7.0 and is deployed at:

- Public application: <https://atoms-atomic-physics-lab.onrender.com/>
- GitHub repository currently used in the deployment workflow: `mtabedi1390-design/atoms_V0.5`
- The repository name is historical and must not be used to infer the scientific version. Inspect the actual content and current commit.

The previous v0.7.0 implementation includes, according to its engineering report:

- React, TypeScript, Vite, Three.js, and an existing laboratory/workspace architecture;
- Node.js + Express production server;
- Python scientific backend;
- PySCF 2.15.1, bundled libcint, Basis Set Exchange 0.12, NumPy, SciPy, and h5py;
- genuine RHF, UHF, ROHF, and PySCF `AtomSphAverageRHF` calculation paths with explicitly differentiated semantics;
- atomic configurations, basis-set coverage checks, SCF diagnostics, orbitals, density, radial profiles, and optional volumetric fields;
- the previous analytical Schrödinger and Dirac hydrogenic engines;
- E1 transitions and baseline spectroscopy;
- experiment execution, persistence, and result visualization;
- an independently compiled and exercised CompAS SPHF reference program;
- a Render-compatible root `Dockerfile` and `.dockerignore`.

These are baseline claims to verify against the current workspace, not permission to assume every file or behavior is intact.

## Non-negotiable preservation requirements

1. Inspect the exact current workspace and Git state before editing.
2. Preserve the complete v0.7.0 implementation and its scientific behavior.
3. Keep the existing RHF, UHF, ROHF, and spherical-average HF paths available.
4. Keep existing Schrödinger, Dirac, E1, spectroscopy, experiment, visualization, and data features operational.
5. Do not overwrite, delete, or silently change v0.7.0 calculations or stored results.
6. Maintain backward compatibility for v0.7.0 experiment records and APIs wherever possible.
7. Do not remove unsupported-state warnings merely to make the interface look more complete.
8. Do not introduce fabricated term labels, assumed angular momenta, synthetic orbitals, or illustrative values presented as calculations.
9. Do not begin the v0.7.2 MP2/UMP2/CCSD roadmap in this release.
10. Do not begin relativistic multi-electron Dirac–Fock, MCDHF, RCI, Breit, QED, Stark, Zeeman, or plasma work in this release.
11. Preserve the current Render + Docker deployment architecture. Do not replace it with Vercel/serverless architecture or introduce a hidden remote service.
12. Continue the existing project delivery workflow. Do not add a new ZIP-generation requirement.
13. Do not force-push, rewrite history, or replace the current deployed v0.7.0 baseline.

If Git is available, use an isolated development branch such as `development/v0.7.1`, based on the verified v0.7.0 commit. If the workspace has no `.git` metadata, preserve the existing workspace state and clearly record that Git-level isolation could not be performed. Never claim a commit, branch, tag, or push that did not occur.

---

# 2. The scientific problem this version must solve

## 2.1 Why v0.7.0 is not enough for atomic term structure

A single Slater determinant from RHF, UHF, or ROHF is not generally an eigenfunction of the total orbital angular momentum operator \(\hat L^2\). A determinant may have a well-defined spin in certain cases while still representing an oriented or mixed orbital-angular-momentum state.

Likewise, a spin-unpolarized spherical ensemble is not the same mathematical object as a pure LS-coupled atomic term. Spherical density by itself does not prove that a wavefunction is an eigenstate of \(L^2\), and an isotropic one-particle density does not uniquely identify a term.

For v0.7.1, ATOMS must explicitly distinguish:

- an electronic configuration;
- a single-determinant HF state;
- a spherical fractional-occupation ensemble;
- an antisymmetrized CSF;
- an LS term \(^{2S+1}L^{\pi}\);
- a CI eigenstate within a specified \(LS\pi\) symmetry block;
- a relativistic \(J\)-resolved level (not implemented in this release).

Never use these terms interchangeably.

## 2.2 Nonrelativistic atomic Hamiltonian

For an N-electron atom in the fixed, point, infinite-mass nucleus approximation, use the declared Hamiltonian consistently:

\[
\hat H = \sum_{i=1}^{N}\left[-\frac{1}{2}\nabla_i^2-\frac{Z}{r_i}\right]
+\sum_{i<j}\frac{1}{r_{ij}}
\]

in atomic units, with any added terms explicitly declared and versioned.

For this spin-independent nonrelativistic Coulomb Hamiltonian:

\[
[\hat H,\hat L^2]=[\hat H,\hat L_z]=[\hat H,\hat S^2]=[\hat H,\hat S_z]=0
\]

and parity is conserved. The v0.7.1 term-resolved solver must exploit these symmetries rather than infer them from visual density patterns.

The model does **not** include spin–orbit coupling, Breit interaction, QED, finite nuclear size, nuclear recoil, or hyperfine interactions unless an independently verified feature already exists and is deliberately included under a separately identified model. Do not imply that an LS term calculation has produced fine-structure splitting.

## 2.3 Required state labels

A term label must contain, at minimum:

- spin multiplicity \(2S+1\);
- total orbital angular momentum label \(L\) (S, P, D, F, G, ...);
- parity (even or odd, displayed with the conventional superscript circle for odd parity);
- parent/configuration ancestry where needed to distinguish repeated terms.

For example: \(^{3}P\), \(^{1}D\), \(^{1}S\), \(^{4}S^{\circ}\), and \(^{2}P^{\circ}\).

A complete level label may additionally include a term-parentage or seniority identifier when multiple CSFs produce the same \(LS\pi\) symmetry. Do not invent a unique term identity where the quantum numbers alone do not distinguish states.

The possible values of \(J\) from LS coupling may be displayed as **allowed coupling values** \(|L-S|,\ldots,L+S\), but v0.7.1 must not claim to calculate their energy splittings. Actual \(J\)-resolved energies require spin-dependent interactions and belong to later relativistic/fine-structure work.

---

# 3. PHASE 0 — Workspace audit and immutable baseline

Before coding, inspect:

- Git branch, commit, tags, and working-tree status;
- `package.json`, `bun.lock`, npm lockfiles if present, Dockerfile, `.dockerignore`, and Render start/build configuration;
- `server.ts` and Python subprocess lifecycle;
- `science/hf_backend.py` and Python requirements;
- `src/physics/hf/` and Hartree–Fock provider;
- existing domain quantum-state and observable types;
- any existing Wigner 3j/6j, Clebsch–Gordan, Racah, Slater-integral, angular-momentum, and symmetry code;
- SPHF integration, test sources, and pinned upstream reference data;
- experiment schema, worker/transport, persistence, and UI workspaces;
- current documentation and validation manifests.

Run the existing v0.7.0 baseline tests before editing. Record exact commands, exit codes, skipped tests, and environment versions.

Create or verify an immutable recovery point for v0.7.0. If Git is available, create the v0.7.1 branch from the exact current deployed baseline. If Git is not available, do not fabricate Git metadata; preserve the current state through the platform's existing workflow.

Do not proceed with a large implementation until the baseline is identifiable and its key tests are reproducible.

---

# 4. PHASE 1 — Solver ecosystem discovery: choose the correct atomic LS engine

This phase is mandatory. Do not write a new CSF generator, atomic angular-momentum engine, Slater-integral engine, or MCHF/CI solver before auditing existing code.

## 4.1 Primary specialist candidate: ATSP / ATSP2K

Investigate the official Computational Atomic Structure (CompAS) ecosystem and identify the most appropriate stable, legally reusable, technically buildable implementation of atomic MCHF and LS-coupled CI.

Start with these official sources:

- CompAS code inventory: <https://compas.github.io/codes.html>
- Development ATSP repository: <https://github.com/compas/atsp>
- ATSP book-code repository: <https://github.com/compas/atsp-book>
- CompAS SPHF reference already used in v0.7.0: <https://github.com/compas/sphf>
- GRASP repository (future relativistic work only): <https://github.com/compas/grasp>

Important: the CompAS `compas/atsp` repository explicitly describes itself as an **unstable development version** and points to ATSP2K as the latest stable published release. The `atsp-book` version is a teaching/book version and must not automatically be treated as the production-quality stable package.

You must:

1. Find the latest stable ATSP2K source/distribution through the official project or original publication source.
2. Verify exact version, source provenance, license, redistribution permissions, build requirements, and supported compiler/toolchain.
3. Determine whether it implements the required LS-coupled MCHF and CI functionality.
4. Inspect input/output conventions, CSF definitions, radial orbital formats, angular coefficients, and term labels.
5. Build and run it in the current supported Linux environment if feasible.
6. Run official example/test inputs and compare outputs with documented references.
7. Assess whether its executable can be safely managed through the existing Python/Express backend.
8. If the stable release cannot be located, built, licensed for integration, or tested, report the exact blocker. Do not silently substitute the unstable development repository.

`compas/atsp` may be inspected as a development reference, but it must not be declared the production engine without stability and validation evidence. `atsp-book` may be used as a transparent pedagogical reference or a limited validated engine only if its scientific coverage is demonstrated.

## 4.2 PySCF: complementary FCI/CASCI capability, not automatic LS term solver

Inspect the installed PySCF version and its actual APIs. Relevant documentation:

- FCI API: <https://pyscf.org/pyscf_api_docs/pyscf.fci.html>
- CI user guide: <https://pyscf.org/user/ci.html>
- Quickstart FCI guide: <https://pyscf.org/quickstart.html>

PySCF can provide spin-aware FCI/CASCI calculations, multiple roots, reduced density matrices, and spin diagnostics. It can be useful for active-space calculations and independent energy comparisons.

However:

- spin adaptation is not the same as full LS term adaptation;
- point-group irreps such as D2h are not equivalent to full atomic SO(3) angular momentum;
- an \(M_L\) value or cylindrical symmetry label is not by itself proof of an \(L^2\) eigenstate;
- `fix_spin_` or an \(S^2\) penalty does not automatically resolve total orbital L;
- a determinant/CI vector must be checked for both \(L^2\) and \(S^2\) purity before receiving an LS label.

PySCF FCI/CASCI may be integrated as a supplementary determinant-space CI backend, benchmark, or cross-check. It must not be advertised as an LS-coupled atomic CSF solver unless an explicit, validated LS projection or CSF transformation is actually implemented.

## 4.3 Reuse existing ATOMS mathematical components

Search the real source tree for existing implementations of:

- Wigner 3j and 6j symbols;
- Clebsch–Gordan coefficients;
- Racah coefficients;
- angular momentum coupling;
- parity and equivalent-electron restrictions;
- spin-adapted determinants;
- radial orbitals and one-/two-electron integrals;
- Slater radial integrals \(F^k\), \(G^k\), or equivalent integrals;
- basis transformations and matrix diagonalization.

Inspect formulas, phase conventions, normalization, domains, and tests before reuse. Do not duplicate a valid implementation. If existing routines are incomplete, extend them with independent identities and regression tests.

## 4.4 Required solver decision matrix

Produce `docs/ATOMIC_LS_SOLVER_AUDIT.md` with a matrix comparing at least:

- stable ATSP2K source;
- CompAS development ATSP;
- ATSP-book;
- existing SPHF;
- PySCF FCI/CASCI;
- existing ATOMS angular-momentum utilities;
- any additional genuinely relevant open-source atomic-structure code discovered.

For each candidate document:

- exact version/commit;
- source URL and citation;
- license and distribution obligations;
- method (MCHF, LS-CI, determinant FCI, B-spline HF, etc.);
- whether it generates true LS-adapted CSFs;
- whether it optimizes radial orbitals;
- whether it computes multiple roots and term mixing;
- supported configurations/elements;
- compiler/runtime requirements;
- benchmark evidence;
- integration strategy;
- reasons for selection or rejection.

Choose the strongest scientifically appropriate reusable backend. Do not choose based on repository popularity, language preference, or apparent ease of UI integration.

---

# 5. PHASE 2 — Atomic configuration, term enumeration, and LS quantum numbers

Extend the existing atomic-domain models without introducing a parallel incompatible system.

## 5.1 Configuration model

Represent a configuration as explicit occupied subshells:

\[
(n,l)^{q}
\]

with validated electron occupancy, shell capacities, parity, and electron count.

The parity of a configuration must be computed from the sum of occupied electron orbital angular momenta:

\[
\pi=(-1)^{\sum_i q_i l_i}.
\]

Support only subshells and configurations actually supported by the chosen solver/backend. Preserve explicit user occupations; never silently replace them with Aufbau occupations.

## 5.2 Term enumeration

Implement or integrate a mathematically sound procedure for finding allowed \(LS\) terms for supported configurations.

It must correctly handle:

- equivalent electrons in partially filled subshells;
- Pauli antisymmetry;
- repeated terms and parentage;
- electron-hole equivalence where the chosen method supports it;
- coupling of non-equivalent open subshells;
- configuration parity;
- spin multiplicity constraints;
- term ordering and term identity.

A simple vector addition of individual \(l_i\) and \(s_i\) values is not sufficient for equivalent electrons because antisymmetry removes many nominal couplings.

Do not use hardcoded term tables as a replacement for a general algorithm. Curated tables may be used as validation fixtures, never as an undisclosed substitute for calculation.

## 5.3 Required quantum diagnostics

For every computed CSF or CI state, return where available:

- \(\langle L^2\rangle\);
- \(\langle S^2\rangle\);
- \(\langle L_z\rangle\) and \(\langle S_z\rangle\), if meaningful for the selected representation;
- parity;
- variance of \(L^2\) and \(S^2\);
- term/parentage information;
- state purity and convergence diagnostics.

For a pure LS state:

\[
\langle L^2\rangle=L(L+1),\qquad
\langle S^2\rangle=S(S+1)
\]

in atomic units.

Report the residual/variance as well as the expectation value. A result close to the expected scalar by accident is not enough to certify a pure eigenstate if the variance is nonzero or the operator was not actually evaluated.

If any diagnostic is unavailable, return an explicit `available: false` and a reason. Never return a fabricated zero.

---

# 6. PHASE 3 — CSF generation and spin-angular algebra

A configuration-state function must be a correctly normalized antisymmetric many-electron state with definite target quantum numbers, not merely a label attached to one determinant.

Implement or reuse a validated CSF-generation strategy based on the selected atomic solver. Establish a canonical representation and a stable interchange format for:

- subshell occupations;
- parent terms and seniority/parentage labels;
- intermediate coupling labels;
- total L and S;
- parity;
- determinant expansion coefficients;
- phase conventions;
- normalization and orthogonality.

## 6.1 Equivalent-electron treatment

This is one of the highest-risk mathematical components. Verify equivalent-electron CSFs against established angular-momentum tables or trusted atomic-structure references for the supported subshells.

Do not use distinguishable-electron coupling rules for equivalent electrons. Pauli restrictions, coefficients of fractional parentage, and antisymmetrization must be handled correctly.

## 6.2 Numerical checks

For the generated CSF set, verify:

- normalization;
- pairwise orthogonality;
- correct electron number;
- correct parity;
- correct \(L^2\) and \(S^2\) eigenvalues;
- correct behavior under exchange/antisymmetrization;
- linear independence;
- deterministic phase conventions.

For every transformation matrix between determinants and CSFs, verify its orthogonality/unitarity under the actual overlap metric.

Document convention choices for Wigner symbols and phases. Ensure they agree across any reused Fortran, Python, and TypeScript components.

---

# 7. PHASE 4 — LS-resolved multiconfiguration Hamiltonian and CI

The core v0.7.1 deliverable is a real, validated multiconfiguration calculation for selected LS terms.

## 7.1 Hamiltonian blocks

Construct the Hamiltonian in a CSF basis. Separate blocks by conserved symmetry:

- total L;
- total S;
- parity;
- any additional exact quantum numbers supported by the model.

Do not mix different \(LS\pi\) blocks in a spin-independent nonrelativistic Hamiltonian.

Verify Hermiticity:

\[
H_{IJ}=H_{JI}^{*}.
\]

Document all radial and angular matrix elements, including the Coulomb direct and exchange contributions. If the selected solver uses Slater integrals, document the conventions for \(F^k\) and \(G^k\), angular coefficients, radial orbitals, and normalization.

## 7.2 CI eigenproblem

Solve:

\[
\sum_J H_{IJ} c_J = E c_I
\]

within the selected CSF symmetry block.

For each root, return:

- total energy and units;
- target \(LS\pi\) symmetry;
- root index;
- normalized CI eigenvector;
- CSF expansion coefficients;
- dominant configuration/CSF weights;
- term purity and operator diagnostics;
- convergence and numerical residuals;
- basis/orbital provenance;
- solver and method version.

Do not label an eigenstate solely by the largest coefficient in its expansion. Use symmetry eigenvalues and a documented state-assignment procedure. For near-degenerate roots or strong mixing, report ambiguity and mixing rather than forcing a single dominant label.

## 7.3 Multiple roots and state tracking

Support calculation of multiple roots within a given symmetry block where the backend allows it. State ordering can change as the active space, orbital basis, or configuration list changes. Provide overlap-based state tracking where available, or explicitly state that root indices are local to one calculation.

Do not identify roots across unrelated calculations merely by sorting their energies.

## 7.4 Frozen-orbital CI versus MCHF optimization

Explicitly distinguish:

- CI using fixed orbitals obtained from HF or another source;
- MCHF, where radial orbitals are optimized variationally together with configuration mixing.

If stable ATSP2K provides a validated MCHF/CI path and its runtime integration is feasible, use it as the primary specialist backend.

If only fixed-orbital CI can be integrated safely in v0.7.1, label it as such. Do not call it MCHF. MCHF radial-orbital optimization may be included only after independent tests demonstrate the actual variational optimization.

The release must not falsely imply that every CI calculation optimizes orbitals.

---

# 8. PHASE 5 — Backend integration and provider design

Use the existing ATOMS Express + Python backend architecture, unless the solver audit proves a specific alternative is materially better and can be integrated without compromising deployment.

The preferred integration is a versioned Python/Fortran executable adapter behind the existing API and provider contracts.

Requirements:

- no direct scientific calculations in React components;
- no physics imports of React, Three.js, or DOM APIs;
- structured, versioned JSON request/response schemas;
- typed validation of configurations and target LS symmetries;
- calculation progress and cancellation;
- bounded runtime, memory, and output size;
- safe subprocess management and child-process reaping;
- robust error reporting;
- deterministic input manifests;
- no hidden cloud calculation service;
- no mock values or offline fallbacks pretending to be scientific calculations.

If a Fortran solver is integrated, document how it is built, invoked, versioned, and validated. Pin the upstream source commit or published release and preserve license notices.

Do not shell-interpolate untrusted user input. Use argument arrays and validated files/streams. Apply process timeouts and cleanup on client abort or application shutdown.

Keep all v0.7.0 HF endpoints and behavior operational. Add separate endpoints/providers for LS term/CI operations where appropriate rather than changing the meaning of existing `/api/hf/*` results.

---

# 9. PHASE 6 — ATOMS UI and scientific workflow

Extend the existing interface with a coherent **Atomic Terms & CI** workspace. Do not rebuild the application navigation or replace the HF workspace.

The workflow should allow a user to:

1. Select an atom or ion within the validated solver domain.
2. Inspect or define an electronic configuration.
3. See allowed term candidates for that configuration.
4. Inspect the derivation/parentage and parity of each supported term.
5. Select a target \(LS\pi\) block.
6. Choose a supported orbital source, active configuration set, and CI/MCHF method.
7. Configure validated solver options.
8. Run the calculation and observe progress/convergence.
9. Inspect term-resolved energy levels and multiple roots.
10. Examine CSF mixing coefficients and dominant configurations.
11. Inspect \(L^2\), \(S^2\), parity, and state-purity diagnostics.
12. Compare against documented theoretical and experimental references.
13. Save, reload, export, and replay the experiment without confusing replay with recalculation.

Display a clear distinction among:

- experimental/NIST level;
- HF reference energy;
- frozen-orbital CI energy;
- MCHF-optimized energy;
- correlated energy from a future method;
- term centroid versus fine-structure \(J\)-resolved level.

Do not show unavailable controls as functional. Unsupported configurations must be disabled with a precise reason.

---

# 10. PHASE 7 — Validation system and benchmark suite

This release requires stronger validation than ordinary unit tests. Tests authored by the same implementation are necessary but not sufficient.

## 10.1 Canonical term benchmarks

Build a documented benchmark suite for selected configurations and terms. At minimum investigate these familiar cases, subject to the actual supported solver/basis domain:

| System/configuration | Well-known LS terms to validate |
|---|---|
| He, \(1s^2\) | \(^{1}S\) |
| Li, \(1s^2 2s\) | \(^{2}S\) |
| Li, \(1s^2 2p\) | \(^{2}P^{\circ}\) |
| Be, \(1s^2 2s^2\) | \(^{1}S\) |
| B, \(1s^2 2s^2 2p\) | \(^{2}P^{\circ}\) |
| C, \(1s^2 2s^2 2p^2\) | \(^{3}P\), \(^{1}D\), \(^{1}S\) |
| N, \(1s^2 2s^2 2p^3\) | \(^{4}S^{\circ}\), \(^{2}D^{\circ}\), \(^{2}P^{\circ}\) |
| O, \(1s^2 2s^2 2p^4\) | \(^{3}P\), \(^{1}D\), \(^{1}S\) |
| F, \(1s^2 2s^2 2p^5\) | \(^{2}P^{\circ}\) |
| Ne, \(1s^2 2s^2 2p^6\) | \(^{1}S\) |

These are validation targets, not permission to hardcode their answers. Confirm notation and configuration ancestry against authoritative sources.

Add selected ions and more complex open shells only when the chosen backend can calculate them reliably.

## 10.2 Independent atomic-structure references

Use and pin appropriate sources such as:

- stable ATSP2K published code/examples and its associated publications;
- SPHF results already validated in v0.7.0, where the physical method and configuration match;
- NIST Atomic Spectra Database (ASD) evaluated configurations, terms, J levels, and uncertainties;
- published atomic-structure benchmark tables;
- PySCF FCI/CASCI for carefully matched active-space energy/spin cross-checks (not as automatic LS-label proof).

Useful official sources:

- NIST ASD: <https://physics.nist.gov/PhysRefData/ASD/>
- NIST level conventions/help: <https://physics.nist.gov/PhysRefData/ASD/Html/levelshelp.html>
- PySCF CI documentation: <https://pyscf.org/user/ci.html>
- CompAS code inventory: <https://compas.github.io/codes.html>

NIST level energies are often fine-structure \(J\)-resolved experimental values and may include effects absent from a nonrelativistic LS Hamiltonian. Do not compare a nonrelativistic LS term energy directly with one arbitrary J level and call the difference a solver error. Use a physically justified term centroid/weighted comparison when appropriate, document the weighting, and retain the experimental uncertainty and data provenance.

## 10.3 Required mathematical tests

At minimum:

- CSF normalization and orthogonality;
- determinant-to-CSF transformation consistency;
- correct Pauli restrictions for equivalent electrons;
- correct parity;
- \(L^2\) and \(S^2\) eigenvalue residuals;
- correct term multiplicities and allowed terms for benchmark configurations;
- Hamiltonian Hermiticity;
- eigenvector normalization and orthogonality;
- energy variational behavior where mathematically applicable;
- convergence under CSF expansion and orbital/basis refinement;
- stable identification of multiple roots;
- correct spin and orbital diagnostics;
- deterministic reproducibility within declared numerical tolerances.

## 10.4 Regression and backend tests

Run all prior v0.7.0 tests, including:

- TypeScript typecheck/lint;
- Vitest;
- C++ Debug and Release suites;
- Playwright/browser tests;
- existing PySCF live HF benchmarks;
- Docker/Render startup and health endpoint tests, where the environment permits.

Add end-to-end browser tests for term enumeration, LS selection, CI calculation, multi-root display, unsupported-state messaging, save/replay, and backend-offline behavior.

Do not weaken, delete, or skip existing tests to obtain a passing status.

---

# 11. PHASE 8 — Performance, numerical convergence, and robustness

Measure actual runtime and memory use for representative systems and active spaces.

Investigate:

- CSF-space dimension growth;
- Hamiltonian sparsity and storage;
- dense versus iterative diagonalization;
- Davidson or other iterative eigensolvers, if supported by the selected engine;
- integral caching;
- radial-orbital reuse;
- deterministic ordering of configurations/CSFs;
- numerical conditioning;
- multiple-root convergence;
- backend cancellation and orphan-process prevention.

Use the best validated algorithm already available before writing a new eigensolver. For larger CI matrices, do not allocate dense matrices blindly. Estimate dimension and memory before launching a calculation; reject unsafe requests with a clear resource estimate.

Performance optimization must not alter the Hamiltonian or numerical result without a stated approximation and validation.

---

# 12. PHASE 9 — Documentation and provenance

Create/update the following documentation based on the actual implementation:

- `docs/ATOMIC_LS_SOLVER_AUDIT.md`
- `docs/ATOMIC_TERM_STRUCTURE.md`
- `docs/CSF_GENERATION_AND_ANGULAR_MOMENTUM.md`
- `docs/LS_COUPLED_CI.md`
- `docs/MCHF_AND_ORBITAL_OPTIMIZATION.md`
- `docs/ATOMIC_TERM_VALIDATION.md`
- `docs/SCIENTIFIC_SCOPE.md`
- `docs/PHYSICS_MODELS.md`
- `docs/API_REFERENCE.md`
- `docs/USER_GUIDE.md`
- `docs/DEVELOPER_GUIDE.md`
- `docs/VALIDATION.md`
- `docs/VERIFICATION.md`
- `README.md`
- `CHANGELOG.md`
- `docs/CHANGELOG.md`
- `docs/RELEASE_NOTES.md`

For every reused external code, record:

- upstream URL;
- exact version, release, or commit;
- license and attribution obligations;
- local modifications, if any;
- build/runtime requirements;
- reference papers;
- data/source checksums where applicable.

Clearly distinguish calculated results, imported reference data, and benchmark fixtures.

---

# 13. Explicit scope boundaries for v0.7.1

## In scope

- audited and reusable atomic LS-structure solver integration;
- term enumeration for a declared supported configuration domain;
- correct CSF construction or validated use of an external CSF engine;
- LS- and parity-resolved CI for supported systems;
- multiple roots and configuration mixing where supported;
- \(L^2\), \(S^2\), parity, and state-purity diagnostics;
- integration into the existing experiment/backend/UI architecture;
- independent scientific benchmarks and documentation.

## Conditional, only if the selected verified engine supports it

- MCHF radial orbital optimization;
- broader configuration expansions;
- extended parentage/seniority labeling;
- term-resolved transition densities or transition matrix elements (only if required by the validated solver and without turning this into the v0.9 spectroscopy milestone).

If MCHF orbital optimization is not actually integrated and tested, label the v0.7.1 feature as fixed-orbital LS-CI and explicitly defer MCHF optimization. Do not mislabel one as the other.

## Out of scope

- MP2, UMP2, CISD-as-a-general-correlation-product, CCSD, CCSD(T) as the v0.7.2 correlation milestone;
- general production FCI across large atoms (FCI may be used as a small-system benchmark);
- relativistic multi-electron Dirac–Fock;
- MCDHF and relativistic RCI;
- spin–orbit fine-structure energy splitting;
- Breit, QED, Lamb shift, hyperfine, nuclear recoil;
- Stark/Zeeman external-field calculations;
- plasma collision and line-broadening models;
- molecules.

Do not imply a complete periodic-table capability. Declare supported atoms, ions, shells, basis/orbital families, and active-space sizes explicitly.

---

# 14. Release and deployment requirements

Target release:

**ATOMS v0.7.1 — Atomic Term Structure & LS-Coupled Multiconfiguration CI**

Preserve v0.7.0 as a reproducible rollback baseline.

Update version metadata, provider versions, changelog, scientific scope, and release documentation consistently.

Preserve the existing Render + Docker architecture:

- keep the root Dockerfile and `.dockerignore` functional;
- keep Render's dynamic `PORT` handling and `0.0.0.0` binding;
- retain the Express + Python backend architecture;
- ensure the chosen Fortran/atomic solver is built and included in the production image if required;
- pin external source versions and dependencies;
- keep `/api/hf/capabilities` and existing HF calculations working;
- add explicit capabilities/health reporting for the term/CI backend;
- verify the production container can run at least one real LS-CI calculation;
- do not claim a Render deployment succeeded unless the actual deployment was performed and tested.

Do not switch to Vercel/serverless for the scientific backend. Do not add a new ZIP release requirement. Use the project's existing version-delivery and repository workflow.

If a local Docker CLI is unavailable, report that limitation. Still validate Dockerfile syntax and build as much as the environment permits, but never claim an actual image build that was not run.

---

# 15. Required completion report

At completion, provide a precise engineering and scientific report containing:

1. exact starting v0.7.0 commit/workspace checkpoint;
2. baseline commands and results;
3. solver ecosystem audit and chosen primary engine;
4. stable source/version/commit and license evidence for every external engine;
5. why the selected engine is preferable to alternatives;
6. exact files created, modified, and removed;
7. term enumeration algorithm and its validated domain;
8. CSF construction method and phase/normalization conventions;
9. LS-CI Hamiltonian implementation and matrix conventions;
10. whether orbital optimization is MCHF or fixed-orbital CI;
11. benchmark configurations, terms, references, energies, and tolerances;
12. \(L^2\), \(S^2\), parity, and state-purity results;
13. performance and active-space limits;
14. UI, API, experiment, and persistence behavior;
15. full regression results;
16. Docker/Render verification results;
17. known unsupported features and reasons;
18. acceptance matrix;
19. exact Git branch/commit/tag where genuinely available;
20. recommended next milestone: v0.7.2 Electron Correlation.

Use only these acceptance statuses:

- `PASS` — demonstrated by concrete reproducible evidence;
- `FAIL` — a defect remains and has been demonstrated;
- `BLOCKED` — verification or implementation could not be completed, with a specific blocker;
- `NOT IMPLEMENTED` — capability is absent;
- `NOT APPLICABLE` — genuinely irrelevant to this release.

Never turn `BLOCKED` or `NOT IMPLEMENTED` into `PASS`. Clearly separate direct local execution, published upstream reference data, and tests written by this project.

---

# 16. Autonomous execution and recovery policy

Proceed autonomously through the complete v0.7.1 assignment. Do not stop after writing an audit if implementation and verification can safely continue. Do not ask for intermediate approval.

Work in verifiable phases and maintain checkpoints. If execution is interrupted:

1. inspect the current workspace and Git state;
2. identify completed phases and actual modified files;
3. preserve all valid work;
4. resume from the first unfinished task;
5. never repeat completed work merely to produce a new report;
6. never reset, overwrite, or discard previous achievements.

If the platform's quota or runtime limits interrupt execution, leave the workspace intact and report the exact checkpoint, verified accomplishments, unresolved tasks, and the next command/action needed. Do not continue blindly after resource exhaustion.

---

# 17. Final directive

**Build a real atomic term-structure and LS-coupled multiconfiguration capability on top of ATOMS v0.7.0. Reuse the strongest stable atomic-structure software available—especially the verified stable ATSP2K path if its source, license, build, and scientific behavior check out. Use PySCF FCI as a complementary tool, not as an automatic substitute for LS-adapted CSFs. Reuse ATOMS' existing angular-momentum mathematics where correct. Never invent term labels, never confuse spherical density with an LS eigenstate, and never claim MCHF when only fixed-orbital CI was performed.**

The measure of success is not how many files changed or how many term symbols appear in the interface. It is whether ATOMS computes and validates genuine, well-defined atomic LS states and multiconfiguration energies for an explicitly stated scientific domain, while preserving every working v0.7.0 capability.
