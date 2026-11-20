/**
 * Machine-readable 118-element x observable x method coverage matrix for ATOMS v0.5.0.
 * Consumed by the UI Inspector, data-integrity tests, and docs/ACCURACY_MATRIX.md.
 */
import { ELEMENTS, type ElementRecord } from "@/data/elements";
import { HF_ATOMS } from "./providers";

export type MatrixStatus =
  | "validated/computed"
  | "evaluated"
  | "approximate"
  | "predicted"
  | "not-available";

export interface CoverageCell {
  readonly status: MatrixStatus;
  readonly method: string;
}

export interface ElementCoverageRow {
  readonly Z: number;
  readonly symbol: string;
  readonly name: string;
  readonly configuration: CoverageCell;
  readonly groundTerm: CoverageCell;
  readonly ionizationEnergy: CoverageCell;
  readonly totalDensityDF: CoverageCell;
  readonly totalDensityHF: CoverageCell;
  readonly subshellOrbitals: CoverageCell;
  readonly relativisticTreatment: CoverageCell;
  readonly referenceValidation: CoverageCell;
}

const HF_SET = new Set<number>(HF_ATOMS);

export function elementCoverage(e: ElementRecord): ElementCoverageRow {
  const hasHF = HF_SET.has(e.Z);
  return {
    Z: e.Z,
    symbol: e.symbol,
    name: e.name,
    configuration: {
      status: e.configuration.evidence === "predicted" ? "predicted" : "evaluated",
      method: e.configuration.evidence === "predicted" ? "Relativistic prediction" : "NIST ASD",
    },
    groundTerm: {
      status:
        e.groundTerm.evidence === "unavailable"
          ? "not-available"
          : e.groundTerm.evidence === "predicted"
            ? "predicted"
            : "evaluated",
      method: e.groundTerm.value ?? "unavailable",
    },
    ionizationEnergy: {
      status:
        e.ionizationEnergy_eV.evidence === "unavailable"
          ? "not-available"
          : e.ionizationEnergy_eV.evidence === "predicted"
            ? "predicted"
            : "evaluated",
      method:
        e.ionizationEnergy_eV.value === null
          ? "unavailable"
          : `${e.ionizationEnergy_eV.value} eV (NIST)`,
    },
    totalDensityDF: {
      status: "validated/computed",
      method: e.Z === 1 ? "Exact Dirac 1s (DP)" : "Lobato 2026 Dirac-Fock (DP)",
    },
    totalDensityHF: hasHF
      ? { status: "validated/computed", method: "PySCF RHF/ROHF aug-cc-pVTZ" }
      : { status: "not-available", method: "Not bundled for Z" },
    subshellOrbitals:
      e.Z === 1
        ? { status: "validated/computed", method: "Exact 1-e- hydrogenic (analytic)" }
        : { status: "approximate", method: "Slater Z_eff (qualitative only)" },
    relativisticTreatment: {
      status: "validated/computed",
      method: "Total rho(r) Dirac-Fock only; spin-orbit R_nlj unavailable",
    },
    referenceValidation: hasHF
      ? { status: "validated/computed", method: "DF charge + PySCF HF limit" }
      : { status: "validated/computed", method: "DF charge & positivity checks" },
  };
}

export const COVERAGE_MATRIX: readonly ElementCoverageRow[] = ELEMENTS.map(elementCoverage);

export function coverageForZ(Z: number): ElementCoverageRow {
  const row = COVERAGE_MATRIX[Z - 1];
  if (!row || row.Z !== Z) throw new RangeError(`No coverage entry for Z=${Z}`);
  return row;
}
