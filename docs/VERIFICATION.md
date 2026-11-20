# Verification record

Date: 2026-11-19 · Workspace: `/home/user/sandbox` · No `.git` metadata present.

## Workspace / baseline inventory

* **Continuation ZIPs absent.** `find` located neither `atoms-quantum-workstation-evolution (1).zip`
  nor the 280 KB reference archive; therefore the "larger archive" could not be used as a literal
  baseline. The authoritative tree used is the browser workstation present in the workspace
  (created in the preceding session from upstream `kavan010/Atoms`, commit `5c4283a`), now extended.
* Also absent: upstream native viewer sources, `src/quantum/quantum_core.hpp`, `src/data/elements.generated.json`,
  pinned data snapshots, the earlier C++/TS comparison vectors, and the prior Playwright suite.
  These were replaced by independently written, tested equivalents (see file list); nothing was
  fabricated as if it came from the archives.
* No Git repository: no branch/commit history exists for this tree. The upstream commit used for the
  audit was `5c4283a` (cloned separately during the first session).

## Commands actually executed (final run)

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | clean install from lockfile; `@types/node@22.19.17` declared in `package.json` **and** lockfile |
| `npm run typecheck` | 0 | strict TypeScript clean |
| `npm test` | 0 | **5 files / 65 tests passed** |
| `npm run test:native` | 0 | CMake Debug **and** Release built; CTest 100% passed each (1/1); **340 always-active checks** per configuration |
| `npm run build` | 0 | `dist/index.html` **918.93 kB**, gzip **258.45 kB**, single file; inline worker confirmed |
| `npm run test:browser` | 0 | **12 Playwright scenarios passed** (29.0 s, Chromium 131 headless, SwiftShader) |
| `npx vite preview --port 4181` | HTTP 200 | title `ATOMS — Quantum Atomic-Orbital Workstation`, 918 933 bytes, all assets inlined |

Native test-failure proof: one known check was temporarily inverted; `ctest` returned **exit 8**
(1 test failed) and the fault was reverted before the final run above.

### Native environment

`g++ 12.2.0`; `cmake`/`ctest` **4.4.5** (installed via pip because the apt repository lacked the
package). `ATOMS_BUILD_NATIVE_VIEWERS=OFF`. Native viewer build **not attempted**: the viewer
sources are absent and GLFW3/GLEW are not installed. CMake emits an explicit diagnostic if the
option is enabled. `libGL` etc. were not needed for the verified core.

## Unit/integration coverage (65 tests)

* special functions vs closed forms; Condon–Shortley; `P_l^{−m}` relation
* radial normalisation & analytic ⟨r⟩ for 30 (n,l,Z) cases; 1s/2s/2p closed forms
* full ψ normalisation; angular |Y|², real tesseral orthogonality; Y_l^{−m} conjugation
* radial/angular node counts and positions; stability to n=25, l=19
* energies (Z, n); probability current closed form vs numerical gradient; j=0 for m=0/real/axis
* **radial tail control** (tail ≤ 1e-8) for n up to 20 and l up to 19; impossible tolerance rejected
* **electron-density normalisation** (volume density uses R²/(4π), Jacobian counted once): closed
  shell Ne 2p⁶ = 6 e; open-shell C 2p² = 2 e; fractional 1.5 e; cross-shell shared-max convention
* KS tests α = 0.001: radial (1s,2s,3d,4f,2p Z=6), θ including Jacobian (2p m=0, 3d m=±2),
  uniform complex φ, real p_x φ ∝ cos²φ; HF-density radial KS
* deterministic seeds, cache-key invalidation (model/Z_eff/n/l/m/basis/mix/occupancy/table),
  cancellation, occupancy scaling, tabulated-density mismatch rejection (0.5 % tolerance)
* 118-element integrity, configurations/exceptions, Pauli capacity, provenance/evidence classes,
  Slater textbook Z_eff
* provider registry: HF data schema, monotonic non-negative grids, independent electron count,
  variational HF energy vs reference, unavailable heavy-atom total energy/fine structure, GRASP blocker
* **C++ ↔ TypeScript parity on 1020 shared vectors** (radial, energies, ⟨r⟩, real harmonics, current)

## Higher-accuracy pathway (really executed)

`python3 science/hf_export.py` → PySCF **2.15.1** (Apache-2.0), RHF/ROHF, aug-cc-pVTZ, point nucleus,
non-relativistic, no correlation. Actual output:

| atom | term | method | E (Ha) | numerical HF limit (Ha) | ΔE (Ha) | ∫4πr²ρdr (e) |
|---|---|---|---|---|---|---|
| H | ²S | ROHF | −0.49982118 | −0.5 | +0.00018 | 1.00011 |
| He | ¹S | RHF | −2.86118343 | −2.8616799956 | +0.00050 | 2.00022 |
| C | ³P | ROHF | −37.68683674 | −37.6886189594 | +0.00178 | 6.00053 |
| N | ⁴S | ROHF | −54.39760952 | −54.4009342052 | +0.00332 | 7.00077 |
| O | ³P | ROHF | −74.80650839 | −74.8093984657 | +0.00289 | 8.00112 |
| Ne | ¹S | RHF | −128.53327283 | −128.5470981090 | +0.01383 | 10.00110 |

Data are bundled as `atoms.hf-radial.v1` and sampled in the browser for the full-atom view; the
inspector shows engine/version/basis/convergence/basis error/reference. The browser **refuses** a
tabulated table whose integral differs from the expected electron count by > 0.5 %.

Not run: GRASP2018 / MCDHF / RCI / Breit / QED / X2C / Dirac–Coulomb / spin–orbit. The GRASP
provider is registered unavailable with a concrete blocker; no results are fabricated.

## Renderer verification & benchmark

Hardware acceleration **not available**. Benchmarks use ANGLE/SwiftShader software rasterisation;
they are reported separately and are **not** evidence of GPU performance.

Environment: Linux 6.1.189+ x64, headless Chromium 131.0.6778.33, viewport 1440×900, DPR 1,
renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`.
Protocol: fixed workloads (`adaptive=0`), 4 s warm-up, six FPS samples at 700 ms, median.

| mode | Z | samples | points | median FPS | sampling ms | upload ms |
|---|---|---|---|---|---|---|
| single | 1 | 25 000 | 25 000 | 21 | 54 | 4.2 |
| single | 1 | 75 000 | 75 000 | 11 | 98 | 2.6 |
| single | 1 | 150 000 | 150 000 | 5 | 114 | 4.7 |
| single | 1 | 300 000 | 300 000 | 2 | 228 | 27.1 |
| atom | 10 | 75 000 | 75 000 | 10 | 70 | 0.5 |
| atom | 10 | 150 000 | 150 000 | 3 | 110 | 1.0 |
| atom | 10 | 300 000 | 300 000 | 2 | 163 | 18.8 |

Full report: `docs/BENCHMARK.md`. Real-GPU benchmark: **not executed** (no GPU);
`ATOMS_BENCH_GPU=hardware npm run bench` is provided for a workstation.

## Browser scenarios (all passed)

ground-state boot + WebGL2 + radial panel + zero console errors · 118-element search + keyboard
navigation · negative-m complex basis · XY/XZ/YZ slices with offsets · rapid element changes
(no stale results) · open-shell C full density ∫ρ = 6.000 e · imported HF Ne density + inspector
validation (∫ρ ≈ 10 e, aug-cc-pVTZ) · unavailable HF/MCDHF limitations for Fe · visibility/opacity
controls · honest probability-current message · WebGL2 fallback keeps analytical panels · mobile
390 px drawers, search and no page-level horizontal overflow.

## Deployment

`vercel.json` validated: framework `vite`, install `npm ci`, build `npm run build`, output `dist`.
Production preview served HTTP 200 with the worker inlined as a Blob and PySCF JSON bundled.
**Not deployed**: no credentials/permissions available. No environment variables required.

## Licence / redistribution

Upstream `kavan010/Atoms` has **no LICENSE file**. No upstream source, `mesh.json`, binaries, or
viewer sources are redistributed in this tree; the mathematics was re-implemented and attributed.
PySCF is Apache-2.0. Bundled HF JSON is generated data with provenance. The project makes no licence
claim over upstream-derived material; public release requires upstream permission.

## Remaining gaps and blockers

1. Baseline ZIPs and Git history absent → cannot verify "based on the larger archive" beyond the tree.
2. Native viewers absent + GLFW/GLEW unavailable → viewer build unverified (core verified).
3. Data compiled/transcribed rather than regenerated from pinned snapshots; re-verify against live
   NIST/CIAAW/Cordero sources before publication.
4. No hardware GPU → 60 FPS target unmeasured; software numbers only.
5. No GRASP/MCDHF and no heavy-atom relativistic pathway; registered unavailable.
6. HF covers six light atoms as total spherical density only; no subshell-resolved orbitals, no
   correlation (not HF for arbitrary Z in browser).
7. Isosurfaces, transition rates and fine structure are not implemented.
