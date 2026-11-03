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
const { generateLabelSheet, generateSingleLabel, labelLayout, DURABLE_QR_MM } = pdfModule.exports;
const { DEFAULT_LABEL_SIZE, LABEL_SIZE_KEY, LABEL_SIZE_PRESETS, parseLabelSize } = paperSettings;

const samples = [1, 2, 3].map((i) => ({
  barcode: `NSU/BUR/FXA/FF/00${i}`,
  name: `Office chair ${i}`,
  unitName: "Bursary Department › Fixed Assets Unit",
  categoryName: "Furniture & Fittings",
  campusName: "Keffi (Main)",
}));

function verifyPages(doc, paper, count, { title = true } = {}) {
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
    // Layout settled on 3 Nov 2026: crest, system name, QR, asset code —
    // nothing about the item. Extra fields from an older caller must not
    // reach the sticker.
    assert.equal(commands.includes("NSUK ASSET MANAGEMENT SYSTEM"), title, "System name printed when it fits");
    for (const detail of [samples[page - 1].name, "Fixed Assets Unit", "Furniture", "Keffi", "NASARAWA STATE"]) {
      assert.ok(!commands.includes(detail), `"${detail}" is not printed`);
    }
  }
}

/** Stand in for a browser whose storage holds the given values. */
function withStorage(values, run) {
  globalThis.window = { localStorage: { getItem: (key) => values[key] ?? null } };
  return run().finally(() => { delete globalThis.window; });
}

test("batch has one 60 x 40 mm label per asset by default", async () => {
  verifyPages(await generateLabelSheet(samples), DEFAULT_LABEL_SIZE, samples.length);
});

test("labels print at the size chosen on this device", async () => {
  await withStorage({ [LABEL_SIZE_KEY]: "80x50" }, async () => {
    verifyPages(await generateLabelSheet(samples), { width: 80, height: 50 }, samples.length);
    verifyPages(await generateSingleLabel(samples[0]), { width: 80, height: 50 }, 1);
  });
  await withStorage({ [LABEL_SIZE_KEY]: "40x60" }, async () => {
    verifyPages(await generateSingleLabel(samples[0]), { width: 40, height: 60 }, 1);
  });
});

test("an explicit size wins over the stored one", async () => {
  await withStorage({ [LABEL_SIZE_KEY]: "80x50" }, async () => {
    verifyPages(await generateSingleLabel(samples[0], { width: 100, height: 75 }), { width: 100, height: 75 }, 1);
  });
});

test("the size kept before #65 does not come back", async () => {
  await withStorage({ "nsuk-label-paper": "100x50" }, async () => {
    verifyPages(await generateSingleLabel(samples[0]), DEFAULT_LABEL_SIZE, 1);
  });
});

test("a malformed or out-of-range stored size falls back to 60 x 40 mm", async () => {
  for (const stored of ["5x5", "999x40", "60 x 40", "abc", "60x"]) {
    await withStorage({ [LABEL_SIZE_KEY]: stored }, async () => {
      verifyPages(await generateSingleLabel(samples[0]), DEFAULT_LABEL_SIZE, 1);
    });
  }
});

test("printing does not need browser storage access", async () => {
  globalThis.window = { localStorage: { getItem: () => { throw new Error("blocked"); } } };
  try {
    verifyPages(await generateSingleLabel(samples[0]), DEFAULT_LABEL_SIZE, 1);
  } finally { delete globalThis.window; }
});

test("sizes parse in millimetres within limits", () => {
  assert.deepEqual(parseLabelSize("60x40"), { width: 60, height: 40 });
  assert.deepEqual(parseLabelSize("50.5x25"), { width: 50.5, height: 25 });
  for (const bad of ["19x40", "60x301", "x40", "60x40mm", "", null]) assert.equal(parseLabelSize(bad), null, String(bad));
});

const oddSizes = [{ width: 40, height: 60 }, { width: 30, height: 20 }, { width: 25, height: 25 }, { width: 150, height: 40 }, { width: 300, height: 300 }];

test("every size lays out inside the sticker, top to bottom in order", () => {
  for (const size of [...LABEL_SIZE_PRESETS, ...oddSizes]) {
    for (const withCrest of [true, false]) {
      const l = labelLayout(size, withCrest);
      const name = `${size.width}x${size.height}${withCrest ? "" : " no crest"}`;
      const inside = (x, y, w, h) => x >= -0.01 && y >= -0.01 && x + w <= size.width + 0.01 && y + h <= size.height + 0.01;
      assert.ok(inside(l.qr.x, l.qr.y, l.qr.size, l.qr.size), `${name}: QR inside`);
      assert.ok(l.code.baseline <= size.height, `${name}: code inside`);
      assert.ok(l.code.baseline > l.qr.y + l.qr.size, `${name}: code under the QR`);
      if (l.title) assert.ok(l.title.baseline <= l.qr.y, `${name}: title above the QR`);
      if (l.crest) {
        assert.ok(withCrest, `${name}: no crest without the image`);
        assert.ok(inside(l.crest.x, l.crest.y, l.crest.width, l.crest.height), `${name}: crest inside`);
        assert.ok(l.crest.y + l.crest.height <= (l.title ? l.title.baseline - 1 : l.qr.y), `${name}: crest above the rest`);
      }
      assert.equal(l.durable, l.qr.size >= DURABLE_QR_MM - 0.05, `${name}: durable flag`);
      // The QR comes first: the header only stays when the QR is still durable.
      if (!l.durable) assert.ok(!l.crest && !l.title, `${name}: header dropped before the QR shrinks`);
    }
  }
});

test("60 x 40 mm keeps the approved layout and a QR of at least 22 mm", () => {
  const l = labelLayout(DEFAULT_LABEL_SIZE);
  assert.ok(l.crest && l.title && l.durable);
  assert.ok(l.qr.size >= 22 && l.qr.size < 24, `QR ${l.qr.size} mm`);
});

test("the asset code sits just under the QR's quiet zone", () => {
  // Asked for on 3 Nov 2026: the code was 2.4 mm further down than it needed
  // to be. The QR's own white border is the only real separation now.
  for (const size of [...LABEL_SIZE_PRESETS, ...oddSizes]) {
    const l = labelLayout(size);
    const capTop = l.code.baseline - l.code.size * 0.3528 * 0.718;
    const gap = capTop - (l.qr.y + l.qr.size);
    const scale = Math.min(3, Math.max(0.4, Math.min(size.width / 60, size.height / 40)));
    assert.ok(gap > 0 && gap <= 0.6 * scale + 0.01, `${size.width}x${size.height}: ${gap.toFixed(2)} mm past the QR`);
  }
});

test("the asset code prints pure black, outlined, and within the margins", async () => {
  const long = { barcode: "NSU/ENGR/MECH/ICT/1234" };
  for (const size of [DEFAULT_LABEL_SIZE, { width: 40, height: 30 }, { width: 100, height: 75 }]) {
    const doc = await generateSingleLabel(long, size);
    const page = doc.internal.pages[1].join("\n");
    const at = page.indexOf(`(${long.barcode})`);
    assert.ok(at > 0, "code printed whole");
    const block = page.slice(page.lastIndexOf("BT", at), at);
    assert.match(block, /\n2 Tr\n/, "fill then stroke, to thicken the strokes");
    assert.match(block, /\n0\.? g\n/, "pure black, not a grey a thermal printer would dither");
    assert.match(block, /\n[\d.]+ Tc\n/, "letter spacing");
    const l = labelLayout(size);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(l.code.size);
    const full = doc.getTextWidth(long.barcode) + l.code.charSpace * (long.barcode.length - 1) + l.code.stroke;
    const fit = Math.min(1, l.code.maxWidth / full);
    assert.ok(full * fit <= l.code.maxWidth + 0.01, `${size.width}x${size.height}: code fits`);
  }
});

test("larger stickers get a larger QR", () => {
  assert.ok(labelLayout({ width: 100, height: 75 }).qr.size > labelLayout(DEFAULT_LABEL_SIZE).qr.size + 15);
});

test("small stickers print the code with no header", async () => {
  verifyPages(await generateSingleLabel(samples[0], { width: 30, height: 20 }), { width: 30, height: 20 }, 1, { title: false });
});

test("a batch of 100 labels stays small enough to print from a phone", async () => {
  // The QR is drawn, not embedded as a picture: before, 100 labels came to 88 MB.
  const batch = Array.from({ length: 100 }, (_, i) => ({ barcode: `NSU/BUR/BUS/OE/${String(i + 1).padStart(3, "0")}` }));
  const bytes = (await generateLabelSheet(batch)).output("arraybuffer").byteLength;
  assert.ok(bytes < 1024 * 1024, `100 labels came to ${(bytes / 1024).toFixed(0)} KB`);
});

test("empty selection does not generate an empty printable page", async () => {
  await assert.rejects(generateLabelSheet([]), /Select at least one asset/);
});
