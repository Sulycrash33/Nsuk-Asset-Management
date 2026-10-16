import assert from "node:assert/strict";
import test from "node:test";
import { parseAssetDate, parseAssetValue, fileFingerprint, importRowKey } from "../src/lib/asset-validation.ts";
import { importSerialProblems, reusableImportIndexes } from "../src/lib/import-recovery.ts";

test("partially imported serials are reusable only for the same file row and original unit", async () => {
  const fingerprint = await fileFingerprint(new TextEncoder().encode("same file").buffer);
  const key = await importRowKey(fingerprint, 0, "unit-a");
  const expected = [{ index: 0, import_key: key, org_unit_id: "unit-a", serial_number: " SN-1 " }];
  const saved = [{ import_key: key, org_unit_id: "unit-a", serial_number: "sn-1" }];
  const reused = reusableImportIndexes(expected, saved);
  assert.deepEqual([...reused], [0]);
  assert.equal(importSerialProblems(expected, new Set(["sn-1"]), reused).size, 0);
  for (const changed of [
    { ...saved[0], import_key: await importRowKey(fingerprint, 1, "unit-a") },
    { ...saved[0], import_key: await importRowKey(fingerprint, 0, "unit-b") },
    { ...saved[0], org_unit_id: "unit-b" },
    { ...saved[0], serial_number: "SN-2" },
    { ...saved[0], import_key: null },
  ]) assert.equal(reusableImportIndexes(expected, [changed]).size, 0);
  assert.equal(reusableImportIndexes(expected, []).size, 0, "inaccessible or missing rows cannot be reused");
});

test("recovery keeps genuine duplicates blocked and includes both saved and new rows", () => {
  const rows = [
    { index: 0, serial_number: "SN-SAVED" },
    { index: 1, serial_number: "SN-NEW" },
    { index: 2, serial_number: "sn-saved" },
    { index: 3, serial_number: "SN-OTHER" },
    { index: 4, serial_number: null },
  ];
  const problems = importSerialProblems(rows, new Set(["sn-saved", "sn-other"]), new Set([0, 2]));
  assert.deepEqual([...problems.keys()], [2, 3]);
  assert.match(problems.get(2), /same as row 2/);
  assert.match(problems.get(3), /already on the register/);
});

test("text dates require a declared order and never roll over impossible days", () => {
  assert.equal(parseAssetDate("02/08/2019"), null);
  assert.equal(parseAssetDate("02/08/2019", "dmy"), "2019-08-02");
  assert.equal(parseAssetDate("02/08/2019", "mdy"), "2019-02-08");
  for (const order of ["ymd", "dmy", "mdy"]) assert.equal(parseAssetDate("2019-08-02", order), "2019-08-02");
  assert.equal(parseAssetDate("2024-02-29"), "2024-02-29");
  assert.equal(parseAssetDate("0001-01-01"), "0001-01-01");
  for (const date of ["2024-02-31", "2023-02-29", "0000-01-01", "2024-00-01", "2024-01-00", "2024-13-01", "2024-01-01T23:00:00Z"]) {
    assert.equal(parseAssetDate(date), null, date);
  }
});

test("amounts accept explicit currency/grouping and reject malformed or unrepresentable values", () => {
  for (const [raw, value] of [["",0], ["0",0], ["₦18,500,000",18500000], [" 450000.50 ",450000.5], ["999999999999.99",999999999999.99]]) {
    assert.equal(parseAssetValue(raw), value);
  }
  for (const raw of ["-1", "Infinity", "NaN", "0x10", "1e3", "1,00", "1.001", "1000000000000", "₦", "1 000", "$50"]) {
    assert.equal(parseAssetValue(raw), null, raw);
  }
});

test("same-file row retries keep their identity and distinct rows/units remain distinct", async () => {
  const bytes = new TextEncoder().encode("fixture file").buffer;
  const hash = await fileFingerprint(bytes);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, await fileFingerprint(bytes));
  const key = await importRowKey(hash, 0, "unit-a");
  assert.equal(key, await importRowKey(hash, 0, "unit-a"));
  assert.notEqual(key, await importRowKey(hash, 1, "unit-a"));
  assert.notEqual(key, await importRowKey(hash, 0, "unit-b"));
});

