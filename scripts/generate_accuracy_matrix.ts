import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COVERAGE_MATRIX, type MatrixStatus } from "../src/science/coverageMatrix";

function countStatus(
  getter: (r: (typeof COVERAGE_MATRIX)[number]) => MatrixStatus,
): Record<MatrixStatus, number> {
  const counts: Record<MatrixStatus, number> = {
    "validated/computed": 0,
    evaluated: 0,
    approximate: 0,
    predicted: 0,
    "not-available": 0,
  };
  for (const row of COVERAGE_MATRIX) {
    counts[getter(row)]++;
  }
  return counts;
}

const cfgCounts = countStatus((r) => r.configuration.status);
const termCounts = countStatus((r) => r.groundTerm.status);
const ieCounts = countStatus((r) => r.ionizationEnergy.status);
const dfCounts = countStatus((r) => r.totalDensityDF.status);
const hfCounts = countStatus((r) => r.totalDensityHF.status);
const orbCounts = countStatus((r) => r.subshellOrbitals.status);

const lines: string[] = [
  "# ATOMS v0.5.0 — 118-Element Scientific Coverage & Accuracy Matrix",
  "",
  "Generated deterministically by `npm run data:matrix` (`scripts/generate_accuracy_matrix.ts`) from `src/science/coverageMatrix.ts`.",
  "",
  "## Summary Counts (Z = 1..118)",
  "",
  "| Observable / Property | validated/computed | evaluated | approximate | predicted | not-available | Notes |",
  "|---|---:|---:|---:|---:|---:|---|",
  `| Ground configuration | ${cfgCounts["validated/computed"]} | ${cfgCounts.evaluated} | ${cfgCounts.approximate} | ${cfgCounts.predicted} | ${cfgCounts["not-available"]} | NIST ASD Z=1..103; literature predictions Z=104..118 |`,
  `| Ground term & J | ${termCounts["validated/computed"]} | ${termCounts.evaluated} | ${termCounts.approximate} | ${termCounts.predicted} | ${termCounts["not-available"]} | Pinned NIST ASD Z=1..108 (104..108 predicted); Z=109..118 null |`,
  `| 1st Ionization Energy | ${ieCounts["validated/computed"]} | ${ieCounts.evaluated} | ${ieCounts.approximate} | ${ieCounts.predicted} | ${ieCounts["not-available"]} | NIST ASD Z=1..108 (H, Pa, Fm, Md, 104..108 marked); Z=109..118 null |`,
  `| Total ρ(r) — Dirac–Fock | ${dfCounts["validated/computed"]} | ${dfCounts.evaluated} | ${dfCounts.approximate} | ${dfCounts.predicted} | ${dfCounts["not-available"]} | Lobato et al. (2026) finite-nucleus B-spline Dirac–Fock (` + "`atomx`" + `); Z=1 exact Dirac 1s |`,
  `| Total ρ(r) — PySCF HF | ${hfCounts["validated/computed"]} | ${hfCounts.evaluated} | ${hfCounts.approximate} | ${hfCounts.predicted} | ${hfCounts["not-available"]} | Bundled aug-cc-pVTZ RHF/ROHF for Z ∈ {1, 2, 6, 7, 8, 10} |`,
  `| Subshell orbitals R_nl(r) | ${orbCounts["validated/computed"]} | ${orbCounts.evaluated} | ${orbCounts.approximate} | ${orbCounts.predicted} | ${orbCounts["not-available"]} | Exact 1-e⁻ only for H/ions; Slater Z_eff qualitative estimate for neutral multi-electron atoms |`,
  "",
  "## Method & Literature Boundary Matrix",
  "",
  "| Provider / Dataset | Z Coverage | N (e⁻) Coverage | Observables Provided | Evidence Class | Explicit Limitations / Blockers |",
  "|---|---|---|---|---|---|",
  "| Lobato et al. (2026) Dirac–Padé (`lobato2026-df`) | Z = 1..118 | Neutral (N = Z) | Total spherical density ρ(r) | `computed-and-validated` | Total density only; no subshell R_nl(r), no orbital ε_i, spherical avg for open shells |",
  "| PySCF RHF/ROHF (`pyscf-hf`) | Z ∈ {1,2,6,7,8,10} | Neutral (N = Z) | Total spherical ρ(r), E_HF | `computed-basis-limited` | Non-relativistic, no electron correlation, aug-cc-pVTZ basis |",
  "| Model A Hydrogenic (`hydrogenic-exact`) | Z = 1..118 (ions) | N = 1 only | Exact ψ_nlm, E_n, ⟨r⟩, j | `analytic-exact-within-stated-Hamiltonian` | One-electron H or bare-nucleus X^(Z-1)+ ion only; non-relativistic point nucleus |",
  "| Model B Slater (`browser-slater`) | Z = 2..118 | Independent e⁻ | Qualitative subshell R_nl, Z_eff | `qualitative-approximation` | Empirical screening rules; n* ≥ 7 extrapolated; non-relativistic |",
  "| NIST ASD IE & Ground Levels | Z = 1..108 | Neutral (N = Z) | Config, term/J, 1st IE | `evaluated` / `predicted` | Z = 109..118 absent from ASD IE query (flagged `unavailable`) |",
  "| Datatoms 2026 MCDF (`datatoms-2026-mcdf`) | Z = 1..118 | **1 ≤ N ≤ 10 only** | Levels/lines (not neutral Z>10) | `unavailable` (neutral Z>10) | External dataset scoped strictly to H-like through Ne-like ions (`N ≤ 10`) |",
  "| GRASP2018 MCDHF/RCI (`grasp-mcdhf`) | — | — | Spin-orbit R_nlj, fine structure | `unavailable` | GRASP2018 not installed/bundled; never silently substituted |",
  "",
  "## Per-Element Coverage (Z = 1..118)",
  "",
  "| Z | Sym | Name | Config | Ground Term | 1st IE (NIST) | Total ρ(r) DF | Total ρ(r) HF | Subshell Orbitals | Relativistic / Validation |",
  "|---:|:---:|---|---|---|---|---|---|---|---|",
];

for (const r of COVERAGE_MATRIX) {
  lines.push(
    `| ${r.Z} | ${r.symbol} | ${r.name} | ${r.configuration.status} (${r.configuration.method}) | ${r.groundTerm.status} (${r.groundTerm.method}) | ${r.ionizationEnergy.status} (${r.ionizationEnergy.method}) | ${r.totalDensityDF.status} | ${r.totalDensityHF.status} | ${r.subshellOrbitals.status} (${r.subshellOrbitals.method}) | ${r.referenceValidation.method} |`,
  );
}

lines.push("");
const outPath = resolve(process.cwd(), "docs/ACCURACY_MATRIX.md");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${COVERAGE_MATRIX.length} rows to ${outPath}`);
