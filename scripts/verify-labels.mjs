import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import ts from "typescript";
import * as paperSettings from "../src/lib/label-paper.ts";

// Execute the real PDF module with its installed PDF/QR dependencies in Node.
const filename = new URL("../src/lib/pdf.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const pdfModule = new Module(filename.pathname);
const require = createRequire(filename);
pdfModule.require = (id) => id === "./label-paper" ? paperSettings : require(id);
pdfModule._compile(compiled, filename.pathname);
const { generateLabelSheet, generateSingleLabel } = pdfModule.exports;

const samples = [1, 2, 3].map((i) => ({
  barcode: `NSU/BUR/FXA/FF/00${i}`,
  name: `Office chair ${i}`,
  unitName: "Bursary Department › Fixed Assets Unit",
  categoryName: "Furniture & Fittings",
  campusName: "Keffi (Main)",
}));

function verifyPages(doc, paper, count) {
  assert.equal(doc.getNumberOfPages(), count);
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    assert.ok(Math.abs(doc.internal.pageSize.getWidth() - paper.width) < 0.01);
    assert.ok(Math.abs(doc.internal.pageSize.getHeight() - paper.height) < 0.01);
    const commands = doc.internal.pages[page].join("\n");
    assert.ok(commands.includes(samples[page - 1].barcode));
    for (const other of samples.filter((_, index) => index !== page - 1)) {
      assert.ok(!commands.includes(other.barcode), "No other asset code on this page");
    }
  }
}

for (const paper of paperSettings.LABEL_PAPERS) {
  test(`batch has one ${paper.id} mm label per asset`, async () => {
    verifyPages(await generateLabelSheet(samples, paper), paper, samples.length);
  });
}

test("single asset uses the printer size selected in this browser", async () => {
  globalThis.window = { localStorage: { getItem: () => "80x50" } };
  try {
    verifyPages(await generateSingleLabel(samples[0]), paperSettings.labelPaper("80x50"), 1);
  } finally { delete globalThis.window; }
});

test("missing, blocked or obsolete browser storage falls back to 60x40", () => {
  assert.equal(paperSettings.readLabelPaper().id, "60x40");
  globalThis.window = { localStorage: { getItem: () => { throw new Error("blocked"); } } };
  try { assert.equal(paperSettings.readLabelPaper().id, "60x40"); }
  finally { delete globalThis.window; }
  assert.equal(paperSettings.labelPaper("obsolete").id, "60x40");
});

test("empty selection does not generate an empty printable page", async () => {
  await assert.rejects(generateLabelSheet([]), /Select at least one asset/);
});

test("chosen size still works for this session when storage is blocked", async () => {
  globalThis.window = { localStorage: {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  } };
  try {
    paperSettings.saveLabelPaper("80x50");
    verifyPages(await generateSingleLabel(samples[0]), paperSettings.labelPaper("80x50"), 1);
  } finally {
    // Reset the in-memory fallback through a successful save.
    globalThis.window = { localStorage: { setItem: () => {} } };
    paperSettings.saveLabelPaper("60x40");
    delete globalThis.window;
  }
});
