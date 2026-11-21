/// <reference lib="webworker" />
import type { NonRelativisticState, RelativisticState } from "@/domain/quantum";
import {
  extractStateIsosurface,
  type FieldQuantity,
  type IsosurfaceExtractionResult,
} from "@/numerics/isosurface/marchingTetrahedra";
import {
  sampleDiracSpinorCloud,
  type DiracSampleResult,
} from "@/sampling/diracSampler";

export type DiracComponentView = "total" | "large" | "small";

export type VisWorkerInbound =
  | {
      readonly type: "sample-dirac";
      readonly id: number;
      readonly state: RelativisticState;
      readonly Z: number;
      readonly reducedMassRatio: number;
      readonly count: number;
      readonly seed: number;
      readonly componentView: DiracComponentView;
    }
  | {
      readonly type: "extract-isosurface";
      readonly id: number;
      readonly state: NonRelativisticState | RelativisticState;
      readonly Z: number;
      readonly reducedMassRatio: number;
      readonly quantity: FieldQuantity;
      readonly isoFraction: number;
      readonly resolution: number;
      readonly extentBohr: number;
    };

export type VisWorkerOutbound =
  | {
      readonly type: "dirac-done";
      readonly id: number;
      readonly cloud: DiracSampleResult;
      readonly elapsedMs: number;
    }
  | {
      readonly type: "isosurface-done";
      readonly id: number;
      readonly surface: IsosurfaceExtractionResult;
      readonly elapsedMs: number;
    }
  | {
      readonly type: "error";
      readonly id: number;
      readonly message: string;
    };

const post = (msg: VisWorkerOutbound, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (ev: MessageEvent<VisWorkerInbound>) => {
  const msg = ev.data;
  const t0 = performance.now();
  try {
    if (msg.type === "sample-dirac") {
      const cloud = sampleDiracSpinorCloud({
        state: msg.state,
        Z: msg.Z,
        reducedMassRatio: msg.reducedMassRatio,
        count: msg.count,
        seed: msg.seed,
        componentView: msg.componentView,
      });
      post(
        { type: "dirac-done", id: msg.id, cloud, elapsedMs: performance.now() - t0 },
        [cloud.positionsBohr.buffer, cloud.density.buffer, cloud.phase.buffer],
      );
      return;
    }

    const surface = extractStateIsosurface(msg.state, msg.Z, msg.reducedMassRatio, {
      resolution: msg.resolution,
      extentBohr: msg.extentBohr,
      isoFraction: msg.isoFraction,
      quantity: msg.quantity,
    });

    const transfers: Transferable[] = [];
    for (const m of surface.meshes) {
      transfers.push(m.positionsPm.buffer, m.normals.buffer);
    }

    post({ type: "isosurface-done", id: msg.id, surface, elapsedMs: performance.now() - t0 }, transfers);
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
