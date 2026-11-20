import type { SamplingParams } from "./sampler";

export interface SampleRequest {
  type: "sample";
  id: number;
  /** Identifies the slot (e.g. subshell key) so the main thread can discard stale results per slot. */
  slot: string;
  params: SamplingParams;
}
export interface CancelRequest {
  type: "cancel";
  id: number;
}
export type WorkerInbound = SampleRequest | CancelRequest;

export interface SampleProgress {
  type: "progress";
  id: number;
  slot: string;
  fraction: number;
}
export interface SampleDone {
  type: "done";
  id: number;
  slot: string;
  positions: Float32Array;
  density: Float32Array;
  phase: Float32Array;
  maxDensity: number;
  rMax: number;
  elapsedMs: number;
  cacheHit: boolean;
  electrons: number;
  includedMass: number;
  tailMass: number;
}
export interface SampleCancelled {
  type: "cancelled";
  id: number;
  slot: string;
}
export interface SampleError {
  type: "error";
  id: number;
  slot: string;
  message: string;
}
export type WorkerOutbound = SampleProgress | SampleDone | SampleCancelled | SampleError;
