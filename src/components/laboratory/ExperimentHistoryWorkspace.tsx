import { useEffect, useState } from "react";
import type { QuantumTheoryMode, SavedExperimentEntry } from "@/app/useAtomsLaboratory";
import type { ExperimentDefinition, ExperimentExecution, ExperimentResultRecord } from "@/experiments/schema";
import { useFirebase } from "@/firebase/FirebaseProvider";
import {
  BLUEPRINT_LIMITS,
  type AllowedBasis,
  type AtomicBookmarkDoc,
  type CloudExperimentDoc,
  type UserAccountDoc,
} from "@/firebase/validation";
import { Badge, Panel, Row } from "@/components/ui";

interface Props {
  readonly history: readonly SavedExperimentEntry[];
  readonly executions: readonly ExperimentExecution[];
  readonly selectedResult: ExperimentResultRecord | null;
  readonly platformNotice: string | null;
  readonly currentZ: number;
  readonly currentN: number;
  readonly currentTheoryMode: QuantumTheoryMode;
  readonly onRunSingleState: () => void;
  readonly onCancelExecution: (executionId: string) => void;
  readonly onReplayExperiment: (experimentId: string) => void;
  readonly onRerunExperiment: (def: ExperimentDefinition) => void;
  readonly onDeleteExperiment: (experimentId: string) => void;
  readonly onExportJson: (entry: SavedExperimentEntry) => string;
  readonly onImportJson: (json: string) => Promise<void>;
  readonly onApplyBookmark: (bm: AtomicBookmarkDoc) => void;
  readonly onApplyPreferences: (account: UserAccountDoc) => void;
  readonly onImportCloudExperiment: (doc: CloudExperimentDoc) => Promise<void>;
}

export function ExperimentHistoryWorkspace({
  history,
  executions,
  selectedResult,
  platformNotice,
  currentZ,
  currentN,
  currentTheoryMode,
  onRunSingleState,
  onCancelExecution,
  onReplayExperiment,
  onRerunExperiment,
  onDeleteExperiment,
  onExportJson,
  onImportJson,
  onApplyBookmark,
  onApplyPreferences,
  onImportCloudExperiment,
}: Props) {
  const {
    user,
    authReady,
    signingIn,
    authError,
    syncingId,
    userAccount,
    cloudExperiments,
    bookmarks,
    signInWithGoogle,
    signOutUser,
    savePreferences,
    syncExperiment,
    removeCloudExperiment,
    saveBookmark,
    removeBookmark,
  } = useFirebase();

  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [exportedPreview, setExportedPreview] = useState<string | null>(null);

  const [prefName, setPrefName] = useState("");
  const [prefZ, setPrefZ] = useState(currentZ);
  const [prefMode, setPrefMode] = useState<QuantumTheoryMode>(currentTheoryMode);
  const [prefBasis, setPrefBasis] = useState<AllowedBasis>("cc-pvdz");

  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [bookmarkWorkspace, setBookmarkWorkspace] = useState<string>("workbench");
  const [bookmarkNotes, setBookmarkNotes] = useState("");
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    if (userAccount) {
      setPrefName(userAccount.displayName);
      setPrefZ(userAccount.preferredZ);
      setPrefMode(userAccount.preferredTheoryMode);
      setPrefBasis(userAccount.preferredBasis);
    } else if (user) {
      setPrefName(user.displayName ?? user.email?.split("@")[0] ?? "ATOMS Researcher");
    }
  }, [userAccount, user]);

  const handleImport = async () => {
    setImportError(null);
    try {
      await onImportJson(importText);
      setImportText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSavePreferences = async () => {
    setCloudNotice(null);
    setCloudBusy(true);
    try {
      await savePreferences({
        displayName: prefName || "ATOMS Researcher",
        preferredZ: prefZ,
        preferredTheoryMode: prefMode,
        preferredBasis: prefBasis,
      });
      setCloudNotice("Cloud preferences saved to Firestore.");
    } catch (err) {
      setCloudNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCreateBookmark = async () => {
    setCloudNotice(null);
    setCloudBusy(true);
    try {
      const label = bookmarkLabel.trim() || `Z=${currentZ}, N=${currentN} (${currentTheoryMode})`;
      await saveBookmark({
        label,
        Z: currentZ,
        N: currentN,
        workspace: bookmarkWorkspace,
        theoryMode: currentTheoryMode,
        notes: bookmarkNotes,
      });
      setBookmarkLabel("");
      setBookmarkNotes("");
      setCloudNotice(`Saved bookmark "${label.slice(0, BLUEPRINT_LIMITS.bookmarkLabelMaxLength)}".`);
    } catch (err) {
      setCloudNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSyncSingleEntry = async (entry: SavedExperimentEntry) => {
    setCloudNotice(null);
    try {
      await syncExperiment({
        definition: entry.definition,
        executions: entry.executions,
        latestResult: entry.latestResult,
      });
      setCloudNotice(`Synced "${entry.definition.title}" to Cloud Firestore.`);
    } catch (err) {
      setCloudNotice(err instanceof Error ? err.message : String(err));
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
                const isCloudSynced = cloudExperiments.some((ce) => ce.experimentId === entry.definition.id);
                return (
                  <div
                    key={entry.definition.id}
                    data-testid="saved-experiment-card"
                    className="rounded-sm border border-zinc-800 bg-zinc-900/50 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-100">{entry.definition.title}</span>
                      <div className="flex items-center gap-1">
                        {isCloudSynced && <Badge kind="exact">cloud</Badge>}
                        <Badge kind={lastExec?.status === "completed" ? "evaluated" : "unavailable"}>
                          {lastExec?.status ?? "saved"}
                        </Badge>
                      </div>
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
                      {user?.emailVerified && (
                        <button
                          type="button"
                          disabled={syncingId === entry.definition.id}
                          onClick={() => void handleSyncSingleEntry(entry)}
                          className="rounded-sm border border-emerald-800 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50"
                        >
                          {syncingId === entry.definition.id ? "Syncing…" : "Sync to Cloud"}
                        </button>
                      )}
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

        <Panel title="Cloud Sync, Researcher Preferences & Atomic Bookmarks (Firebase)">
          {!authReady ? (
            <p className="text-xs text-zinc-500">Checking Firebase authentication state…</p>
          ) : !user ? (
            <div className="flex flex-col gap-2 text-xs">
              <p className="text-zinc-400">
                All quantum solvers and IndexedDB persistence work offline. Sign in with Google to sync experiment ledgers, researcher preferences, and atomic system bookmarks to Cloud Firestore.
              </p>
              {authError && (
                <p className="rounded-sm border border-red-900 bg-red-950/40 p-2 text-[11px] text-red-300">
                  {authError}
                </p>
              )}
              <div>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void signInWithGoogle()}
                  className="rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                >
                  {signingIn ? "Opening Google Sign-In…" : "Sign in with Google"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-900/50 p-2">
                <div>
                  <div className="font-semibold text-zinc-100">
                    {userAccount?.displayName ?? user.displayName ?? "ATOMS Researcher"}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-400">
                    {user.email} · {user.emailVerified ? "verified" : "unverified"} · uid={user.uid.slice(0, 10)}…
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </div>

              {(authError || cloudNotice) && (
                <div
                  className={`rounded-sm border p-2 text-[11px] ${
                    authError
                      ? "border-red-900 bg-red-950/40 text-red-300"
                      : "border-emerald-800 bg-emerald-950/30 text-emerald-200"
                  }`}
                >
                  {authError ?? cloudNotice}
                </div>
              )}

              {/* Researcher Preferences */}
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-2.5">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  Researcher Cloud Preferences
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    Display Name
                    <input
                      type="text"
                      value={prefName}
                      maxLength={BLUEPRINT_LIMITS.displayNameMaxLength}
                      onChange={(e) => setPrefName(e.target.value)}
                      className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    Preferred Z (1–118)
                    <input
                      type="number"
                      min={1}
                      max={118}
                      value={prefZ}
                      onChange={(e) => setPrefZ(Number(e.target.value) || 1)}
                      className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    Preferred One-Electron Theory
                    <select
                      value={prefMode}
                      onChange={(e) => setPrefMode(e.target.value as QuantumTheoryMode)}
                      className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                    >
                      {BLUEPRINT_LIMITS.allowedTheoryModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                    Preferred HF/LS-CI Basis
                    <select
                      value={prefBasis}
                      onChange={(e) => setPrefBasis(e.target.value as AllowedBasis)}
                      className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
                    >
                      {BLUEPRINT_LIMITS.allowedBases.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={cloudBusy}
                    onClick={() => void handleSavePreferences()}
                    className="rounded-sm border border-amber-600/60 bg-amber-950/30 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
                  >
                    Save Preferences to Cloud
                  </button>
                  {userAccount && (
                    <button
                      type="button"
                      onClick={() => onApplyPreferences(userAccount)}
                      className="rounded-sm border border-zinc-700 px-2.5 py-1 text-[11px] text-sky-300 hover:bg-zinc-800"
                    >
                      Apply Cloud Defaults to Lab
                    </button>
                  )}
                </div>
              </div>

              {/* Atomic Bookmarks */}
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-2.5">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  Atomic System Bookmarks (Current: Z={currentZ}, N={currentN}, {currentTheoryMode})
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    aria-label="Bookmark label"
                    placeholder={`e.g. Z=${currentZ}, N=${currentN} benchmark`}
                    value={bookmarkLabel}
                    maxLength={BLUEPRINT_LIMITS.bookmarkLabelMaxLength}
                    onChange={(e) => setBookmarkLabel(e.target.value)}
                    className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  />
                  <select
                    aria-label="Bookmark target workspace"
                    value={bookmarkWorkspace}
                    onChange={(e) => setBookmarkWorkspace(e.target.value)}
                    className="rounded-sm border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  >
                    {BLUEPRINT_LIMITS.allowedWorkspaces.map((ws) => (
                      <option key={ws} value={ws}>
                        {ws}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  aria-label="Bookmark notes"
                  placeholder="Optional scientific notes (max 500 chars)..."
                  value={bookmarkNotes}
                  maxLength={BLUEPRINT_LIMITS.bookmarkNotesMaxLength}
                  onChange={(e) => setBookmarkNotes(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-sm border border-zinc-700 bg-zinc-950 p-1.5 text-[11px] text-zinc-200"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    disabled={cloudBusy}
                    onClick={() => void handleCreateBookmark()}
                    className="rounded-sm border border-emerald-700/70 bg-emerald-950/30 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-50"
                  >
                    Bookmark Current System
                  </button>
                </div>

                {bookmarks.length > 0 && (
                  <div className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto border-t border-zinc-800 pt-2">
                    {bookmarks.map((bm) => (
                      <div
                        key={bm.bookmarkId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950/70 p-2"
                      >
                        <div>
                          <div className="font-medium text-zinc-100">{bm.label}</div>
                          <div className="font-mono text-[10px] text-zinc-400">
                            Z={bm.Z}, N={bm.N} · {bm.workspace} · {bm.theoryMode}
                          </div>
                          {bm.notes && <div className="mt-0.5 text-[10px] text-zinc-400">{bm.notes}</div>}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApplyBookmark(bm)}
                            className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-zinc-800"
                          >
                            Open System
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeBookmark(bm.bookmarkId)}
                            className="rounded-sm border border-zinc-800 px-2 py-0.5 text-[11px] text-red-400 hover:bg-zinc-800"
                          >
                            Remove Bookmark
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cloud-Synced Experiments */}
              <div className="rounded-sm border border-zinc-800 bg-zinc-900/30 p-2.5">
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  Cloud-Synced Experiments ({cloudExperiments.length})
                </div>
                {cloudExperiments.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">
                    Completed experiments sync automatically while signed in, or click Sync to Cloud on any local ledger entry.
                  </p>
                ) : (
                  <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                    {cloudExperiments.map((ce) => (
                      <div
                        key={ce.experimentId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-zinc-800 bg-zinc-950/70 p-2"
                      >
                        <div>
                          <div className="font-medium text-zinc-100">{ce.title}</div>
                          <div className="font-mono text-[10px] text-zinc-400">
                            {ce.kind} · {ce.providerId}@{ce.providerVersion} · Z={ce.Z}, N={ce.N}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void onImportCloudExperiment(ce)}
                            className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-zinc-800"
                          >
                            Import to Local
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeCloudExperiment(ce.experimentId)}
                            className="rounded-sm border border-zinc-800 px-2 py-0.5 text-[11px] text-red-400 hover:bg-zinc-800"
                          >
                            Remove Cloud
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
