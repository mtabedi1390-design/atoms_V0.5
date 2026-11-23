/**
 * Strictly separated Quantum State Domain (ATOMS v0.6.0).
 *
 * Nonrelativistic (n, l, m_l, m_s) and Relativistic (n, kappa, j, m_j) states
 * are distinct discriminated union members and are never merged into one ambiguous shape.
 *
 * Zero dependency on React or Three.js.
 */
import type { AngularBasis } from "@/physics/hydrogenic";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import {
  formatSubshellConfiguration,
  validateMethodForSpin,
  validateSubshellOccupations,
  type HFBasisId,
  type HFMethod,
  type HFOccupationMode,
  type HFSCFOptions,
  type HFVolumeGridSpec,
  type SubshellOccupation,
} from "@/physics/hf";
import { assertValid, validationFromIssues, type ValidationIssue, type ValidationResult } from "../validation";

export interface NonRelativisticState {
  readonly kind: "nonrelativistic";
  readonly n: number;
  readonly l: number;
  readonly m_l: number;
  readonly m_s: -0.5 | 0.5;
  readonly basis: AngularBasis;
}

export interface RelativisticState {
  readonly kind: "relativistic";
  readonly n: number;
  /** Relativistic spin-orbit quantum number kappa in Z \ {0}: -1 (s1/2), +1 (p1/2), -2 (p3/2), ... */
  readonly kappa: number;
  /** Total angular momentum j = |kappa| - 1/2. */
  readonly j: number;
  /** Total magnetic projection m_j in {-j, -j+1, ..., +j}. */
  readonly m_j: number;
}

export interface SuperpositionTerm {
  readonly state: NonRelativisticState | RelativisticState;
  readonly amplitude: { readonly re: number; readonly im: number };
}

export interface SuperpositionState {
  readonly kind: "superposition";
  readonly basisKind: "nonrelativistic" | "relativistic";
  readonly terms: readonly SuperpositionTerm[];
}

export interface ConfigurationAverageState {
  readonly kind: "configuration-average";
  readonly Z: number;
  readonly densitySource: "dirac-fock" | "hf" | "model";
  readonly focusSubshell?: { readonly n: number; readonly l: number };
}

export interface MultiElectronHFState {
  readonly kind: "multi-electron-hf";
  readonly N: number;
  readonly method: HFMethod;
  readonly basis: HFBasisId;
  readonly occupationMode: HFOccupationMode;
  readonly spin2S: number;
  readonly subshellOccupations: readonly SubshellOccupation[];
  readonly useSymmetry: boolean;
  readonly scfOptions?: HFSCFOptions;
  readonly volumeGrid?: HFVolumeGridSpec;
}

export type QuantumState =
  | NonRelativisticState
  | RelativisticState
  | SuperpositionState
  | ConfigurationAverageState
  | MultiElectronHFState;

export interface TransitionPair<TState extends NonRelativisticState | RelativisticState = NonRelativisticState | RelativisticState> {
  readonly initial: TState;
  readonly final: TState;
}

/** Orbital angular momentum l corresponding to Dirac quantum number kappa. */
export function lFromKappa(kappa: number): number {
  if (!Number.isInteger(kappa) || kappa === 0) {
    throw new RangeError(`kappa must be a non-zero integer (got ${kappa})`);
  }
  return kappa < 0 ? -kappa - 1 : kappa;
}

/** Orbital angular momentum l_small of the small radial Dirac component Q (corresponding to -kappa). */
export function lSmallFromKappa(kappa: number): number {
  return lFromKappa(-kappa);
}

/** Total angular momentum j = |kappa| - 1/2. */
export function jFromKappa(kappa: number): number {
  if (!Number.isInteger(kappa) || kappa === 0) {
    throw new RangeError(`kappa must be a non-zero integer (got ${kappa})`);
  }
  return Math.abs(kappa) - 0.5;
}

/** Parity (-1)^l of a Dirac state with quantum number kappa. */
export function parityFromKappa(kappa: number): 1 | -1 {
  return lFromKappa(kappa) % 2 === 0 ? 1 : -1;
}

/** Inverse mapping from (l, j) to Dirac kappa: j = l + 1/2 -> -(l+1), j = l - 1/2 -> +l. */
export function kappaFromLJ(l: number, j: number): number {
  if (!Number.isInteger(l) || l < 0) {
    throw new RangeError(`l must be a non-negative integer (got ${l})`);
  }
  if (Math.abs(j - (l + 0.5)) < 1e-9) return -(l + 1);
  if (l >= 1 && Math.abs(j - (l - 0.5)) < 1e-9) return l;
  throw new RangeError(`Invalid relativistic coupling (l=${l}, j=${j}): j must be l ± 1/2 with j >= 1/2`);
}

export function createNonRelativisticState(params: {
  n: number;
  l: number;
  m_l: number;
  m_s?: -0.5 | 0.5;
  basis?: AngularBasis;
}): NonRelativisticState {
  const s: NonRelativisticState = {
    kind: "nonrelativistic",
    n: params.n,
    l: params.l,
    m_l: params.m_l,
    m_s: params.m_s ?? 0.5,
    basis: params.basis ?? "complex",
  };
  assertValid(validateNonRelativisticState(s), "createNonRelativisticState");
  return s;
}

export function createRelativisticState(params: {
  n: number;
  kappa: number;
  m_j: number;
  j?: number;
}): RelativisticState {
  const derivedJ = Number.isInteger(params.kappa) && params.kappa !== 0 ? jFromKappa(params.kappa) : NaN;
  const s: RelativisticState = {
    kind: "relativistic",
    n: params.n,
    kappa: params.kappa,
    j: params.j ?? derivedJ,
    m_j: params.m_j,
  };
  assertValid(validateRelativisticState(s), "createRelativisticState");
  return s;
}

export function validateNonRelativisticState(s: NonRelativisticState): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(s.n) || s.n < 1) {
    issues.push({ severity: "error", code: "NR_INVALID_N", field: "n", message: `n must be an integer >= 1 (got ${s.n})` });
  }
  if (!Number.isInteger(s.l) || s.l < 0 || (Number.isInteger(s.n) && s.l >= s.n)) {
    issues.push({ severity: "error", code: "NR_INVALID_L", field: "l", message: `l must satisfy 0 <= l < n (got n=${s.n}, l=${s.l})` });
  }
  if (!Number.isInteger(s.m_l) || Math.abs(s.m_l) > s.l) {
    issues.push({ severity: "error", code: "NR_INVALID_ML", field: "m_l", message: `m_l must satisfy |m_l| <= l (got l=${s.l}, m_l=${s.m_l})` });
  }
  if (s.m_s !== 0.5 && s.m_s !== -0.5) {
    issues.push({ severity: "error", code: "NR_INVALID_MS", field: "m_s", message: `m_s must be +1/2 or -1/2 (got ${s.m_s})` });
  }
  return validationFromIssues(issues);
}

export function createMultiElectronHFState(
  params: Omit<MultiElectronHFState, "kind">,
): MultiElectronHFState {
  const s: MultiElectronHFState = { kind: "multi-electron-hf", ...params };
  assertValid(validateMultiElectronHFState(s), "createMultiElectronHFState");
  return s;
}

export function validateRelativisticState(s: RelativisticState): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(s.n) || s.n < 1) {
    issues.push({ severity: "error", code: "DIRAC_INVALID_N", field: "n", message: `n must be an integer >= 1 (got ${s.n})` });
  }
  if (!Number.isInteger(s.kappa) || s.kappa === 0) {
    issues.push({ severity: "error", code: "DIRAC_INVALID_KAPPA", field: "kappa", message: `kappa must be a non-zero integer (got ${s.kappa})` });
  } else {
    const l = lFromKappa(s.kappa);
    const expectedJ = jFromKappa(s.kappa);
    if (Number.isInteger(s.n) && l >= s.n) {
      issues.push({
        severity: "error",
        code: "DIRAC_KAPPA_EXCEEDS_N",
        field: "kappa",
        message: `kappa=${s.kappa} implies l=${l}, violating l < n (n=${s.n}). For n=1 only kappa=-1 (1s1/2) exists.`,
      });
    }
    if (Math.abs(s.j - expectedJ) > 1e-9) {
      issues.push({
        severity: "error",
        code: "DIRAC_J_MISMATCH",
        field: "j",
        message: `kappa=${s.kappa} requires j=${expectedJ}, got j=${s.j}.`,
      });
    }
    const twoMj = Math.round(2 * s.m_j);
    if (Math.abs(2 * s.m_j - twoMj) > 1e-9 || Math.abs(twoMj) % 2 !== 1 || Math.abs(s.m_j) > expectedJ + 1e-9) {
      issues.push({
        severity: "error",
        code: "DIRAC_INVALID_MJ",
        field: "m_j",
        message: `m_j must be a half-integer in [-${expectedJ}, +${expectedJ}] (got ${s.m_j}).`,
      });
    }
  }
  return validationFromIssues(issues);
}

export function validateSuperpositionState(s: SuperpositionState): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (s.terms.length === 0) {
    issues.push({ severity: "error", code: "EMPTY_SUPERPOSITION", field: "terms", message: "Superposition must contain at least one basis state." });
    return validationFromIssues(issues);
  }
  let normSq = 0;
  for (let i = 0; i < s.terms.length; i++) {
    const t = s.terms[i];
    if (t.state.kind !== s.basisKind) {
      issues.push({
        severity: "error",
        code: "MIXED_SUPERPOSITION_BASIS",
        field: `terms[${i}]`,
        message: `Term ${i} has kind "${t.state.kind}" inside "${s.basisKind}" superposition.`,
      });
    }
    const inner = t.state.kind === "nonrelativistic" ? validateNonRelativisticState(t.state) : validateRelativisticState(t.state);
    issues.push(...inner.issues);
    normSq += t.amplitude.re * t.amplitude.re + t.amplitude.im * t.amplitude.im;
  }
  if (!(normSq > 0)) {
    issues.push({ severity: "error", code: "ZERO_NORM_SUPERPOSITION", field: "terms", message: "Superposition norm squared must be > 0." });
  } else if (Math.abs(normSq - 1) > 1e-6) {
    issues.push({ severity: "warning", code: "UNNORMALIZED_SUPERPOSITION", field: "terms", message: `Superposition sum |c_i|^2 = ${normSq.toFixed(6)} != 1.` });
  }
  return validationFromIssues(issues);
}

export function validateMultiElectronHFState(s: MultiElectronHFState): ValidationResult {
  const occVal = validateSubshellOccupations(s.N, s.spin2S, s.subshellOccupations);
  const methodVal = validateMethodForSpin(s.method, s.spin2S, s.N);
  const issues = [...occVal.issues, ...methodVal.issues];
  if (s.scfOptions?.maxCycle !== undefined && (s.scfOptions.maxCycle < 1 || s.scfOptions.maxCycle > 300)) {
    issues.push({
      severity: "error",
      code: "HF_INVALID_MAX_CYCLE",
      field: "scfOptions.maxCycle",
      message: `maxCycle must be between 1 and 300 (got ${s.scfOptions.maxCycle}).`,
    });
  }
  return validationFromIssues(issues);
}

export function validateQuantumState(s: QuantumState): ValidationResult {
  switch (s.kind) {
    case "nonrelativistic":
      return validateNonRelativisticState(s);
    case "relativistic":
      return validateRelativisticState(s);
    case "superposition":
      return validateSuperpositionState(s);
    case "configuration-average":
      return validationFromIssues(
        Number.isInteger(s.Z) && s.Z >= 1 && s.Z <= 118
          ? []
          : [{ severity: "error", code: "INVALID_Z", field: "Z", message: `Z must be in 1..118 (got ${s.Z})` }],
      );
    case "multi-electron-hf":
      return validateMultiElectronHFState(s);
  }
}

export function formatHalfInt(x: number): string {
  const num = Math.round(2 * x);
  return `${num > 0 ? "+" : ""}${num}/2`;
}

export function formatQuantumStateLabel(s: QuantumState): string {
  switch (s.kind) {
    case "nonrelativistic": {
      const sub = `${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`}`;
      const spin = s.m_s > 0 ? "↑" : "↓";
      return `${sub} (m_l=${s.m_l}, ${spin}, ${s.basis})`;
    }
    case "relativistic": {
      const l = lFromKappa(s.kappa);
      const sub = `${s.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}`;
      const twoJ = Math.round(2 * s.j);
      return `${sub}_${twoJ}/2 (κ=${s.kappa}, m_j=${formatHalfInt(s.m_j)})`;
    }
    case "superposition":
      return `${s.basisKind} superposition (${s.terms.length} terms)`;
    case "configuration-average":
      return `Z=${s.Z} config-avg (${s.densitySource})`;
    case "multi-electron-hf": {
      const cfg = formatSubshellConfiguration(s.subshellOccupations);
      return `${s.method.toUpperCase()}/${s.basis} (${cfg || `N=${s.N}`}, 2S=${s.spin2S})`;
    }
  }
}
