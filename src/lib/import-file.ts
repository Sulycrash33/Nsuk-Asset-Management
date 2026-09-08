/**
 * Reading an upload into a table, whatever the officer happened to save it as.
 *
 * The register wants one thing from a file: a header row and the rows beneath
 * it. A CSV says that directly, and for a long time a CSV was all this screen
 * would take — which meant anyone holding a spreadsheet, a Word table or a
 * printed schedule had to convert it first, on a desktop, before they could
 * start. The conversion is the part people get wrong, so it is done here.
 *
 * Every format below is reduced to the same grid of strings and then to the
 * same headers-and-rows shape, so the mapping, validation and duplicate checks
 * downstream never learn what was uploaded. Only two things differ by format:
 * how confident the reading is, and what to say when it fails.
 *
 * A word on confidence, because it is not the same for all four. CSV, Excel and
 * Word each *store* a table: the cell boundaries are in the file, and reading
 * them back is a parse. A PDF stores no such thing — it stores glyphs at
 * coordinates, and the columns are inferred here from where those glyphs sit.
 * That inference is good enough to save re-typing a schedule and not good
 * enough to trust unread, which is why `caution` exists and why the screen
 * shows the preview before anything is written.
 */

import type { ParseResult } from "papaparse";

/** How a file was read. Shown to the person, so these are the words they see. */
export type FileFormat = "csv" | "spreadsheet" | "word" | "pdf";

export type TableRow = Record<string, string>;

export type ParsedTable = {
  headers: string[];
  rows: TableRow[];
  format: FileFormat;
  /** Set where the reading was reconstructed rather than parsed. */
  caution?: string;
};

/** Extensions accepted, by format. */
const EXTENSIONS: Record<FileFormat, string[]> = {
  csv: [".csv", ".tsv", ".txt"],
  spreadsheet: [".xlsx", ".xlsm", ".xls", ".ods", ".fods"],
  word: [".docx"],
  pdf: [".pdf"],
};

/**
 * What the file input offers. Extensions rather than MIME types, because the
 * type a browser reports for a spreadsheet varies by operating system and is
 * routinely empty on Android — which is the phone case this system is built
 * around. The extension is what people can see and what is actually reliable.
 */
export const ACCEPTED_FILE_TYPES = Object.values(EXTENSIONS).flat().join(",");

/** Human list of what may be uploaded, for the wording on the upload panel. */
export const ACCEPTED_DESCRIPTION = "CSV, Excel, Word or PDF";

/** The format of a file, or null if the extension is not one we read. */
export function formatForFile(file: File): FileFormat | null {
  const name = file.name.toLowerCase();
  for (const [format, extensions] of Object.entries(EXTENSIONS)) {
    if (extensions.some((ext) => name.endsWith(ext))) return format as FileFormat;
  }
  return null;
}

/** Raised where the file was read but held nothing a register could use. */
export class UnreadableFileError extends Error {}

/**
 * Turn a grid of cells into headers and rows.
 *
 * Deliberately forgiving about the heading itself: one nobody filled in still
 * gets a name, so its column can be mapped by hand, and two columns headed the
 * same way stay distinguishable rather than one silently replacing the other.
 */
function tableFromGrid(grid: string[][]): { headers: string[]; rows: TableRow[] } {
  const filledCount = (row: string[]) => row.filter((cell) => cell.trim() !== "").length;

  // The heading is not simply the first row with anything in it. Real files
  // carry a title above the table — "NSUK Fixed Assets Unit", a printed date,
  // sometimes a blank line — and reading one of those as the heading turns the
  // whole schedule into a single unnamed column. So the widest row in the file
  // sets what a full row looks like, and the heading is the first row that is
  // most of the way there. A title occupying one cell is not.
  const width = Math.max(0, ...grid.map(filledCount));
  if (width === 0) throw new UnreadableFileError("no rows");
  const enough = Math.max(1, Math.ceil(width * 0.6));
  const start = grid.findIndex((row) => filledCount(row) >= enough);
  if (start === -1) throw new UnreadableFileError("no rows");

  const seen = new Map<string, number>();
  const headers = grid[start].map((cell, i) => {
    const base = cell.trim() || `Column ${i + 1}`;
    const before = seen.get(base) ?? 0;
    seen.set(base, before + 1);
    return before === 0 ? base : `${base} (${before + 1})`;
  });

  const rows: TableRow[] = [];
  for (const cells of grid.slice(start + 1)) {
    if (filledCount(cells) === 0) continue;
    const row: TableRow = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    rows.push(row);
  }

  if (rows.length === 0) throw new UnreadableFileError("no rows");
  return { headers, rows };
}

/**
 * Whether what came back is text at all.
 *
 * A reader will not always refuse a file that is not what its name says. Handed
 * four kilobytes of random bytes named `.xlsx`, the spreadsheet library sniffed
 * its way to a plain text reading and produced a full grid of mojibake, which
 * then filled the preview and the mapping menus — a screen that looks broken
 * rather than a file that was rejected. Control characters are what separates
 * the two: a register holds names, rooms and serial numbers, and none of those
 * contain a byte below a space.
 */
function looksLikeText(grid: string[][]): boolean {
  const binary = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/;
  return !grid.some((row) => row.some((cell) => binary.test(cell)));
}

/** Everything reaching `tableFromGrid` is a string, whatever a reader returned. */
function asText(value: unknown): string {
  // A date is written out in full rather than however the sheet displayed it.
  // This is the one conversion that has to be got right: a cell shown as
  // 02/08/2019 is the second of August to the officer who typed it and the
  // eighth of February to `Date.parse`, and nothing downstream can tell which
  // was meant. The cell's own value can, so it is read here — from the local
  // parts, since the date carries no time and shifting it into UTC can move it
  // to the day before.
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return value == null ? "" : String(value);
}

async function readCsv(file: File): Promise<string[][][]> {
  const Papa = (await import("papaparse")).default;
  const result = await new Promise<ParseResult<string[]>>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: resolve,
      error: reject,
    });
  });
  return [result.data.map((row) => row.map(asText))];
}

async function readSpreadsheet(file: File): Promise<string[][][]> {
  const XLSX = await import("xlsx");
  // `cellDates` turns a date cell into a real date rather than the serial
  // number a spreadsheet stores, which is what lets `asText` write it out
  // unambiguously. Cells are then read raw, as values rather than as the text
  // the sheet displayed: a value shown as "₦18,500,000" is the number
  // 18500000, and reading the number saves guessing at the punctuation.
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  // Every sheet is offered, in order, because a workbook whose front page is a
  // cover note or a summary is a normal thing to be handed. Which one holds the
  // assets is decided by whether a table can be read out of it, not by position
  // and not by whether the sheet has anything on it at all.
  return book.SheetNames.flatMap((name) => {
    const sheet = book.Sheets[name];
    if (!sheet) return [];
    return [
      XLSX.utils
        .sheet_to_json<unknown[]>(sheet, {
          header: 1,
          blankrows: false,
          defval: "",
          raw: true,
        })
        .map((row) => row.map(asText)),
    ];
  });
}

/** Text of one WordprocessingML element, paragraphs joined by a single space. */
function wordText(element: Element): string {
  const paragraphs = element.getElementsByTagName("*");
  const parts: string[] = [];
  for (const node of Array.from(paragraphs)) {
    if (node.localName === "t") parts.push(node.textContent ?? "");
    else if (node.localName === "p" && parts.length > 0) parts.push(" ");
    else if (node.localName === "br" || node.localName === "tab") parts.push(" ");
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Direct children of `parent` with this local name, ignoring nested tables. */
function childrenNamed(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

async function readWord(file: File): Promise<string[][][]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entry = zip["word/document.xml"];
  if (!entry) throw new UnreadableFileError("not a Word document");

  const xml = new DOMParser().parseFromString(strFromU8(entry), "application/xml");
  // A table is the only shape a register can read. Prose listing assets in
  // sentences is not something to guess at, so a document holding none is
  // refused by name rather than half-read. Where there are several — a summary
  // above the schedule is common — each is offered and the first with rows in
  // it is used.
  const tables = Array.from(xml.getElementsByTagName("*")).filter(
    (node) => node.localName === "tbl",
  );
  if (tables.length === 0) throw new UnreadableFileError("no table");

  // Rows and cells are read as direct children so that a table nested inside a
  // cell contributes its text to that cell instead of inventing rows, and so a
  // nested table is not offered as a candidate ahead of the one holding it.
  return tables
    .filter((tbl) => !tables.some((other) => other !== tbl && other.contains(tbl)))
    .map((tbl) => childrenNamed(tbl, "tr").map((tr) => childrenNamed(tr, "tc").map(wordText)));
}

/**
 * A PDF, reconstructed.
 *
 * There are no cells to read — only glyphs at coordinates — so both the rows
 * and the columns have to be worked out. Rows are the easy half: words sharing
 * a vertical position are one line.
 *
 * Columns are found from the gaps. Every word on the page is projected onto the
 * horizontal axis, and the bands no word on the page ever occupies are the
 * spaces between columns. Taking it from the whole page rather than from the
 * heading is what makes a two word heading stay one column, and what lets a
 * right aligned figure sit under a left aligned title; a gap only counts as a
 * boundary if it is empty on *every* line, so the space inside "Block B Room
 * 14" cannot split a column that some other row fills.
 *
 * Each page is measured separately, because a schedule printed across several
 * pages is laid out afresh on each one and the columns rarely land in the same
 * place twice. That was not a guess: reading a two page schedule with the first
 * page's columns put the condition of every asset on page two into the value
 * column, silently and plausibly.
 *
 * What this still cannot do is a cell whose text wrapped onto a second line —
 * that reads as a row of its own — or two columns printed close enough to touch
 * somewhere down the page. Hence the caution the caller attaches: the preview
 * is the check, not this function.
 */
type PdfWord = { text: string; x0: number; x1: number; y: number; height: number };

/** The x positions separating one column from the next, across a whole page. */
function columnBoundaries(words: PdfWord[]): number[] {
  const heights = words.map((w) => w.height).sort((a, b) => a - b);
  const em = heights[Math.floor(heights.length / 2)] || 8;
  // A gap has to be wider than a word space to be a column boundary. Measured
  // in ems so it holds at any print size: a space is roughly a quarter of one,
  // and the padding either side of a ruled column is far more than this.
  const minGap = Math.max(2, em * 0.7);

  const spans = [...words].sort((a, b) => a.x0 - b.x0);
  const boundaries: number[] = [];
  let reach = spans[0].x1;
  for (const word of spans) {
    if (word.x0 - reach > minGap) boundaries.push((reach + word.x0) / 2);
    reach = Math.max(reach, word.x1);
  }
  return boundaries;
}

/** Words split into the columns those boundaries describe, joined back to text. */
function cellsAcross(line: PdfWord[], boundaries: number[]): string[] {
  const cells: string[] = new Array(boundaries.length + 1).fill("");
  for (const word of line) {
    let column = 0;
    while (column < boundaries.length && word.x0 >= boundaries[column]) column++;
    cells[column] = cells[column] ? `${cells[column]} ${word.text}` : word.text;
  }
  return cells;
}

async function readPdf(file: File): Promise<string[][][]> {
  const pdfjs = await import("pdfjs-dist");
  // Left alone if a host has already pointed it somewhere, so this module can
  // be exercised outside the app's bundler.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const grid: string[][] = [];
  let headingText: string | null = null;

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const words: PdfWord[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.trim();
        if (!text) continue;
        const x0 = item.transform[4];
        words.push({ text, x0, x1: x0 + item.width, y: item.transform[5], height: item.height });
      }
      page.cleanup();
      if (words.length === 0) continue;

      // Words within a fraction of a line of each other are one line. Taken
      // from the type size rather than fixed, so a schedule set in 7pt and one
      // set in 12pt both group correctly.
      words.sort((a, b) => b.y - a.y || a.x0 - b.x0);
      const tolerance = Math.max(1.5, (words[0].height || 8) * 0.5);
      const lines: PdfWord[][] = [];
      let current: PdfWord[] = [];
      let baseline = Number.NaN;
      for (const word of words) {
        if (current.length > 0 && Math.abs(word.y - baseline) > tolerance) {
          lines.push(current);
          current = [];
        }
        if (current.length === 0) baseline = word.y;
        current.push(word);
      }
      if (current.length > 0) lines.push(current);

      const boundaries = columnBoundaries(words);
      for (const line of lines) {
        const cells = cellsAcross(line, boundaries);
        const text = cells.join("\u0000");
        // A printed schedule repeats its heading on every page. Reading it again
        // would put a row of column names in the middle of the register.
        if (headingText === null) headingText = text;
        else if (text === headingText) continue;
        grid.push(cells);
      }
    }
  } finally {
    await task.destroy();
  }

  if (grid.length === 0) throw new UnreadableFileError("no text");
  return [grid];
}

/** What to say when a file of this format could not be read into rows. */
const UNREADABLE: Record<FileFormat, string> = {
  csv: "That file has no readable rows. Check it has a heading row and try again.",
  spreadsheet:
    "No table was found in that workbook. Check that one of its sheets has a heading row with the assets listed underneath.",
  word:
    "No table was found in that Word document. The assets must be laid out in a table, with a heading row — a list written as sentences cannot be read.",
  pdf: "No table could be read out of that PDF. If it is a scan rather than a printed document it holds pictures of words, not words, so it cannot be read — upload the spreadsheet it came from.",
};

const PDF_CAUTION =
  "A PDF has no columns of its own, so these were worked out from the printed layout. Check the preview below before importing — a description long enough to have wrapped onto a second line reads as a row of its own, which will show as a row with no asset name.";

/**
 * Read an upload into headers and rows. Throws `UnreadableFileError` with a
 * message fit to show, whether the file was of an unknown type, broken, or
 * simply empty.
 */
export async function readTable(file: File): Promise<ParsedTable> {
  const format = formatForFile(file);
  if (!format) {
    throw new UnreadableFileError(
      `${ACCEPTED_DESCRIPTION} files can be uploaded. Save this one as a spreadsheet or a CSV and try again.`,
    );
  }

  // Each reader offers the tables it found — a workbook has a sheet each, a
  // Word document a table each — and the first that reads as a register is the
  // one used. "Has anything in it" is not the test: a cover sheet has a title
  // on it and no assets under it.
  let candidates: string[][][];
  try {
    if (format === "csv") candidates = await readCsv(file);
    else if (format === "spreadsheet") candidates = await readSpreadsheet(file);
    else if (format === "word") candidates = await readWord(file);
    else candidates = await readPdf(file);
  } catch (cause) {
    // A reader that threw for its own reasons — a corrupt file, a password, a
    // format that is not what the extension claimed — says the same thing as
    // one that found nothing. The distinction does not help the person.
    throw new UnreadableFileError(UNREADABLE[format], { cause });
  }

  // A reader that produced something unreadable is a different failure from one
  // that produced nothing, and it is worth saying so: the file is damaged, or
  // is not the kind of file its name claims.
  const readable = candidates.filter(looksLikeText);
  if (readable.length === 0 && candidates.length > 0) {
    throw new UnreadableFileError(
      "That file could not be read. It may be damaged, or saved in a different format from the one its name gives.",
    );
  }

  for (const grid of readable) {
    try {
      const { headers, rows } = tableFromGrid(grid);
      return { headers, rows, format, caution: format === "pdf" ? PDF_CAUTION : undefined };
    } catch {
      // Not a table. Try the next sheet, or the next table in the document.
    }
  }
  throw new UnreadableFileError(UNREADABLE[format]);
}
