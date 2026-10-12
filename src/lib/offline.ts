"use client";

// Queue ownership comes from the authenticated server page, never from cached
// session HTML. Legacy unowned scans stay quarantined until explicitly recovered.
const DB_NAME = "nsuk-offline";
const DB_VERSION = 2;
const LEGACY = "pending-scans";
const PENDING = "owned-pending-scans";
const EXPECTED = "owned-expected-assets";

export type PendingScan = {
  key: string;
  ownerId: string;
  sessionId: string;
  barcode: string;
  scannedAt: number;
};
type LegacyScan = Omit<PendingScan, "ownerId">;
export type ExpectedAsset = { barcode: string; name: string };

function scope(ownerId: string, sessionId: string): string {
  if (!ownerId || !sessionId) throw new Error("Sign in and choose a verification first.");
  return `${ownerId}|${sessionId}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY)) db.createObjectStore(LEGACY, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PENDING)) db.createObjectStore(PENDING, { keyPath: "key" });
      if (!db.objectStoreNames.contains(EXPECTED)) db.createObjectStore(EXPECTED);
      // Unowned asset names must not be shown to another person using the device.
      if (db.objectStoreNames.contains("expected-assets")) db.deleteObjectStore("expected-assets");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(store: string, mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let request: IDBRequest<T>;
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Local storage transaction was aborted.")); };
    try { request = work(tx.objectStore(store)); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  }));
}

export async function cacheExpected(ownerId: string, sessionId: string, assets: ExpectedAsset[]): Promise<void> {
  await run(EXPECTED, "readwrite", (s) => s.put(assets, scope(ownerId, sessionId)));
}
export async function readExpected(ownerId: string, sessionId: string): Promise<ExpectedAsset[]> {
  try { return (await run<ExpectedAsset[]>(EXPECTED, "readonly", (s) => s.get(scope(ownerId, sessionId)))) ?? []; }
  catch { return []; } // Names are optional; pending work never uses this fallback.
}
export async function forgetExpected(ownerId: string, sessionId: string): Promise<void> {
  try { await run(EXPECTED, "readwrite", (s) => s.delete(scope(ownerId, sessionId))); }
  catch { /* A cleanup failure must not obscure an already saved server result. */ }
}
export async function queueScan(ownerId: string, sessionId: string, barcode: string): Promise<void> {
  const key = `${scope(ownerId, sessionId)}|${barcode}`;
  await run(PENDING, "readwrite", (s) => s.put({ key, ownerId, sessionId, barcode, scannedAt: Date.now() }));
}
export async function pendingScans(ownerId: string, sessionId: string): Promise<PendingScan[]> {
  scope(ownerId, sessionId);
  const all = (await run<PendingScan[]>(PENDING, "readonly", (s) => s.getAll())) ?? [];
  return all.filter((p) => p.ownerId === ownerId && p.sessionId === sessionId);
}
export async function forgetScan(ownerId: string, key: string): Promise<void> {
  if (!ownerId || !key.startsWith(`${ownerId}|`)) throw new Error("This scan belongs to another account.");
  await run(PENDING, "readwrite", (s) => s.delete(key));
}
export async function legacyScanCount(sessionId: string): Promise<number> {
  const all = (await run<LegacyScan[]>(LEGACY, "readonly", (s) => s.getAll())) ?? [];
  return all.filter((scan) => scan.sessionId === sessionId).length;
}

// Copy and remove legacy work in one transaction, so failed recovery loses none.
export async function recoverLegacyScans(ownerId: string, sessionId: string): Promise<void> {
  const prefix = scope(ownerId, sessionId);
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([LEGACY, PENDING], "readwrite");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Recovery was not saved.")); };
    const legacy = tx.objectStore(LEGACY);
    const pending = tx.objectStore(PENDING);
    const read = legacy.getAll();
    read.onsuccess = () => {
      for (const scan of read.result as LegacyScan[]) {
        if (scan.sessionId !== sessionId) continue;
        const key = `${prefix}|${scan.barcode}`;
        const existing = pending.get(key);
        existing.onsuccess = () => {
          if (!existing.result) pending.put({ ...scan, key, ownerId });
          legacy.delete(scan.key);
        };
      }
    };
  });
}

export function isRetryableScanError(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
