/**
 * ExperimentStore — versioned IndexedDB persistence + Memory fallback (ATOMS v0.6.0 Phase 2).
 *
 * Separates three object stores:
 *  - "experiments" (ExperimentDefinition)
 *  - "executions"  (ExperimentExecution)
 *  - "results"     (ExperimentResultRecord)
 *
 * Loading stored results explicitly sets `source: "loaded-from-store"` and `loadedAtIso`
 * while preserving original `computedAtIso` and provenance, distinguishing replay from recompute.
 */
import {
  toPlainCloneSafeData,
  type ExperimentDefinition,
  type ExperimentError,
  type ExperimentExecution,
  type ExperimentResultRecord,
} from "../schema";
import type { ExperimentBundleEntry } from "./serializer";

export const ATOMS_IDB_NAME = "atoms_laboratory_db" as const;
export const ATOMS_IDB_VERSION = 1 as const;

export interface ExperimentStorageBackend {
  saveExperiment(def: ExperimentDefinition): Promise<void>;
  getExperiment(experimentId: string): Promise<ExperimentDefinition | undefined>;
  listExperiments(): Promise<readonly ExperimentDefinition[]>;
  deleteExperiment(experimentId: string): Promise<void>;

  saveExecution(exec: ExperimentExecution): Promise<void>;
  listExecutions(experimentId?: string): Promise<readonly ExperimentExecution[]>;

  saveResult(result: ExperimentResultRecord): Promise<void>;
  getResult(resultId: string): Promise<ExperimentResultRecord | undefined>;
  listResults(experimentId?: string): Promise<readonly ExperimentResultRecord[]>;

  loadExperimentBundle(experimentId: string): Promise<{
    readonly definition?: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly results: readonly ExperimentResultRecord[];
  }>;

  clearAll(): Promise<void>;
  close(): void;
}

export class ExperimentStorageError extends Error {
  readonly experimentError: ExperimentError;

  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "ExperimentStorageError";
    this.experimentError = {
      code: "STORAGE_ERROR",
      message,
      recoverable: true,
      details,
    };
  }
}

function markLoaded(res: ExperimentResultRecord): ExperimentResultRecord {
  return {
    ...res,
    source: res.source === "imported-json" ? "imported-json" : "loaded-from-store",
    loadedAtIso: new Date().toISOString(),
  };
}

/**
 * In-memory backend sharing the exact same async semantics for headless / test usage
 * when native browser IndexedDB is absent.
 */
export class MemoryExperimentStore implements ExperimentStorageBackend {
  private readonly experiments = new Map<string, ExperimentDefinition>();
  private readonly executions = new Map<string, ExperimentExecution>();
  private readonly results = new Map<string, ExperimentResultRecord>();

  async saveExperiment(def: ExperimentDefinition): Promise<void> {
    this.experiments.set(def.id, structuredClone(toPlainCloneSafeData(def)) as ExperimentDefinition);
  }

  async getExperiment(experimentId: string): Promise<ExperimentDefinition | undefined> {
    const d = this.experiments.get(experimentId);
    return d ? (structuredClone(d) as ExperimentDefinition) : undefined;
  }

  async listExperiments(): Promise<readonly ExperimentDefinition[]> {
    return [...this.experiments.values()]
      .map((d) => structuredClone(d) as ExperimentDefinition)
      .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  async deleteExperiment(experimentId: string): Promise<void> {
    this.experiments.delete(experimentId);
    for (const [id, ex] of this.executions) {
      if (ex.experimentId === experimentId) this.executions.delete(id);
    }
    for (const [id, res] of this.results) {
      if (res.experimentId === experimentId) this.results.delete(id);
    }
  }

  async saveExecution(exec: ExperimentExecution): Promise<void> {
    this.executions.set(exec.executionId, structuredClone(toPlainCloneSafeData(exec)) as ExperimentExecution);
  }

  async listExecutions(experimentId?: string): Promise<readonly ExperimentExecution[]> {
    const all = [...this.executions.values()];
    return (experimentId ? all.filter((e) => e.experimentId === experimentId) : all)
      .map((e) => structuredClone(e) as ExperimentExecution)
      .sort((a, b) => a.runSequence - b.runSequence);
  }

  async saveResult(result: ExperimentResultRecord): Promise<void> {
    this.results.set(result.resultId, structuredClone(toPlainCloneSafeData(result)) as ExperimentResultRecord);
  }

  async getResult(resultId: string): Promise<ExperimentResultRecord | undefined> {
    const r = this.results.get(resultId);
    return r ? markLoaded(structuredClone(r) as ExperimentResultRecord) : undefined;
  }

  async listResults(experimentId?: string): Promise<readonly ExperimentResultRecord[]> {
    const all = [...this.results.values()];
    return (experimentId ? all.filter((r) => r.experimentId === experimentId) : all)
      .map((r) => markLoaded(structuredClone(r) as ExperimentResultRecord))
      .sort((a, b) => a.runSequence - b.runSequence);
  }

  async loadExperimentBundle(experimentId: string): Promise<{
    readonly definition?: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly results: readonly ExperimentResultRecord[];
  }> {
    const [definition, executions, results] = await Promise.all([
      this.getExperiment(experimentId),
      this.listExecutions(experimentId),
      this.listResults(experimentId),
    ]);
    return { definition, executions, results };
  }

  async clearAll(): Promise<void> {
    this.experiments.clear();
    this.executions.clear();
    this.results.clear();
  }

  close(): void {
    // nothing to close
  }
}

export interface IndexedDBStoreOptions {
  readonly dbName?: string;
  readonly dbVersion?: number;
  readonly idbFactory?: IDBFactory;
  readonly onUpgrade?: (oldVersion: number, newVersion: number) => void;
}

/**
 * Browser IndexedDB persistence backend with explicit schema versioning,
 * `onupgradeneeded` migrations, `onblocked` protection, and structured error handling.
 */
export class IndexedDBExperimentStore implements ExperimentStorageBackend {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly factory: IDBFactory;
  private readonly onUpgrade?: (oldVersion: number, newVersion: number) => void;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private openDb: IDBDatabase | null = null;

  constructor(options: IndexedDBStoreOptions = {}) {
    const factory = options.idbFactory ?? (typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined);
    if (!factory) {
      throw new ExperimentStorageError("IndexedDB API is unavailable in this environment.");
    }
    this.dbName = options.dbName ?? ATOMS_IDB_NAME;
    this.dbVersion = options.dbVersion ?? ATOMS_IDB_VERSION;
    this.factory = factory;
    this.onUpgrade = options.onUpgrade;
  }

  private getDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.factory.open(this.dbName, this.dbVersion);
      } catch (err) {
        this.dbPromise = null;
        reject(new ExperimentStorageError(`Failed to open IndexedDB "${this.dbName}": ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion ?? 0;
        const newVersion = event.newVersion ?? this.dbVersion;
        try {
          applySchemaUpgrade(db, oldVersion, newVersion);
          this.onUpgrade?.(oldVersion, newVersion);
        } catch (err) {
          reject(new ExperimentStorageError(`IndexedDB schema upgrade v${oldVersion} -> v${newVersion} failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      };

      req.onblocked = () => {
        this.dbPromise = null;
        reject(new ExperimentStorageError(`IndexedDB upgrade blocked by another open connection on "${this.dbName}".`));
      };

      req.onerror = () => {
        this.dbPromise = null;
        reject(new ExperimentStorageError(`IndexedDB open error: ${req.error?.message ?? "Unknown error"}`));
      };

      req.onsuccess = () => {
        const db = req.result;
        this.openDb = db;
        db.onversionchange = () => {
          db.close();
          this.openDb = null;
          this.dbPromise = null;
        };
        resolve(db);
      };
    });
    return this.dbPromise;
  }

  private async runTx<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    op: (stores: Record<string, IDBObjectStore>) => Promise<T>,
  ): Promise<T> {
    const db = await this.getDatabase();
    const tx = db.transaction(storeNames, mode);
    const storeMap: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) {
      storeMap[name] = tx.objectStore(name);
    }

    return await new Promise<T>((resolve, reject) => {
      let resultValue!: T;
      let opCompleted = false;

      tx.oncomplete = () => {
        if (opCompleted) resolve(resultValue);
      };
      tx.onabort = () => {
        reject(new ExperimentStorageError(`IndexedDB transaction aborted: ${tx.error?.message ?? "aborted"}`));
      };
      tx.onerror = () => {
        reject(new ExperimentStorageError(`IndexedDB transaction error: ${tx.error?.message ?? "error"}`));
      };

      void op(storeMap)
        .then((val) => {
          resultValue = val;
          opCompleted = true;
        })
        .catch((err) => {
          try {
            tx.abort();
          } catch {
            // ignore abort error if already closing
          }
          reject(err instanceof ExperimentStorageError ? err : new ExperimentStorageError(String(err)));
        });
    });
  }

  async saveExperiment(def: ExperimentDefinition): Promise<void> {
    const clean = toPlainCloneSafeData(def) as ExperimentDefinition;
    await this.runTx(["experiments"], "readwrite", async ({ experiments }) => {
      await idbReq(experiments.put(clean));
    });
  }

  async getExperiment(experimentId: string): Promise<ExperimentDefinition | undefined> {
    return await this.runTx(["experiments"], "readonly", async ({ experiments }) => {
      const val = await idbReq<ExperimentDefinition | undefined>(experiments.get(experimentId));
      return val;
    });
  }

  async listExperiments(): Promise<readonly ExperimentDefinition[]> {
    return await this.runTx(["experiments"], "readonly", async ({ experiments }) => {
      const all = await idbReq<ExperimentDefinition[]>(experiments.getAll());
      return all.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
    });
  }

  async deleteExperiment(experimentId: string): Promise<void> {
    await this.runTx(["experiments", "executions", "results"], "readwrite", async ({ experiments, executions, results }) => {
      await idbReq(experiments.delete(experimentId));
      const execMatches = await idbReq<ExperimentExecution[]>(executions.index("by_experimentId").getAll(experimentId));
      for (const ex of execMatches) await idbReq(executions.delete(ex.executionId));
      const resMatches = await idbReq<ExperimentResultRecord[]>(results.index("by_experimentId").getAll(experimentId));
      for (const res of resMatches) await idbReq(results.delete(res.resultId));
    });
  }

  async saveExecution(exec: ExperimentExecution): Promise<void> {
    const clean = toPlainCloneSafeData(exec) as ExperimentExecution;
    await this.runTx(["executions"], "readwrite", async ({ executions }) => {
      await idbReq(executions.put(clean));
    });
  }

  async listExecutions(experimentId?: string): Promise<readonly ExperimentExecution[]> {
    return await this.runTx(["executions"], "readonly", async ({ executions }) => {
      const rows = experimentId
        ? await idbReq<ExperimentExecution[]>(executions.index("by_experimentId").getAll(experimentId))
        : await idbReq<ExperimentExecution[]>(executions.getAll());
      return rows.sort((a, b) => a.runSequence - b.runSequence);
    });
  }

  async saveResult(result: ExperimentResultRecord): Promise<void> {
    const clean = toPlainCloneSafeData(result) as ExperimentResultRecord;
    await this.runTx(["results"], "readwrite", async ({ results }) => {
      await idbReq(results.put(clean));
    });
  }

  async getResult(resultId: string): Promise<ExperimentResultRecord | undefined> {
    return await this.runTx(["results"], "readonly", async ({ results }) => {
      const row = await idbReq<ExperimentResultRecord | undefined>(results.get(resultId));
      return row ? markLoaded(row) : undefined;
    });
  }

  async listResults(experimentId?: string): Promise<readonly ExperimentResultRecord[]> {
    return await this.runTx(["results"], "readonly", async ({ results }) => {
      const rows = experimentId
        ? await idbReq<ExperimentResultRecord[]>(results.index("by_experimentId").getAll(experimentId))
        : await idbReq<ExperimentResultRecord[]>(results.getAll());
      return rows.map(markLoaded).sort((a, b) => a.runSequence - b.runSequence);
    });
  }

  async loadExperimentBundle(experimentId: string): Promise<{
    readonly definition?: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly results: readonly ExperimentResultRecord[];
  }> {
    return await this.runTx(["experiments", "executions", "results"], "readonly", async ({ experiments, executions, results }) => {
      const [definition, execRows, resRows] = await Promise.all([
        idbReq<ExperimentDefinition | undefined>(experiments.get(experimentId)),
        idbReq<ExperimentExecution[]>(executions.index("by_experimentId").getAll(experimentId)),
        idbReq<ExperimentResultRecord[]>(results.index("by_experimentId").getAll(experimentId)),
      ]);
      return {
        definition,
        executions: execRows.sort((a, b) => a.runSequence - b.runSequence),
        results: resRows.map(markLoaded).sort((a, b) => a.runSequence - b.runSequence),
      };
    });
  }

  async saveBundleEntry(entry: ExperimentBundleEntry): Promise<void> {
    await this.runTx(["experiments", "executions", "results"], "readwrite", async ({ experiments, executions, results }) => {
      await idbReq(experiments.put(toPlainCloneSafeData(entry.definition)));
      for (const ex of entry.executions) {
        await idbReq(executions.put(toPlainCloneSafeData(ex)));
      }
      for (const res of entry.results) {
        await idbReq(results.put(toPlainCloneSafeData(res)));
      }
    });
  }

  async clearAll(): Promise<void> {
    await this.runTx(["experiments", "executions", "results"], "readwrite", async ({ experiments, executions, results }) => {
      await idbReq(experiments.clear());
      await idbReq(executions.clear());
      await idbReq(results.clear());
    });
  }

  close(): void {
    if (this.openDb) {
      this.openDb.close();
      this.openDb = null;
      this.dbPromise = null;
    }
  }
}

export function applySchemaUpgrade(db: IDBDatabase, oldVersion: number, _newVersion: number): void {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains("experiments")) {
      const expStore = db.createObjectStore("experiments", { keyPath: "id" });
      expStore.createIndex("by_updatedAt", "updatedAtIso", { unique: false });
      expStore.createIndex("by_kind", "kind", { unique: false });
      expStore.createIndex("by_providerId", "providerId", { unique: false });
    }
    if (!db.objectStoreNames.contains("executions")) {
      const execStore = db.createObjectStore("executions", { keyPath: "executionId" });
      execStore.createIndex("by_experimentId", "experimentId", { unique: false });
      execStore.createIndex("by_status", "status", { unique: false });
      execStore.createIndex("by_queuedAt", "queuedAtIso", { unique: false });
    }
    if (!db.objectStoreNames.contains("results")) {
      const resStore = db.createObjectStore("results", { keyPath: "resultId" });
      resStore.createIndex("by_experimentId", "experimentId", { unique: false });
      resStore.createIndex("by_executionId", "executionId", { unique: false });
      resStore.createIndex("by_computedAt", "computedAtIso", { unique: false });
    }
  }
}

function idbReq<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new ExperimentStorageError(req.error?.message ?? "IndexedDB request failed"));
  });
}

export function createDefaultExperimentStore(): ExperimentStorageBackend {
  if (typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined") {
    return new IndexedDBExperimentStore();
  }
  return new MemoryExperimentStore();
}
