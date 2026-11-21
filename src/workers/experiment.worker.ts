/// <reference lib="webworker" />
import { createDefaultProviderRegistry } from "@/physics/providers/registry";
import {
  createExperimentWorkerRuntime,
  type ExperimentWorkerInbound,
  type ExperimentWorkerOutbound,
} from "./protocol";

const registry = createDefaultProviderRegistry();
const runtime = createExperimentWorkerRuntime(registry, (msg: ExperimentWorkerOutbound) => {
  (self as unknown as Worker).postMessage(msg);
});

self.onmessage = (ev: MessageEvent<ExperimentWorkerInbound>) => {
  runtime.receive(ev.data);
};
