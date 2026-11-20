/**
 * Independent-electron density helpers.
 *
 * Ensemble convention (documented in the UI): for a subshell with occupancy N_nl we use
 * the *configuration average* over the 2l+1 magnetic states.  By Unsöld's theorem
 *   Σ_m |Y_lm|² = (2l+1)/(4π),
 * so the spherically averaged density contribution per atom is
 *   ρ_nl(r) = N_nl |R_nl(r)|² / (4π)        [electrons / a0³]
 * and 4π∫r²ρ_nl dr = N_nl.  This is a configuration-average visualization, NOT a
 * correlated many-electron density and not a claim that an open-shell atom physically
 * occupies an incoherent equal mixture of m states.
 */
import { radialExtent, radialR } from "./hydrogenic";

/** Spherically averaged density contribution of a subshell, in electrons/a0³. */
export function subshellDensity(n: number, l: number, r: number, occupancy: number, zeff = 1): number {
  // |R|², not r²|R|²: the r² of the volume element belongs to the 4πr²dr integration,
  // and must not be counted twice.
  const R = radialR(n, l, r, zeff);
  return (occupancy * R * R) / (4 * Math.PI);
}

/** 4π∫₀^R r²ρ_nl dr = N_nl ∫₀^R r²R² dr; composite Simpson. */
export function integrateElectronCount(n: number, l: number, occupancy: number, zeff = 1, rMax = radialExtent(n, l, zeff), intervals = 4000): number {
  const h = rMax / intervals;
  let s = 0;
  for (let i = 0; i <= intervals; i++) {
    const r = i * h;
    const w = i === 0 || i === intervals ? 1 : i % 2 === 1 ? 4 : 2;
    s += w * 4 * Math.PI * r * r * subshellDensity(n, l, r, occupancy, zeff);
  }
  return (s * h) / 3;
}

export interface LayerPeak {
  key: string;
  /** Absolute peak of the electron-density contribution, electrons/a0³. */
  peakDensity: number;
}

/**
 * Cross-shell brightness convention.
 *
 * The shader maps brightness through a *shared* normalisation constant in full-atom
 * mode, so peaks from different subshells remain comparable in absolute terms.
 * Point count and occupancy weighting are separate: the number of samples is allocated
 * ∝ occupancy, and each sample's density value already includes its occupancy factor.
 * In single-orbital mode the layer's own peak is used (brightness is then explicitly
 * within-orbital relative).
 */
export function sharedDensityMax(layers: readonly LayerPeak[]): number {
  return layers.reduce((m, l) => Math.max(m, l.peakDensity), 0);
}

/** Physical units conversion for display. */
export const densityToPm3 = (rhoBohr3: number): number => rhoBohr3 / Math.pow(52.9177210903, 3);
