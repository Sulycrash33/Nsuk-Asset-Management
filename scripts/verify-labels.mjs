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
    // Layout asked for on 3 Nov 2026: the system's name heads the label in
    // place of the University's, and the item's details fill the room left.
    assert.ok(commands.includes("NSUK ASSET") && commands.includes("MANAGEMENT SYSTEM"), "System name printed");
    assert.ok(!commands.includes("NASARAWA STATE"), "University name replaced by the system name");
    for (const detail of [samples[page - 1].name, "Fixed Assets Unit", "Furniture & Fittings"]) {
      assert.ok(commands.includes(detail), `"${detail}" is printed when there is room`);
    }
  }
}

test("batch has one 60 x 40 mm label per asset", async () => {
  verifyPages(await generateLabelSheet(samples), paperSettings.LABEL_PAPER, samples.length);
});

test("single label ignores obsolete browser paper sizes", async () => {
  globalThis.window = { localStorage: { getItem: () => "100x50" } };
  try {
    verifyPages(await generateSingleLabel(samples[0]), paperSettings.LABEL_PAPER, 1);
  } finally { delete globalThis.window; }
});

test("printing does not need browser storage access", async () => {
  globalThis.window = { localStorage: { getItem: () => { throw new Error("blocked"); } } };
  try {
    verifyPages(await generateSingleLabel(samples[0]), paperSettings.LABEL_PAPER, 1);
  } finally { delete globalThis.window; }
});

test("empty selection does not generate an empty printable page", async () => {
  await assert.rejects(generateLabelSheet([]), /Select at least one asset/);
});
