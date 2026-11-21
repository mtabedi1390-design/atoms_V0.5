/**
 * Minimal faithful in-memory IDBFactory shim for testing IndexedDBExperimentStore
 * (including schema versioning, onupgradeneeded, indexes, and error/blocked paths) in Node Vitest.
 */
interface StoreData {
  keyPath: string;
  records: Map<string, unknown>;
  indexes: Map<string, string>; // indexName -> keyPath
}

class ShimDOMStringList {
  constructor(private readonly items: string[]) {}
  get length(): number {
    return this.items.length;
  }
  contains(name: string): boolean {
    return this.items.includes(name);
  }
  item(i: number): string | null {
    return this.items[i] ?? null;
  }
}

function makeRequest<T>(exec: () => T): IDBRequest<T> {
  const req: {
    result: T;
    error: DOMException | null;
    onsuccess: ((ev: Event) => void) | null;
    onerror: ((ev: Event) => void) | null;
  } = {
    result: undefined as unknown as T,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    try {
      req.result = exec();
      req.onsuccess?.({} as Event);
    } catch (e) {
      req.error = e instanceof DOMException ? e : new DOMException(String(e));
      req.onerror?.({} as Event);
    }
  });
  return req as unknown as IDBRequest<T>;
}

export function createInMemoryIDBFactory(opts?: { simulateBlocked?: boolean }): IDBFactory {
  const databases = new Map<string, { version: number; stores: Map<string, StoreData> }>();

  return {
    open(name: string, version = 1): IDBOpenDBRequest {
      const req: {
        result: IDBDatabase | null;
        error: DOMException | null;
        onupgradeneeded: ((ev: IDBVersionChangeEvent) => void) | null;
        onblocked: ((ev: Event) => void) | null;
        onsuccess: ((ev: Event) => void) | null;
        onerror: ((ev: Event) => void) | null;
      } = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onblocked: null,
        onsuccess: null,
        onerror: null,
      };

      queueMicrotask(() => {
        if (opts?.simulateBlocked) {
          req.onblocked?.({} as Event);
          return;
        }
        let dbEntry = databases.get(name);
        const oldVersion = dbEntry ? dbEntry.version : 0;
        if (!dbEntry) {
          dbEntry = { version, stores: new Map() };
          databases.set(name, dbEntry);
        }

        const dbHandle = {
          name,
          get version() {
            return dbEntry!.version;
          },
          get objectStoreNames() {
            return new ShimDOMStringList([...dbEntry!.stores.keys()]) as unknown as DOMStringList;
          },
          onversionchange: null,
          close() {},
          createObjectStore(storeName: string, options?: IDBObjectStoreParameters) {
            const store: StoreData = {
              keyPath: String(options?.keyPath ?? "id"),
              records: new Map(),
              indexes: new Map(),
            };
            dbEntry!.stores.set(storeName, store);
            return {
              createIndex(idxName: string, keyPath: string) {
                store.indexes.set(idxName, keyPath);
                return {} as IDBIndex;
              },
            } as unknown as IDBObjectStore;
          },
          transaction(storeNames: string | string[]) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const tx: {
              error: DOMException | null;
              oncomplete: ((ev: Event) => void) | null;
              onabort: ((ev: Event) => void) | null;
              onerror: ((ev: Event) => void) | null;
              abort: () => void;
              objectStore: (sName: string) => IDBObjectStore;
            } = {
              error: null,
              oncomplete: null,
              onabort: null,
              onerror: null,
              abort() {
                tx.error = new DOMException("Aborted", "AbortError");
                tx.onabort?.({} as Event);
              },
              objectStore(sName: string): IDBObjectStore {
                if (!names.includes(sName)) {
                  throw new DOMException(`Store ${sName} not in transaction`, "NotFoundError");
                }
                const store = dbEntry!.stores.get(sName);
                if (!store) {
                  throw new DOMException(`Unknown object store ${sName}`, "NotFoundError");
                }
                const wrapStore = {
                  put(val: Record<string, unknown>) {
                    return makeRequest(() => {
                      const key = String(val[store.keyPath]);
                      store.records.set(key, structuredClone(val));
                      return key;
                    });
                  },
                  get(key: IDBValidKey) {
                    return makeRequest(() => {
                      const found = store.records.get(String(key));
                      return found ? structuredClone(found) : undefined;
                    });
                  },
                  getAll() {
                    return makeRequest(() => [...store.records.values()].map((v) => structuredClone(v)));
                  },
                  delete(key: IDBValidKey) {
                    return makeRequest(() => {
                      store.records.delete(String(key));
                      return undefined;
                    });
                  },
                  clear() {
                    return makeRequest(() => {
                      store.records.clear();
                      return undefined;
                    });
                  },
                  index(idxName: string) {
                    const keyPath = store.indexes.get(idxName);
                    if (!keyPath) throw new DOMException(`Unknown index ${idxName}`, "NotFoundError");
                    return {
                      getAll(query?: IDBValidKey) {
                        return makeRequest(() => {
                          const all = [...store.records.values()];
                          const filtered =
                            query === undefined
                              ? all
                              : all.filter((r) => (r as Record<string, unknown>)[keyPath] === query);
                          return filtered.map((v) => structuredClone(v));
                        });
                      },
                    } as unknown as IDBIndex;
                  },
                };
                return wrapStore as unknown as IDBObjectStore;
              },
            };
            // Fire tx.oncomplete after microtasks flush
            setTimeout(() => {
              if (!tx.error) tx.oncomplete?.({} as Event);
            }, 0);
            return tx as unknown as IDBTransaction;
          },
        } as unknown as IDBDatabase;

        req.result = dbHandle;
        if (oldVersion < version) {
          dbEntry.version = version;
          req.onupgradeneeded?.({ oldVersion, newVersion: version } as IDBVersionChangeEvent);
        }
        req.onsuccess?.({} as Event);
      });

      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}
