// A tiny IndexedDB-backed queue for proof photos captured while offline.
// Volunteers work in basements and loading docks; a flaky connection shouldn't
// lose a pickup. The blob is stashed locally (surviving even a reload) under a
// stable key (e.g. "pickup:<listingId>"), then uploaded and the claim advanced
// once the connection returns. The decision logic is pure (testable); the
// IndexedDB plumbing is a thin, SSR-safe wrapper around it.

/**
 * Should we queue this attempt instead of surfacing an error? Yes when the
 * browser is offline, or the failure looks like a network error (fetch rejects
 * with a TypeError, or a 5xx/no-response). A genuine app error (bad file, 4xx)
 * is not queued — retrying wouldn't help. Pure.
 */
export function shouldQueueUpload(online: boolean, error: unknown): boolean {
  if (!online) return true;
  if (error instanceof TypeError) return true; // fetch network failure
  // Browser network-failure messages: "Failed to fetch" (Chrome), "NetworkError…"
  // (Firefox), "Load failed" (Safari). Anchor the Safari one so it doesn't also
  // match a server "Upload failed." message.
  if (error instanceof Error && /network|failed to fetch|^load failed/i.test(error.message)) {
    return true;
  }
  return false;
}

const DB_NAME = "mealmove";
const STORE = "pendingUploads";

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Stash a blob to upload later, keyed by a stable id. No-op without IndexedDB. */
export async function savePendingUpload(key: string, blob: Blob): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.put(blob, key));
}

/** Read a stashed blob, or null. */
export async function getPendingUpload(key: string): Promise<Blob | null> {
  if (!hasIDB()) return null;
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) => s.get(key));
    return blob ?? null;
  } catch {
    return null;
  }
}

/** Drop a stashed blob once it's safely uploaded. */
export async function clearPendingUpload(key: string): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.delete(key));
}
