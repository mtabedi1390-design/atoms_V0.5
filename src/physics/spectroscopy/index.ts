/**
 * Atomic Spectroscopy Engine (ATOMS v0.6.0 Phase 6).
 *
 * Dynamically constructs discrete emission and absorption spectra strictly from real
 * Nonrelativistic (Schrödinger) and Relativistic (Dirac) E1 transition calculations.
 *
 * Scientific honesty & scope:
 *  - Discrete ideal lines only (delta-function wavelengths & transition strengths).
 *  - No artificial line-shape broadening (natural/Doppler/collisional) claimed as physical.
 *  - No empirical Boltzmann/NLTE level-population intensities claimed as observed intensities.
 *  - Restricted strictly to one-electron (N = 1) point-nucleus Coulomb systems.
 *
 * Zero React or Three.js dependencies.
 */
import type { AtomicSystem } from "@/domain/atomic";
import { createNonRelativisticState, createRelativisticState, jFromKappa, lFromKappa } from "@/domain/quantum";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import { checkDiracCoulombDomain } from "@/physics/providers/dirac";
import {
  calculateNonRelativisticE1Transition,
  calculateRelativisticE1Transition,
} from "@/physics/transitions";
import {
  getNistHydrogenLines,
  NIST_HYDROGEN_LINES,
  type NistHydrogenLineReference,
} from "@/data/references/nistHydrogen";

export type SpectralSeriesKind = "lyman" | "balmer" | "paschen" | "custom";
export type SpectrumMode = "emission" | "absorption";
export type SpectroscopyModelKind = "schrodinger-coulomb" | "dirac-coulomb";

export interface SpectralLine {
  readonly id: string;
  readonly model: SpectroscopyModelKind;
  readonly series: SpectralSeriesKind;
  readonly label: string;
  readonly lowerN: number;
  readonly upperN: number;
  readonly lowerStateLabel: string;
  readonly upperStateLabel: string;
  readonly wavelength_nm: number;
  readonly frequency_Hz: number;
  readonly transitionEnergy_eV: number;
  readonly oscillatorStrength: number;
  readonly einsteinA_s1: number;
  readonly reducedStrength: number;
  /**
   * Dimensionless ideal line marker intensity computed directly from fundamental rate/oscillator
   * strength (Einstein A for emission, oscillator strength f for absorption), NOT an empirical
   * population-weighted laboratory intensity.
   */
  readonly idealLineStrength: number;
  readonly wavelengthConvention: "vacuum";
}

export interface NistLineComparisonEntry {
  readonly referenceId: string;
  readonly referenceLabel: string;
  readonly lowerN: number;
  readonly upperN: number;
  readonly nistVacuumWavelength_nm: number;
  readonly calculatedWavelength_nm: number | null;
  readonly deltaWavelength_nm: number | null;
  readonly relativeError: number | null;
  readonly matchedLineLabel: string | null;
}

export interface SpectrumGenerationOptions {
  readonly model: SpectroscopyModelKind;
  readonly mode: SpectrumMode;
  readonly series: SpectralSeriesKind;
  readonly maxUpperN?: number;
  readonly customLowerN?: number;
  readonly customMinUpperN?: number;
  readonly minWavelength_nm?: number;
  readonly maxWavelength_nm?: number;
  readonly quadratureIntervals?: number;
}

export interface GeneratedSpectrum {
  readonly systemId: string;
  readonly Z: number;
  readonly N: number;
  readonly model: SpectroscopyModelKind;
  readonly mode: SpectrumMode;
  readonly series: SpectralSeriesKind;
  readonly wavelengthConvention: "vacuum";
  readonly minWavelength_nm: number | null;
  readonly maxWavelength_nm: number | null;
  readonly lines: readonly SpectralLine[];
  readonly nistComparisons: readonly NistLineComparisonEntry[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
}

function seriesLowerN(series: SpectralSeriesKind, customLowerN?: number): number {
  switch (series) {
    case "lyman":
      return 1;
    case "balmer":
      return 2;
    case "paschen":
      return 3;
    case "custom":
      return Math.max(1, Math.round(customLowerN ?? 1));
  }
}

function enumerateKappasForN(n: number): number[] {
  const kappas: number[] = [];
  for (let l = 0; l < n; l++) {
    kappas.push(-(l + 1)); // j = l + 1/2
    if (l > 0) kappas.push(l); // j = l - 1/2
  }
  return kappas;
}

function diracStateLabel(n: number, kappa: number): string {
  const l = lFromKappa(kappa);
  const twoJ = Math.round(2 * jFromKappa(kappa));
  return `${n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${twoJ}/2`;
}

/**
 * Generates an emission or absorption discrete line spectrum by calling the real
 * Schrödinger or Dirac E1 matrix-element evaluators over every dipole-allowed channel.
 */
export function generateHydrogenLikeSpectrum(
  system: AtomicSystem,
  opts: SpectrumGenerationOptions,
): GeneratedSpectrum {
  if (system.N !== 1) {
    throw new RangeError(`Hydrogen-like spectroscopy requires N = 1 (got N=${system.N}).`);
  }
  if (system.nuclearModel.kind === "finite-uniform" || system.nuclearModel.kind === "finite-fermi") {
    throw new RangeError(`Finite nuclear model "${system.nuclearModel.kind}" is unsupported for analytical spectroscopy.`);
  }
  if (opts.model === "dirac-coulomb") {
    const dom = checkDiracCoulombDomain(system.Z, -1);
    if (!dom.valid) throw new RangeError(dom.reason);
  }

  const lowerN = seriesLowerN(opts.series, opts.customLowerN);
  const maxUpperN = Math.max(lowerN + 1, Math.min(8, opts.maxUpperN ?? lowerN + 4));
  const minUpperN = opts.series === "custom" ? Math.max(lowerN + 1, opts.customMinUpperN ?? lowerN + 1) : lowerN + 1;
  const quadIntervals = opts.quadratureIntervals ?? 2400;

  const rawLines: SpectralLine[] = [];

  if (opts.model === "schrodinger-coulomb") {
    for (let upperN = minUpperN; upperN <= maxUpperN; upperN++) {
      for (let lLower = 0; lLower < lowerN; lLower++) {
        for (const lUpper of [lLower - 1, lLower + 1]) {
          if (lUpper < 0 || lUpper >= upperN) continue;
          const lowerSt = createNonRelativisticState({ n: lowerN, l: lLower, m_l: 0, m_s: 0.5, basis: "complex" });
          // Pick a parity/dipole compatible m_l channel (Delta l = +-1 allows Delta m_l = 0, +-1)
          const upperSt = createNonRelativisticState({ n: upperN, l: lUpper, m_l: 0, m_s: 0.5, basis: "complex" });
          const init = opts.mode === "emission" ? upperSt : lowerSt;
          const fin = opts.mode === "emission" ? lowerSt : upperSt;
          const tr = calculateNonRelativisticE1Transition(system, init, fin, quadIntervals);
          if (tr.wavelength_nm === null || tr.frequency_Hz === null || !tr.selectionRule.allowed) continue;

          rawLines.push({
            id: `nr:${lowerN}${SUBSHELL_LETTERS[lLower] ?? `l${lLower}`}-${upperN}${SUBSHELL_LETTERS[lUpper] ?? `l${lUpper}`}`,
            model: "schrodinger-coulomb",
            series: opts.series,
            label: `${upperN}${SUBSHELL_LETTERS[lUpper] ?? `l${lUpper}`} <-> ${lowerN}${SUBSHELL_LETTERS[lLower] ?? `l${lLower}`}`,
            lowerN,
            upperN,
            lowerStateLabel: `${lowerN}${SUBSHELL_LETTERS[lLower] ?? `l${lLower}`}`,
            upperStateLabel: `${upperN}${SUBSHELL_LETTERS[lUpper] ?? `l${lUpper}`}`,
            wavelength_nm: tr.wavelength_nm,
            frequency_Hz: tr.frequency_Hz,
            transitionEnergy_eV: tr.transitionEnergy_eV,
            oscillatorStrength: tr.oscillatorStrength,
            einsteinA_s1: tr.einsteinA_s1,
            reducedStrength: tr.reducedDipoleSquared_e2a02,
            idealLineStrength: opts.mode === "emission" ? tr.einsteinA_s1 : tr.oscillatorStrength,
            wavelengthConvention: "vacuum",
          });
        }
      }
    }
  } else {
    for (let upperN = minUpperN; upperN <= maxUpperN; upperN++) {
      for (const kLower of enumerateKappasForN(lowerN)) {
        for (const kUpper of enumerateKappasForN(upperN)) {
          const jLower = jFromKappa(kLower);
          const jUpper = jFromKappa(kUpper);
          const lLower = lFromKappa(kLower);
          const lUpper = lFromKappa(kUpper);
          if ((lLower + lUpper) % 2 === 0) continue; // E1 parity flips
          if (Math.abs(jUpper - jLower) > 1 + 1e-9) continue;

          // Choose matching m_j = +1/2 (guaranteed valid for all half-integer j >= 1/2)
          const lowerSt = createRelativisticState({ n: lowerN, kappa: kLower, m_j: 0.5 });
          const upperSt = createRelativisticState({ n: upperN, kappa: kUpper, m_j: 0.5 });
          const init = opts.mode === "emission" ? upperSt : lowerSt;
          const fin = opts.mode === "emission" ? lowerSt : upperSt;
          const tr = calculateRelativisticE1Transition(system, init, fin, { quadratureIntervals: quadIntervals });
          if (tr.wavelength_nm === null || tr.frequency_Hz === null || !tr.selectionRule.allowed) continue;

          const lowLbl = diracStateLabel(lowerN, kLower);
          const upLbl = diracStateLabel(upperN, kUpper);
          rawLines.push({
            id: `dirac:${lowLbl}-${upLbl}`,
            model: "dirac-coulomb",
            series: opts.series,
            label: `${upLbl} <-> ${lowLbl}`,
            lowerN,
            upperN,
            lowerStateLabel: lowLbl,
            upperStateLabel: upLbl,
            wavelength_nm: tr.wavelength_nm,
            frequency_Hz: tr.frequency_Hz,
            transitionEnergy_eV: tr.transitionEnergy_eV,
            oscillatorStrength: tr.oscillatorStrength,
            einsteinA_s1: tr.einsteinA_s1,
            reducedStrength: tr.reducedLineStrength_S,
            idealLineStrength: opts.mode === "emission" ? tr.einsteinA_s1 : tr.oscillatorStrength,
            wavelengthConvention: "vacuum",
          });
        }
      }
    }
  }

  // Apply wavelength filter if specified
  const filtered = rawLines
    .filter((line) => {
      if (opts.minWavelength_nm !== undefined && line.wavelength_nm < opts.minWavelength_nm) return false;
      if (opts.maxWavelength_nm !== undefined && line.wavelength_nm > opts.maxWavelength_nm) return false;
      return true;
    })
    .sort((a, b) => a.wavelength_nm - b.wavelength_nm);

  // Compare against NIST 1H reference lines when Z = 1 (neutral hydrogen)
  const nistComparisons = system.Z === 1 ? compareLinesWithNist(filtered, opts.series) : [];

  return {
    systemId: system.id,
    Z: system.Z,
    N: system.N,
    model: opts.model,
    mode: opts.mode,
    series: opts.series,
    wavelengthConvention: "vacuum",
    minWavelength_nm: opts.minWavelength_nm ?? (filtered.length > 0 ? filtered[0].wavelength_nm : null),
    maxWavelength_nm: opts.maxWavelength_nm ?? (filtered.length > 0 ? filtered[filtered.length - 1].wavelength_nm : null),
    lines: filtered,
    nistComparisons,
    assumptions: [
      `Generated strictly from calculated ${opts.model} E1 radial & angular dipole matrix elements.`,
      "Wavelengths are vacuum wavelengths (n = 1), not standard-air Edlen wavelengths.",
      "Ideal discrete transitions only; no unmodeled thermal/Doppler/collisional broadening or NLTE level populations.",
    ],
    limitations: [
      "Restricted to N = 1 hydrogen-like ions and point-nucleus Coulomb potential.",
      opts.model === "schrodinger-coulomb"
        ? "Schrödinger–Coulomb is fine-structure-degenerate in (l, j); all l-multiplet lines share identical wavelength per (n_i, n_f)."
        : "Dirac–Coulomb resolves j-dependent fine-structure doublets; Lamb shift (~0.0005 nm on Lyman-alpha) and hyperfine splittings are omitted.",
    ],
  };
}

export function compareLinesWithNist(
  lines: readonly SpectralLine[],
  series: SpectralSeriesKind,
): readonly NistLineComparisonEntry[] {
  const refs: readonly NistHydrogenLineReference[] =
    series === "custom" ? NIST_HYDROGEN_LINES.lines : getNistHydrogenLines(series);

  return refs.map((ref) => {
    const candidates = lines.filter((l) => l.lowerN === ref.lowerN && l.upperN === ref.upperN);
    if (candidates.length === 0) {
      return {
        referenceId: ref.id,
        referenceLabel: ref.label,
        lowerN: ref.lowerN,
        upperN: ref.upperN,
        nistVacuumWavelength_nm: ref.vacuumWavelength_nm,
        calculatedWavelength_nm: null,
        deltaWavelength_nm: null,
        relativeError: null,
        matchedLineLabel: null,
      };
    }
    // Intensity-weighted centroid or strongest E1 line for multiplet matching
    let best = candidates[0];
    for (const c of candidates) {
      if (c.idealLineStrength > best.idealLineStrength) best = c;
    }
    const delta = best.wavelength_nm - ref.vacuumWavelength_nm;
    return {
      referenceId: ref.id,
      referenceLabel: ref.label,
      lowerN: ref.lowerN,
      upperN: ref.upperN,
      nistVacuumWavelength_nm: ref.vacuumWavelength_nm,
      calculatedWavelength_nm: best.wavelength_nm,
      deltaWavelength_nm: delta,
      relativeError: Math.abs(delta) / ref.vacuumWavelength_nm,
      matchedLineLabel: best.label,
    };
  });
}

export function compareNonRelativisticAndDiracSpectra(
  system: AtomicSystem,
  opts: Omit<SpectrumGenerationOptions, "model">,
): {
  readonly nonrelativistic: GeneratedSpectrum;
  readonly relativistic: GeneratedSpectrum;
} {
  return {
    nonrelativistic: generateHydrogenLikeSpectrum(system, { ...opts, model: "schrodinger-coulomb" }),
    relativistic: generateHydrogenLikeSpectrum(system, { ...opts, model: "dirac-coulomb" }),
  };
}
