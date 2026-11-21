import ExperimentWorker from "./experiment.worker?worker&inline";
import type { WorkerLike } from "./protocol";

export function createBrowserExperimentWorker(): WorkerLike {
  return new ExperimentWorker() as unknown as WorkerLike;
}
