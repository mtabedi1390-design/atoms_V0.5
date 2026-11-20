/// <reference lib="webworker" />
import { SamplerCache, cacheKey, sampleOrbital } from "./sampler";
import type { WorkerInbound, WorkerOutbound } from "./protocol";

const cache = new SamplerCache(64);
const cancelled = new Set<number>();
const queue: Extract<WorkerInbound, { type: "sample" }>[] = [];
let busy = false;

const post = (msg: WorkerOutbound, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

function runNext(): void {
  if (busy) return;
  const req = queue.shift();
  if (!req) return;
  busy = true;
  const { id, slot, params } = req;
  if (cancelled.has(id)) {
    cancelled.delete(id);
    post({ type: "cancelled", id, slot });
    busy = false;
    setTimeout(runNext, 0);
    return;
  }
  const t0 = performance.now();
  try {
    const hit = cache.has(cacheKey(params));
    const res = sampleOrbital(
      params,
      cache,
      (fraction) => post({ type: "progress", id, slot, fraction }),
      () => cancelled.has(id),
    );
    if (!res) {
      cancelled.delete(id);
      post({ type: "cancelled", id, slot });
    } else {
      post(
        { type: "done", id, slot, positions: res.positions, density: res.density, phase: res.phase, maxDensity: res.maxDensity, rMax: res.rMax, elapsedMs: performance.now() - t0, cacheHit: hit, electrons: res.electrons, includedMass: res.radial.includedMass, tailMass: res.radial.tailMass },
        [res.positions.buffer, res.density.buffer, res.phase.buffer],
      );
    }
  } catch (e) {
    post({ type: "error", id, slot, message: e instanceof Error ? e.message : String(e) });
  } finally {
    busy = false;
    setTimeout(runNext, 0);
  }
}

self.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.id);
    // drop from queue if not started
    const i = queue.findIndex((q) => q.id === msg.id);
    if (i >= 0) {
      queue.splice(i, 1);
      cancelled.delete(msg.id);
      post({ type: "cancelled", id: msg.id, slot: "" });
    }
    return;
  }
  // Supersede any queued request for the same slot
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].slot === msg.slot) {
      const old = queue.splice(i, 1)[0];
      post({ type: "cancelled", id: old.id, slot: old.slot });
    }
  }
  queue.push(msg);
  runNext();
};
