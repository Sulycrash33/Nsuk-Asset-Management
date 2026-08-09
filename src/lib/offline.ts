"use client";

/**
 * Offline support for verification.
 *
 * Store rooms and basements are exactly where the network fails and exactly
 * where verification happens, so a scan must never be lost for want of a
 * signal. Two things are kept in the browser's own database:
 *
 *   expected  the items recorded against the unit, downloaded when the
 *             verification starts, so a scan can still be judged in the room
 *   pending   scans that have not reached the server yet
 *
 * IndexedDB rather than localStorage: it survives a browser clearing "site
 * data caches", it is not limited to a few megabytes, and it does not block
 * the page while writing.
 */

const DB_NAME = "nsuk-offline";
const DB_VERSION = 1;
const PENDING = "pending-scans";
const EXPECTED = "expected-assets";

export type PendingScan = {
  key: string; // sessionId + barcode, so the same code cannot queue twice
  sessionId: string;
  barcode: string;
  scannedAt: number;
};

export type ExpectedAsset = { barcode: string; name: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING)) {
        db.createObjectStore(PENDING, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(EXPECTED)) {
        // Keyed by session so two verifications never mix their lists.
        db.createObjectStore(EXPECTED);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Remember what the unit is supposed to contain, for judging scans offline. */
export async function cacheExpected(sessionId: string, assets: ExpectedAsset[]): Promise<void> {
  await run(EXPECTED, "readwrite", (s) => s.put(assets, sessionId));
}

export async function readExpected(sessionId: string): Promise<ExpectedAsset[]> {
  try {
    return (await run<ExpectedAsset[]>(EXPECTED, "readonly", (s) => s.get(sessionId))) ?? [];
  } catch {
    return [];
  }
}

export async function forgetExpected(sessionId: string): Promise<void> {
  try {
    await run(EXPECTED, "readwrite", (s) => s.delete(sessionId));
  } catch {
    // A stale list is harmless; it is replaced the next time one is cached.
  }
}

export async function queueScan(sessionId: string, barcode: string): Promise<void> {
  await run(PENDING, "readwrite", (s) =>
    s.put({ key: `${sessionId}|${barcode}`, sessionId, barcode, scannedAt: Date.now() }),
  );
}

export async function pendingScans(sessionId?: string): Promise<PendingScan[]> {
  try {
    const all = (await run<PendingScan[]>(PENDING, "readonly", (s) => s.getAll())) ?? [];
    return sessionId ? all.filter((p) => p.sessionId === sessionId) : all;
  } catch {
    return [];
  }
}

export async function forgetScan(key: string): Promise<void> {
  await run(PENDING, "readwrite", (s) => s.delete(key));
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
