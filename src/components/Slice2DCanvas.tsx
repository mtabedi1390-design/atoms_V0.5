import { useEffect, useRef } from "react";
import type { Slice2DResult } from "@/numerics/isosurface/marchingTetrahedra";

interface Slice2DCanvasProps {
  readonly slice: Slice2DResult | null;
  readonly label?: string;
}

/**
 * 2D XY / XZ / YZ cross-section heatmap view rendered from exact scalar-field data.
 * Color is a mathematical representation of amplitude/density, never physical electron color.
 */
export function Slice2DCanvas({ slice, label }: Slice2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !slice) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const N = slice.resolution;
    canvas.width = N;
    canvas.height = N;
    const img = ctx.createImageData(N, N);
    const denom = Math.max(slice.maxAbs, 1e-30);

    for (let j = 0; j < N; j++) {
      // Flip vertical row so +axis is top
      const row = N - 1 - j;
      for (let i = 0; i < N; i++) {
        const v = slice.values[row * N + i];
        const dst = (j * N + i) * 4;
        if (slice.isSigned) {
          const g = Math.pow(Math.min(1, Math.abs(v) / denom), 0.55);
          if (v >= 0) {
            img.data[dst] = Math.round(245 * g);
            img.data[dst + 1] = Math.round(145 * g);
            img.data[dst + 2] = Math.round(22 * g);
          } else {
            img.data[dst] = Math.round(45 * g);
            img.data[dst + 1] = Math.round(165 * g);
            img.data[dst + 2] = Math.round(248 * g);
          }
          img.data[dst + 3] = 255;
        } else {
          const t = Math.min(1, Math.log1p(250 * (Math.max(0, v) / denom)) / Math.log1p(250));
          img.data[dst] = Math.round(Math.min(255, t * 270));
          img.data[dst + 1] = Math.round(Math.min(255, t * t * 245));
          img.data[dst + 2] = Math.round(Math.min(255, 25 + t * 210));
          img.data[dst + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [slice]);

  if (!slice) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-500">
        Select a slice plane (XY, XZ, or YZ) to inspect a 2D mathematical cross-section.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span>
          {slice.plane.toUpperCase()} slice @ {slice.offsetBohr.toFixed(2)} a₀
          {label ? ` · ${label}` : ""}
        </span>
        <span>±{slice.extentPm.toFixed(0)} pm</span>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="2D orbital slice heatmap"
        className="w-full aspect-square rounded border border-zinc-800 bg-black"
        style={{ imageRendering: "auto" }}
      />
      <div className="flex justify-between font-mono text-[10px] text-zinc-500 tabular-nums">
        <span>{slice.isSigned ? "orange (+) / blue (−) phase" : "log-scaled density"}</span>
        <span>max {slice.maxAbs.toExponential(2)}</span>
      </div>
    </div>
  );
}
