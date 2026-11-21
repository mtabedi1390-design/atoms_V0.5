/**
 * Physical constants — CODATA 2018 recommended values.
 * Source: NIST Reference on Constants, Units, and Uncertainty,
 * https://physics.nist.gov/cuu/Constants/ (CODATA 2018 adjustment, published 2019).
 *
 * The upstream kavan010/Atoms C++ code set a0 = hbar = m_e = 1 with no provenance;
 * here every constant carries its dataset version so results can be reproduced.
 */
export interface ConstantsDataset {
  readonly name: string;
  readonly url: string;
  /** Bohr radius in metres (exact to ~1.5e-10 relative uncertainty). */
  readonly a0_m: number;
  /** Bohr radius in picometres. */
  readonly a0_pm: number;
  /** Rydberg energy (hc·R∞) in eV. */
  readonly rydberg_eV: number;
  /** Hartree energy in eV. */
  readonly hartree_eV: number;
  /** Reduced Planck constant h/(2π) in J·s (10-digit CODATA 2018 value; exact SI h/(2π) ≈ 1.054571817646e-34). */
  readonly hbar_Js: number;
  /** Electron mass in kg. */
  readonly m_e_kg: number;
  /** Proton mass in kg. */
  readonly m_p_kg: number;
  /** Atomic mass unit in kg. */
  readonly u_kg: number;
  /** Fine-structure constant. */
  readonly alpha: number;
}

export const CODATA_2018: ConstantsDataset = {
  name: "CODATA 2018",
  url: "https://physics.nist.gov/cuu/Constants/",
  a0_m: 5.29177210903e-11,
  a0_pm: 52.9177210903,
  rydberg_eV: 13.605693122994,
  hartree_eV: 27.211386245988,
  hbar_Js: 1.054571817e-34,
  m_e_kg: 9.1093837015e-31,
  m_p_kg: 1.67262192369e-27,
  u_kg: 1.66053906660e-27,
  alpha: 7.2973525693e-3,
};

export const CONSTANTS = CODATA_2018;

/**
 * Reduced-mass correction factor μ/m_e for a nucleus of mass M (in kg).
 * E_n(μ) = E_n(∞) · μ/m_e ;  a_μ = a0 · m_e/μ.
 */
export function reducedMassRatio(nuclearMass_kg: number): number {
  const me = CONSTANTS.m_e_kg;
  return (me * nuclearMass_kg) / (me + nuclearMass_kg) / me;
}
