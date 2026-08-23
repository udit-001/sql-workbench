/**
 * Tiny promise wrapper over one IndexedDB key-value store shared by all
 * bench persistence (journal events, imported-CSV bytes). Falls back to
 * an in-memory map when IndexedDB is unavailable so features degrade
 * instead of dying.
 */

const DB_NAME = "sql-workbench";
const DB_VERSION = 1;
const STORE = "kv";

interface KvBackend {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

let backendPromise: Promise<KvBackend> | null = null;

async function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function memoryBackend(): KvBackend {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key) as never;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

function idbBackend(db: IDBDatabase): KvBackend {
  function tx<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = body(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  }
  return {
    get: (key) => tx("readonly", (store) => store.get(key)),
    put: (key, value) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
      }),
    delete: (key) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
      }),
  };
}

/** Opens (once) the shared store; memory fallback keeps the app usable. */
export async function openKv(): Promise<KvBackend> {
  backendPromise ??= openIdb()
    .then(idbBackend)
    .catch((err) => {
      console.warn("[sql-workbench] IndexedDB unavailable — data will not persist", err);
      return memoryBackend();
    });
  return backendPromise;
}
