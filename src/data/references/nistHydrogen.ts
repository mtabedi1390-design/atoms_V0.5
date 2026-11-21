/**
 * Typed accessors and consistency helpers for the NIST-anchored 1H I vacuum line table.
 * Anchors directly to the pinned 13.598434599702(12) eV H I ground-state ionization energy
 * in data/sources/nist_asd_ie.tsv.
 */
import nistLinesRaw from "./nistHydrogenLines.json";

export interface NistHydrogenLineReference {
  readonly id: string;
  readonly series: "lyman" | "balmer" | "paschen";
  readonly label: string;
  readonly lowerN: number;
  readonly upperN: number;
  readonly vacuumWavelength_nm: number;
  readonly photonEnergy_eV: number;
  readonly relativeOrder: string;
}

export interface NistHydrogenReferenceCatalog {
  readonly schema: string;
  readonly species: string;
  readonly Z: number;
  readonly A: number;
  readonly wavelengthConvention: "vacuum";
  readonly pinnedSourceFile: string;
  readonly pinnedGroundIonizationEnergy_eV: number;
  readonly pinnedGroundIonizationUncertainty_eV: number;
  readonly pinnedSourceBibRef: string;
  readonly provenanceNote: string;
  readonly lines: readonly NistHydrogenLineReference[];
}

export const NIST_HYDROGEN_LINES: NistHydrogenReferenceCatalog =
  nistLinesRaw as NistHydrogenReferenceCatalog;

export function getNistHydrogenLines(series?: "lyman" | "balmer" | "paschen"): readonly NistHydrogenLineReference[] {
  if (!series) return NIST_HYDROGEN_LINES.lines;
  return NIST_HYDROGEN_LINES.lines.filter((line) => line.series === series);
}
