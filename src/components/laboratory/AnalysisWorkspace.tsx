import { useMemo, useState } from "react";
import type { ElementRecord, Subshell } from "@/data/elements";
import type { AtomicSystem } from "@/domain/atomic";
import { lFromKappa, type NonRelativisticState, type RelativisticState } from "@/domain/quantum";
import {
  evaluate2DSlice,
  type FieldQuantity,
  type SlicePlaneKind,
} from "@/numerics/isosurface/marchingTetrahedra";
import { SUBSHELL_LETTERS, meanRSquaredAnalytic, meanRadiusAnalytic, radialExtent } from "@/physics/hydrogenic";
import {
  meanInvRAnalytic,
  meanInvRCubedAnalytic,
  meanInvRSquaredAnalytic,
} from "@/physics/providers/schrodinger";
import {
  checkDiracCoulombDomain,
  diracRadialPQ,
  integrateDiracExpectationValues,
} from "@/physics/providers/dirac";
import type { Selection } from "@/science/providers";
import type { ModelId } from "@/physics/models";
import type { LaboratoryConfig } from "@/app/useAtomsLaboratory";
import { RadialPlot, type DiracRadialView, type TotalRadialDensityView } from "@/components/RadialPlot";
import { Slice2DCanvas } from "@/components/Slice2DCanvas";
import { Inspector } from "@/components/Inspector";
import { Panel, Row, Seg, Slider } from "@/components/ui";

interface Props {
  readonly element: ElementRecord;
  readonly system: AtomicSystem;
  readonly sub: Subshell;
  readonly model: ModelId;
  readonly zeff: number;
  readonly nrState: NonRelativisticState;
  readonly diracState: RelativisticState;
  readonly config: LaboratoryConfig;
  readonly providerSelection: Selection;
  readonly totalRadialView: TotalRadialDensityView | null;
  readonly electrons: number | null;
}

export function AnalysisWorkspace({
  element,
  system,
  sub,
  model,
  zeff,
  nrState,
  diracState,
  config,
  providerSelection,
  totalRadialView,
  electrons,
}: Props) {
  const [plane, setPlane] = useState<SlicePlaneKind>("xz");
  const [sliceQuantity, setSliceQuantity] = useState<"density" | "wavefunction-signed">("wavefunction-signed");
  const [offsetBohr, setOffsetBohr] = useState(0);

  const isOneElectron = system.N === 1;
  const pointNucleus =
    system.nuclearModel.kind === "point-infinite-mass" || system.nuclearModel.kind === "point-finite-mass";

  const activeState = config.theoryMode === "dirac" && isOneElectron && pointNucleus ? diracState : nrState;
  const extentBohr = useMemo(
    () => radialExtent(nrState.n, nrState.l, isOneElectron ? system.Z : zeff),
    [nrState.n, nrState.l, isOneElectron, system.Z, zeff],
  );

  const sliceData = useMemo(() => {
    if (activeState.kind === "relativistic" && !checkDiracCoulombDomain(system.Z, activeState.kappa).valid) {
      return null;
    }
    const quantity: FieldQuantity =
      activeState.kind === "relativistic" ? "dirac-total-density" : sliceQuantity;
    return evaluate2DSlice(
      activeState,
      isOneElectron ? system.Z : zeff,
      isOneElectron ? system.reducedMassRatio : 1,
      {
        plane,
        offsetBohr,
        extentBohr,
        resolution: 88,
        quantity,
      },
    );
  }, [activeState, system.Z, system.reducedMassRatio, isOneElectron, zeff, sliceQuantity, plane, offsetBohr, extentBohr]);

  const diracView: DiracRadialView | null = useMemo(() => {
    if (config.theoryMode !== "dirac" || !isOneElectron || !pointNucleus) return null;
    if (!checkDiracCoulombDomain(system.Z, diracState.kappa).valid) return null;
    const ex = integrateDiracExpectationValues(diracState.n, diracState.kappa, system.Z, system.reducedMassRatio, undefined, 1600);
    const l = lFromKappa(diracState.kappa);
    const aScale = 1 / system.reducedMassRatio;
    const rMax = Math.max(((3 * diracState.n * diracState.n - l * (l + 1)) * aScale) / (2 * system.Z) * 5, (10 * diracState.n * aScale) / system.Z);
    const rBohr: number[] = [];
    const P_nkappa: number[] = [];
    const Q_nkappa: number[] = [];
    const radialProbability: number[] = [];
    for (let i = 0; i < 200; i++) {
      const r = (i / 199) * rMax;
      const pq = diracRadialPQ(diracState.n, diracState.kappa, r, system.Z, system.reducedMassRatio);
      rBohr.push(r);
      P_nkappa.push(pq.P);
      Q_nkappa.push(pq.Q);
      radialProbability.push(pq.P * pq.P + pq.Q * pq.Q);
    }
    return {
      label: `${diracState.n}${SUBSHELL_LETTERS[l] ?? `l${l}`}_${Math.round(2 * diracState.j)}/2`,
      rBohr,
      P_nkappa,
      Q_nkappa,
      radialProbability,
      integratedNorm: ex.totalSpinorNorm,
      smallFraction: ex.smallComponentNorm,
      meanR_a0: ex.meanR_a0,
    };
  }, [config.theoryMode, isOneElectron, pointNucleus, system.Z, system.reducedMassRatio, diracState]);

  const aScale = isOneElectron ? 1 / system.reducedMassRatio : 1;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-3">
      <div className="flex flex-col gap-3">
        <Panel title="2D Quantitative Cross-Section Slice">
          <div className="mb-2 flex flex-col gap-2">
            <Seg
              value={plane}
              onChange={(p) => setPlane(p)}
              options={[
                { v: "xy", label: "XY (z=c)" },
                { v: "xz", label: "XZ (y=c)" },
                { v: "yz", label: "YZ (x=c)" },
              ]}
            />
            {activeState.kind === "nonrelativistic" && (
              <Seg
                value={sliceQuantity}
                onChange={(m) => setSliceQuantity(m)}
                options={[
                  { v: "wavefunction-signed", label: "Signed ψ (phase)" },
                  { v: "density", label: "Density |ψ|²" },
                ]}
              />
            )}
            <Slider
              label="Slice offset (a₀)"
              value={offsetBohr}
              min={-extentBohr * 0.6}
              max={extentBohr * 0.6}
              step={extentBohr / 40}
              onChange={setOffsetBohr}
              format={(v) => `${v.toFixed(2)} a₀`}
            />
          </div>
          <Slice2DCanvas
            slice={sliceData}
            label={activeState.kind === "relativistic" ? "Dirac |Ψ|²" : `ψ_${nrState.n}${SUBSHELL_LETTERS[nrState.l] ?? ""}`}
          />
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Radial Functions & Expectation Values">
          <RadialPlot
            mode={diracView ? "dirac" : totalRadialView ? "atom" : "single"}
            n={nrState.n}
            l={nrState.l}
            zeff={isOneElectron ? system.Z : zeff}
            model={model}
            totalDensity={totalRadialView}
            diracView={diracView}
          />
          {isOneElectron && pointNucleus && (
            <div className="mt-3 flex flex-col gap-1 border-t border-zinc-800 pt-2 text-xs">
              <Row label="Analytic <r>">{meanRadiusAnalytic(nrState.n, nrState.l, system.Z, aScale).toFixed(6)} a₀</Row>
              <Row label="Analytic <r²>">{meanRSquaredAnalytic(nrState.n, nrState.l, system.Z, aScale).toFixed(6)} a₀²</Row>
              <Row label="Analytic <r⁻¹>">{meanInvRAnalytic(nrState.n, system.Z, aScale).toFixed(6)} a₀⁻¹</Row>
              <Row label="Analytic <r⁻²>">{meanInvRSquaredAnalytic(nrState.n, nrState.l, system.Z, aScale).toFixed(6)} a₀⁻²</Row>
              <Row label="Analytic <r⁻³>">
                {(() => {
                  const v = meanInvRCubedAnalytic(nrState.n, nrState.l, system.Z, aScale);
                  return v === null ? "divergent (l = 0)" : `${v.toFixed(6)} a₀⁻³`;
                })()}
              </Row>
            </div>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Scientific Provenance & Coverage Matrix">
          <Inspector
            element={element}
            model={model}
            sub={sub}
            m={nrState.m_l}
            basis={nrState.basis}
            providerSelection={providerSelection}
            hfDataset={null}
            electrons={electrons}
          />
        </Panel>
      </div>
    </div>
  );
}
