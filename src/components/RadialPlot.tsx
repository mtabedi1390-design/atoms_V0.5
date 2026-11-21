import { useMemo } from "react";
import { BOHR_PM, meanRadiusAnalytic, radialExtent, radialMoments, radialNodes, radialPDF, subshellLabel } from "@/physics/hydrogenic";
import { MODELS, type ModelId } from "@/physics/models";

export interface TotalRadialDensityView {
  readonly label: string;
  readonly rBohr: readonly number[];
  readonly rhoElectronPerBohr3: readonly number[];
  readonly integratedElectrons: number;
  readonly expectedElectrons: number;
  readonly limitationsNote: string;
}

export interface DiracRadialView {
  readonly label: string;
  readonly rBohr: readonly number[];
  readonly P_nkappa: readonly number[];
  readonly Q_nkappa: readonly number[];
  readonly radialProbability: readonly number[];
  readonly integratedNorm: number;
  readonly smallFraction: number;
  readonly meanR_a0?: number;
}

interface Props {
  mode: "single" | "atom" | "dirac";
  n: number;
  l: number;
  zeff: number;
  model: ModelId;
  totalDensity?: TotalRadialDensityView | null;
  diracView?: DiracRadialView | null;
}

/**
 * Radial probability / density distribution plot.
 * - Single-orbital or Slater subshell mode: P_r(r) = r^2 |R_nl(r)|^2 (pm^-1, integral = 1).
 * - Full-atom total-density mode (Dirac-Fock or PySCF HF): P_total(r) = 4*pi*r^2*rho(r) (pm^-1, integral = Z).
 * - Dirac spinor mode: coupled large P_nkappa(r), small Q_nkappa(r), and total |P|^2+|Q|^2.
 */
export function RadialPlot({ mode, n, l, zeff, model, totalDensity, diracView }: Props) {
  const W = 320, H = 150, padL = 36, padB = 22, padT = 8, padR = 8;

  const diracData = useMemo(() => {
    if (mode !== "dirac" || !diracView) return null;
    const { rBohr, P_nkappa, Q_nkappa, radialProbability } = diracView;
    const rMaxPm = (rBohr[rBohr.length - 1] ?? 1) * BOHR_PM;
    let maxProb = 1e-12;
    let maxAmp = 1e-12;
    for (let i = 0; i < rBohr.length; i++) {
      const pPm = radialProbability[i] / BOHR_PM;
      if (pPm > maxProb) maxProb = pPm;
      maxAmp = Math.max(maxAmp, Math.abs(P_nkappa[i]), Math.abs(Q_nkappa[i]));
    }
    return { rMaxPm, maxProb, maxAmp };
  }, [mode, diracView]);

  const totalData = useMemo(() => {
    if (mode !== "atom" || !totalDensity) return null;
    const { rBohr, rhoElectronPerBohr3 } = totalDensity;
    // Choose a visually informative radial window covering ~99.5% of cumulative charge
    let cum = 0;
    let rCutBohr = rBohr[rBohr.length - 1];
    const pBohr = new Array<number>(rBohr.length);
    let rMoment = 0;
    let totalIntegral = 0;
    for (let i = 0; i < rBohr.length; i++) {
      pBohr[i] = 4 * Math.PI * rBohr[i] * rBohr[i] * rhoElectronPerBohr3[i];
    }
    for (let i = 1; i < rBohr.length; i++) {
      const dr = rBohr[i] - rBohr[i - 1];
      const seg = 0.5 * (pBohr[i - 1] + pBohr[i]) * dr;
      totalIntegral += seg;
      rMoment += 0.5 * (rBohr[i - 1] * pBohr[i - 1] + rBohr[i] * pBohr[i]) * dr;
    }
    for (let i = 1; i < rBohr.length; i++) {
      const dr = rBohr[i] - rBohr[i - 1];
      cum += 0.5 * (pBohr[i - 1] + pBohr[i]) * dr;
      if (cum >= totalIntegral * 0.995) {
        rCutBohr = Math.max(rBohr[i] * 1.15, 4);
        break;
      }
    }
    const pts: [number, number][] = [];
    let max = 0;
    for (let i = 0; i < rBohr.length; i++) {
      if (rBohr[i] > rCutBohr) break;
      const pPm = pBohr[i] / BOHR_PM;
      pts.push([rBohr[i] * BOHR_PM, pPm]);
      if (pPm > max) max = pPm;
    }
    return {
      pts,
      max: Math.max(max, 1e-12),
      rMaxPm: rCutBohr * BOHR_PM,
      integrated: totalIntegral,
      meanNumPm: (rMoment / Math.max(totalIntegral, 1e-30)) * BOHR_PM,
      tailFraction: Math.max(0, 1 - totalIntegral / totalDensity.expectedElectrons),
    };
  }, [mode, totalDensity]);

  const orbData = useMemo(() => {
    const rMax = radialExtent(n, l, zeff) * 0.85;
    const N = 240;
    const pts: [number, number][] = [];
    let max = 0;
    for (let i = 0; i <= N; i++) {
      const r = (i / N) * rMax;
      const p = radialPDF(n, l, r, zeff) / BOHR_PM; // per pm
      pts.push([r * BOHR_PM, p]);
      if (p > max) max = p;
    }
    const nodes = radialNodes(n, l, zeff).map((r) => r * BOHR_PM);
    const mom = radialMoments(n, l, zeff, 1, 4000);
    return { pts, max, rMaxPm: rMax * BOHR_PM, nodes, meanNum: mom.meanR * BOHR_PM, norm: mom.norm, meanAn: meanRadiusAnalytic(n, l, zeff) * BOHR_PM };
  }, [n, l, zeff]);

  const active = totalData ?? orbData;
  const sx = (x: number) => padL + (x / active.rMaxPm) * (W - padL - padR);
  const sy = (y: number) => H - padB - (y / (active.max * 1.08)) * (H - padB - padT);
  const path = active.pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const ticks = 4;
  const fmtR = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));

  if (diracData && diracView) {
    const rMaxPm = diracData.rMaxPm;
    const dsx = (rBohr: number) => padL + ((rBohr * BOHR_PM) / Math.max(rMaxPm, 1e-12)) * (W - padL - padR);
    const maxP = Math.max(...diracView.P_nkappa.map(Math.abs), 1e-12);
    const maxQ = Math.max(...diracView.Q_nkappa.map(Math.abs), 1e-12);
    const qGain = maxQ < 0.1 * maxP ? Math.min(200, Math.pow(10, Math.floor(Math.log10(maxP / maxQ)))) : 1;
    const ampSpan = Math.max(maxP, maxQ * qGain) * 1.1;
    const yMid = padT + (H - padB - padT) * 0.5;
    const yHalf = (H - padB - padT) * 0.48;
    const dsyAmp = (v: number) => yMid - (v / ampSpan) * yHalf;
    const dsyProb = (pBohr: number) => H - padB - ((pBohr / BOHR_PM) / (diracData.maxProb * 1.08)) * (H - padB - padT);

    const step = Math.max(1, Math.floor(diracView.rBohr.length / 240));
    const pathP: string[] = [];
    const pathQ: string[] = [];
    const pathProb: string[] = [];
    for (let i = 0; i < diracView.rBohr.length; i += step) {
      const x = dsx(diracView.rBohr[i]).toFixed(1);
      const cmd = i === 0 ? "M" : "L";
      pathP.push(`${cmd}${x},${dsyAmp(diracView.P_nkappa[i]).toFixed(1)}`);
      pathQ.push(`${cmd}${x},${dsyAmp(diracView.Q_nkappa[i] * qGain).toFixed(1)}`);
      pathProb.push(`${cmd}${x},${dsyProb(diracView.radialProbability[i]).toFixed(1)}`);
    }

    return (
      <div className="flex flex-col gap-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dirac spinor radial components P, Q, and probability">
          <rect x={padL} y={padT} width={W - padL - padR} height={H - padB - padT} fill="#0a0a0a" stroke="#27272a" strokeWidth={0.5} />
          <line x1={padL} x2={W - padR} y1={yMid} y2={yMid} stroke="#27272a" strokeWidth={0.6} strokeDasharray="2 2" />
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const xPm = (i / ticks) * rMaxPm;
            const px = padL + (xPm / Math.max(rMaxPm, 1e-12)) * (W - padL - padR);
            return (
              <g key={i}>
                <line x1={px} x2={px} y1={H - padB} y2={H - padB + 3} stroke="#52525b" strokeWidth={0.5} />
                <text x={px} y={H - 8} textAnchor="middle" fill="#a1a1aa" fontSize={8} fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtR(xPm)}</text>
              </g>
            );
          })}
          <text x={W - padR} y={H - 1} textAnchor="end" fill="#71717a" fontSize={7}>r / pm</text>
          <text x={2} y={padT + 8} fill="#38bdf8" fontSize={7}>P(r)</text>
          <text x={2} y={padT + 17} fill="#f59e0b" fontSize={6}>{qGain > 1 ? `Q×${qGain}` : "Q(r)"}</text>
          <text x={2} y={padT + 26} fill="#e4e4e7" fontSize={6}>|P|²+|Q|²</text>
          {diracView.meanR_a0 !== undefined && (
            <line x1={dsx(diracView.meanR_a0)} x2={dsx(diracView.meanR_a0)} y1={padT} y2={H - padB} stroke="#22d3ee" strokeWidth={0.7} />
          )}
          <path d={pathProb.join(" ")} fill="none" stroke="#a1a1aa" strokeWidth={1.0} strokeDasharray="3 2" />
          <path d={pathP.join(" ")} fill="none" stroke="#38bdf8" strokeWidth={1.3} />
          <path d={pathQ.join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.2} />
        </svg>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
          <span>spinor</span><span className="text-sky-300">{diracView.label}</span>
          <span>∫(|P|²+|Q|²) dr</span><span className="text-zinc-200">{diracView.integratedNorm.toFixed(7)}</span>
          <span>small fraction ∫|Q|²dr</span><span className="text-amber-300">{(diracView.smallFraction * 100).toFixed(4)}%</span>
          <span className="col-span-2 mt-1 text-zinc-500">
            P_nκ (large) and Q_nκ (small) are coupled components of one 4-component Dirac spinor — never independent orbitals.{qGain > 1 ? ` Small component plotted ×${qGain} for visibility.` : ""}
          </span>
        </div>
      </div>
    );
  }

  if (totalData && totalDensity) {
    return (
      <div className="flex flex-col gap-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Full-atom radial electron density distribution">
          <rect x={padL} y={padT} width={W - padL - padR} height={H - padB - padT} fill="#0a0a0a" stroke="#27272a" strokeWidth={0.5} />
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const x = (i / ticks) * totalData.rMaxPm;
            return (
              <g key={i}>
                <line x1={sx(x)} x2={sx(x)} y1={H - padB} y2={H - padB + 3} stroke="#52525b" strokeWidth={0.5} />
                <text x={sx(x)} y={H - 8} textAnchor="middle" fill="#a1a1aa" fontSize={8} fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtR(x)}</text>
              </g>
            );
          })}
          <text x={W - padR} y={H - 1} textAnchor="end" fill="#71717a" fontSize={7}>r / pm</text>
          <text x={2} y={padT + 8} fill="#71717a" fontSize={7}>4πr²ρ</text>
          <text x={2} y={padT + 16} fill="#71717a" fontSize={6}>e⁻/pm</text>
          <text x={padL - 3} y={padT + 6} textAnchor="end" fill="#a1a1aa" fontSize={7} fontFamily="monospace">{totalData.max.toExponential(1)}</text>
          <line x1={sx(totalData.meanNumPm)} x2={sx(totalData.meanNumPm)} y1={padT} y2={H - padB} stroke="#22d3ee" strokeWidth={0.7} />
          <path d={path} fill="none" stroke="#7dd3fc" strokeWidth={1.3} />
        </svg>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
          <span>distribution</span><span className="text-sky-300">{totalDensity.label}</span>
          <span>⟨r⟩ per e⁻ (numeric)</span><span className="text-cyan-300">{totalData.meanNumPm.toFixed(2)} pm</span>
          <span>∫4πr²ρ(r) dr</span><span className="text-zinc-200">{totalData.integrated.toFixed(5)} / {totalDensity.expectedElectrons} e⁻</span>
          <span>radial shells</span><span className="text-zinc-400">total density (no R_nl)</span>
          <span className="col-span-2 mt-1 text-zinc-500">{totalDensity.limitationsNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Radial probability distribution">
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padB - padT} fill="#0a0a0a" stroke="#27272a" strokeWidth={0.5} />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const x = (i / ticks) * orbData.rMaxPm;
          return (
            <g key={i}>
              <line x1={sx(x)} x2={sx(x)} y1={H - padB} y2={H - padB + 3} stroke="#52525b" strokeWidth={0.5} />
              <text x={sx(x)} y={H - 8} textAnchor="middle" fill="#a1a1aa" fontSize={8} fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtR(x)}</text>
            </g>
          );
        })}
        <text x={W - padR} y={H - 1} textAnchor="end" fill="#71717a" fontSize={7}>r / pm</text>
        <text x={2} y={padT + 8} fill="#71717a" fontSize={7}>P(r)</text>
        <text x={2} y={padT + 16} fill="#71717a" fontSize={6}>pm⁻¹</text>
        <text x={padL - 3} y={padT + 6} textAnchor="end" fill="#a1a1aa" fontSize={7} fontFamily="monospace">{orbData.max.toExponential(1)}</text>
        {orbData.nodes.map((r, i) => (
          <line key={i} x1={sx(r)} x2={sx(r)} y1={padT} y2={H - padB} stroke="#f59e0b" strokeDasharray="2 2" strokeWidth={0.7} />
        ))}
        <line x1={sx(orbData.meanNum)} x2={sx(orbData.meanNum)} y1={padT} y2={H - padB} stroke="#22d3ee" strokeWidth={0.7} />
        <path d={path} fill="none" stroke="#e4e4e7" strokeWidth={1.2} />
      </svg>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
        <span>orbital</span><span className="text-zinc-200">{subshellLabel(n, l)} · Z<sub>eff</sub>={zeff.toFixed(3)}</span>
        <span>⟨r⟩ numeric</span><span className="text-cyan-300">{orbData.meanNum.toFixed(2)} pm</span>
        <span>⟨r⟩ {model === "hydrogenic-exact" ? "analytic" : "Z_eff surrogate"}</span><span className="text-zinc-300">{orbData.meanAn.toFixed(2)} pm</span>
        <span>∫P dr</span><span className="text-zinc-300">{orbData.norm.toFixed(6)}</span>
        <span>radial nodes</span><span className="text-amber-300">{orbData.nodes.length ? orbData.nodes.map((r) => r.toFixed(1)).join(", ") + " pm" : "none"}</span>
        <span className="col-span-2 mt-1 text-zinc-500">
          {MODELS[model].name}. Convention: ∫|R|²r²dr = 1 ⇒ P(r) = r²|R|² (angular part already normalised).
          {model === "slater-screened-hydrogenic" && " Note: ⟨r⟩ uses the hydrogenic formula at Slater Z_eff, not an SCF expectation value."}
        </span>
      </div>
    </div>
  );
}
