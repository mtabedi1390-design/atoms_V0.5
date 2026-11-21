import { useMemo, useState } from "react";
import type { AtomicSystem } from "@/domain/atomic";
import {
  createNonRelativisticState,
  createRelativisticState,
  type NonRelativisticState,
  type RelativisticState,
} from "@/domain/quantum";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import { checkDiracCoulombDomain } from "@/physics/providers/dirac";
import { DIRAC_PROVIDER_ID } from "@/physics/providers/dirac";
import { SCHRODINGER_PROVIDER_ID } from "@/physics/providers/schrodinger";
import {
  calculateNonRelativisticE1Transition,
  calculateRelativisticE1Transition,
} from "@/physics/transitions";
import { Badge, Panel, Row, Seg } from "@/components/ui";

interface Props {
  readonly system: AtomicSystem;
  readonly onRunTransitionExperiment: (
    initial: NonRelativisticState | RelativisticState,
    final: NonRelativisticState | RelativisticState,
    providerId: string,
    title: string,
  ) => void;
}

const NR_PRESETS = [
  { label: "1s (m=0)", n: 1, l: 0, m_l: 0 },
  { label: "2s (m=0)", n: 2, l: 0, m_l: 0 },
  { label: "2p (m=0)", n: 2, l: 1, m_l: 0 },
  { label: "2p (m=+1)", n: 2, l: 1, m_l: 1 },
  { label: "3s (m=0)", n: 3, l: 0, m_l: 0 },
  { label: "3p (m=0)", n: 3, l: 1, m_l: 0 },
  { label: "3d (m=0)", n: 3, l: 2, m_l: 0 },
  { label: "4p (m=0)", n: 4, l: 1, m_l: 0 },
] as const;

const DIRAC_PRESETS = [
  { label: "1s_1/2 (κ=-1, mj=+1/2)", n: 1, kappa: -1, m_j: 0.5 },
  { label: "2s_1/2 (κ=-1, mj=+1/2)", n: 2, kappa: -1, m_j: 0.5 },
  { label: "2p_1/2 (κ=+1, mj=+1/2)", n: 2, kappa: 1, m_j: 0.5 },
  { label: "2p_3/2 (κ=-2, mj=+1/2)", n: 2, kappa: -2, m_j: 0.5 },
  { label: "2p_3/2 (κ=-2, mj=+3/2)", n: 2, kappa: -2, m_j: 1.5 },
  { label: "3p_3/2 (κ=-2, mj=+1/2)", n: 3, kappa: -2, m_j: 0.5 },
  { label: "3d_3/2 (κ=+2, mj=+1/2)", n: 3, kappa: 2, m_j: 0.5 },
  { label: "3d_5/2 (κ=-3, mj=+3/2)", n: 3, kappa: -3, m_j: 1.5 },
] as const;

export function TransitionsWorkspace({ system, onRunTransitionExperiment }: Props) {
  const [model, setModel] = useState<"schrodinger" | "dirac">("dirac");
  const [nrInitIdx, setNrInitIdx] = useState(0);
  const [nrFinIdx, setNrFinIdx] = useState(2);
  const [nrInitMs, setNrInitMs] = useState<0.5 | -0.5>(0.5);
  const [nrFinMs, setNrFinMs] = useState<0.5 | -0.5>(0.5);
  const [dInitIdx, setDInitIdx] = useState(0);
  const [dFinIdx, setDFinIdx] = useState(3);

  const eligible =
    system.N === 1 &&
    (system.nuclearModel.kind === "point-infinite-mass" || system.nuclearModel.kind === "point-finite-mass") &&
    (model === "schrodinger" || checkDiracCoulombDomain(system.Z, -1).valid);

  const nrResult = useMemo(() => {
    if (!eligible || model !== "schrodinger") return null;
    const pi = NR_PRESETS[nrInitIdx];
    const pf = NR_PRESETS[nrFinIdx];
    const init = createNonRelativisticState({ n: pi.n, l: pi.l, m_l: pi.m_l, m_s: nrInitMs });
    const fin = createNonRelativisticState({ n: pf.n, l: pf.l, m_l: pf.m_l, m_s: nrFinMs });
    return calculateNonRelativisticE1Transition(system, init, fin, 3000);
  }, [eligible, model, system, nrInitIdx, nrFinIdx, nrInitMs, nrFinMs]);

  const diracResult = useMemo(() => {
    if (!eligible || model !== "dirac") return null;
    const pi = DIRAC_PRESETS[dInitIdx];
    const pf = DIRAC_PRESETS[dFinIdx];
    const init = createRelativisticState({ n: pi.n, kappa: pi.kappa, m_j: pi.m_j });
    const fin = createRelativisticState({ n: pf.n, kappa: pf.kappa, m_j: pf.m_j });
    return calculateRelativisticE1Transition(system, init, fin, { quadratureIntervals: 2400 });
  }, [eligible, model, system, dInitIdx, dFinIdx]);

  const handleSaveRun = () => {
    if (model === "schrodinger") {
      const pi = NR_PRESETS[nrInitIdx];
      const pf = NR_PRESETS[nrFinIdx];
      const init = createNonRelativisticState({ n: pi.n, l: pi.l, m_l: pi.m_l, m_s: nrInitMs });
      const fin = createNonRelativisticState({ n: pf.n, l: pf.l, m_l: pf.m_l, m_s: nrFinMs });
      onRunTransitionExperiment(
        init,
        fin,
        SCHRODINGER_PROVIDER_ID,
        `${system.species.symbol} NR E1 ${pi.label} -> ${pf.label}`,
      );
    } else {
      const pi = DIRAC_PRESETS[dInitIdx];
      const pf = DIRAC_PRESETS[dFinIdx];
      const init = createRelativisticState({ n: pi.n, kappa: pi.kappa, m_j: pi.m_j });
      const fin = createRelativisticState({ n: pf.n, kappa: pf.kappa, m_j: pf.m_j });
      onRunTransitionExperiment(
        init,
        fin,
        DIRAC_PROVIDER_ID,
        `${system.species.symbol} Dirac E1 ${pi.n}${SUBSHELL_LETTERS[pi.kappa > 0 ? pi.kappa : -pi.kappa - 1]} -> ${pf.n}${SUBSHELL_LETTERS[pf.kappa > 0 ? pf.kappa : -pf.kappa - 1]}`,
      );
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel title="Electric-Dipole (E1) Transition Selector">
          <Seg
            value={model}
            onChange={(m) => setModel(m)}
            options={[
              { v: "dirac", label: "Relativistic Dirac E1 (spinor)" },
              { v: "schrodinger", label: "Nonrelativistic Schrödinger E1" },
            ]}
          />

          {model === "schrodinger" ? (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-zinc-500">Initial state</span>
                <select
                  aria-label="NR initial state"
                  value={nrInitIdx}
                  onChange={(e) => setNrInitIdx(Number(e.target.value))}
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                >
                  {NR_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-zinc-500">m_s:</span>
                  <button type="button" onClick={() => setNrInitMs(0.5)} className={`rounded-sm border px-1.5 py-0.5 font-mono ${nrInitMs === 0.5 ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700"}`}>+1/2</button>
                  <button type="button" onClick={() => setNrInitMs(-0.5)} className={`rounded-sm border px-1.5 py-0.5 font-mono ${nrInitMs === -0.5 ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700"}`}>-1/2</button>
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-zinc-500">Final state</span>
                <select
                  aria-label="NR final state"
                  value={nrFinIdx}
                  onChange={(e) => setNrFinIdx(Number(e.target.value))}
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                >
                  {NR_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-zinc-500">m_s:</span>
                  <button type="button" onClick={() => setNrFinMs(0.5)} className={`rounded-sm border px-1.5 py-0.5 font-mono ${nrFinMs === 0.5 ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700"}`}>+1/2</button>
                  <button type="button" onClick={() => setNrFinMs(-0.5)} className={`rounded-sm border px-1.5 py-0.5 font-mono ${nrFinMs === -0.5 ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700"}`}>-1/2</button>
                </div>
              </label>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-zinc-500">Initial Dirac spinor</span>
                <select
                  aria-label="Dirac initial state"
                  value={dInitIdx}
                  onChange={(e) => setDInitIdx(Number(e.target.value))}
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                >
                  {DIRAC_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-zinc-500">Final Dirac spinor</span>
                <select
                  aria-label="Dirac final state"
                  value={dFinIdx}
                  onChange={(e) => setDFinIdx(Number(e.target.value))}
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                >
                  {DIRAC_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>{p.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
            <span className="text-[11px] text-zinc-400">
              System: {system.isotope.label} (Z={system.Z}, N={system.N})
            </span>
            <button
              type="button"
              data-testid="run-transition-exp"
              onClick={handleSaveRun}
              className="rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Run E1 Transition Experiment
            </button>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Matrix Elements, Selection Rules & Transition Rates">
          {!eligible ? (
            <p className="text-xs text-amber-300">
              Analytical one-electron E1 calculations require N = 1 and a point nucleus (currently N={system.N}, {system.nuclearModel.kind}).
              Submitting via the Experiment Platform will record an honest <span className="font-mono">unsupported</span> execution.
            </p>
          ) : model === "schrodinger" && nrResult ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-zinc-200">{nrResult.initialLabel} → {nrResult.finalLabel}</span>
                <Badge kind={nrResult.selectionRule.allowed ? "exact" : "unavailable"}>
                  {nrResult.selectionRule.allowed ? "E1 ALLOWED" : "E1 FORBIDDEN"}
                </Badge>
              </div>
              <p className="text-[11px] text-zinc-400">{nrResult.selectionRule.reasons.join(" ")}</p>
              <Row label="Operator">{nrResult.operator}</Row>
              <Row label="Radial integral ∫r³ R_f R_i dr">{nrResult.radialMatrixElement_a0.toFixed(8)} a₀</Row>
              <Row label="Angular C_q^(1) (q=-1,0,+1)">
                {nrResult.angularCoefficients[-1].toFixed(4)} / {nrResult.angularCoefficients[0].toFixed(4)} / {nrResult.angularCoefficients[1].toFixed(4)}
              </Row>
              <Row label="Total |<f|d|i>|²">{nrResult.totalDipoleSquared_e2a02.toExponential(6)} (e·a₀)²</Row>
              <Row label="Transition energy ΔE">{nrResult.transitionEnergy_eV.toFixed(6)} eV</Row>
              <Row label="Vacuum wavelength λ">{nrResult.wavelength_nm ? `${nrResult.wavelength_nm.toFixed(5)} nm` : "0 (degenerate)"}</Row>
              <Row label="Oscillator strength f (subshell)">{nrResult.oscillatorStrength.toFixed(6)}</Row>
              <Row label="Einstein A (spontaneous)">{nrResult.einsteinA_s1.toExponential(5)} s⁻¹</Row>
              <Row label="Sublevel A (i → f)">{nrResult.isEmission ? `${nrResult.sublevelEinsteinA_s1.toExponential(5)} s⁻¹` : "0 (absorption)"}</Row>
              <Row label="Quadrature convergence">{nrResult.numericalQuality.convergenceResidual.toExponential(2)}</Row>
            </div>
          ) : diracResult ? (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-zinc-200">{diracResult.initialLabel} → {diracResult.finalLabel}</span>
                <Badge kind={diracResult.selectionRule.allowed ? "exact" : "unavailable"}>
                  {diracResult.selectionRule.allowed ? "DIRAC E1 ALLOWED" : "DIRAC E1 FORBIDDEN"}
                </Badge>
              </div>
              <p className="text-[11px] text-zinc-400">{diracResult.selectionRule.reasons.join(" ")}</p>
              <Row label="Operator">{diracResult.operator}</Row>
              <Row label="Large radial ∫r P_f P_i dr">{diracResult.radialLargePP_a0.toFixed(8)} a₀</Row>
              <Row label="Small radial ∫r Q_f Q_i dr">{diracResult.radialSmallQQ_a0.toExponential(5)} a₀</Row>
              <Row label="Reduced line strength S">{diracResult.reducedLineStrength_S.toFixed(6)} (e·a₀)²</Row>
              <Row label="Total |<f|d|i>|²">{diracResult.totalDipoleSquared_e2a02.toExponential(6)} (e·a₀)²</Row>
              <Row label="Transition energy ΔE">{diracResult.transitionEnergy_eV.toFixed(6)} eV</Row>
              <Row label="Vacuum wavelength λ">{diracResult.wavelength_nm ? `${diracResult.wavelength_nm.toFixed(6)} nm` : "0 (degenerate)"}</Row>
              <Row label="Oscillator strength f (level)">{diracResult.oscillatorStrength.toFixed(6)}</Row>
              <Row label="Einstein A (spontaneous)">{diracResult.einsteinA_s1.toExponential(5)} s⁻¹</Row>
              <Row label="Sublevel A (i → f)">{diracResult.isEmission ? `${diracResult.sublevelEinsteinA_s1.toExponential(5)} s⁻¹` : "0 (absorption)"}</Row>
              <Row label="Quadrature residual">{diracResult.numericalQuality.convergenceResidual.toExponential(2)}</Row>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
