/**
 * Electronic Configuration & Spin-Occupation Utilities for ATOMS v0.7.0.
 *
 * Explicitly separates:
 *  - Curated NIST ground-state subshell configurations (including d/f exceptions like Cr 3d5 4s1, Cu 3d10 4s1)
 *  - Standard Aufbau Madelung proposal (useful for cations/anions or baseline comparison)
 *  - Custom user-specified (n, l, alpha, beta) & spin multiplicity 2S
 *
 * Never silently modifies an invalid or unsupported occupation.
 */
import { elementByZ, type Subshell } from "@/data/elements";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import type { ValidationIssue, ValidationResult } from "@/domain/validation";
import { validationFromIssues } from "@/domain/validation";
import type { HFMethod, SubshellOccupation } from "./types";

const MADELUNG_ORDER: readonly { readonly n: number; readonly l: number }[] = (() => {
  const list: { n: number; l: number }[] = [];
  for (let n = 1; n <= 8; n++) {
    for (let l = 0; l < n && l <= 3; l++) {
      list.push({ n, l });
    }
  }
  list.sort((a, b) => (a.n + a.l) - (b.n + b.l) || a.n - b.n);
  return list;
})();

function hundSpinSplit(l: number, occ: number): { alpha: number; beta: number } {
  const maxPerSpin = 2 * l + 1;
  const alpha = Math.min(maxPerSpin, occ);
  const beta = Math.max(0, occ - alpha);
  return { alpha, beta };
}

/**
 * Generates an Aufbau spin-resolved subshell occupation for N electrons using Hund's rule.
 * Note: For neutral ground-state atoms with d/f anomalies (Cr, Cu, Mo, Pd, ...),
 * prefer `curatedGroundConfiguration(Z)`.
 */
export function proposeAufbauConfiguration(N: number): {
  readonly subshells: readonly SubshellOccupation[];
  readonly spin2S: number;
} {
  let remaining = Math.max(0, Math.round(N));
  const subshells: SubshellOccupation[] = [];
  let spin2S = 0;
  for (const nl of MADELUNG_ORDER) {
    if (remaining <= 0) break;
    const cap = 2 * (2 * nl.l + 1);
    const occ = Math.min(cap, remaining);
    remaining -= occ;
    const { alpha, beta } = hundSpinSplit(nl.l, occ);
    spin2S += alpha - beta;
    subshells.push({ n: nl.n, l: nl.l, alpha, beta });
  }
  return { subshells, spin2S };
}

/**
 * Converts a curated neutral-atom subshell table into spin-resolved occupations
 * using Hund's rule maximum multiplicity within open subshells.
 */
export function subshellsToSpinOccupations(subshells: readonly Subshell[]): {
  readonly subshells: readonly SubshellOccupation[];
  readonly spin2S: number;
} {
  const occupied = subshells.filter((s) => s.occupancy > 0);
  let spin2S = 0;
  const out: SubshellOccupation[] = occupied.map((s) => {
    const { alpha, beta } = hundSpinSplit(s.l, s.occupancy);
    spin2S += alpha - beta;
    return { n: s.n, l: s.l, alpha, beta };
  });
  return { subshells: out, spin2S };
}

/**
 * Proposes the default atomic/ionic spin-resolved electronic configuration:
 * - For neutral atoms (N === Z): uses ATOMS's curated NIST ground subshells (preserving Cr 3d5 4s1, Cu 3d10 4s1, etc.)
 * - For ions (N !== Z): falls back explicitly to Aufbau + Hund's rule proposal.
 */
export function proposeDefaultConfiguration(Z: number, N: number): {
  readonly source: "curated-ground" | "aufbau";
  readonly subshells: readonly SubshellOccupation[];
  readonly spin2S: number;
} {
  if (N === Z) {
    const rec = elementByZ(Z);
    const conv = subshellsToSpinOccupations(rec.subshells);
    return { source: "curated-ground", ...conv };
  }
  const auf = proposeAufbauConfiguration(N);
  return { source: "aufbau", ...auf };
}

export function validateSubshellOccupations(
  N: number,
  spin2S: number,
  subshells: readonly SubshellOccupation[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(N) || N < 1) {
    issues.push({
      severity: "error",
      code: "HF_INVALID_N",
      field: "N",
      message: `Electron count N must be an integer >= 1 (got ${N}).`,
    });
  }
  if (!Number.isInteger(spin2S) || spin2S < 0 || spin2S > N || (N - spin2S) % 2 !== 0) {
    issues.push({
      severity: "error",
      code: "HF_INVALID_SPIN",
      field: "spin2S",
      message: `Spin 2S=${spin2S} is incompatible with N=${N} electrons (must satisfy 0 <= 2S <= N and (N - 2S) even).`,
    });
  }

  let totalAlpha = 0;
  let totalBeta = 0;
  const seen = new Set<string>();
  for (let i = 0; i < subshells.length; i++) {
    const s = subshells[i];
    const key = `${s.n},${s.l}`;
    if (seen.has(key)) {
      issues.push({
        severity: "error",
        code: "HF_DUPLICATE_SUBSHELL",
        field: `subshells[${i}]`,
        message: `Duplicate subshell (${s.n}, l=${s.l}) in occupation specification.`,
      });
    }
    seen.add(key);

    if (!Number.isInteger(s.n) || s.n < 1 || !Number.isInteger(s.l) || s.l < 0 || s.l >= s.n) {
      issues.push({
        severity: "error",
        code: "HF_INVALID_NL",
        field: `subshells[${i}]`,
        message: `Subshell (n=${s.n}, l=${s.l}) violates 1 <= n and 0 <= l < n.`,
      });
    }
    const maxSpinOcc = 2 * s.l + 1;
    if (!Number.isInteger(s.alpha) || s.alpha < 0 || s.alpha > maxSpinOcc) {
      issues.push({
        severity: "error",
        code: "HF_INVALID_ALPHA_OCC",
        field: `subshells[${i}].alpha`,
        message: `Subshell ${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`} α occupation must be 0..${maxSpinOcc} (got ${s.alpha}).`,
      });
    }
    if (!Number.isInteger(s.beta) || s.beta < 0 || s.beta > maxSpinOcc) {
      issues.push({
        severity: "error",
        code: "HF_INVALID_BETA_OCC",
        field: `subshells[${i}].beta`,
        message: `Subshell ${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`} β occupation must be 0..${maxSpinOcc} (got ${s.beta}).`,
      });
    }
    totalAlpha += s.alpha;
    totalBeta += s.beta;
  }

  if (subshells.length > 0) {
    if (totalAlpha + totalBeta !== N) {
      issues.push({
        severity: "error",
        code: "HF_OCC_COUNT_MISMATCH",
        field: "subshells",
        message: `Subshell electrons α+β = ${totalAlpha + totalBeta} does not match system N = ${N}.`,
      });
    }
    if (totalAlpha - totalBeta !== spin2S) {
      issues.push({
        severity: "error",
        code: "HF_OCC_SPIN_MISMATCH",
        field: "spin2S",
        message: `Subshell spin excess α−β = ${totalAlpha - totalBeta} does not match 2S = ${spin2S}.`,
      });
    }
  }

  return validationFromIssues(issues);
}

export function validateMethodForSpin(method: HFMethod, spin2S: number, N?: number): ValidationResult {
  if (method === "rhf" && spin2S !== 0) {
    return validationFromIssues([
      {
        severity: "error",
        code: "RHF_OPEN_SHELL_FORBIDDEN",
        field: "method",
        message: `Closed-shell RHF requires singlet spin 2S = 0 (got 2S = ${spin2S}). Choose UHF, ROHF, or AtomSphAverageRHF.`,
      },
    ]);
  }
  if (method === "atom-sph-avg" && N !== undefined && N < 2) {
    return validationFromIssues([
      {
        severity: "error",
        code: "ATOM_SPH_AVG_REQUIRES_MULTI_ELECTRON",
        field: "method",
        message:
          "PySCF AtomSphAverageRHF is a spin-unpolarized fractional ensemble designed for N >= 2 atoms. Select UHF or ROHF for 1-electron systems.",
      },
    ]);
  }
  return validationFromIssues([]);
}

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function toSup(num: number): string {
  return String(num)
    .split("")
    .map((c) => SUPERSCRIPTS[c] ?? c)
    .join("");
}

export function formatSubshellConfiguration(subshells: readonly SubshellOccupation[]): string {
  return subshells
    .filter((s) => s.alpha + s.beta > 0)
    .map((s) => `${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`}${toSup(s.alpha + s.beta)}`)
    .join(" ");
}
