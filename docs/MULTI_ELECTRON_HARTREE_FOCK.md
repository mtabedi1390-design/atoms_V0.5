# Multi-Electron Hartree–Fock Engine (`ATOMS v0.7.0`)

This document describes the physical model, formalism distinctions (`RHF`, `UHF`, `ROHF`, `AtomSphAverageRHF`), Express + Python process boundary, and execution lifecycle of ATOMS' live multi-electron Hartree–Fock implementation.

---

## 1. Physical Hamiltonian and Nuclear Approximation

ATOMS v0.7.0 solves the nonrelativistic clamped-nucleus $N$-electron Schrödinger Hamiltonian in Hartree atomic units ($\hbar = m_e = e = 4\pi\varepsilon_0 = 1$):

$$\hat{H} = \sum_{i=1}^{N}\left(-\frac{1}{2}\nabla_i^2 - \frac{Z}{r_i}\right) + \sum_{1 \le i < j \le N}\frac{1}{r_{ij}}$$

- **Zero nuclear-repulsion term**: For a single isolated atom or atomic ion, $V_{NN} = 0$.
- **Strict Nuclear-Model Boundary**: Multi-electron HF calculations run strictly under **`point-infinite-mass`** (clamped point nucleus, infinite nuclear mass).
  - *Why?* Unlike a 2-body hydrogenic atom ($N=1$), a naive $m_e \to \mu$ scaling omits the **mass-polarization** cross term $\frac{1}{M_{\text{nuc}}}\sum_{i<j}\mathbf{p}_i\cdot\mathbf{p}_j$ of the full nuclear recoil operator. ATOMS therefore never silently injects hydrogenic reduced-mass corrections into $N$-electron HF, and `pyscfLiveProvider.supports()` explicitly rejects `point-finite-mass`, `finite-uniform`, and `finite-fermi` for multi-electron HF.

---

## 2. Independent Supported HF Formalisms

Each formalism is exposed, validated, and labelled separately in both `pyscfLiveProvider` (`src/physics/providers/hartreeFock/index.ts`) and `HartreeFockWorkspace.tsx`:

| Method ID | PySCF Solver | State Character (`stateInfo.stateCharacter`) | Spin & Angular-Momentum Diagnostics | Validated Domain & Caveats |
|---|---|---|---|---|
| `rhf` | `scf.RHF` | `closed-shell-determinant` | Spin-pure (`<S^2> = 0`), closed-shell determinant; `<L^2>` unavailable (`null`). | Strict closed-shell singlet (`2S = 0`); disabled if `2S !== 0`. |
| `uhf` | `scf.UHF` | `unrestricted-determinant` | Reports `<S^2>`, `S(S+1)`, and spin contamination `<S^2> - S(S+1)`; `<L^2>` unavailable (`null`). | Allows $\psi_i^\alpha \ne \psi_i^\beta$; may break spatial or spin symmetry on open shells. |
| `rohf` | `scf.ROHF` | `restricted-open-shell-determinant` | Spin-pure (`<S^2> = S(S+1)`), shared spatial MOs; `<L^2>` unavailable (`null`). | Single real-orbital determinant under PySCF `SO3`; **not automatically an $L^2$ eigenstate or term-resolved $^{2S+1}L$ state**. Returns both effective eigenvalues and Koopmans diagonals `<i|Fa|i>`, `<i|Fb|i>`. |
| `atom-sph-avg` | `pyscf.scf.atom_hf.AtomSphAverageRHF` | `spherical-ensemble-average` | **`spinDiagnostics.available = false`** (`sSquared = null`, `multiplicity = null`); 110-pt Lebedev isotropy `~2e-15`; `<L^2>` unavailable (`null`). | Spin-unpolarized ($N_\alpha = N_\beta$) fractional shell ensemble for $N \ge 2$ in `C1`. ATOMS explicitly sets `mf.atomic_configuration` for ions (`C+`) and curated ground atoms (`Cr 3d5 4s1`). Distinct from term-resolved HF. |
| *(unavailable)* | — | *(not implemented in `v0.7.0`)* | `termResolution.supported = false`, `termSymbol = null`, `totalJ = null` | Multi-determinant $LS$ term coupling ($^{2S+1}L$) and relativistic $J$ coupling are explicitly unavailable and never fabricated from $(Z, N, 2S)$ or 1e densities. |

> **Important Distinction on `ROHF` Orbital Energies (`Li`, `C`, `N`, etc.):**
> In PySCF `ROHF`, the effective Roothaan Fock eigenvalues (`mo_energy`) govern orbital optimization (`Li 1s: -2.477798 Ha` vs `compas/sphf -2.477751 Ha`), while for singly occupied open-shell orbitals the physical ionization-potential / Koopmans orbital expectation is the $\alpha$-Fock diagonal $\langle i | \hat{F}^\alpha | i \rangle$ (`Li 2s <Fa> = -0.196313 Ha` vs `compas/sphf -0.196323 Ha`). ATOMS returns and displays **both** `energy_Ha` and `fockAlpha_Ha` / `fockBeta_Ha` cleanly.

---

## 3. Atomic Occupations, `SO(3)` Caveats, and Angular Diagnostics

Users choose among three explicit occupation sources (`occupationMode`), never silently overridden:

1. **`curated-ground`**: Neutral ground configurations & ground-term Hund spin multiplicities $2S$ across $Z = 1..118$ (`src/physics/hf/configurations.ts`, e.g., Cr `[Ar] 3d5 4s1` `2S=6`, Cu `[Ar] 3d10 4s1` `2S=1`).
2. **`aufbau`**: Standard Madelung Aufbau + Hund rule ordering for arbitrary neutral or ionic electron counts $N$.
3. **`custom`**: Direct user editing of per-subshell $(\alpha, \beta)$ counts up to subshell degeneracy $(2l+1)$ per spin.

When `useSymmetry = true` (`RHF`/`UHF`/`ROHF`), `science/hf_backend.py` builds a `gto.Mole(symmetry="SO3")` and converts explicit subshell $(n, l, \alpha, \beta)$ counts into PySCF real-harmonic `SO(3)` irrep strings (`s+0`, `p-1`, `p+0`, `p+1`, `d-2`..`d+2`, `f-3`..`f+3`).
- `equallyOccupiedSubshellSplitMax_Ha`: measures splitting within equally occupied degenerate sublevels (`< 1.5e-14 Ha` in `C, N, Cr`).
- `angularDiagnostics` (110-pt Lebedev quadrature): separates genuinely isotropic systems (`atom-sph-avg` ~`2e-15`, half-filled `Li, N, Cr` ~`1e-13..1e-15`) from oriented open-shell determinants (`B, C, O, F` relative anisotropy `0.50..1.72`).

---

## 4. Execution Modes, Runtime Architecture, Security, & Lifecycle

```text
Full Local Scientific Mode:
Browser UI (HartreeFockWorkspace) -> GET /api/hf/capabilities
   ▼
ExperimentRunner -> experiment.worker.ts (AbortSignal + stale guard)
   ▼
createHttpHFTransport() -> POST /api/hf/calculate (Express 5 server.ts, 127.0.0.1 default)
   ▼  (90s timeout + Host/Origin 403 guard + SIGTERM->SIGKILL child cleanup)
.venv/bin/python science/hf_backend.py (PySCF 2.15.1 + libcint + BSE 0.12)
```

- **Full Local Scientific Mode**: Bound to **`127.0.0.1` by default** (override via `--host` / `ATOMS_HOST` for managed containers). Cross-origin `/api/hf/*` requests are rejected with HTTP `403 FORBIDDEN_ORIGIN` (no wildcard CORS). `SIGINT`/`SIGTERM` cleanly reaps all spawned Python children, closes Vite, and shuts down the HTTP server; `EADDRINUSE` reports socket/owner diagnostics without killing unrelated processes.
- **Static / Viewer Mode**: Serving `dist/index.html` without Express/Python causes `/api/hf/capabilities` to return non-JSON (`text/html`) or connection failure; the UI enters **backend offline** state and disables live HF runs cleanly rather than fabricating calculations.
- **Input & Abort Safeguards**: Request JSON limited to `1mb`; `Z, N, method, basis, convTol, maxCycle` validated; client abort triggers immediate `SIGTERM -> SIGKILL` termination of the Python subprocess.
