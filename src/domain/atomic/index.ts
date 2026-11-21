/**
 * General solver-independent Atomic System domain (ATOMS v0.6.0).
 *
 * Supports:
 *  - Neutral atoms (N = Z, q = 0)
 *  - Positive ions (N < Z, q > 0)
 *  - Negative ions (N > Z, q < 0) — representable without artificial N <= Z gate
 *  - Isotopes & nuclear charge models
 *
 * Zero dependency on React or Three.js.
 */
import { elementByZ, type ElementRecord } from "@/data/elements";
import { EXTENDED_CONSTANTS, reducedMassRatioFromNuclearU } from "@/physics/units";
import { validationFromIssues, assertValid, type ValidationIssue, type ValidationResult } from "../validation";

export interface AtomicSpecies {
  readonly Z: number;
  readonly symbol: string;
  readonly name: string;
  readonly elementRecord: ElementRecord;
}

export interface IsotopeSpec {
  readonly Z: number;
  readonly massNumber: number;
  readonly label: string;
  /** Bare nuclear mass in atomic mass units (u) — used for reduced-mass μ = m_e M_nuc / (m_e + M_nuc). */
  readonly nuclearMass_u: number;
  /** Neutral atom mass in atomic mass units (u), distinct from bare nuclear mass by Z*m_e - B_e/c^2. */
  readonly neutralAtomicMass_u: number;
  readonly source: string;
  readonly isExactNuclearMass: boolean;
}

export type NuclearModel =
  | { readonly kind: "point-infinite-mass" }
  | { readonly kind: "point-finite-mass"; readonly nuclearMass_u: number; readonly source: string }
  | { readonly kind: "finite-uniform"; readonly rmsRadius_fm: number; readonly nuclearMass_u: number }
  | { readonly kind: "finite-fermi"; readonly rmsRadius_fm: number; readonly skinThickness_fm: number; readonly nuclearMass_u: number };

export interface AtomicSystem {
  readonly id: string;
  readonly species: AtomicSpecies;
  readonly Z: number;
  readonly N: number;
  /** Net electric charge q = Z - N (in elementary charge units e). */
  readonly q: number;
  readonly isotope: IsotopeSpec;
  readonly nuclearModel: NuclearModel;
  /** mu / m_e for this system & nuclear model (1 for point-infinite-mass). */
  readonly reducedMassRatio: number;
}

interface CuratedIsotopeEntry {
  massNumber: number;
  nuclearMass_u: number;
  neutralAtomicMass_u: number;
  source: string;
  default?: boolean;
}

/**
 * Curated bare nuclear masses (CODATA 2018 for p, d, alpha; AME2020 atomic mass minus Z*m_e
 * without binding correction flagged via source where applicable) paired with neutral atomic masses.
 */
const CURATED_ISOTOPES: Record<number, readonly CuratedIsotopeEntry[]> = {
  1: [
    { massNumber: 1, nuclearMass_u: EXTENDED_CONSTANTS.m_p_u, neutralAtomicMass_u: 1.00782503223, source: "CODATA 2018 proton mass", default: true },
    { massNumber: 2, nuclearMass_u: EXTENDED_CONSTANTS.m_d_u, neutralAtomicMass_u: 2.01410177811, source: "CODATA 2018 deuteron mass" },
    { massNumber: 3, nuclearMass_u: 3.01550071621, neutralAtomicMass_u: 3.01604928199, source: "CODATA 2018 triton mass" },
  ],
  2: [
    { massNumber: 3, nuclearMass_u: 3.014932247175, neutralAtomicMass_u: 3.01602932265, source: "CODATA 2018 helion mass" },
    { massNumber: 4, nuclearMass_u: EXTENDED_CONSTANTS.m_alpha_u, neutralAtomicMass_u: 4.00260325413, source: "CODATA 2018 alpha particle mass", default: true },
  ],
  3: [
    { massNumber: 6, nuclearMass_u: 6.0151228874 - 3 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 6.0151228874, source: "AME2020 neutral mass - 3 m_e" },
    { massNumber: 7, nuclearMass_u: 7.0160034366 - 3 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 7.0160034366, source: "AME2020 neutral mass - 3 m_e", default: true },
  ],
  6: [
    { massNumber: 12, nuclearMass_u: 12 - 6 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 12.0, source: "12C IUPAC definition - 6 m_e", default: true },
    { massNumber: 13, nuclearMass_u: 13.00335483507 - 6 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 13.00335483507, source: "AME2020 - 6 m_e" },
  ],
  7: [{ massNumber: 14, nuclearMass_u: 14.00307400443 - 7 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 14.00307400443, source: "AME2020 - 7 m_e", default: true }],
  8: [{ massNumber: 16, nuclearMass_u: 15.99491461957 - 8 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 15.99491461957, source: "AME2020 - 8 m_e", default: true }],
  10: [{ massNumber: 20, nuclearMass_u: 19.9924401762 - 10 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 19.9924401762, source: "AME2020 - 10 m_e", default: true }],
  26: [{ massNumber: 56, nuclearMass_u: 55.9349363 - 26 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 55.9349363, source: "AME2020 - 26 m_e", default: true }],
  79: [{ massNumber: 197, nuclearMass_u: 196.9665687 - 79 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 196.9665687, source: "AME2020 - 79 m_e", default: true }],
  92: [{ massNumber: 238, nuclearMass_u: 238.0507884 - 92 * EXTENDED_CONSTANTS.m_e_u, neutralAtomicMass_u: 238.0507884, source: "AME2020 - 92 m_e", default: true }],
};

export function speciesForZ(Z: number): AtomicSpecies {
  const el = elementByZ(Z);
  return { Z, symbol: el.symbol, name: el.name, elementRecord: el };
}

export function listIsotopesForZ(Z: number): IsotopeSpec[] {
  const el = elementByZ(Z);
  const curated = CURATED_ISOTOPES[Z];
  if (curated) {
    return curated.map((c) => ({
      Z,
      massNumber: c.massNumber,
      label: `${c.massNumber}${el.symbol}`,
      nuclearMass_u: c.nuclearMass_u,
      neutralAtomicMass_u: c.neutralAtomicMass_u,
      source: c.source,
      isExactNuclearMass: Z <= 2,
    }));
  }
  const approxA = Math.round(el.mass.value);
  const approxNuclearU = Math.max(0.5, el.mass.value - Z * EXTENDED_CONSTANTS.m_e_u);
  return [
    {
      Z,
      massNumber: approxA,
      label: `${approxA}${el.symbol}`,
      nuclearMass_u: approxNuclearU,
      neutralAtomicMass_u: el.mass.value,
      source: `${el.mass.source} (neutral atomic mass - Z*m_e approximation)`,
      isExactNuclearMass: false,
    },
  ];
}

export function defaultIsotopeForZ(Z: number, massNumber?: number): IsotopeSpec {
  const list = listIsotopesForZ(Z);
  if (massNumber !== undefined) {
    const found = list.find((iso) => iso.massNumber === massNumber);
    if (found) return found;
    const el = elementByZ(Z);
    return {
      Z,
      massNumber,
      label: `${massNumber}${el.symbol}`,
      nuclearMass_u: Math.max(0.5, massNumber - Z * EXTENDED_CONSTANTS.m_e_u),
      neutralAtomicMass_u: massNumber,
      source: "User-specified mass number A (approx nuclear mass A - Z*m_e)",
      isExactNuclearMass: false,
    };
  }
  const curated = CURATED_ISOTOPES[Z];
  if (curated) {
    const idx = curated.findIndex((c) => c.default);
    if (idx >= 0) return list[idx];
  }
  return list[0];
}

/** Build a NuclearModel bound explicitly to the isotope's bare nuclear mass (never neutral atomic mass). */
export function createNuclearModelForIsotope(
  kind: NuclearModel["kind"],
  isotope: IsotopeSpec,
  finiteOpts?: { readonly rmsRadius_fm: number; readonly skinThickness_fm?: number },
): NuclearModel {
  switch (kind) {
    case "point-infinite-mass":
      return { kind: "point-infinite-mass" };
    case "point-finite-mass":
      return { kind: "point-finite-mass", nuclearMass_u: isotope.nuclearMass_u, source: isotope.source };
    case "finite-uniform":
      return {
        kind: "finite-uniform",
        rmsRadius_fm: finiteOpts?.rmsRadius_fm ?? 0.8414,
        nuclearMass_u: isotope.nuclearMass_u,
      };
    case "finite-fermi":
      return {
        kind: "finite-fermi",
        rmsRadius_fm: finiteOpts?.rmsRadius_fm ?? 5.5,
        skinThickness_fm: finiteOpts?.skinThickness_fm ?? 2.3,
        nuclearMass_u: isotope.nuclearMass_u,
      };
  }
}

export function computeReducedMassRatio(model: NuclearModel): number {
  switch (model.kind) {
    case "point-infinite-mass":
      return 1;
    case "point-finite-mass":
    case "finite-uniform":
    case "finite-fermi":
      return model.nuclearMass_u ? reducedMassRatioFromNuclearU(model.nuclearMass_u) : 1;
  }
}

export interface CreateAtomicSystemOptions {
  readonly Z: number;
  /** Number of bound/system electrons; defaults to neutral (N = Z). May exceed Z for negative ions. */
  readonly N?: number;
  readonly massNumber?: number;
  readonly nuclearModel?: NuclearModel;
}

export function createAtomicSystem(opts: CreateAtomicSystemOptions): AtomicSystem {
  const Z = opts.Z;
  const N = opts.N ?? Z;
  const species = speciesForZ(Z);
  const isotope = defaultIsotopeForZ(Z, opts.massNumber);
  const nuclearModel: NuclearModel = opts.nuclearModel ?? { kind: "point-infinite-mass" };
  const q = Z - N;
  const sys: AtomicSystem = {
    id: `${isotope.label}:Z=${Z}:N=${N}:q=${q >= 0 ? `+${q}` : q}:${nuclearModel.kind}`,
    species,
    Z,
    N,
    q,
    isotope,
    nuclearModel,
    reducedMassRatio: computeReducedMassRatio(nuclearModel),
  };
  assertValid(validateAtomicSystem(sys), "createAtomicSystem");
  return sys;
}

export function validateAtomicSystem(sys: AtomicSystem): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(sys.Z) || sys.Z < 1 || sys.Z > 118) {
    issues.push({
      severity: "error",
      code: "INVALID_Z",
      field: "Z",
      message: `Atomic number Z must be an integer in 1..118 (got ${sys.Z}).`,
    });
  }
  if (!Number.isInteger(sys.N) || sys.N < 0) {
    issues.push({
      severity: "error",
      code: "INVALID_N",
      field: "N",
      message: `Electron count N must be a non-negative integer (got ${sys.N}).`,
    });
  }
  if (sys.q !== sys.Z - sys.N) {
    issues.push({
      severity: "error",
      code: "CHARGE_MISMATCH",
      field: "q",
      message: `Charge relation q = Z - N violated: q=${sys.q}, Z-N=${sys.Z - sys.N}.`,
    });
  }
  if (!(sys.isotope.nuclearMass_u > 0) || !Number.isFinite(sys.isotope.nuclearMass_u)) {
    issues.push({
      severity: "error",
      code: "INVALID_NUCLEAR_MASS",
      field: "isotope.nuclearMass_u",
      message: `Nuclear mass must be finite and > 0 u (got ${sys.isotope.nuclearMass_u}).`,
    });
  }
  if (sys.nuclearModel.kind !== "point-infinite-mass") {
    if (!(sys.nuclearModel.nuclearMass_u > 0) || !Number.isFinite(sys.nuclearModel.nuclearMass_u)) {
      issues.push({
        severity: "error",
        code: "INVALID_NUCLEAR_MODEL_MASS",
        field: "nuclearModel.nuclearMass_u",
        message: `Nuclear model requires bare nuclear mass > 0 u (got ${sys.nuclearModel.nuclearMass_u}).`,
      });
    } else if (Math.abs(sys.nuclearModel.nuclearMass_u - sys.isotope.neutralAtomicMass_u) < 1e-7 && Math.abs(sys.isotope.neutralAtomicMass_u - sys.isotope.nuclearMass_u) > 1e-4) {
      issues.push({
        severity: "warning",
        code: "NEUTRAL_ATOMIC_MASS_USED_FOR_NUCLEUS",
        field: "nuclearModel.nuclearMass_u",
        message: `nuclearModel.nuclearMass_u (${sys.nuclearModel.nuclearMass_u} u) matches neutral atomic mass rather than bare nuclear mass (${sys.isotope.nuclearMass_u} u).`,
      });
    }
  }
  if (sys.nuclearModel.kind === "finite-uniform" || sys.nuclearModel.kind === "finite-fermi") {
    if (!(sys.nuclearModel.rmsRadius_fm > 0) || !Number.isFinite(sys.nuclearModel.rmsRadius_fm)) {
      issues.push({
        severity: "error",
        code: "INVALID_NUCLEAR_RADIUS",
        field: "nuclearModel.rmsRadius_fm",
        message: `Finite nuclear RMS radius must be > 0 fm.`,
      });
    }
    if (sys.nuclearModel.kind === "finite-fermi" && !(sys.nuclearModel.skinThickness_fm >= 0)) {
      issues.push({
        severity: "error",
        code: "INVALID_FERMI_SKIN",
        field: "nuclearModel.skinThickness_fm",
        message: `Fermi nuclear skin thickness must be >= 0 fm.`,
      });
    }
  }
  if (sys.N === 0) {
    issues.push({
      severity: "warning",
      code: "BARE_NUCLEUS",
      field: "N",
      message: "Bare nucleus (N = 0): no bound electronic states.",
    });
  } else if (sys.q < 0) {
    issues.push({
      severity: "info",
      code: "NEGATIVE_ION",
      field: "q",
      message: `Negative ion (${formatIonLabel(sys)}, q = ${sys.q}e): binding requires correlated or experimental affinity data; one-electron and mean-field HF/DF providers do not automatically bind anions.`,
    });
  }
  return validationFromIssues(issues);
}

export function formatChargeSuffix(q: number): string {
  if (q === 0) return "";
  if (q === 1) return "⁺";
  if (q === -1) return "⁻";
  return q > 0 ? `${q}+` : `${Math.abs(q)}−`;
}

export function formatIonLabel(sys: Pick<AtomicSystem, "species" | "q" | "isotope">, withMassNumber = false): string {
  const base = withMassNumber ? sys.isotope.label : sys.species.symbol;
  return `${base}${formatChargeSuffix(sys.q)}`;
}
