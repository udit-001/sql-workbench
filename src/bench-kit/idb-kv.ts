/**
 * Tiny promise wrapper over one IndexedDB key-value store shared by all
 * bench persistence (journal events, imported-CSV bytes). Falls back to
 * an in-memory map when IndexedDB is unavailable so features degrade
 * instead of dying.
 *
 * Namespace: each mount passes a storage namespace (the component's
 * `db` attribute). Two benches on one page must not share journals or
 * imported tables — same-origin IndexedDB is global, so the namespace
 * becomes the database name.
 */

const DEFAULT_NAMESPACE = "sql-workbench";
const DB_VERSION = 1;
const STORE = "kv";

interface KvBackend {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

const backends = new Map<string, Promise<KvBackend>>();

async function openIdb(namespace: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(namespace, DB_VERSION);
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
  function read<T>(body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = body(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  }
  function write(body: (store: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      body(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  }
  return {
    get: (key) => read((store) => store.get(key)),
    put: (key, value) => write((store) => store.put(value, key)),
    delete: (key) => write((store) => store.delete(key)),
  };
}

/** Opens (once per namespace) the shared store; memory fallback keeps the app usable. */
export function openKv(namespace: string = DEFAULT_NAMESPACE): Promise<KvBackend> {
  let backend = backends.get(namespace);
  if (!backend) {
    backend = openIdb(namespace)
      .then(idbBackend)
      .catch((err) => {
        console.warn("[sql-workbench] IndexedDB unavailable — data will not persist", err);
        return memoryBackend();
      });
    backends.set(namespace, backend);
  }
  return backend;
}
