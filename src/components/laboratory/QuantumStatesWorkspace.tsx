import { useMemo } from "react";
import type { AtomicSystem } from "@/domain/atomic";
import { lFromKappa, lSmallFromKappa, parityFromKappa, type NonRelativisticState, type RelativisticState } from "@/domain/quantum";
import { SUBSHELL_LETTERS, hydrogenicEnergy_eV, meanRadiusAnalytic, radialExtent, radialNodes, radialPDF, radialR } from "@/physics/hydrogenic";
import {
  checkDiracCoulombDomain,
  computeDiracEnergy,
  diracRadialPQ,
  integrateDiracExpectationValues,
} from "@/physics/providers/dirac";
import { convertEnergy } from "@/physics/units";
import { clampMjForKappa, type LaboratoryConfig } from "@/app/useAtomsLaboratory";
import { RadialPlot, type DiracRadialView } from "@/components/RadialPlot";
import { Badge, Panel, Row, Seg } from "@/components/ui";

interface Props {
  readonly system: AtomicSystem;
  readonly config: LaboratoryConfig;
  readonly nrState: NonRelativisticState;
  readonly diracState: RelativisticState;
  readonly onPatchConfig: (patch: Partial<LaboratoryConfig>) => void;
  readonly onSelectNR: (n: number, l: number, m_l: number, basis?: "real" | "complex") => void;
  readonly onRunExperiment: () => void;
}

export function QuantumStatesWorkspace({
  system,
  config,
  nrState,
  diracState,
  onPatchConfig,
  onSelectNR,
  onRunExperiment,
}: Props) {
  const isOneElectron = system.N === 1;
  const pointNucleus = system.nuclearModel.kind === "point-infinite-mass" || system.nuclearModel.kind === "point-finite-mass";

  const availableKappas = useMemo(() => {
    const out: { kappa: number; label: string }[] = [];
    for (let l = 0; l < config.diracN; l++) {
      const kPlus = -(l + 1);
      out.push({ kappa: kPlus, label: `${config.diracN}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${2 * l + 1}/2 (κ=${kPlus})` });
      if (l > 0) {
        const kMinus = l;
        out.push({ kappa: kMinus, label: `${config.diracN}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${2 * l - 1}/2 (κ=${kMinus})` });
      }
    }
    return out;
  }, [config.diracN]);

  const mjValues = useMemo(() => {
    const twoJ = Math.round(2 * diracState.j);
    const vals: number[] = [];
    for (let m = -twoJ; m <= twoJ; m += 2) vals.push(m / 2);
    return vals;
  }, [diracState.j]);

  const diracDomain = checkDiracCoulombDomain(system.Z, diracState.kappa);

  const nrMetrics = useMemo(() => {
    if (!isOneElectron || !pointNucleus) return null;
    const E = hydrogenicEnergy_eV(nrState.n, system.Z, system.reducedMassRatio);
    const a = 1 / system.reducedMassRatio;
    return {
      E_eV: E,
      E_Ha: convertEnergy(E, "eV", "Ha"),
      meanR: meanRadiusAnalytic(nrState.n, nrState.l, system.Z, a),
      nodes: radialNodes(nrState.n, nrState.l, system.Z, a),
      rMax: radialExtent(nrState.n, nrState.l, system.Z, a),
      sampleR: radialR(nrState.n, nrState.l, meanRadiusAnalytic(nrState.n, nrState.l, system.Z, a), system.Z, a),
      sampleP: radialPDF(nrState.n, nrState.l, meanRadiusAnalytic(nrState.n, nrState.l, system.Z, a), system.Z, a),
    };
  }, [isOneElectron, pointNucleus, nrState, system.Z, system.reducedMassRatio]);

  const diracMetrics = useMemo(() => {
    if (!isOneElectron || !pointNucleus || !diracDomain.valid) return null;
    const energy = computeDiracEnergy(diracState.n, diracState.kappa, system.Z, system.reducedMassRatio);
    const ex = integrateDiracExpectationValues(diracState.n, diracState.kappa, system.Z, system.reducedMassRatio, undefined, 1600);
    const aScale = 1 / system.reducedMassRatio;
    const l = lFromKappa(diracState.kappa);
    const rMax = Math.max(((3 * diracState.n * diracState.n - l * (l + 1)) * aScale) / (2 * system.Z) * 5, (10 * diracState.n * aScale) / system.Z);
    const pts = 240;
    const rBohr: number[] = [];
    const P_nkappa: number[] = [];
    const Q_nkappa: number[] = [];
    const radialProbability: number[] = [];
    for (let i = 0; i < pts; i++) {
      const r = (i / (pts - 1)) * rMax;
      const pq = diracRadialPQ(diracState.n, diracState.kappa, r, system.Z, system.reducedMassRatio);
      rBohr.push(r);
      P_nkappa.push(pq.P);
      Q_nkappa.push(pq.Q);
      radialProbability.push(pq.P * pq.P + pq.Q * pq.Q);
    }
    const diracView: DiracRadialView = {
      label: `${diracState.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${Math.round(2 * diracState.j)}/2`,
      rBohr,
      P_nkappa,
      Q_nkappa,
      radialProbability,
      integratedNorm: ex.totalSpinorNorm,
      smallFraction: ex.smallComponentNorm,
      meanR_a0: ex.meanR_a0,
    };
    return { energy, ex, diracView };
  }, [isOneElectron, pointNucleus, diracDomain.valid, diracState, system.Z, system.reducedMassRatio]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel title="Theory & Quantum-State Editor">
          <Seg
            value={config.theoryMode}
            onChange={(theoryMode) => onPatchConfig({ theoryMode })}
            options={[
              { v: "schrodinger", label: "Nonrelativistic (n, l, m_l, m_s)" },
              { v: "dirac", label: "Relativistic Dirac (n, κ, j, m_j)" },
            ]}
          />

          {config.theoryMode === "schrodinger" ? (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">n</span>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onSelectNR(n, Math.min(nrState.l, n - 1), nrState.m_l)}
                    className={`h-7 w-7 rounded-sm border font-mono ${nrState.n === n ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">l</span>
                {Array.from({ length: nrState.n }, (_, l) => l).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onSelectNR(nrState.n, l, Math.max(-l, Math.min(l, nrState.m_l)))}
                    className={`h-7 min-w-7 rounded-sm border px-2 font-mono ${nrState.l === l ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"}`}
                  >
                    {SUBSHELL_LETTERS[l] ?? l} ({l})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">m_l</span>
                {Array.from({ length: 2 * nrState.l + 1 }, (_, i) => i - nrState.l).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onSelectNR(nrState.n, nrState.l, m)}
                    className={`h-7 min-w-7 rounded-sm border px-2 font-mono ${nrState.m_l === m ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"}`}
                  >
                    {m > 0 ? `+${m}` : m}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-zinc-500">m_s</span>
                <Seg
                  value={String(config.m_s)}
                  onChange={(v) => onPatchConfig({ m_s: Number(v) as 0.5 | -0.5 })}
                  options={[
                    { v: "0.5", label: "+1/2 (spin up)" },
                    { v: "-0.5", label: "-1/2 (spin down)" },
                  ]}
                />
                <Seg
                  value={nrState.basis}
                  onChange={(b) => onSelectNR(nrState.n, nrState.l, nrState.m_l, b)}
                  options={[
                    { v: "real", label: "Real" },
                    { v: "complex", label: "Complex Y_l^m" },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">n</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      const nextK = Math.abs(config.diracKappa) <= n ? config.diracKappa : -1;
                      onPatchConfig({ diracN: n, diracKappa: nextK, diracMj: clampMjForKappa(nextK, config.diracMj) });
                    }}
                    className={`h-7 w-7 rounded-sm border font-mono ${config.diracN === n ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">κ, j</span>
                {availableKappas.map((item) => (
                  <button
                    key={item.kappa}
                    type="button"
                    onClick={() =>
                      onPatchConfig({
                        diracKappa: item.kappa,
                        diracMj: clampMjForKappa(item.kappa, config.diracMj),
                      })
                    }
                    className={`rounded-sm border px-2 py-1 font-mono text-[11px] ${
                      diracState.kappa === item.kappa ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-10 text-zinc-500">m_j</span>
                {mjValues.map((mj) => (
                  <button
                    key={mj}
                    type="button"
                    onClick={() => onPatchConfig({ diracMj: mj })}
                    className={`rounded-sm border px-2 py-1 font-mono text-[11px] ${
                      diracState.m_j === mj ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-200"
                    }`}
                  >
                    {mj > 0 ? `+${mj}` : mj}
                  </button>
                ))}
              </div>
              <Row label="Spinor quantum numbers">
                l_large={lFromKappa(diracState.kappa)}, l_small={lSmallFromKappa(diracState.kappa)}, j={diracState.j}, parity={parityFromKappa(diracState.kappa) === 1 ? "+" : "−"}
              </Row>
              {!diracDomain.valid && (
                <p className="rounded-sm border border-red-900 bg-red-950/30 p-2 text-[11px] text-red-300">
                  {diracDomain.reason}
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
            <Badge kind={isOneElectron && pointNucleus ? "exact" : "unavailable"}>
              {isOneElectron && pointNucleus ? "N=1 point-Coulomb analytic" : "Requires N=1 & point nucleus"}
            </Badge>
            <button
              type="button"
              onClick={onRunExperiment}
              className="rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Execute in Worker Platform
            </button>
          </div>
        </Panel>

        <Panel title="Calculated State Observables">
          {!isOneElectron || !pointNucleus ? (
            <p className="text-xs text-amber-300">
              Analytical one-electron Schrödinger/Dirac evaluation requires N = 1 and a point nucleus (currently N={system.N}, {system.nuclearModel.kind}).
              Use Atomic Systems to select a hydrogen-like ion or neutral H.
            </p>
          ) : config.theoryMode === "schrodinger" && nrMetrics ? (
            <div className="flex flex-col gap-1 text-xs">
              <Row label="Binding energy">{nrMetrics.E_eV.toFixed(8)} eV ({nrMetrics.E_Ha.toFixed(8)} Ha)</Row>
              <Row label="Mean radius <r>">{nrMetrics.meanR.toFixed(6)} a₀</Row>
              <Row label="Radial nodes">{nrMetrics.nodes.length > 0 ? nrMetrics.nodes.map((r) => `${r.toFixed(3)} a₀`).join(", ") : "0 (nodeless)"}</Row>
              <Row label="Angular nodes">{nrState.l} total ({nrState.l - Math.abs(nrState.m_l)} polar + {Math.abs(nrState.m_l)} azimuthal)</Row>
            </div>
          ) : diracMetrics ? (
            <div className="flex flex-col gap-1 text-xs">
              <Row label="Binding energy (E − mₑc²)">{diracMetrics.energy.bindingEnergy_eV.toFixed(8)} eV ({diracMetrics.energy.bindingEnergy_Ha.toFixed(8)} Ha)</Row>
              <Row label="Total relativistic energy">{diracMetrics.energy.totalEnergy_eV.toFixed(4)} eV</Row>
              <Row label="γ = sqrt(κ² − (Zα)²)">{diracMetrics.energy.gamma.toFixed(8)}</Row>
              <Row label="Spinor norm ∫(|P|²+|Q|²)dr">{diracMetrics.ex.totalSpinorNorm.toFixed(8)}</Row>
              <Row label="Large / Small fractions">{(diracMetrics.ex.largeComponentNorm * 100).toFixed(4)}% P / {(diracMetrics.ex.smallComponentNorm * 100).toFixed(4)}% Q</Row>
              <Row label="<r> (Dirac spinor)">{diracMetrics.ex.meanR_a0.toFixed(6)} a₀</Row>
              <p className="mt-1 text-[10px] text-amber-300/90">
                P_nκ(r) and Q_nκ(r) are coupled upper/lower bispinor radial components of one Dirac eigenstate, NOT independent spatial orbitals.
              </p>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title={config.theoryMode === "dirac" ? "Dirac Spinor Radial Components P(r), Q(r), |P|²+|Q|²" : "Schrödinger Radial Probability Density P_nl(r)"}>
          {config.theoryMode === "dirac" && diracMetrics ? (
            <RadialPlot
              mode="dirac"
              n={diracState.n}
              l={lFromKappa(diracState.kappa)}
              zeff={system.Z / system.reducedMassRatio}
              model="hydrogenic-exact"
              diracView={diracMetrics.diracView}
            />
          ) : (
            <RadialPlot
              mode="single"
              n={nrState.n}
              l={nrState.l}
              zeff={isOneElectron ? system.Z : 1}
              model="hydrogenic-exact"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
