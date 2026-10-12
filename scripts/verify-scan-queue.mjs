import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { queueScan, pendingScans, forgetScan, cacheExpected, readExpected,
  recoverLegacyScans, legacyScanCount, isRetryableScanError } from "../src/lib/offline.ts";

function reset() { globalThis.indexedDB = new IDBFactory(); }

test("queue is durable, deduplicated and isolated by account and exercise", async () => {
  reset();
  await queueScan("alice", "room-a", "QR-1");
  await queueScan("alice", "room-a", "QR-1");
  await queueScan("bob", "room-a", "QR-2");
  await queueScan("alice", "room-b", "QR-3");
  assert.equal((await pendingScans("alice", "room-a")).length, 1);
  assert.equal((await pendingScans("bob", "room-a"))[0].barcode, "QR-2");
  assert.equal((await pendingScans("alice", "room-b"))[0].barcode, "QR-3");
  const [scan] = await pendingScans("alice", "room-a");
  await assert.rejects(forgetScan("bob", scan.key));
  await forgetScan("alice", scan.key);
  assert.equal((await pendingScans("alice", "room-a")).length, 0);
});

test("expected asset names never cross accounts", async () => {
  reset();
  await cacheExpected("alice", "room", [{ barcode: "QR", name: "Private equipment" }]);
  assert.deepEqual(await readExpected("bob", "room"), []);
  assert.equal((await readExpected("alice", "room"))[0].name, "Private equipment");
});

test("an abort after request success still rejects Saved", async () => {
  reset();
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    const request = original.apply(this, args);
    request.addEventListener("success", () => this.transaction.abort());
    return request;
  };
  try { await assert.rejects(queueScan("alice", "room", "QR")); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.deepEqual(await pendingScans("alice", "room"), []);
  await queueScan("alice", "room", "retry");
  assert.equal((await pendingScans("alice", "room"))[0].barcode, "retry");
});

test("unreadable pending work raises an error instead of looking empty", async () => {
  reset();
  const original = IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll = function() { throw new Error("storage denied"); };
  try { await assert.rejects(pendingScans("alice", "room"), /storage denied/); }
  finally { IDBObjectStore.prototype.getAll = original; }
});

async function seedLegacy() {
  reset();
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("nsuk-offline", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("pending-scans", { keyPath: "key" });
      request.result.createObjectStore("expected-assets");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("pending-scans", "readwrite");
    tx.objectStore("pending-scans").put({ key: "room|QR", sessionId: "room", barcode: "QR", scannedAt: 10 });
    tx.objectStore("pending-scans").put({ key: "other|QR2", sessionId: "other", barcode: "QR2", scannedAt: 20 });
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  db.close();
}

test("legacy work stays quarantined and recovery claims only the chosen exercise", async () => {
  await seedLegacy();
  assert.deepEqual(await pendingScans("alice", "room"), []);
  assert.equal(await legacyScanCount("room"), 1);
  await recoverLegacyScans("alice", "room");
  assert.equal((await pendingScans("alice", "room"))[0].scannedAt, 10);
  assert.deepEqual(await pendingScans("bob", "room"), []);
  assert.equal(await legacyScanCount("room"), 0);
  assert.equal(await legacyScanCount("other"), 1);
});

test("failed recovery preserves legacy work without a partial copy", async () => {
  await seedLegacy();
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(...args) {
    const request = original.apply(this, args);
    if (this.name === "owned-pending-scans") request.addEventListener("success", () => this.transaction.abort());
    return request;
  };
  try { await assert.rejects(recoverLegacyScans("alice", "room")); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal(await legacyScanCount("room"), 1);
  assert.deepEqual(await pendingScans("alice", "room"), []);
});

test("only transport and transient server failures are queueable", () => {
  for (const status of [0, 408, 429, 500, 502, 503]) assert.equal(isRetryableScanError(status), true);
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(isRetryableScanError(status), false);
});
