/**
 * Main-thread client for the sampling worker.  Tracks the newest request id per
 * slot so stale results can never overwrite a newer selection.
 */
import SamplerWorker from "./sampler.worker?worker&inline";
import type { SampleDone, WorkerInbound, WorkerOutbound } from "./protocol";
import type { SamplingParams } from "./sampler";

export interface SlotCallbacks {
  onProgress?: (fraction: number) => void;
  onDone: (result: SampleDone) => void;
  onError?: (message: string) => void;
}

export class SamplerClient {
  private worker: Worker;
  private nextId = 1;
  private latest = new Map<string, number>();
  private callbacks = new Map<number, SlotCallbacks>();
  private fatal: ((msg: string) => void) | null = null;

  constructor() {
    this.worker = new SamplerWorker();
    this.worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => this.handle(ev.data);
    this.worker.onerror = (e) => this.fatal?.(`Sampler worker crashed: ${e.message}`);
  }

  onFatal(cb: (msg: string) => void): void {
    this.fatal = cb;
  }

  request(slot: string, params: SamplingParams, cb: SlotCallbacks): number {
    const prev = this.latest.get(slot);
    if (prev !== undefined) {
      this.post({ type: "cancel", id: prev });
      this.callbacks.delete(prev);
    }
    const id = this.nextId++;
    this.latest.set(slot, id);
    this.callbacks.set(id, cb);
    this.post({ type: "sample", id, slot, params });
    return id;
  }

  /** Cancel whatever is in flight for a slot (e.g. subshell hidden). */
  cancelSlot(slot: string): void {
    const prev = this.latest.get(slot);
    if (prev !== undefined) {
      this.post({ type: "cancel", id: prev });
      this.callbacks.delete(prev);
      this.latest.delete(slot);
    }
  }

  cancelAllExcept(keep: Set<string>): void {
    for (const slot of [...this.latest.keys()]) if (!keep.has(slot)) this.cancelSlot(slot);
  }

  dispose(): void {
    this.worker.terminate();
    this.callbacks.clear();
    this.latest.clear();
  }

  private post(msg: WorkerInbound): void {
    this.worker.postMessage(msg);
  }

  private handle(msg: WorkerOutbound): void {
    const cb = this.callbacks.get(msg.id);
    if (msg.type === "progress") {
      if (cb && this.latest.get(msg.slot) === msg.id) cb.onProgress?.(msg.fraction);
      return;
    }
    this.callbacks.delete(msg.id);
    if (msg.type === "cancelled") return;
    if (this.latest.get(msg.slot) !== msg.id) return; // stale — discard
    if (msg.type === "error") cb?.onError?.(msg.message);
    else cb?.onDone(msg);
  }
}
