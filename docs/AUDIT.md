# Audit — Upstream `kavan010/Atoms` and `v0.5.0` Fixes

Upstream inspected at commit `5c4283a`. Confirmed defects from the initial port and newly identified `v0.5.0` workstation defects are recorded below.

## Confirmed Defects Fixed in Initial Port

| # | Upstream location | Defect | Fix / evidence |
|---|---|---|---|
| 1 | `atom_realtime.cpp` `sampleR`, `sampleTheta` | `static bool built` CDF cache never invalidated after `n/l/m` changes | `SamplerCache` keyed by model, `Z_eff`, `n`, `l`, `m`, basis, mix, occupancy, table id; regression test `cache keys differ…` |
| 2 | `sampleTheta` | recurrence called with signed `m`; negative-`m` $\theta$-distributions wrong | `legendreP` uses `|m|` plus $P_l^{-m}$ relation; tests vs closed forms + complex-basis KS test |
| 3 | same | $\sin\theta$ Jacobian present (correct upstream) | kept exactly once; $\theta$ KS test |
| 4 | `sampleR` | inverse CDF returns a grid node (quantised `r`) | linear interpolation inside the bracketing bin |
| 5 | `calculateProbabilityFlow` | returned $\hbar m/(m_e r \sin\theta)$ velocity with clamped $\sin\theta$, labelled as probability flow; `y`-polar axis | genuine $\mathbf{j} = \operatorname{Im}(\psi^*\nabla\psi)$; numeric-vs-closed-form test; no clamping, $\mathbf{j}\to 0$ on axis; `z`-polar used consistently |
| 6 | `random_device` seeding | non-reproducible sampling | seeded `xoshiro128**`; reproducibility test |
| 7 | per-particle sphere meshes | one `glDrawArrays` per particle | one `THREE.Points` draw per subshell; measured draw counts in telemetry/benchmark |
| 8 | `tgamma(n+l+1)` | overflow for high `n+l` | log-$\Gamma$ everywhere; stability tests to `n=25, l=19` |
| 9 | fixed `r_max = 10 n² a0` | uncontrolled truncation | `radialDomainForMass` expands until tail `< 1e-8`, else throws; high-`n/l` tests |
| 10 | — | radial probability written with a $4\pi$ where $R,Y$ are separately normalised | documented $P_r = r^2|R|^2$; full-volume density uses $R^2/(4\pi)$ |
| 11 | `atom.cpp` | Bohr-style 2-D animation presented alongside quantum visualisations | clearly separated in docs/model registry; not used as a quantum model |

## Additional Bugs Discovered & Fixed in `v0.5.0`

| # | Location | Defect | Fix / evidence |
|---|---|---|---|
| 12 | `src/render/OrbitalScene.ts` (`setLayer`) | `L.ownMax` initialized to `1` and never updated from `data.maxDensity` | Set `L.ownMax = data.maxDensity` on upload so single-orbital and single-layer total-density clouds normalize to their actual peak density |
| 13 | `src/App.tsx` (sampling effect) | Clearing `peaks` / `electronTotals` unconditionally while skipping unchanged `lastParams` dropped electron-count telemetry when layers remained cached | Delete cached `peaks`/`electronTotals` only for invalidated or removed layer keys; compute aggregate `electrons` cleanly across cached + fresh layers |
| 14 | `src/components/RadialPlot.tsx` & `TelemetryBar.tsx` | Full-atom total-density modes (PySCF HF and Dirac–Fock) previously plotted a single Slater subshell $P_r(r)$ and single-orbital $\langle r\rangle$ / node count alongside the many-electron 3D cloud | Added dedicated $4\pi r^2\rho(r)$ total radial density plot mode and `total ρ(r)` / numeric $\langle r \rangle$ telemetry state |
| 15 | `src/App.tsx` & `ControlRail.tsx` | Wavefunction sign/phase color modes (`phase-real`, `phase-complex`) remained selectable or active in Full-Atom / total-density modes | Guarded incompatible color-mode options and enforced `colorMode = "density"` in `effectiveRender` |

## Cross-Implementation Parity

The mathematics exists in both `src/physics/*.ts` and `native/quantum_core.hpp`, verified across 1,020 shared vectors via `src/physics/__tests__/native_parity.test.ts` (`z` is the polar axis consistently across TS, C++, WebGL2 shaders, and probability-current vectors).
