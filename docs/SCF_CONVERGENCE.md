# SCF Engine and Convergence Controls (`ATOMS v0.7.0`)

Multi-electron Hartree–Fock is a nonlinear self-consistent eigenvalue problem ($\mathbf{F}(\mathbf{P})\mathbf{C} = \mathbf{S}\mathbf{C}\boldsymbol{\varepsilon}$). ATOMS exposes PySCF `2.15.1`'s mature SCF machinery directly and **strictly forbids presenting an unconverged run as a valid HF result**.

---

## 1. SCF Workflow Inside `science/hf_backend.py`

1. **Symmetry & Initial Guess (`initGuess`)**:
   - `minao` *(default)*: Projected minimal atomic orbital superposition density (`PySCF` standard guess).
   - `1e`: Core Hamiltonian ($\mathbf{h}_{\text{core}} = \mathbf{T} + \mathbf{V}_{ne}$) eigensolution.
   - `atom`: Superposition of atomic HF spherically averaged densities.
2. **Fock Construction & Convergence Acceleration (`diis`, `damp`, `levelShift`)**:
   - `cdiis` *(default)*: Pulay Commutator DIIS ($\mathbf{e}_i = \mathbf{F}_i\mathbf{P}_i\mathbf{S} - \mathbf{S}\mathbf{P}_i\mathbf{F}_i$).
   - `ediis`: Energy-represented DIIS (guarantees descent in oscillating open-shell steps).
   - `adiis`: Augmented DIIS.
   - `none`: Straight SCF updates (useful for testing/teaching damping `0..0.95` or virtual-gap `levelShift` `0..2.0 Ha`).
3. **Per-Cycle Recording Callback**:
   - Every SCF iteration records `(cycle, eTotal_Ha, dE_Ha, gradNorm)` via `mf.callback` and emits full iteration traces (`scf.history`) to the UI and persisted experiment records.
4. **Convergence Thresholds**:
   - `convTol` (`conv_tol`, configurable `1e-6`, `1e-8`, `1e-9` default, `1e-11` tight) on $\Delta E$,
   - `convTolGrad = sqrt(convTol)` on orbital gradient norm $\|\mathbf{g}\|_{\infty/2}$.
5. **Optional Post-SCF Internal Stability Check (`runStability = true`)**:
   - Invokes PySCF's Hessian stability analyzer (`rhf_internal` / `uhf_internal` / `rohf_internal`), reporting `stable: boolean` and lowest stability eigenvalue note (when not `atom-sph-avg`).

---

## 2. Explicit Handling of Unconverged SCF

- If `mf.converged` is `False` (e.g., `maxCycle = 1` on `Ne RHF` or pathological level crossings without DIIS):
  1. `science/hf_backend.py` returns `ok: false`, `scf.converged: false`, and full iteration diagnostics up to `maxCycle`.
  2. `pyscfLiveProvider.calculate()` **throws an error** citing `maxCycle`, last $\Delta E$, and gradient norm $|\nabla|$, advising adjustment of `diis`/`damp`/`levelShift`/`maxCycle`.
  3. `ExperimentRunner` marks the `ExperimentExecution` status as `"failed"` and **does NOT persist a completed `ExperimentResultRecord`** to `IndexedDBExperimentStore`.
  4. Tests in `src/physics/__tests__/hartreeFock.test.ts` explicitly verify that `Ne RHF/cc-pVTZ` with `maxCycle: 1, convTol: 1e-12` fails honestly and throws rather than returning an unconverged energy.

---

## 3. Troubleshooting Open-Shell SCF Convergence

- Transition metals (e.g., `Cr` `[Ar] 3d5 4s1`) or near-degenerate open $d$ shells can require:
  - Switching `diis` to **`ediis`** or **`adiis`**,
  - Applying **`levelShift = 0.2 – 0.5 Ha`** and/or **`damp = 0.2 – 0.4`**,
  - Testing explicit `initGuess` (`minao`, `1e`, `atom`) — verified in `C`, `N`, and `Cr` ROHF to converge to identical energies (`< 1e-10 Ha` spread) and subshell degeneracies (`< 4e-14 Ha` split),
  - Explicitly checking `subshells` spin occupations (`2S`) in `HartreeFockWorkspace` rather than relying blindly on Aufbau defaults.
- **Magnetic-Sublevel (`m_l`) Sensitivity on Open $d$ Shells**: For open-shell `SO(3)` real-harmonic determinants (e.g., `V 3d3 4s2`), different real $d$ sublevel occupation choices produce physically distinct determinant energies (default `[d0, d+1, d-1]` converges at `-942.832679 Ha` vs `t2g [d-2, d-1, d+1]` at `-942.883837 Ha` in `aug-cc-pVTZ`, within `0.50 mHa` of `compas/sphf 4F`), whereas `C1` without angular restrictions can mix $s/d$ symmetry below the pure $4F$ limit. Because ATOMS configures real-orbital subshells rather than multi-determinant $LS$ eigenstates, `stateInfo.termResolution` remains explicitly unavailable.
