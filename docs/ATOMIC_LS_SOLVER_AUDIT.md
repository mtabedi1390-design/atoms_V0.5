# Atomic LS-Structure Solver Ecosystem Audit (`ATOMS v0.7.1`)

**Principle:** *Search before coding. Reuse before reimplementing. Validate before labeling a state.*

This document fulfills **Phase 1 (Solver Ecosystem Discovery)** of `ATOMS v0.7.1 — Atomic Term Structure & LS-Coupled Multiconfiguration CI`. Every major CompAS/academic atomic-structure candidate, PySCF `2.15.1` determinant CI module, and existing ATOMS mathematical module was audited by inspecting upstream provenance, licenses, compiler/runtime behavior in this Linux environment, and actual execution outputs.

---

## 1. Summary Decision

- **Selected Production Engine for `ATOMS v0.7.1`:** **Fixed-Orbital LS-Coupled Multiconfiguration CI** built directly on ATOMS's existing redistributable stack:
  - **Radial & AO Integral Engine:** `PySCF 2.15.1` (`Apache-2.0`) `atom_hf.AtomSphAverageRHF` + bundled `libcint` (`BSD-2-Clause`) + `basis-set-exchange 0.12` (`BSD-3-Clause`) + `pyscf.symm.sph.sph_pure2real` exact real-to-complex Condon–Shortley unitary shell transform.
  - **LS-CSF & Symmetry-Blocked CI Engine:** Versioned second-quantized $(L^2, S^2, L_z, S_z, \Pi)$ CSF projector and $(L, S, \pi)$ Hamiltonian block builder/diagonalizer (`science/ls_ci_backend.py` + `SciPy 1.17.1` / `NumPy 2.4.6`), paired with TypeScript Russell–Saunders configuration/term enumeration (`src/physics/ls/`) and ATOMS's existing exact `wigner3j`/`wigner6j` module (`src/numerics/specialFunctions/wigner.ts`).
  - **Independent Cross-Checks:** Exact active-space eigenvalue verification against `pyscf.fci.direct_spin1`, single-configuration LS HF limit comparison against `compas/sphf` (`MIT`), published `ATSP2K` reference examples, and weighted term-centroid comparisons against pinned NIST ASD evaluated levels.
- **Explicit Scientific Honesty Scope:** Radial orbitals are taken from fixed $SO(3)$-symmetric `AtomSphAverageRHF` (or curated ion occupations) and are **not** re-optimized self-consistently per CI root. This capability is explicitly labeled **Fixed-Orbital LS-Coupled CI** (and **not** MCHF orbital optimization, which is deferred).

---

## 2. External Codebase & Internal Module Audit

### 2.1 Official Published `ATSP2K` (`ADLY_v2_0`)
- **Provenance & Citation:** C. Froese Fischer, G. Tachiev, G. Gaigalas, M. R. Godefroid, *"An MCHF atomic-structure package for large-scale calculations"*, *Comput. Phys. Commun.* **176** (2007) 559–579, DOI `10.1016/j.cpc.2007.01.006`. Distribution archive retrieved from the CPC Program Library on Mendeley Data: DOI `10.17632/yz5jgp2b94.1`, file `adly_v2_0.tar.gz` (`2,976,902` bytes, SHA-256 `a53485727be7e91893e730892b550ae790c66cc71691c666ea19856581c2a72e`).
- **License & Redistribution Blocker:** Distributed under the **Computer Physics Communications (CPC) Journal Licence** (`https://www.elsevier.com/about/policies/open-access-licenses/elsevier-user-license/cpc-license/`), which states: *"No user or site will re-distribute the source code or executable code to a third party in original or modified form without the written permission of the author"* and prohibits commercial or third-party re-distribution. Therefore `ADLY_v2_0` **cannot legally be bundled or redistributed** inside ATOMS's public GitHub repository or Render production Docker image.
- **Local Build & Execution Audit (`gfortran 12.3.0`):**
  - Core serial libraries (`libcom`, `libang`, `libdvdson`, `librad`) and binaries (`gencl`, `hf`, `nonh`, `lsreduce`, `mchf`, `ci`, `levels`, `lines`) compiled only with legacy compiler workarounds (`-O2 -fno-automatic -fcray-pointer -std=legacy -fallow-argument-mismatch`).
  - `lsgen.f:4475` failed GCC 12 rank-argument type checking (`Rank mismatch between actual argument at (1) and actual argument at (2) (scalar and rank-1)`). `src/lib/mpi` failed because `FC_MPI` was unset.
  - `hf` succeeded on formatted `Si,av,14` from `examples/sh_hf`, whereas interactive `C 3P` stdin input aborted radial iteration (`ED = NaN; METHOD 1 UNABLE TO SOLVE EQUATION FOR ELECTRON 2`).
  - Official reference outputs in `examples/output/e1/` (`Si` $3s^2 3p^2$: `3Pe1.14_4.l = -288.935678169`, `1De1.14_4.l = -288.906052812`, `1Se1.14_4.l = -288.863158930`) remain valuable as published literature benchmarks.
- **Verdict:** **REJECTED for runtime bundling** due to CPC non-redistribution license and legacy interactive stdin/gfortran-12 fragility. Used strictly as a non-redistributed literature/reference audit target.

### 2.2 CompAS Development `ATSP` (`github.com/compas/atsp`)
- **Exact Commit:** `66689d9` (`https://github.com/compas/atsp`).
- **License:** MIT License.
- **Assessment:** Upstream README carries the explicit warning: *"Disclaimer: this is an unstable, development version of ATSP - for the latest stable release we refer you to the most recently published version (ATSP2K)"*. Prompt Section 4.1 explicitly forbids substituting this unstable development repository as stable `ATSP2K`.
- **Verdict:** **REJECTED as production solver.**

### 2.3 CompAS `atsp-book` (`github.com/compas/atsp-book`)
- **Exact Commit:** `26a2c5a` (`https://github.com/compas/atsp-book`).
- **License:** **No `LICENSE` file present** in repository (pedagogical companion to *Computational Atomic Structure: An MCHF Approach*, 1997 / CPC 128, 2000).
- **Technical Limits:** Fixed static Fortran 77 array bounds (`NWD=30`, `NCD=100`, `NTERMD` caps) and no explicit redistribution license.
- **Verdict:** **REJECTED for production bundling** (missing explicit license + static F77 teaching bounds).

### 2.4 CompAS `spmchf` (`github.com/compas/spmchf`)
- **Exact Commit:** `d08a88f` (`https://github.com/compas/spmchf`).
- **License:** **No `LICENSE` file present**; README describes the code as *"unpublished"* and *"a work-in-porgress"*.
- **Build Result:** Failed compilation under `gfortran 12.3.0` (`some_nr.f90:161: Error: INTENT(INOUT) argument 'i' cannot be a DO loop index`).
- **Verdict:** **REJECTED.**

### 2.5 CompAS `sphf` (`github.com/compas/sphf`)
- **Exact Commit:** `913991ff361ddb52f05d207c23fd1932d0c960e3` (`https://github.com/compas/sphf`).
- **License:** MIT License.
- **Capabilities & Limits:** Builds cleanly under `gfortran 12.3.0` and already provides validated numerical B-spline single-configuration LS term HF limits (`1S`, `2S`, `2P`, `3P`, `4S`, `7S`, `AV`) pinned in `src/physics/hf/benchmarks.ts`. However, it is strictly **single-configuration** HF and does not construct multiconfiguration CI expansions or arbitrary multi-shell CSF blocks.
- **Verdict:** **RETAINED as single-configuration LS HF benchmark limit**, not sufficient alone for multiconfiguration LS-CI.

### 2.6 `PySCF 2.15.1` (`AtomSphAverageRHF` + `fci` + `libcint` + `BSE 0.12`)
- **Provenance & Licenses:** `pyscf==2.15.1` (`Apache-2.0`), bundled `libcint` (`BSD-2-Clause`), `basis-set-exchange==0.12` (`BSD-3-Clause`), `numpy==2.4.6` (`BSD-3-Clause`), `scipy==1.17.1` (`BSD-3-Clause`). Already installed and verified in `.venv` and `/opt/atoms-py` inside `Dockerfile`.
- **Audited Orbital & Symmetry Behavior:**
  - Direct testing confirms `atom_hf.AtomSphAverageRHF(mol)` produces exact $SO(3)$-symmetric radial shells $(n, l)$ with `0.00e+00` cross-$l$ AO mixing and exact degeneracy across $2l+1$ real-harmonic $m$ components (`max |C^T S C - I| = 6.66e-16` on C/cc-pVDZ).
  - `pyscf.symm.sph.sph_pure2real(l, reorder_p=True)` was tested directly against `scipy.special.sph_harm_y` via `mol.eval_gto('GTOval_sph', pts)` for $s, p, d, f$ shells and matches standard Condon–Shortley complex spherical harmonics $Y_l^m$ to `1.8e-15` relative error.
  - `pyscf.fci.direct_spin1` operates in $S_z$/determinant space (not $L^2$/parity CSF blocks) and therefore cannot by itself isolate $L^2$ multiplets or label LS terms. However, within an identical $(h_{1e}, \text{eri})$ active space, its eigenvalues provide an **exact, independent, machine-precision cross-check** for the eigenvalues of our LS-coupled CI Hamiltonian!
- **Verdict:** **SELECTED as integral/radial-orbital substrate + independent FCI energy cross-check**, paired with our explicit exact second-quantized $(L^2, S^2, \Pi)$ CSF engine.

### 2.7 Existing ATOMS Mathematical Utilities
- **`src/numerics/specialFunctions/wigner.ts`:** Already implements exact doubled-integer log-factorial `wigner3j` and `wigner6j` (zero React/Three.js dependencies, verified in `transitionsSpectroscopy.test.ts` and `stabilization.test.ts`). **Reused directly** for TypeScript Clebsch–Gordan / Racah / LS coupling verification—no duplicate implementation created.
- **`src/physics/hf/configurations.ts`:** Validates explicit subshell occupations and separates curated ground vs Aufbau proposals without silently overwriting user occupations. Extended cleanly for LS configuration specs.

---

## 3. Comparative Solver Decision Matrix

| Candidate | Version / Commit | URL & Citation | License & Redistribution | Method | True LS-CSFs | Orbital Optimization | Multi-Root & Mixing | Domain | Compiler / Runtime | Benchmark Status | Integration Strategy | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ATSP2K (`ADLY_v2_0`)** | `ADLY_v2_0` (2007) | Mendeley `10.17632/yz5jgp2b94.1`; *CPC* 176 (2007) 559 | CPC Journal Licence (**No third-party redistribution**) | MCHF & BP CI (radial FD) | Yes | Yes (MCHF) | Yes | Multi-shell $s..f$ | Fortran (`gfortran 12` needs legacy flags; `lsgen.f` error) | `examples/output/e1` reference verified; interactive `C 3P` hit `NaN` | Cannot redistribute in repo/Docker | **Rejected for bundling**; literature ref only |
| **CompAS `atsp`** | `66689d9` | `github.com/compas/atsp` | MIT | Unstable dev MCHF/BP-CI | Yes | Yes (dev) | Yes | Unstable dev | Fortran 90/MPI | Upstream explicitly marks unstable | Explicitly disallowed by prompt §4.1 | **Rejected** |
| **CompAS `atsp-book`** | `26a2c5a` | `github.com/compas/atsp-book` | **No LICENSE file** | Teaching MCHF/CI | Yes | Yes | Limited (`NCD=100`) | Small teaching configs | F77 fixed arrays | Textbook companion (CPC 2000) | Unlicensed + static F77 dims | **Rejected** |
| **CompAS `spmchf`** | `d08a88f` | `github.com/compas/spmchf` | **No LICENSE file** | B-spline MCHF (WIP) | Yes | Yes | Partial | Light atoms | Fails `gfortran 12.3.0` | Does not compile | Broken + unlicensed | **Rejected** |
| **CompAS `sphf`** | `913991f` | `github.com/compas/sphf` | MIT | Single-config B-spline LS HF | Single-CSF term HF | Yes (1 config) | No (single config) | $s,p,d$ open shells | `gfortran 12.3.0` | Built & executed in v0.7.0 | Single-config LS HF limit benchmarks | **Benchmark ref** |
| **PySCF `2.15.1` FCI (`direct_spin1`)** | `2.15.1` | `github.com/pyscf/pyscf`; *JCP* 153 (2020) | Apache-2.0 | Determinant FCI/CASCI | **No** ($S_z$/optional $S^2$ only) | Orbital integrals only (fixed MOs) | Yes (determinant roots) | Active spaces matching GTO basis | Python + `libcint` (already deployed) | `<1e-10 Ha` cross-check vs LS-CI blocks | Active-space FCI energy cross-check | **Cross-check oracle** |
| **PySCF `AtomSphAverageRHF` + ATOMS Exact $(L^2,S^2,\Pi)$ LS-CSF CI** | PySCF `2.15.1` + ATOMS `0.7.1` | Local `science/ls_ci_backend.py` + `src/physics/ls/` | Apache-2.0 / BSD / ATOMS MIT | **Fixed-orbital LS-coupled multiconfiguration CI** | **Yes** (exact $L^2, S^2, \Pi$ projection in $|nlm_lm_s\rangle$) | **No** (fixed $SO(3)$ HF orbitals; MCHF deferred) | **Yes** (per-$LS\pi$ multi-root + weights) | Supported $Z=2..18$ + ions, $s/p/d$ active spaces | Python + NumPy/SciPy + `libcint` (zero new OS deps) | Matches PySCF `fci` to `<1e-10 Ha`, `L^2`/`S^2` var `<1e-12` | Primary Express + Python `/api/ls/*` engine | **SELECTED** |
| **ATOMS `wigner.ts`** | `0.6.0+` | `src/numerics/specialFunctions/wigner.ts` | ATOMS project | Exact 3-j & 6-j symbols | Helper | N/A | N/A | Integer & half-integer $j$ | TypeScript | Verified in Vitest suites | Reused for CG / Racah / TS checks | **REUSED** |

---

## 4. Scientific & Engineering Rationale for Selection

1. **Exact Symmetry Adaptation:** Unlike raw PySCF `FCI` (which only constrains $S_z$ and point-group irreps), constructing exact antisymmetrized $(L^2, S^2, L_z=L, S_z=S, \Pi)$ CSFs per configuration guarantees each CI matrix block belongs strictly to one $(L, S, \pi)$ sector and reports explicit $\langle L^2\rangle$, $\langle S^2\rangle$, and operator variances $\mathrm{Var}(L^2), \mathrm{Var}(S^2) < 10^{-12}$.
2. **Exact Independent Verification:** Because the CI Hamiltonian in a given configuration space is spanned in the exact `AtomSphAverageRHF` complex-spherical MO space using PySCF/`libcint` 1e/2e integrals, a full-valence or CAS CI across all configurations in an active space reproduces `pyscf.fci.direct_spin1` eigenvalues identically (`< 10^{-10}` Ha) while cleanly resolving degenerate multiplets ($^3P, ^1D, ^1S$, etc.) that determinant FCI mixes arbitrarily.
3. **Legal & Deployment Integrity:** Uses 100% permissive OSI-approved packages (`Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`) already installed in Render Docker (`Dockerfile`), requires zero `gfortran` binary redistribution, and avoids fragile F77 interactive stdin/scratch-file execution.
4. **Honest Nomenclature:** Every result and UI/API field explicitly states that radial orbitals are **fixed** $SO(3)$-symmetric HF orbitals (**Fixed-Orbital LS-Coupled CI**) and does **not** falsely claim MCHF radial optimization.
