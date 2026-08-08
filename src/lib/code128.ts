/**
 * Minimal Code 128-B encoder.
 *
 * Kept dependency-free and pure so the same module can drive the on-screen SVG
 * preview and the vector bars drawn into the printable PDF label sheets — a
 * bitmap barcode at label size scans poorly, so nothing here rasterises.
 */

// Canonical Code 128 element-width patterns for symbol values 0..106.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** A run of modules: `width` modules of bar (dark) or space (light). */
export type Code128Module = { bar: boolean; width: number };

function symbolValues(text: string): number[] {
  const values: number[] = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Code 128-B cannot encode "${ch}" in "${text}"`);
    }
    values.push(code - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

/**
 * Encode `text` into alternating bar/space runs, starting with a bar.
 * Quiet zones are the caller's responsibility (10 modules is the minimum).
 */
export function encodeCode128(text: string): Code128Module[] {
  const modules: Code128Module[] = [];
  for (const value of symbolValues(text)) {
    const pattern = PATTERNS[value];
    for (let i = 0; i < pattern.length; i++) {
      modules.push({ bar: i % 2 === 0, width: Number(pattern[i]) });
    }
  }
  return modules;
}

/** Total module count of an encoded symbol, excluding quiet zones. */
export function moduleCount(modules: Code128Module[]): number {
  return modules.reduce((sum, m) => sum + m.width, 0);
}

/**
 * Render an encoded symbol as a standalone SVG string.
 * `width`/`height` are CSS pixels; the bars scale to fill the width.
 */
export function code128Svg(text: string, width = 260, height = 60): string {
  const modules = encodeCode128(text);
  const quiet = 10;
  const total = moduleCount(modules) + quiet * 2;
  const unit = width / total;

  let x = quiet * unit;
  let rects = "";
  for (const m of modules) {
    const w = m.width * unit;
    if (m.bar) {
      rects += `<rect x="${x.toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${height}" fill="#111111"/>`;
    }
    x += w;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>${rects}</svg>`
  );
}
