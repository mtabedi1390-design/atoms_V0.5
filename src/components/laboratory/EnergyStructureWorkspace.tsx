import { useMemo } from "react";
import type { ElementRecord } from "@/data/elements";
import type { AtomicSystem } from "@/domain/atomic";
import { jFromKappa, lFromKappa } from "@/domain/quantum";
import { SUBSHELL_LETTERS, hydrogenicEnergy_eV } from "@/physics/hydrogenic";
import { checkDiracCoulombDomain, computeDiracEnergy } from "@/physics/providers/dirac";
import { hfDatasetFor } from "@/science/providers";
import { convertEnergy } from "@/physics/units";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly element: ElementRecord;
  readonly system: AtomicSystem;
}

interface ComparisonLevel {
  readonly n: number;
  readonly l: number;
  readonly kappa: number;
  readonly j: number;
  readonly label: string;
  readonly schrodinger_eV: number;
  readonly diracBinding_eV: number | null;
  readonly diracTotal_eV: number | null;
  readonly relShift_eV: number | null;
}

export function EnergyStructureWorkspace({ element, system }: Props) {
  const isOneElectron = system.N === 1;
  const pointNucleus = system.nuclearModel.kind === "point-infinite-mass" || system.nuclearModel.kind === "point-finite-mass";
  const hfDataset = useMemo(() => hfDatasetFor(system.Z), [system.Z]);

  const levels: readonly ComparisonLevel[] = useMemo(() => {
    const out: ComparisonLevel[] = [];
    for (let n = 1; n <= 4; n++) {
      const schE = hydrogenicEnergy_eV(n, system.Z, system.reducedMassRatio);
      for (let l = 0; l < n; l++) {
        const kappas = l === 0 ? [-1] : [l, -(l + 1)];
        for (const kappa of kappas) {
          const j = jFromKappa(kappa);
          const dom = checkDiracCoulombDomain(system.Z, kappa);
          const dir = dom.valid ? computeDiracEnergy(n, kappa, system.Z, system.reducedMassRatio) : null;
          out.push({
            n,
            l,
            kappa,
            j,
            label: `${n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${Math.round(2 * j)}/2`,
            schrodinger_eV: schE,
            diracBinding_eV: dir?.bindingEnergy_eV ?? null,
            diracTotal_eV: dir?.totalEnergy_eV ?? null,
            relShift_eV: dir ? dir.bindingEnergy_eV - schE : null,
          });
        }
      }
    }
    return out;
  }, [system.Z, system.reducedMassRatio]);

  const splittings = useMemo(() => {
    const pairs: { shell: string; lowerLabel: string; upperLabel: string; split_eV: number; split_cm1: number; split_GHz: number }[] = [];
    for (const [n, l] of [
      [2, 1],
      [3, 1],
      [3, 2],
      [4, 1],
    ] as const) {
      const kLow = -(l + 1);
      const kHigh = l;
      const dLow = checkDiracCoulombDomain(system.Z, kLow);
      const dHigh = checkDiracCoulombDomain(system.Z, kHigh);
      if (!dLow.valid || !dHigh.valid) continue;
      const eLow = computeDiracEnergy(n, kLow, system.Z, system.reducedMassRatio);
      const eHigh = computeDiracEnergy(n, kHigh, system.Z, system.reducedMassRatio);
      const split_eV = Math.abs(eLow.bindingEnergy_eV - eHigh.bindingEnergy_eV);
      pairs.push({
        shell: `${n}${SUBSHELL_LETTERS[l]}`,
        lowerLabel: `${n}${SUBSHELL_LETTERS[l]}_${2 * l - 1}/2`,
        upperLabel: `${n}${SUBSHELL_LETTERS[l]}_${2 * l + 1}/2`,
        split_eV,
        split_cm1: convertEnergy(split_eV, "eV", "cm-1"),
        split_GHz: (split_eV * 1.602176634e-19) / 6.62607015e-34 / 1e9,
      });
    }
    return pairs;
  }, [system.Z, system.reducedMassRatio]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel title="One-Electron Energy Structure: Schrödinger vs Dirac Fine Structure">
          {!isOneElectron || !pointNucleus ? (
            <div className="rounded-sm border border-amber-800/70 bg-amber-950/20 p-2 text-xs text-amber-200">
              Note: Currently viewing Z={system.Z}, N={system.N} ({system.nuclearModel.kind}). The table below represents the one-electron hydrogen-like ion{" "}
              <span className="font-mono">{element.symbol}{system.Z > 1 ? `${system.Z - 1}+` : ""}</span> (N=1), NOT neutral {element.name} many-electron orbital eigenvalues.
            </div>
          ) : (
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>Exact one-electron binding energies (E_bind = E_total − mₑc²) for {system.isotope.label}{system.q > 0 ? `${system.q}+` : ""}</span>
              <Badge kind="exact">N=1 analytic</Badge>
            </div>
          )}

          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="py-1 pr-2">State</th>
                  <th className="py-1 pr-2 text-right">Schrödinger (eV)</th>
                  <th className="py-1 pr-2 text-right">Dirac E_bind (eV)</th>
                  <th className="py-1 text-right">Δ_rel (eV)</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((lv) => (
                  <tr key={`${lv.n}-${lv.kappa}`} className="border-b border-zinc-900 text-zinc-200">
                    <td className="py-1 pr-2 text-amber-300">
                      {lv.label} <span className="text-zinc-500">(κ={lv.kappa})</span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{lv.schrodinger_eV.toFixed(6)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {lv.diracBinding_eV !== null ? lv.diracBinding_eV.toFixed(6) : "domain invalid"}
                    </td>
                    <td className="py-1 text-right tabular-nums text-sky-300">
                      {lv.relShift_eV !== null ? `${lv.relShift_eV >= 0 ? "+" : ""}${lv.relShift_eV.toExponential(3)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Notice that Dirac total relativistic energy E_total = mₑc² + E_bind (≈ 510,998.95 eV + E_bind) is strictly separated from negative binding energy E_bind.
          </p>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Dirac Fine-Structure Splittings (j = l + 1/2 vs l − 1/2)">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="py-1 pr-2">Doublet</th>
                  <th className="py-1 pr-2 text-right">ΔE (eV)</th>
                  <th className="py-1 pr-2 text-right">Δσ (cm⁻¹)</th>
                  <th className="py-1 text-right">Δν (GHz)</th>
                </tr>
              </thead>
              <tbody>
                {splittings.map((sp) => (
                  <tr key={sp.shell} className="border-b border-zinc-900 text-zinc-200">
                    <td className="py-1 pr-2">
                      {sp.upperLabel} − {sp.lowerLabel}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{sp.split_eV.toExponential(4)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-emerald-300">{sp.split_cm1.toFixed(4)}</td>
                    <td className="py-1 text-right tabular-nums text-amber-300">{sp.split_GHz.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Point-Coulomb Dirac levels with equal (n, j) (e.g. 2s₁/₂ and 2p₁/₂) are strictly degenerate; breaking that degeneracy requires QED Lamb shift (omitted in point-Coulomb Dirac).
          </p>
        </Panel>

        <Panel title="Separated Experimental & Neutral-Atom Reference Quantities">
          <Row label={`NIST 1st IE (neutral ${element.symbol})`}>
            {element.ionizationEnergy_eV.value !== null
              ? `${element.ionizationEnergy_eV.value.toFixed(6)} eV (${element.ionizationEnergy_eV.evidence})`
              : "unavailable (Z >= 109)"}
          </Row>
          <Row label={`PySCF HF Total Energy (neutral ${element.symbol})`}>
            {hfDataset ? `${hfDataset.energy_hartree.toFixed(8)} Ha (${hfDataset.basis})` : "unavailable (only H, He, C, N, O, Ne bundled)"}
          </Row>
          <Row label="Dirac 1s₁/₂ rest-mass reference">
            {lFromKappa(-1) === 0 ? "mₑc² = 510,998.95000 eV (CODATA 2018)" : ""}
          </Row>
        </Panel>
      </div>
    </div>
  );
}
