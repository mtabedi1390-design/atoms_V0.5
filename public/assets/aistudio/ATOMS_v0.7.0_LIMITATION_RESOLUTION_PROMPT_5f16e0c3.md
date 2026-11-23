# ATOMS v0.7.0 — Scientific Limitations Resolution & Runtime Hardening

## Mission

You are continuing the **existing ATOMS v0.7.0 — Multi-Electron Atomic Structure** project. The v0.7.0 implementation already integrates a live local Python backend using PySCF 2.15.1, bundled libcint, Basis Set Exchange, an Express API, TypeScript physics providers, experiment persistence, and Hartree–Fock visualization.

Your assignment is **not** to start v0.7.1 and not to add electron-correlation methods. First resolve the scientific and deployment limitations identified during the v0.7.0 review. Treat this as a focused **v0.7.0 completion and hardening task**. Preserve the current version and workflow unless the existing project has an established patch-version convention that requires otherwise.

The objective is to make the current claims precise, close the important verification gaps, and ensure the supported full-stack application can be launched and used reliably.

---

## 1. Non-negotiable preservation rules

1. Inspect the actual current workspace, Git status if available, running processes, dependency state, and all modified files before changing anything.
2. Preserve every valid v0.7.0 implementation and all v0.6.1 functionality. Do not rebuild the application, replace working solvers, or duplicate existing modules.
3. Do not remove or weaken tests to obtain a passing result.
4. Do not fabricate atomic terms, angular-momentum quantum numbers, benchmark values, reference outputs, or solver capabilities.
5. Do not describe a calculation as term-resolved, spherically symmetric, or rotationally invariant unless that property has actually been established.
6. Do not begin MP2, UMP2, CISD, FCI, CCSD, or other v0.7.1 electron-correlation work.
7. Do not create a new ZIP-generation workflow. Continue using the project's existing development and delivery workflow.
8. Keep a precise checkpoint so work can resume without repeating completed tasks.

---

# Workstream A — Correct atomic-state and open-shell semantics

## 2. Audit the actual methods and labels

Inspect the installed PySCF 2.15.1 source, especially:

- `pyscf.scf.hf`
- `pyscf.scf.uhf`
- `pyscf.scf.rohf`
- `pyscf.scf.hf_symm`
- `pyscf.scf.atom_hf`
- the actual ATOMS code in `science/hf_backend.py`, `src/physics/hf/`, the live provider, and the Hartree–Fock workspace.

Use the installed source as the implementation authority. Do not infer behavior from a class name or an older PySCF version.

The UI, API, domain model, results, and documentation must distinguish these physically different calculation modes:

1. **RHF** — restricted closed-shell Hartree–Fock.
2. **UHF** — unrestricted alpha and beta spatial orbitals; report possible spin contamination and the calculated spin diagnostics.
3. **ROHF** — restricted open-shell Hartree–Fock with the actual paired/open-orbital occupation convention used by the solver.
4. **Spherically averaged atomic HF** — an ensemble/fractional-occupation atomic mean-field calculation. It is not the same object as a pure open-shell determinant or a term-resolved atomic state.
5. **Term-resolved atomic structure** — a state identified by a physically supported atomic term such as \(^{2S+1}L\), and by \(J\) only when relativistic coupling is actually implemented.

Do not merge modes 3, 4, and 5 under a generic “ROHF” or “spherical HF” label.

## 3. Explicitly audit the SO(3) limitation

PySCF's `AtomSphAverageRHF` implementation has historically disabled molecular symmetry and contains a TODO concerning SO(3) symmetry. Inspect the exact installed 2.15.1 implementation and record whether that remains true in the installed version.

Relevant upstream source to inspect:

- https://pyscf.org/_modules/pyscf/scf/atom_hf.html
- https://github.com/pyscf/pyscf/blob/master/examples/scf/31-v_atom_rohf.py

The official atomic ROHF example warns that a default initial guess can break spherical symmetry and demonstrates explicit symmetry/occupation handling. Treat it as a technical example, not as an automatic guarantee that every atom, configuration, and term is correct.

Requirements:

- Audit the existing SO(3) shell-to-irrep occupation mapper and prove that its mapping is correct for the supported basis conventions and PySCF version.
- Verify the degeneracy and occupation of all relevant \(m_l\) components for supported subshells.
- Verify whether the resulting density is actually rotationally invariant in cases advertised as spherical averages.
- Check whether SCF convergence, initial guesses, symmetry settings, and orbital rotations break the intended degeneracies.
- Do not claim that a finite point-group symmetry setting is automatically identical to full SO(3) symmetry.
- Do not claim that a spherical average is a pure eigenstate of \(L^2\).

Where useful, implement explicit symmetry-adapted occupations and robust initial guesses using supported PySCF functionality. Follow the installed PySCF version's official patterns, but independently test every supported case.

## 4. Represent the atomic state without inventing quantum numbers

Extend the existing atomic-configuration/result schema only as required to distinguish:

- configuration, e.g. subshell occupations;
- electron number and charge;
- \(N_\alpha\), \(N_\beta\), and spin multiplicity;
- the selected computational ansatz (RHF/UHF/ROHF/spherical average);
- magnetic-sublevel occupation where actually specified;
- atomic term \(^{2S+1}L\), only when established by the selected method;
- total \(J\), only for a method that genuinely supports it;
- state character: determinant, ensemble/spherical average, or term-resolved state;
- symmetry constraints and diagnostics.

Important physics rules:

- An electron configuration alone may correspond to multiple LS terms. Never infer a unique term from configuration and spin multiplicity alone when the term is ambiguous.
- ROHF's spin adaptation does not, by itself, prove that the state is an eigenfunction of \(L^2\).
- A UHF determinant may break spatial or spin symmetry; expose relevant diagnostics rather than hiding the effect.
- A spherically averaged fractional-occupation state is an ensemble/average description, not automatically a pure LS term.
- Do not attach a \(J\) value to nonrelativistic HF output as though fine-structure coupling had been computed.

If the application cannot calculate a term-resolved state rigorously, make that capability explicitly unavailable. Do not manufacture a term label to make the interface look complete. A future term-resolved solver may be recommended, but it must not be represented as implemented in this task.

## 5. Open-shell validation matrix

Create an explicit validation matrix covering supported examples across s, p, and d open shells. Include representative systems from the current supported domain, such as Li, B, C, N, O, F, and Cr, but first verify the correct electron configuration and intended state for every case.

For every case record:

- Z, N, charge, and isotope/nuclear model;
- explicit subshell occupation;
- \(N_\alpha\), \(N_\beta\), and multiplicity;
- selected method;
- whether the target is a determinant, a spherical ensemble, or a term-resolved state;
- basis and symmetry convention;
- convergence and stability status;
- orbital degeneracies and occupation pattern;
- density normalization;
- spin diagnostics;
- angular/symmetry diagnostics that the method can genuinely provide.

For a calculation advertised as spherical-average, verify angular isotropy of the computed total density with an adequate angular quadrature. Do not demand isotropy from an oriented pure determinant unless its physical state should have that property. Explain the distinction.

Where a method supports \(\langle S^2\rangle\), report it. Compute or report \(\langle L^2\rangle\) only if a mathematically correct implementation exists; do not estimate it from a one-particle density alone.

Add regression tests proving that the UI labels, API result metadata, and documentation agree with the actual calculation mode.

---

# Workstream B — Direct independent SPHF validation

## 6. Inspect and build the CompAS SPHF reference implementation

The earlier v0.7.0 report used pinned published SPHF outputs because `gfortran` was absent from the container. That is useful reference evidence, but it is not the same as building and executing the upstream SPHF program independently.

The CompAS code catalogue identifies SPHF as a B-spline Hartree–Fock code and cites its associated Computer Physics Communications publication. Inspect the official repository and its build instructions:

- https://compas.github.io/codes.html
- https://github.com/compas/sphf

Tasks:

1. Inspect the repository, license, source files, build system, compiler requirements, test inputs, and official validation procedure.
2. Pin and record the exact upstream commit/revision used.
3. Check whether a suitable Fortran compiler is already installed.
4. If not, determine whether installing a compiler in the current environment is permitted and feasible. Prefer a local/user-level or isolated toolchain where possible; do not damage the managed runtime or alter unrelated system components.
5. Build SPHF from its original source without silently modifying the physics implementation.
6. Run the upstream test suite and the original `test_all` / `out*` reference cases, or the exact current equivalent documented by the repository.
7. Preserve raw outputs, command lines, compiler/version information, source revision, and checksums in a reproducibility record.

Do not claim SPHF was independently built or run if only published output files were read.

## 7. Make scientifically matched comparisons

Compare PySCF/ATOMS results with SPHF only when the physical problem is genuinely comparable:

- same nuclear charge and charge state;
- compatible electron configuration and spin/state assignment;
- same nuclear model and mass convention;
- same nonrelativistic Hamiltonian;
- compatible exchange and occupation treatment;
- clearly stated basis and numerical approximations.

PySCF Gaussian basis results and SPHF B-spline results do not have the same basis incompleteness. Do not impose a false same-basis comparison. Instead:

- compare converged basis/grid limits where possible;
- report the PySCF Gaussian basis sequence and extrapolation, if justified;
- report SPHF radial-grid/B-spline convergence;
- compare total energies and orbital/expectation values only with compatible conventions;
- document expected residual differences from finite basis, grid, and state definitions.

Use the published SPHF values as checksums/secondary references, but distinguish them from newly executed SPHF results.

If the direct SPHF build remains blocked, try a technically reasonable alternative route only after inspecting the cause. Keep the direct-build item marked BLOCKED and explain why. Do not label published-output reuse as a direct build.

## 8. Independent benchmark reporting

For each benchmark, provide:

- system and electronic state;
- method and source program;
- basis or radial representation;
- numerical settings and convergence criteria;
- reference provenance and version;
- computed value;
- reference value;
- absolute and relative difference;
- explanation of basis/grid/state differences;
- whether the comparison is direct, asymptotic, or only contextual.

Do not compare a finite Gaussian-basis HF energy with a complete-basis-limit HF energy using an unrealistically strict tolerance. Separate basis incompleteness from solver error.

---

# Workstream C — Reliable and explicit Python-backend deployment

## 9. Define the supported execution modes honestly

The current scientific backend uses native Python dependencies (PySCF, libcint, NumPy, SciPy, h5py, and Basis Set Exchange). A static HTML file cannot execute this native Python stack by itself.

Do not attempt to conceal this limitation or claim that standalone HTML runs live Hartree–Fock calculations.

Define and implement clear modes:

### Full local scientific mode

- Express serves the application and the HF API on the same local origin.
- Python runs from the project's configured virtual environment.
- The capability endpoint reports the actual backend and dependency versions.
- The UI enables HF only when a live backend health check succeeds.
- Startup and shutdown are documented and repeatable.

### Static/viewer mode

- The existing HTML can still display supported precomputed/static content if designed to do so.
- Live Hartree–Fock is explicitly unavailable without the local Python service.
- No fake calculations or misleading “active” status are permitted.

### Optional remote deployment

Do not build a hidden cloud dependency. Only document or implement remote execution if the project explicitly supports a secured backend deployment. It must have a clear authentication, authorization, resource, and privacy model.

## 10. Harden the local launcher and process lifecycle

Inspect the current `server.ts`, `scripts/setup_python_backend.sh`, `package.json`, Python environment setup, and API transport.

Provide a reliable supported startup path using the project's existing tools and conventions. It should:

- verify Node and Python versions;
- create or validate the configured virtual environment;
- install exactly the pinned Python dependencies;
- verify that PySCF and libcint import successfully;
- verify that the Express dependency and Node lockfile state are consistent;
- start the server and Python backend predictably;
- expose a health/capability endpoint with actionable diagnostics;
- shut down child processes cleanly;
- avoid orphaned `tsx`, Node, Python, or esbuild processes;
- handle an already-running instance safely;
- report port conflicts with the owning process and a safe resolution path;
- never kill unrelated processes.

The previous Vite incident involved orphaned `tsx server.ts` process groups and an HMR WebSocket port collision. Add safe lifecycle handling and diagnostics so that repeating the normal start/restart workflow does not accumulate orphaned server trees.

For ordinary local desktop execution, bind the backend to loopback (`127.0.0.1`) by default. Preserve the explicit host override needed by managed preview/container environments (such as `0.0.0.0`) rather than hardcoding one host for every deployment.

When exposing a loopback API, validate request origin/host appropriately and do not expose a local scientific backend to the LAN unintentionally. Do not introduce a broad permissive CORS policy or unauthenticated remote execution.

## 11. Fresh-environment verification

Test the documented startup process in a clean or isolated environment, not only in the already-prepared development process.

Verify:

1. setup succeeds or emits a precise dependency error;
2. server starts once and remains running;
3. `/api/hf/capabilities` returns an accurate response;
4. one representative HF calculation runs through the actual HTTP route;
5. the result reaches the UI;
6. stopping the server reaps child processes;
7. restarting does not create a port collision;
8. static mode reports backend unavailability honestly;
9. no Python calculation is fabricated or silently mocked.

Do not claim Windows/macOS support unless the corresponding setup and run path has been tested. Clearly list verified operating systems and architectures.

---

# Workstream D — Integration, regression, and documentation

## 12. Preserve and retest the full project

After correcting the above limitations, execute the available checks:

- TypeScript typecheck and lint;
- all Vitest suites;
- native C++ Debug and Release tests;
- all Playwright browser tests;
- live Python/PySCF backend integration tests;
- scientific benchmark tests;
- production build;
- startup/restart/shutdown lifecycle tests;
- static-mode offline behavior.

Keep the v0.6.1 regression guarantees. Do not change previously validated Schrödinger, Dirac, E1, spectroscopy, or experiment behavior unless a demonstrated defect requires a targeted fix.

## 13. Update documentation and UI terminology

Update existing documents rather than generating redundant parallel descriptions.

At minimum synchronize:

- `docs/SOLVER_ECOSYSTEM_AUDIT.md`
- `docs/MULTI_ELECTRON_HARTREE_FOCK.md`
- `docs/BASIS_SETS.md`
- `docs/SCF_CONVERGENCE.md`
- `docs/ORBITALS_AND_DENSITY.md`
- `docs/MULTI_ELECTRON_VALIDATION.md`
- `docs/SCIENTIFIC_SCOPE.md`
- `docs/VALIDATION.md`
- `docs/VERIFICATION.md`
- `docs/DEVELOPER_GUIDE.md`
- `docs/USER_GUIDE.md` or the existing equivalent
- `README.md` and `CHANGELOG.md`

Ensure the UI makes clear whether the user is running RHF, UHF, ROHF, spherical-average HF, or a genuinely term-resolved calculation. Make unsupported state properties unavailable rather than inventing them.

Document how to run full local scientific mode and what static/viewer mode cannot do.

---

# 14. Explicitly out of scope

Do not implement or begin:

- MP2 or UMP2;
- CISD or FCI;
- CCSD or coupled-cluster methods;
- new electron-correlation features;
- relativistic multi-electron Dirac–Fock;
- MCDHF or RCI;
- QED, Lamb shift, Breit, or hyperfine corrections;
- Stark/Zeeman physics;
- plasma/collision physics.

These belong to later milestones. This assignment is strictly to correct and verify the current v0.7.0 capabilities and runtime.

---

# 15. Acceptance criteria

Do not declare this task complete until every criterion has a truthful status:

| Criterion | Required evidence |
|---|---|
| RHF/UHF/ROHF semantics are distinct | API, UI, tests, and docs agree |
| Spherical-average HF is clearly distinct | Explicit ensemble/fractional-occupation labeling |
| SO(3) claims are justified | Installed PySCF source audit plus numerical symmetry tests |
| Open-shell occupations are correct | Verified subshell and magnetic-sublevel occupation matrix |
| Term labels are not fabricated | Term metadata only when actually established |
| Spin diagnostics are honest | \(\langle S^2\rangle\) or documented unavailability |
| Angular-momentum diagnostics are honest | \(\langle L^2\rangle\) only when correctly implemented |
| SPHF source inspected and pinned | Exact upstream revision and license recorded |
| SPHF independently built and run | Build log, compiler version, upstream test outputs |
| Benchmark comparison is matched | State, Hamiltonian, basis/grid, and tolerances documented |
| HF local runtime is reproducible | Fresh-environment setup and live calculation tested |
| Process lifecycle is safe | Start, restart, stop, no orphan processes or port conflict |
| Static mode is honest | HF disabled with explicit local-backend requirement |
| Existing v0.6.1/v0.7.0 capabilities preserved | Full regression suite passes |

Use only these statuses:

- **PASS** — directly verified with evidence.
- **FAIL** — a verified defect remains.
- **BLOCKED** — could not be completed, with the exact reason.
- **NOT IMPLEMENTED** — capability is absent and remains unavailable.
- **NOT APPLICABLE** — genuinely irrelevant.

Never mark a task PASS because it is merely documented or because a mock test passed.

---

# 16. Final report and execution policy

Provide a focused final report containing:

1. Exact workspace checkpoint and files changed.
2. The PySCF 2.15.1 source findings relevant to atomic open shells and spherical averaging.
3. Corrected method/state taxonomy and any remaining unsupported term-resolved cases.
4. Open-shell test matrix and numerical diagnostics.
5. SPHF upstream revision, build procedure, compiler, tests, and comparisons — or a precise BLOCKED explanation.
6. Runtime architecture, startup procedure, security/binding behavior, and verified operating systems.
7. Start/restart/stop lifecycle results.
8. Full regression and browser-test results.
9. Updated documentation locations.
10. Acceptance matrix with PASS/FAIL/BLOCKED/NOT IMPLEMENTED statuses.
11. Remaining limitations, stated plainly.

Proceed autonomously through all safe and feasible work. Do not stop after the audit if a targeted correction can be implemented. If a required compiler, system dependency, quota, or execution capability is unavailable, preserve the workspace and report the blocker precisely; do not simulate the missing validation.

**Final directive: First make v0.7.0 scientifically honest and operationally dependable. Distinguish real atomic states from spherical averages, verify open-shell physics, execute an independent atomic HF reference where feasible, and make the Python backend reliably launchable. Do not start v0.7.1 until this work is complete.**
