/**
 * Centralized physical constants registry and typed unit conversions for ATOMS v0.6.0.
 * Preserves the pinned CODATA 2018 values from `@/physics/constants` so all v0.5
 * hydrogenic and C++17 reference parity vectors remain bit-exact.
 */
import { CODATA_2018, CONSTANTS, reducedMassRatio, type ConstantsDataset } from "./constants";

export { CODATA_2018, CONSTANTS, reducedMassRatio };
export type { ConstantsDataset };

export const CONSTANTS_VERSION = "CODATA-2018" as const;
export type ConstantsVersion = typeof CONSTANTS_VERSION;

/** Exact SI & CODATA 2018 derived constants used across relativistic and spectroscopy modules. */
export const EXTENDED_CONSTANTS = {
  version: CONSTANTS_VERSION,
  source: CODATA_2018.url,
  /** Speed of light in vacuum (m/s, exact SI). */
  c_m_s: 299792458,
  /** Elementary charge (C, exact SI). */
  e_C: 1.602176634e-19,
  /** Planck constant h (J*s, exact SI). */
  h_Js: 6.62607015e-34,
  /** Reduced Planck constant hbar (J*s). */
  hbar_Js: CODATA_2018.hbar_Js,
  /** Vacuum electric permittivity epsilon_0 (F/m, CODATA 2018). */
  epsilon0_Fm: 8.8541878128e-12,
  /** Electron rest mass energy m_e c^2 in eV (CODATA 2018). */
  m_e_c2_eV: 510998.95000,
  /** Electron rest mass energy m_e c^2 in Hartree (= 1 / alpha^2 in atomic units). */
  m_e_c2_Ha: 1 / (CODATA_2018.alpha * CODATA_2018.alpha),
  /** Electron mass in atomic mass units (u, CODATA 2018). */
  m_e_u: 5.48579909065e-4,
  /** Proton mass in atomic mass units (u, CODATA 2018). */
  m_p_u: 1.007276466621,
  /** Deuteron mass in atomic mass units (u, CODATA 2018). */
  m_d_u: 2.013553212745,
  /** Alpha particle (4He nucleus) mass in u (CODATA 2018). */
  m_alpha_u: 4.001506179127,
  /** Fine-structure constant alpha. */
  alpha: CODATA_2018.alpha,
  /** Inverse fine-structure constant 1/alpha. */
  invAlpha: 1 / CODATA_2018.alpha,
  /** Atomic unit of time: hbar / E_h in seconds. */
  au_time_s: 2.4188843265857e-17,
  /** hc in eV * nm (exact from SI h*c / e). */
  hc_eV_nm: (6.62607015e-34 * 299792458) / 1.602176634e-19 * 1e9,
} as const;

/** Published CODATA 2018 relative standard uncertainties (dimensionless). */
export const CODATA_2018_UNCERTAINTIES = {
  version: CONSTANTS_VERSION,
  alpha_rel: 1.5e-10,
  rydberg_rel: 1.9e-12,
  a0_rel: 1.5e-10,
  hartree_eV_rel: 1.9e-12,
  m_e_u_rel: 2.9e-11,
  m_p_u_rel: 6.0e-11,
  m_d_u_rel: 1.5e-11,
  m_alpha_u_rel: 1.5e-11,
  au_time_rel: 1.9e-12,
} as const;

export type LengthUnit = "a0" | "m" | "angstrom" | "nm" | "pm" | "fm";
export type EnergyUnit = "Ha" | "eV" | "J" | "cm-1";
export type TimeUnit = "s" | "au_t";
export type FrequencyUnit = "Hz" | "THz";
export type MassUnit = "u" | "kg" | "me";
export type ChargeUnit = "e" | "C";
export type AnyUnit = LengthUnit | EnergyUnit | TimeUnit | FrequencyUnit | MassUnit | ChargeUnit | "1/s" | "dimensionless";

export interface TypedQuantity<U extends string = AnyUnit> {
  readonly value: number;
  readonly unit: U;
  readonly constantsVersion: ConstantsVersion;
}

export function quantity<U extends string>(value: number, unit: U): TypedQuantity<U> {
  if (!Number.isFinite(value)) throw new RangeError(`Non-finite quantity value for unit ${unit}`);
  return { value, unit, constantsVersion: CONSTANTS_VERSION };
}

const LENGTH_TO_M: Record<LengthUnit, number> = {
  a0: CODATA_2018.a0_m,
  m: 1,
  angstrom: 1e-10,
  nm: 1e-9,
  pm: 1e-12,
  fm: 1e-15,
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return (value * LENGTH_TO_M[from]) / LENGTH_TO_M[to];
}

const ENERGY_TO_EV: Record<EnergyUnit, number> = {
  eV: 1,
  Ha: CODATA_2018.hartree_eV,
  J: 1 / EXTENDED_CONSTANTS.e_C,
  // 1 cm^-1 = h * c * 100 / e eV
  "cm-1": (EXTENDED_CONSTANTS.h_Js * EXTENDED_CONSTANTS.c_m_s * 100) / EXTENDED_CONSTANTS.e_C,
};

export function convertEnergy(value: number, from: EnergyUnit, to: EnergyUnit): number {
  if (from === to) return value;
  return (value * ENERGY_TO_EV[from]) / ENERGY_TO_EV[to];
}

const MASS_TO_KG: Record<MassUnit, number> = {
  kg: 1,
  u: CODATA_2018.u_kg,
  me: CODATA_2018.m_e_kg,
};

export function convertMass(value: number, from: MassUnit, to: MassUnit): number {
  if (from === to) return value;
  return (value * MASS_TO_KG[from]) / MASS_TO_KG[to];
}

const CHARGE_TO_C: Record<ChargeUnit, number> = {
  C: 1,
  e: EXTENDED_CONSTANTS.e_C,
};

export function convertCharge(value: number, from: ChargeUnit, to: ChargeUnit): number {
  if (from === to) return value;
  return (value * CHARGE_TO_C[from]) / CHARGE_TO_C[to];
}

export function convertFrequency(value: number, from: FrequencyUnit, to: FrequencyUnit): number {
  if (from === to) return value;
  return from === "THz" ? value * 1e12 : value * 1e-12;
}

export function convertTime(value: number, from: TimeUnit, to: TimeUnit): number {
  if (from === to) return value;
  return from === "au_t" ? value * EXTENDED_CONSTANTS.au_time_s : value / EXTENDED_CONSTANTS.au_time_s;
}

/** Vacuum photon wavelength in nm from positive transition energy dE in eV. */
export function energyEvToWavelengthNm(deltaE_eV: number): number {
  if (!(deltaE_eV > 0)) throw new RangeError(`Transition energy must be > 0 eV (got ${deltaE_eV})`);
  return EXTENDED_CONSTANTS.hc_eV_nm / deltaE_eV;
}

/** Photon energy in eV from vacuum wavelength in nm. */
export function wavelengthNmToEnergyEv(lambda_nm: number): number {
  if (!(lambda_nm > 0)) throw new RangeError(`Wavelength must be > 0 nm (got ${lambda_nm})`);
  return EXTENDED_CONSTANTS.hc_eV_nm / lambda_nm;
}

/** Photon frequency in Hz from transition energy in eV. */
export function energyEvToFrequencyHz(deltaE_eV: number): number {
  if (!(deltaE_eV > 0)) throw new RangeError(`Transition energy must be > 0 eV (got ${deltaE_eV})`);
  return (deltaE_eV * EXTENDED_CONSTANTS.e_C) / EXTENDED_CONSTANTS.h_Js;
}

/** Reduced mass ratio mu / m_e given nuclear mass in atomic mass units (u). */
export function reducedMassRatioFromNuclearU(nuclearMass_u: number): number {
  if (!(nuclearMass_u > 0)) throw new RangeError(`Nuclear mass must be > 0 u (got ${nuclearMass_u})`);
  return reducedMassRatio(nuclearMass_u * CODATA_2018.u_kg);
}

export interface UncertaintyBudget {
  /** Discretization, quadrature, or Monte Carlo error estimate (same unit as observable, if applicable). */
  readonly numericalError?: number;
  /** Physical parameter or constants uncertainty. */
  readonly physicalUncertainty?: number;
  /** Explicit statement of neglected physical effects (e.g., QED, correlation, finite nucleus). */
  readonly modelApproximationNote: string;
  /** Tabulated reference data uncertainty (e.g. NIST ASD IE uncertainty in eV). */
  readonly referenceUncertainty?: number;
}
