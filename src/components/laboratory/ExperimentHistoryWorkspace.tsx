import { useState } from "react";
import type { SavedExperimentEntry } from "@/app/useAtomsLaboratory";
import type { ExperimentDefinition, ExperimentExecution, ExperimentResultRecord } from "@/experiments/schema";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly history: readonly SavedExperimentEntry[];
  readonly executions: readonly ExperimentExecution[];
  readonly selectedResult: ExperimentResultRecord | null;
  readonly platformNotice: string | null;
  readonly onRunSingleState: () => void;
  readonly onCancelExecution: (executionId: string) => void;
  readonly onReplayExperiment: (experimentId: string) => void;
  readonly onRerunExperiment: (def: ExperimentDefinition) => void;
  readonly onDeleteExperiment: (experimentId: string) => void;
  readonly onExportJson: (entry: SavedExperimentEntry) => string;
  readonly onImportJson: (json: string) => Promise<void>;
}

export function ExperimentHistoryWorkspace({
  history,
  executions,
  selectedResult,
  platformNotice,
  onRunSingleState,
  onCancelExecution,
  onReplayExperiment,
  onRerunExperiment,
  onDeleteExperiment,
  onExportJson,
  onImportJson,
}: Props) {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [exportedPreview, setExportedPreview] = useState<string | null>(null);

  const handleImport = async () => {
    setImportError(null);
    try {
      await onImportJson(importText);
      setImportText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Panel title="Experiment Ledger (IndexedDB + Worker Runner)">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400">
              Separates ExperimentDefinition, ExperimentExecution, and ResultRecord with provenance.
            </span>
            <button
              type="button"
              data-testid="history-run-current"
              onClick={onRunSingleState}
              className="rounded-sm bg-amber-400 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Run Current State Experiment
            </button>
          </div>

          {platformNotice && (
            <div className="mb-2 rounded-sm border border-sky-800 bg-sky-950/30 p-2 text-[11px] text-sky-200">
              {platformNotice}
            </div>
          )}

          {executions.some((e) => e.status === "queued" || e.status === "running") && (
            <div className="mb-2 space-y-1">
              {executions
                .filter((e) => e.status === "queued" || e.status === "running")
                .map((ex) => (
                  <div key={ex.executionId} className="flex items-center justify-between rounded-sm border border-amber-700 bg-amber-950/20 px-2 py-1 text-xs">
                    <span>{ex.executionId} · {ex.status} ({(ex.progress.fraction * 100).toFixed(0)}%)</span>
                    <button
                      type="button"
                      onClick={() => onCancelExecution(ex.executionId)}
                      className="rounded-sm border border-red-700 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-950"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
            </div>
          )}

          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">
              No saved experiments yet. Run a calculation from any workspace to record it in local IndexedDB.
            </p>
          ) : (
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {history.map((entry) => {
                const lastExec = entry.executions[entry.executions.length - 1];
                return (
                  <div
                    key={entry.definition.id}
                    data-testid="saved-experiment-card"
                    className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-100">{entry.definition.title}</span>
                      <Badge kind={lastExec?.status === "completed" ? "evaluated" : "unavailable"}>
                        {lastExec?.status ?? "saved"}
                      </Badge>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-400">
                      kind={entry.definition.kind} · provider={entry.definition.providerId}@{entry.definition.providerVersion} · Z={entry.definition.system.Z}, N={entry.definition.system.N} · {entry.definition.constantsVersion}
                    </div>
                    {lastExec?.error && (
                      <p className="mt-1 text-[11px] text-amber-300">
                        [{lastExec.error.code}] {lastExec.error.message}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onReplayExperiment(entry.definition.id)}
                        className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-zinc-800"
                      >
                        Load / Replay
                      </button>
                      <button
                        type="button"
                        onClick={() => onRerunExperiment(entry.definition)}
                        className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-zinc-800"
                      >
                        Rerun Calculation
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportedPreview(onExportJson(entry))}
                        className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteExperiment(entry.definition.id)}
                        className="rounded-sm border border-zinc-800 px-2 py-0.5 text-[11px] text-red-400 hover:bg-zinc-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Import Validated Experiment JSON (atom-exp/v1)">
          <textarea
            aria-label="Import experiment JSON"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste exported atom-exp/v1 JSON bundle here...'
            rows={4}
            className="w-full rounded-sm border border-zinc-700 bg-zinc-900 p-2 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
          />
          {importError && <p className="mt-1 text-xs text-red-400">{importError}</p>}
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              disabled={!importText.trim()}
              onClick={handleImport}
              className="rounded-sm border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Validate &amp; Import JSON
            </button>
          </div>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title="Result Record & Provenance Inspector">
          {!selectedResult ? (
            <p className="text-xs text-zinc-500">
              Select <span className="text-sky-300">Load / Replay</span> or <span className="text-amber-300">Rerun Calculation</span> to inspect provenance, numerical quality, and validation checks.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-amber-300">{selectedResult.resultId}</span>
                <Badge kind={selectedResult.source === "computed" ? "exact" : "evaluated"}>
                  source: {selectedResult.source}
                </Badge>
              </div>
              <Row label="Recomputed count">{selectedResult.recomputedCount}</Row>
              <Row label="Provider / version">{selectedResult.providerId}@{selectedResult.providerVersion}</Row>
              <Row label="Constants version">{selectedResult.constantsVersion}</Row>
              <Row label="Nuclear model">{selectedResult.nuclearModelUsed.kind} (μ/mₑ={selectedResult.reducedMassRatioUsed.toFixed(8)})</Row>
              <Row label="Computed timestamp">{selectedResult.computedAtIso}</Row>
              {selectedResult.loadedAtIso && <Row label="Replayed timestamp">{selectedResult.loadedAtIso}</Row>}
              <div className="mt-1 space-y-0.5 border-t border-zinc-800 pt-1.5">
                {selectedResult.validationChecks.map((c) => (
                  <div key={c.name} className="text-[11px] text-zinc-300">
                    <span className={c.passed ? "text-emerald-400" : "text-red-400"}>{c.passed ? "✓" : "✗"}</span>{" "}
                    <span className="font-mono">{c.name}</span>: {c.detail}
                  </div>
                ))}
              </div>
              <pre className="mt-2 max-h-60 overflow-auto rounded-sm border border-zinc-800 bg-black p-2 font-mono text-[10px] text-zinc-300">
                {JSON.stringify(selectedResult.payload, null, 2).slice(0, 4000)}
              </pre>
            </div>
          )}
        </Panel>

        {exportedPreview && (
          <Panel title="Exported Experiment JSON Bundle">
            <textarea
              readOnly
              value={exportedPreview}
              rows={8}
              className="w-full rounded-sm border border-zinc-800 bg-black p-2 font-mono text-[10px] text-zinc-300"
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
