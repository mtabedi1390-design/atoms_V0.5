import { useMemo } from "react";
import { BOHR_PM, meanRadiusAnalytic, radialExtent, radialMoments, radialNodes, radialPDF, subshellLabel } from "@/physics/hydrogenic";
import { MODELS, type ModelId } from "@/physics/models";

interface Props {
  n: number;
  l: number;
  zeff: number;
  model: ModelId;
}

/** P_r(r) = r²|R_nl(r)|² (per pm), computed from the active model's radial function. */
export function RadialPlot({ n, l, zeff, model }: Props) {
  const W = 320, H = 150, padL = 36, padB = 22, padT = 8, padR = 8;
  const data = useMemo(() => {
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

  const sx = (x: number) => padL + (x / data.rMaxPm) * (W - padL - padR);
  const sy = (y: number) => H - padB - (y / (data.max * 1.08)) * (H - padB - padT);
  const path = data.pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const ticks = 4;
  const fmtR = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Radial probability distribution">
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padB - padT} fill="#0a0a0a" stroke="#27272a" strokeWidth={0.5} />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const x = (i / ticks) * data.rMaxPm;
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
        <text x={padL - 3} y={padT + 6} textAnchor="end" fill="#a1a1aa" fontSize={7} fontFamily="monospace">{data.max.toExponential(1)}</text>
        {data.nodes.map((r, i) => (
          <line key={i} x1={sx(r)} x2={sx(r)} y1={padT} y2={H - padB} stroke="#f59e0b" strokeDasharray="2 2" strokeWidth={0.7} />
        ))}
        <line x1={sx(data.meanNum)} x2={sx(data.meanNum)} y1={padT} y2={H - padB} stroke="#22d3ee" strokeWidth={0.7} />
        <path d={path} fill="none" stroke="#e4e4e7" strokeWidth={1.2} />
      </svg>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
        <span>orbital</span><span className="text-zinc-200">{subshellLabel(n, l)} · Z<sub>eff</sub>={zeff.toFixed(3)}</span>
        <span>⟨r⟩ numeric</span><span className="text-cyan-300">{data.meanNum.toFixed(2)} pm</span>
        <span>⟨r⟩ analytic</span><span className="text-zinc-300">{data.meanAn.toFixed(2)} pm</span>
        <span>∫P dr</span><span className="text-zinc-300">{data.norm.toFixed(6)}</span>
        <span>radial nodes</span><span className="text-amber-300">{data.nodes.length ? data.nodes.map((r) => r.toFixed(1)).join(", ") + " pm" : "none"}</span>
        <span className="col-span-2 mt-1 text-zinc-500">{MODELS[model].name}. Convention: ∫|R|²r²dr = 1 ⇒ P(r) = r²|R|² (angular part already normalised).</span>
      </div>
    </div>
  );
}
