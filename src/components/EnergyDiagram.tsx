import { useMemo } from "react";
import type { ElementRecord } from "@/data/elements";
import { hydrogenicEnergy_eV } from "@/physics/hydrogenic";
import { slaterZeff, type ModelId } from "@/physics/models";
import type { HFDataset } from "@/science/providers";

interface Props {
  element: ElementRecord;
  model: ModelId;
  activeLabel: string;
  hfDataset?: HFDataset | null;
  onPick: (n: number, l: number) => void;
}

/**
 * Occupied-subshell level diagram. Values plotted are model-dependent *estimates*
 * (hydrogenic -13.6 Z^2/n^2 for Model A; Slater -13.6 Z_eff^2/n*^2 for Model B) and are
 * explicitly NOT HF/DFT orbital eigenvalues or experimental binding energies.
 * The NIST first ionization energy and (when available) PySCF total HF energy are
 * kept strictly separate with distinct units and labels.
 */
export function EnergyDiagram({ element, model, activeLabel, hfDataset, onPick }: Props) {
  const levels = useMemo(
    () =>
      element.subshells.map((s) => {
        const E = model === "hydrogenic-exact" ? hydrogenicEnergy_eV(s.n, element.Z) : slaterZeff(element, s).energyEstimate_eV;
        return { ...s, E };
      }),
    [element, model],
  );
  const W = 320, H = 170, padL = 44, padR = 8, padT = 10, padB = 18;
  const Emin = Math.min(...levels.map((l) => l.E));
  // symmetric log scale so 1s of U (-10^5 eV) and 7s (-few eV) are both visible
  const tf = (E: number) => Math.log10(1 + Math.abs(E));
  const yMax = tf(Emin);
  const sy = (E: number) => padT + (tf(E) / yMax) * (H - padT - padB);
  const cols = 4; // l = 0..3 columns
  const sx = (l: number) => padL + (l + 0.5) * ((W - padL - padR) / cols);
  const ie = element.ionizationEnergy_eV;
  const lLetters = ["s", "p", "d", "f"];

  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Energy level diagram">
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="#0a0a0a" stroke="#27272a" strokeWidth={0.5} />
        {[0, 1, 2, 3].map((l) => (
          <text key={l} x={sx(l)} y={H - 5} textAnchor="middle" fill="#71717a" fontSize={8}>{lLetters[l]}</text>
        ))}
        {[1, 10, 100, 1000, 1e4, 1e5].filter((v) => v <= Math.abs(Emin) * 1.5).map((v) => (
          <g key={v}>
            <line x1={padL - 3} x2={padL} y1={sy(-v)} y2={sy(-v)} stroke="#52525b" strokeWidth={0.5} />
            <text x={padL - 5} y={sy(-v) + 3} textAnchor="end" fill="#a1a1aa" fontSize={7} fontFamily="monospace">−{v >= 1000 ? v.toExponential(0) : v}</text>
          </g>
        ))}
        <text x={2} y={padT + 6} fill="#71717a" fontSize={6}>eV (log)</text>
        <line x1={padL} x2={W - padR} y1={padT} y2={padT} stroke="#3f3f46" strokeDasharray="2 2" strokeWidth={0.6} />
        <text x={W - padR - 2} y={padT - 2} textAnchor="end" fill="#71717a" fontSize={6}>E = 0 (ionisation threshold)</text>
        {ie.value !== null && (
          <g>
            <line x1={padL} x2={W - padR} y1={sy(-ie.value)} y2={sy(-ie.value)} stroke={ie.evidence === "predicted" ? "#a78bfa" : "#34d399"} strokeDasharray="4 2" strokeWidth={0.7} />
            <text x={W - padR - 2} y={sy(-ie.value) - 2} textAnchor="end" fill={ie.evidence === "predicted" ? "#a78bfa" : "#34d399"} fontSize={6}>
              {ie.evidence === "predicted" ? "pred." : "exp."} 1st IE −{ie.value.toFixed(2)} eV (NIST)
            </text>
          </g>
        )}
        {levels.map((lv) => {
          const x = sx(lv.l), y = sy(lv.E), w = 44;
          const active = lv.label === activeLabel;
          return (
            <g key={lv.label} className="cursor-pointer" onClick={() => onPick(lv.n, lv.l)}>
              <line x1={x - w / 2} x2={x + w / 2} y1={y} y2={y} stroke={active ? "#fbbf24" : "#d4d4d8"} strokeWidth={active ? 2 : 1} />
              <text x={x - w / 2 - 2} y={y + 3} textAnchor="end" fill={active ? "#fbbf24" : "#a1a1aa"} fontSize={7} fontFamily="monospace">{lv.label}</text>
              <text x={x + w / 2 + 2} y={y + 3} fill="#71717a" fontSize={6} fontFamily="monospace">{lv.occupancy}e⁻</text>
            </g>
          );
        })}
      </svg>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-sm border border-zinc-800 bg-zinc-900/50 p-1.5 font-mono text-[10px]">
        <span className="text-zinc-500">1st IE (NIST)</span>
        <span className="text-right text-emerald-300">
          {ie.value === null ? "unavailable" : `${ie.value.toFixed(3)} eV (${ie.evidence})`}
        </span>
        <span className="text-zinc-500">Total HF E (PySCF)</span>
        <span className="text-right text-sky-300">
          {hfDataset ? `${hfDataset.energy_hartree.toFixed(5)} Ha` : "unavailable"}
        </span>
        <span className="text-zinc-500">HF orbital ε_i</span>
        <span className="text-right text-zinc-500">unavailable (total ρ only)</span>
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Plotted bars: {model === "hydrogenic-exact" ? "exact one-electron E_n = −13.606 Z²/n² eV (hydrogen-like ion, NOT the neutral atom)" : "Slater surrogate −13.606 Z_eff²/n*² eV — an empirical screening estimate, not an HF/DFT orbital eigenvalue and not a binding energy"}. Distinct reference quantities (NIST 1st IE, PySCF total HF electronic energy) are separated above.
      </p>
    </div>
  );
}
