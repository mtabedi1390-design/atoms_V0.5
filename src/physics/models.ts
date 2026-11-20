/**
 * Physics model registry.  Every result carries a `ModelId`; the UI shows the
 * descriptor's scope and limitations verbatim so approximations are never
 * mislabelled as exact.
 */
import type { ElementRecord, Subshell } from "@/data/elements";
import { CONSTANTS } from "./constants";
import { hydrogenicEnergy_eV, meanRadiusAnalytic } from "./hydrogenic";

export type ModelId = "hydrogenic-exact" | "slater-screened-hydrogenic";

export interface ModelDescriptor {
  readonly id: ModelId;
  readonly name: string;
  readonly hamiltonian: string;
  readonly kind: "exact analytical" | "independent-electron estimate";
  readonly relativistic: string;
  readonly correlation: string;
  readonly nuclearModel: string;
  readonly version: string;
  readonly appliesTo: string;
  readonly limitations: readonly string[];
}

export const MODELS: Record<ModelId, ModelDescriptor> = {
  "hydrogenic-exact": {
    id: "hydrogenic-exact",
    name: "Exact non-relativistic hydrogenic (Model A)",
    hamiltonian: "H = p²/2m_e − Z e²/(4πε₀ r), point nucleus, infinite nuclear mass",
    kind: "exact analytical",
    relativistic: "none (Schrödinger)",
    correlation: "n/a — one electron",
    nuclearModel: "point charge, M → ∞ (reduced-mass factor available separately)",
    version: "1.0 (ported & corrected from kavan010/Atoms atom_realtime.cpp)",
    appliesTo: "H and one-electron ions (He⁺, Li²⁺, …). Also used as the orbital basis for Model B.",
    limitations: [
      "Omits finite nuclear mass unless reduced-mass factor applied",
      "Omits finite nuclear size, fine structure, Lamb shift, hyperfine structure",
      "Multi-electron atoms are NOT described by this model",
    ],
  },
  "slater-screened-hydrogenic": {
    id: "slater-screened-hydrogenic",
    name: "Slater-screened hydrogenic estimate (Model B)",
    hamiltonian: "Independent electrons in Coulomb field with Z_eff = Z − S (Slater 1930 rules)",
    kind: "independent-electron estimate",
    relativistic: "none",
    correlation: "none (screening constants only)",
    nuclearModel: "point charge",
    version: "1.0",
    appliesTo: "Qualitative orbital shapes/sizes of neutral multi-electron atoms, Z = 2 … 118",
    limitations: [
      "Slater screening is an empirical rule, not a self-consistent solution",
      "Radial functions are hydrogenic with Z_eff; Hartree–Fock/Dirac–Fock orbitals are NOT computed in-browser",
      "E = −13.6 Z_eff²/n* ² eV is a rough estimate, not an orbital or ionization energy",
      "No relativistic contraction/expansion or spin–orbit splitting: heavy-element (Z ≳ 50) shapes are qualitatively unreliable",
      "Z ≥ 104 configurations are theoretical predictions",
    ],
  },
};

/**
 * Slater's rules (J. C. Slater, Phys. Rev. 36, 57 (1930)).
 * Groups: [1s] [2s2p] [3s3p] [3d] [4s4p] [4d] [4f] [5s5p] [5d] [5f] [6s6p] …
 * Screening for an electron in group G:
 *   0.35 per other electron in G (0.30 for 1s),
 *   for s/p group: 0.85 per electron with n−1, 1.00 per electron with n−2 or lower,
 *   for d/f group: 1.00 per electron in all lower groups.
 * Effective principal quantum number n*: 1,2,3,3.7,4.0,4.2 for n = 1…6 (n ≥ 7 → 4.3, extrapolated and flagged).
 */
export interface SlaterResult {
  readonly zeff: number;
  readonly screening: number;
  readonly nStar: number;
  readonly energyEstimate_eV: number;
  readonly meanRadiusEstimate_pm: number;
}

const N_STAR = [0, 1, 2, 3, 3.7, 4.0, 4.2, 4.3];

function groupKey(s: { n: number; l: number }): string {
  return s.l <= 1 ? `${s.n}sp` : `${s.n}${s.l}`;
}

export function slaterZeff(element: ElementRecord, target: Subshell): SlaterResult {
  const Z = element.Z;
  const tKey = groupKey(target);
  let S = 0;
  for (const s of element.subshells) {
    const k = groupKey(s);
    if (k === tKey) {
      const others = s.occupancy - (s.n === target.n && s.l === target.l ? 1 : 0);
      S += others * (target.n === 1 ? 0.3 : 0.35);
    } else if (target.l <= 1) {
      if (s.n === target.n - 1) S += 0.85 * s.occupancy;
      else if (s.n < target.n - 1) S += 1.0 * s.occupancy;
      else if (s.n === target.n && s.l > 1) {
        /* d/f of same n are *outside* the ns,np group in Slater's ordering → no screening */
      }
    } else {
      // d or f electron: all groups listed before it screen fully
      const lower = s.n < target.n || (s.n === target.n && s.l < target.l);
      if (lower) S += 1.0 * s.occupancy;
    }
  }
  const zeff = Math.max(Z - S, 0.3);
  const nStar = N_STAR[Math.min(target.n, 7)];
  const energyEstimate_eV = -CONSTANTS.rydberg_eV * (zeff * zeff) / (nStar * nStar);
  const meanRadiusEstimate_pm = meanRadiusAnalytic(target.n, target.l, zeff) * CONSTANTS.a0_pm;
  return { zeff, screening: S, nStar, energyEstimate_eV, meanRadiusEstimate_pm };
}

/** Effective charge used for the orbital basis of a given subshell under a model. */
export function effectiveZ(model: ModelId, element: ElementRecord, sub: Subshell): number {
  if (model === "hydrogenic-exact") return element.Z;
  return slaterZeff(element, sub).zeff;
}

export { hydrogenicEnergy_eV };
