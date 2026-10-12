import assert from "node:assert/strict";
import test from "node:test";
import { parseAssetDate, parseAssetValue, fileFingerprint, importRowKey } from "../src/lib/asset-validation.ts";

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
