import assert from "node:assert/strict";
import test from "node:test";
import { codeIsOutOfDate, codePrefix, currentCodePrefix } from "../src/lib/asset-code.ts";

// A slice of the real tree: the Vice-Chancellor's Office and two of its units,
// the Registry and one of its divisions.
const units = [
  { id: "vcs", parent_id: null, short_code: "VCS" },
  { id: "acp", parent_id: "vcs", short_code: "ACP" },
  { id: "ppd", parent_id: "vcs", short_code: "PPD" },
  { id: "reg", parent_id: null, short_code: "REG" },
  { id: "aad", parent_id: "reg", short_code: "AAD" },
];

test("the code prefix follows the unit's faculty or office, the unit and the item type", () => {
  assert.equal(currentCodePrefix("acp", units, "OE"), "NSU/VCS/ACP/OE");
  assert.equal(currentCodePrefix("aad", units, "FF"), "NSU/REG/AAD/FF");
  // Recorded straight onto the office itself, as next_barcode does.
  assert.equal(currentCodePrefix("vcs", units, "FF"), "NSU/VCS/GEN/FF");
  assert.equal(currentCodePrefix("acp", units, null), "NSU/VCS/ACP/XX");
  assert.equal(currentCodePrefix("missing", units, "OE"), null);
  assert.equal(codePrefix("NSU/VCS/PPD/OE/014"), "NSU/VCS/PPD/OE");
});

test("a code is out of date only when its unit or item type changed", () => {
  // The 5 Nov cases: moved to Academic Planning, codes still name the old unit.
  assert.equal(codeIsOutOfDate("NSU/VCS/PPD/OE/001", "acp", units, "OE"), true);
  assert.equal(codeIsOutOfDate("NSU/REG/AAD/OE/010", "acp", units, "OE"), true);
  assert.equal(codeIsOutOfDate("NSU/VCS/GEN/FF/002", "acp", units, "FF"), true);
  // Still where it was recorded.
  assert.equal(codeIsOutOfDate("NSU/VCS/ACP/OE/002", "acp", units, "OE"), false);
  // A category added after an XX code.
  assert.equal(codeIsOutOfDate("NSU/VCS/ACP/XX/023", "acp", units, "FF"), true);
  // Unknown unit: never offered.
  assert.equal(codeIsOutOfDate("NSU/VCS/ACP/OE/002", "missing", units, "OE"), false);
});
