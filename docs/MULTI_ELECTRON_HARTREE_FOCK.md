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

| Method ID | PySCF Solver | Spin Restriction | Density Matrix Convention | Validated Domain & Caveats |
|---|---|---|---|---|
| `rhf` | `scf.RHF` | **Closed-shell singlet strictly (`2S = 0`)**; disabled if `2S !== 0` | Spin-summed $P_{\mu\nu} = 2\sum_{i\in\text{occ}} C_{\mu i} C_{\nu i}$ | Exact variational restricted single determinant for singlet ground/closed-shell ions ($\text{He}, \text{Be}, \text{Ne}, \text{Li}^+$). |
| `uhf` | `scf.UHF` | Unrestricted ($\psi_i^\alpha \ne \psi_i^\beta$) | Separate $P^\alpha_{\mu\nu}, P^\beta_{\mu\nu}$, total $P = P^\alpha + P^\beta$, spin $P_s = P^\alpha - P^\beta$ | Supports open-shell atoms, cations, anions, and `H` ($N=1$). Exposes $\langle S^2 \rangle$, $S(S+1)$, and spin contamination $\Delta = \langle S^2 \rangle - S(S+1)$. |
| `rohf` | `scf.ROHF` | Spin-restricted shared spatial MOs (`N_alpha >= N_beta`) | $P = P^\alpha + P^\beta$, exact spin eigenfunction ($\langle S^2 \rangle = S(S+1)$) | Uses PySCF's Roothaan effective closed/open Fock operator (`Fc = 0.5*(Fa+Fb)` on closed-closed/virtual blocks). Individual `<i|Fa|i>` and `<i|Fb|i>` Koopmans diagonals are returned alongside effective `energy_Ha`! |
| `atom-sph-avg` | `pyscf.scf.atom_hf.AtomSphAverageRHF` | Fractional spherically averaged atomic RHF | Spin-averaged over degenerate $(2l+1)$ angular momentum shells (runs in `C1`, zero spin density) | Produces true spherically symmetric reference densities (`S(S+1)` unpolarized), distinct from term-specific UHF/ROHF. |

> **Important Distinction on `ROHF` Orbital Energies (`Li`, `C`, `N`, etc.):**
> In PySCF `ROHF`, the effective Roothaan Fock eigenvalues (`mo_energy`) govern orbital optimization and satisfy closed-shell Koopmans closely (`Li 1s: -2.477798 Ha` vs `compas/sphf -2.477751 Ha`), while for singly occupied open-shell orbitals the physical ionization-potential / Koopmans orbital expectation is the $\alpha$-Fock diagonal $\langle i | \hat{F}^\alpha | i \rangle$ (`Li 2s <Fa> = -0.196313 Ha` vs `compas/sphf -0.196323 Ha`). ATOMS returns and displays **both** `energy_Ha` and `fockAlpha_Ha` / `fockBeta_Ha` cleanly.

---

## 3. Atomic Occupations & Symmetry Mapping

Users choose among three explicit occupation sources (`occupationMode`), never silently overridden:

1. **`curated-ground`**: Neutral ground configurations & ground-term Hund spin multiplicities $2S$ across $Z = 1..118$ (`src/physics/hf/configurations.ts`, e.g., Cr `[Ar] 3d5 4s1` `2S=6`, Cu `[Ar] 3d10 4s1` `2S=1`).
2. **`aufbau`**: Standard Madelung Aufbau + Hund rule ordering for arbitrary neutral or ionic electron counts $N$.
3. **`custom`**: Direct user editing of per-subshell $(\alpha, \beta)$ counts up to subshell degeneracy $(2l+1)$ per spin.

When `useSymmetry = true` (`RHF`/`UHF`/`ROHF`), `science/hf_backend.py` builds a `gto.Mole(symmetry="SO3")` and converts explicit subshell $(n, l, \alpha, \beta)$ counts into PySCF `SO(3)` irrep strings (`s+0`, `p-1`, `p+0`, `p+1`, `d-2`..`d+2`, `f-3`..`f+3`) with explicit integer totals `{irrep: alpha+beta}` for `RHF` or `(alpha, beta)` tuples for `UHF`/`ROHF`.

---

## 4. Runtime Architecture, Security, Cancellation, and Offline Behavior

```text
Browser UI (HartreeFockWorkspace)
   │  probe / capabilities -> main thread GET /api/hf/capabilities
   ▼
ExperimentRunner ──► experiment.worker.ts (Web Worker, blob: origin safe)
   │  AbortSignal + runSequence stale-result guard
   ▼
createHttpHFTransport() ──► POST /api/hf/calculate (Express 5 server.ts, localhost)
   │  180s timeout + client disconnect / AbortSignal kills child via SIGTERM -> SIGKILL
   ▼
/opt/atoms-py/bin/python science/hf_backend.py (PySCF 2.15.1 + libcint + BSE 0.12)
```

### Key Operational Safeguards
- **Localhost-Only / No Cloud Dependency**: Calculation executes strictly inside the user's local Node + Python runtime (`/opt/atoms-py/bin/python` or `ATOMS_PYTHON` env var). Zero data leaves localhost.
- **Input Bounding (`server.ts`)**: Request JSON body limited to `256kb`; `Z`, `N`, `method`, `basis`, `convTol`, `maxCycle` validated before spawning Python.
- **Blob-Worker Origin Fix (`src/physics/hf/transport.ts`)**: Resolves `blob:http(s)://...` Worker origins back to the HTTP host origin so `ExperimentWorkerClient` executes PySCF calculations cleanly inside Vite single-file inline Workers (`?worker&inline`).
- **Real Cancellation**: Calling `cancelExecution(executionId)` triggers the browser `AbortController`, closes the HTTP socket, and causes `server.ts` (`req.on("aborted")` / `res.on("close")` while `!res.writableFinished`) to send `SIGTERM` immediately to the Python worker process.
- **Offline Integrity**: When `/api/hf/capabilities` returns HTTP 503 or non-JSON (static bundle without Express server), ATOMS disables HF submission cleanly and displays *"Live Multi-Electron Solver Unavailable — ATOMS never fabricates or simulates HF results offline."*
