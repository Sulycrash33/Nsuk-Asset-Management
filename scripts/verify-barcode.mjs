/**
 * Round-trips the Code 128 encoder in src/lib/code128.ts through ZXing's
 * decoder, so a bad pattern table or checksum can never ship silently.
 * Run with: node --experimental-strip-types scripts/verify-barcode.mjs
 */
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
import { encodeCode128, moduleCount } from "../src/lib/code128.ts";

function render(text, scale = 3, quiet = 12) {
  const modules = encodeCode128(text);
  const width = (moduleCount(modules) + quiet * 2) * scale;
  const height = 40;
  // RGBLuminanceSource treats a Uint8ClampedArray as one grayscale byte per pixel.
  const pixels = new Uint8ClampedArray(width * height).fill(255);

  let x = quiet * scale;
  for (const m of modules) {
    const w = m.width * scale;
    if (m.bar) {
      for (let px = Math.round(x); px < Math.round(x + w); px++) {
        for (let y = 0; y < height; y++) pixels[y * width + px] = 0;
      }
    }
    x += w;
  }
  return { pixels, width, height };
}

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
  [DecodeHintType.TRY_HARDER, true],
]);

// The matric-style codes the register actually issues, plus the older flat form
// so anything already labelled under it keeps decoding. The slash is the part
// worth testing: it moves Code 128 between character sets, which is exactly
// where a pattern table gets a payload subtly wrong.
const samples = [
  "NSU/ADM/ACC/CP/T/001",
  "NSU/FOS/CSC/LP/T/042",
  "NSU/FOA/ARC/FN/T/999",
  "NSU/ADM/BURS/CP/T/0001",
  "NSUK-CS-0001",
  "NSUK-BURS-9999",
  "NSUK-FOL-0042",
  "NSUK-DICT-1234",
  "NSUK-A-0001",
  "NSUK-WM2-0500",
];

let failures = 0;
for (const code of samples) {
  const { pixels, width, height } = render(code);
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)),
  );
  try {
    const decoded = new MultiFormatReader().decode(bitmap, hints).getText();
    const ok = decoded === code;
    console.log(`${ok ? "PASS" : "FAIL"}  ${code} -> ${decoded}`);
    if (!ok) failures++;
  } catch (err) {
    console.log(`FAIL  ${code} -> not decodable (${err?.message ?? err})`);
    failures++;
  }
}

console.log(`\n${samples.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
