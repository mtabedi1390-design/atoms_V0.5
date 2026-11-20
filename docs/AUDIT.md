# Audit — upstream `kavan010/Atoms` and the browser baseline

Upstream inspected at commit `5c4283a` (cloned during the first session, `/tmp/Atoms`).
Confirmed defects were fixed in this tree; suspected risks are listed separately.

## Confirmed defects (fixed)

| # | Upstream location | Defect | Fix / evidence |
|---|---|---|---|
| 1 | `atom_realtime.cpp` `sampleR`, `sampleTheta` | `static bool built` CDF cache never invalidated after n/l/m changes | `SamplerCache` keyed by model, Z_eff, n, l, m, basis, mix, occupancy, table id; regression test `cache keys differ…` |
| 2 | `sampleTheta` | recurrence called with signed m; negative-m θ-distributions wrong | `legendreP` uses \|m\| plus `P_l^{−m}` relation; tests vs closed forms + complex-basis KS test |
| 3 | same | sinθ Jacobian present (correct upstream) | kept exactly once; `θ` KS test |
| 4 | `sampleR` | inverse CDF returns a grid node (quantised r) | linear interpolation inside the bracketing bin |
| 5 | `calculateProbabilityFlow` | returned ħm/(m_e r sinθ) *velocity* with clamped sinθ, labelled as probability flow; y-polar axis | genuine `j = Im(ψ*∇ψ)`; numeric-vs-closed-form test; no clamping, j→0 on axis; z-polar used consistently |
| 6 | `random_device` seeding | non-reproducible sampling | seeded xoshiro128**; reproducibility test |
| 7 | per-particle sphere meshes | one `glDrawArrays` per particle | one `THREE.Points` draw per subshell; measured draw counts in telemetry/benchmark |
| 8 | `tgamma(n+l+1)` | overflow for high n+l | log-Γ everywhere; stability tests to n=25, l=19 |
| 9 | fixed `r_max = 10 n² a0` | uncontrolled truncation | `radialDomainForMass` expands until tail < 1e-8, else throws; high-n/l tests |
| 10 | — | radial probability written with a 4π where `R,Y` are separately normalised | documented `P_r = r²\|R\|²`; full-volume density uses R²/(4π); an introduced double-Jacobian was caught by tests and fixed |
| 11 | `atom.cpp` | Bohr-style 2-D animation presented alongside quantum visualisations | clearly separated in docs/model registry; not used as a quantum model |

## Suspected / not fixed

* Upstream `mesh.json` (425k lines) has unknown generation history and is unused here; not redistributed.
* Upstream pre-built Windows binaries were ignored and are not used.
* Native viewers (GLFW/GLEW) were absent from the workspace; their portability is unverified.

## Cross-implementation work

The mathematics now exists twice (`src/physics/*.ts`, `native/quantum_core.hpp`) and is compared on
1020 shared vectors via `scripts`/vitest parity (`src/physics/__tests__/native_parity.test.ts`).
This comparison already detected a negative-m phase bug in the native port, which was corrected.
Coordinate convention: **z is the polar axis** in every component of this tree; the browser and
native core agree, and the UI states it. The upstream +y convention was not retained because the
browser renderer, slicing and current vectors were already built on z.
