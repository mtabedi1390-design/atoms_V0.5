import VisWorker from "./visualization.worker?worker&inline";
import type { NonRelativisticState, RelativisticState } from "@/domain/quantum";
import type { FieldQuantity, IsosurfaceExtractionResult } from "@/numerics/isosurface/marchingTetrahedra";
import type { DiracSampleResult } from "@/sampling/diracSampler";
import type { DiracComponentView, VisWorkerInbound, VisWorkerOutbound } from "./visualization.worker";

export type { DiracComponentView };

export class VisualizationWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private latestDiracId = 0;
  private latestIsoId = 0;
  private diracCallbacks = new Map<number, { onDone: (c: DiracSampleResult, ms: number) => void; onError?: (m: string) => void }>();
  private isoCallbacks = new Map<number, { onDone: (s: IsosurfaceExtractionResult, ms: number) => void; onError?: (m: string) => void }>();

  constructor() {
    if (typeof Worker !== "undefined") {
      this.worker = new VisWorker();
      this.worker.onmessage = (ev: MessageEvent<VisWorkerOutbound>) => this.handle(ev.data);
    }
  }

  sampleDirac(
    req: {
      state: RelativisticState;
      Z: number;
      reducedMassRatio: number;
      count: number;
      seed: number;
      componentView: DiracComponentView;
    },
    onDone: (cloud: DiracSampleResult, elapsedMs: number) => void,
    onError?: (msg: string) => void,
  ): void {
    if (!this.worker) return;
    const id = this.nextId++;
    this.latestDiracId = id;
    this.diracCallbacks.set(id, { onDone, onError });
    this.worker.postMessage({ type: "sample-dirac", id, ...req } satisfies VisWorkerInbound);
  }

  extractIsosurface(
    req: {
      state: NonRelativisticState | RelativisticState;
      Z: number;
      reducedMassRatio: number;
      quantity: FieldQuantity;
      isoFraction: number;
      resolution: number;
      extentBohr: number;
    },
    onDone: (surface: IsosurfaceExtractionResult, elapsedMs: number) => void,
    onError?: (msg: string) => void,
  ): void {
    if (!this.worker) return;
    const id = this.nextId++;
    this.latestIsoId = id;
    this.isoCallbacks.set(id, { onDone, onError });
    this.worker.postMessage({ type: "extract-isosurface", id, ...req } satisfies VisWorkerInbound);
  }

  private handle(msg: VisWorkerOutbound): void {
    if (msg.type === "dirac-done") {
      const cb = this.diracCallbacks.get(msg.id);
      this.diracCallbacks.delete(msg.id);
      if (cb && msg.id === this.latestDiracId) cb.onDone(msg.cloud, msg.elapsedMs);
      return;
    }
    if (msg.type === "isosurface-done") {
      const cb = this.isoCallbacks.get(msg.id);
      this.isoCallbacks.delete(msg.id);
      if (cb && msg.id === this.latestIsoId) cb.onDone(msg.surface, msg.elapsedMs);
      return;
    }
    if (msg.type === "error") {
      const d = this.diracCallbacks.get(msg.id);
      if (d) {
        this.diracCallbacks.delete(msg.id);
        d.onError?.(msg.message);
      }
      const iso = this.isoCallbacks.get(msg.id);
      if (iso) {
        this.isoCallbacks.delete(msg.id);
        iso.onError?.(msg.message);
      }
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.diracCallbacks.clear();
    this.isoCallbacks.clear();
  }
}
