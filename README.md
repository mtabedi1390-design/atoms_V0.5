# ATOMS — Quantum Atomic-Orbital Workstation

Browser-based scientific workstation for quantum atomic orbitals of all 118 elements,
evolved from the quantum sampling code of [kavan010/Atoms](https://github.com/kavan010/Atoms)
(upstream commit `5c4283a`, audited and corrected) and extended with a shared C++ reference
core, a validated 118-element data layer, Web-Worker sampling, an imported offline
Hartree–Fock density pathway, and a Three.js/WebGL2 point renderer.

> **Baseline note (important).** The continuation directive refers to two ZIP archives
> (`atoms-quantum-workstation-evolution (1).zip`, larger, and the 280 KB reference). **Neither
> archive, any `.git` metadata, nor the upstream native viewer sources were present in this
> workspace.** The working tree contained only the browser workstation from the preceding
> session, so that tree — not a ZIP — is the baseline that was audited and extended here.
> Nothing was replaced by a scaffold. See `docs/VERIFICATION.md` for the workspace inventory.

## What is implemented

| Layer | Content |
|---|---|
| Physics core (TS + C++) | exact non-relativistic hydrogenic orbitals, associated Laguerre/Legendre with negative-m and Condon–Shortley conventions, real tesseral harmonics, radial/angular nodes, analytic energies/⟨r⟩, probability current, Slater screening, radial tail control |
| Atomic data | 118 typed records: Z, symbol, name, mass + convention, category/group/period/block, configuration + exceptions, ionization energy, covalent radius, per-field evidence class and source |
| Sampling | seeded xoshiro128**, parameter-keyed CDF cache, inverse-CDF with interpolation, occupation-weighted 4π spherical-average densities, imported HF-density sampling, cancellation/stale rejection, tail-mass diagnostics |
| Higher accuracy | **real PySCF 2.15.1 RHF/ROHF calculations** for H, He, C, N, O, Ne, exported as validated spherical radial densities with full provenance (`science/hf_export.py`, `src/data/hf/*.json`) |
| Rendering | one `THREE.Points` draw call per subshell, custom GLSL, density/sign/complex-phase/subshell colouring, shared cross-shell brightness normalisation, XY/XZ/YZ slab slicing, axes/grid, nucleus marker, probability-current field |
| UI | periodic table (search, keyboard navigation), mode/model/source selection, occupancy matrix with visibility/opacity, sampling and rendering controls, telemetry bar, P(r) plot, level diagram, method-selection/provenance inspector, responsive mobile drawers, WebGL2 fallback |
| Verification | 65 TypeScript tests, 340 C++ checks in Debug **and** Release, C++↔TS parity vectors, 12 Playwright scenarios, benchmark protocol |

## Quantum models — what is and is not claimed

**Model A — exact hydrogenic** for one electron in a Coulomb field. For Z > 1 the UI says
"one-electron ion": this is *not* the neutral atom. Point nucleus, infinite nuclear mass
(reduced-mass factor available), non-relativistic.

**Model B — Slater-screened hydrogenic estimate.** Z_eff from Slater's rules computed from the
validated configuration; hydrogenic radial shapes with Z_eff. An educational independent-electron
estimate, **not** Hartree–Fock/DFT, not a binding energy, and not an orbital eigenvalue. The
level diagram labels the energy surrogate and draws the experimental first ionization energy as a
separate quantity.

**Full-atom density** is the configuration average `ρ = Σ N_nl |R_nl|² / (4π)` (Unsöld). For
partially filled shells this is a uniform distribution over the 2l+1 magnetic states; that is an
explicit ensemble convention, not a claim about the physical ground state. Integrated electron
count is checked against the declared occupancy. Brightness uses a **shared** normalisation
constant across subshells in full-atom mode (absolute peaks are comparable); sample count is
allocated ∝ occupancy; single-orbital brightness is explicitly within-orbital.

**Imported HF density** for six benchmark atoms uses PySCF RHF/ROHF (aug-cc-pVTZ, point nucleus,
non-relativistic, no correlation). It is basis-set-limited (ΔE = 0.0002–0.0138 Ha vs numerical
HF limits) and ordinary Hartree–Fock is **not** a correlated many-electron wavefunction.

**Probability current** `j = (ħ/m_e) Im(ψ*∇ψ)` is implemented in atomic units and validated
against a numerical gradient. It is a current density, not a flow velocity, and is exactly zero
for real stationary orbitals and m = 0; the UI states this instead of animating fictitious motion.
Arrow length is normalised for visibility (direction only).

**Not implemented:** Hartree–Fock for arbitrary atoms in-browser, MCHF/MCDHF/RCI, Breit/QED,
X2C/Dirac–Coulomb, spin–orbit fine structure, transition rates, isosurfaces, WebAssembly. GRASP2018
was not installed, so the MCDHF provider is registered as **unavailable** with its blocker shown.
No relativistic or correlated result is ever substituted by the Slater estimate.

## Data provenance (summary)

* Configurations & first ionization energies: NIST Atomic Spectra Database ground-level table;
  Z ≥ 104 configurations are flagged `predicted`; unavailable ionization energies are `null`.
* Standard atomic weights: IUPAC/CIAAW 2021 abridged; synthetic elements display the mass number
  of the longest-lived isotope and are flagged as such (not a standard atomic weight).
* Covalent radii: Cordero et al., Dalton Trans. 2008 (Z ≤ 96); `null` where not tabulated.
  The archived variant's PubChem **van der Waals** radius is a different property and is not mixed
  with covalent radii.
* The table was **compiled/transcribed in this workspace** (the referenced generated pipeline and
  pinned snapshots were absent). Values and citations are documented per field in `docs/DATA.md`
  and enforced by integrity tests. Re-derive from pinned authoritative snapshots before publication.

## Commands

```bash
npm ci                  # reproducible install (manifest/lock verified in sync)
npm run typecheck       # strict TypeScript
npm test                # 65 vitest cases (analytic, KS α=0.001, data, providers, C++ parity)
npm run test:native     # CMake Debug + Release, ctest (340 always-active checks each)
npm run build           # single-file production bundle (worker inlined)
npm run test:browser    # 12 Playwright scenarios (SwiftShader; software rendering)
npm run bench           # writes docs/BENCHMARK.md (software by default)
npm run data:hf         # re-run the PySCF HF export (requires pyscf)
```

Native core only (no GLFW/GLEW needed):

```bash
cmake -S . -B build-core -DATOMS_BUILD_NATIVE_VIEWERS=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build-core --parallel
ctest --test-dir build-core --output-on-failure
```

The original GLFW/OpenGL viewers are not present in this snapshot and are not redistributed
(upstream has no license file). See `native/upstream/README.md`.

## Deployment

`vercel.json` is included (`framework: vite`, output `dist`, `npm ci`). No backend, no environment
variables, no paid services. Vercel steps: import the repository → framework Vite → build
`npm run build` → output `dist`; or `npx vercel --prod`. **No remote deployment was performed**
(no credentials in this environment).

## License / redistribution

The upstream repository has **no LICENSE file**. The numerical recurrences were re-implemented
from a reading of the source and are attributed; no upstream source files, `mesh.json`, `.exe`/`.dll`
binaries or native viewer sources are redistributed here. PySCF is Apache-2.0 (computed data and
provenance are bundled). Do not relicense upstream-derived material without the author's permission.
