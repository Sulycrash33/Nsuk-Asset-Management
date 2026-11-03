"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AssetWithRefs } from "./types";
import { readLabelSize, type LabelSize } from "./label-paper";

const BLUE: [number, number, number] = [26, 60, 110];
const GOLD: [number, number, number] = [242, 183, 5];
const INK: [number, number, number] = [17, 17, 17];

/**
 * A label carries the crest, the system's name, the QR and the asset code —
 * nothing about the item itself (the University's instruction, 3 Nov 2026).
 * Scanning the QR shows the full record.
 */
export type LabelInput = {
  barcode: string;
};

const TITLE = "NSUK ASSET MANAGEMENT SYSTEM";

/**
 * The University crest as a data URL, fetched once and reused. jsPDF cannot
 * take a URL directly, and printed asset tags carry more authority with the
 * crest on them. Returns null if it cannot be loaded, so a failed fetch never
 * blocks someone from printing labels.
 */
let crestPromise: Promise<string | null> | null = null;

function crestDataUrl(): Promise<string | null> {
  crestPromise ??= fetch("/nsuk-crest.png")
    .then((response) => (response.ok ? response.blob() : Promise.reject()))
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
  return crestPromise;
}


/** QR print size that survived wear in measurement; 17 mm failed every time. */
export const DURABLE_QR_MM = 22;

export type LabelLayout = {
  width: number;
  height: number;
  crest: { x: number; y: number; width: number; height: number } | null;
  title: { size: number; baseline: number } | null;
  qr: { x: number; y: number; size: number };
  code: { size: number; baseline: number; maxWidth: number };
  /** The QR is at least DURABLE_QR_MM. */
  durable: boolean;
};

/** Helvetica Bold cap height is 718/1000 of the em; 1 pt = 0.3528 mm. */
const capHeight = (pt: number) => pt * 0.3528 * 0.718;

let titleWidthPerPt: number | null = null;
function titleWidth(pt: number): number {
  if (titleWidthPerPt === null) {
    const measure = new jsPDF({ unit: "mm" });
    measure.setFont("helvetica", "bold");
    measure.setFontSize(10);
    titleWidthPerPt = measure.getTextWidth(TITLE) / 10;
  }
  return titleWidthPerPt * pt;
}

/**
 * Where everything goes on a sticker of any size, centred top to bottom in the
 * order the University asked for: crest, system name, QR, asset code. Sizes
 * scale from the approved 60 x 40 mm layout, and the QR takes whatever room is
 * left. The QR comes first: when a small sticker cannot hold a 22 mm QR with
 * everything else, the name is left off, then the crest, and only then does
 * the QR go below 22 mm (`durable: false`).
 */
export function labelLayout(size: LabelSize, withCrest = true): LabelLayout {
  const { width, height } = size;
  const s = Math.min(3, Math.max(0.4, Math.min(width / 60, height / 40)));
  const padX = Math.max(1.2, 2 * s);
  const top = Math.max(0.8, s);
  const bottom = Math.max(0.8, 1.5 * s);
  const gap = 0.6 * s;
  const crestHeight = 7 * s;
  const titleSize = Math.min(8 * s, (width - 2 * padX) / titleWidth(1));
  const titleHeight = capHeight(titleSize);
  const codeSize = 11 * s;
  const codeHeight = capHeight(codeSize);
  const codeGap = 2.4 * s;
  const fixed = top + codeGap + codeHeight + bottom;

  const options = [
    { crest: withCrest, title: true },
    { crest: withCrest, title: false },
    { crest: false, title: true },
    { crest: false, title: false },
  ];
  const sized = options.map((option) => {
    const used = fixed
      + (option.crest ? crestHeight + gap : 0)
      + (option.title ? titleHeight + gap : 0);
    return { ...option, used, qr: Math.min(width - 2 * padX, height - used) };
  });
  // Tolerate float noise so 60 x 40 mm keeps its exact 22 mm QR.
  const chosen = sized.find((option) => option.qr >= DURABLE_QR_MM - 0.05) ?? sized[sized.length - 1];

  // When the QR is limited by the width, not the height (a tall sticker), let
  // the crest use some of the spare height, then centre the stack.
  let spare = Math.max(0, height - chosen.used - chosen.qr);
  const grownCrest = chosen.crest ? crestHeight + Math.min(spare * 0.5, crestHeight * 2) : 0;
  spare -= grownCrest - (chosen.crest ? crestHeight : 0);
  let y = top + spare / 2;
  let crest: LabelLayout["crest"] = null;
  if (chosen.crest) {
    const grownWidth = (grownCrest * 219) / 230;
    crest = { x: (width - grownWidth) / 2, y, width: grownWidth, height: grownCrest };
    y += grownCrest + gap;
  }
  let title: LabelLayout["title"] = null;
  if (chosen.title) {
    title = { size: titleSize, baseline: y + titleHeight };
    y += titleHeight + gap;
  }
  const qr = { x: (width - chosen.qr) / 2, y, size: chosen.qr };
  y += chosen.qr + codeGap;
  return {
    width,
    height,
    crest,
    title,
    qr,
    code: { size: codeSize, baseline: y + codeHeight, maxWidth: width - 2 * padX },
    durable: chosen.qr >= DURABLE_QR_MM - 0.05,
  };
}

/**
 * Draw the QR as filled squares instead of embedding a picture of it: a label
 * then costs a few kilobytes rather than about 1 MB, and the modules stay sharp
 * at any sticker size. The four-module white quiet zone sits inside the box,
 * exactly as the picture's margin did, so `labelLayout` sizes are unchanged.
 */
function drawQr(doc: jsPDF, text: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "Q" });
  const quiet = 4;
  const cell = size / (modules.size + 2 * quiet);
  // A hair of overlap between rows stops viewers drawing seams between them.
  const overlap = Math.min(0.03, cell * 0.04);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, "F");
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < modules.size; row++) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      let end = col;
      while (end < modules.size && modules.get(row, end)) end++;
      const lastRow = row === modules.size - 1;
      doc.rect(x + (quiet + col) * cell, y + (quiet + row) * cell, (end - col) * cell, cell + (lastRow ? 0 : overlap), "F");
      col = end;
    }
  }
}

/**
 * Label PDF, one label per page, at the sticker size chosen on this device
 * (60 x 40 mm unless changed), laid out by `labelLayout`.
 */
export async function generateLabelSheet(
  labels: LabelInput[],
  size: LabelSize = readLabelSize(),
): Promise<jsPDF> {
  if (!labels.length) throw new Error("Select at least one asset to label.");
  const { width, height } = size;
  const orientation = width >= height ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "mm", format: [width, height], orientation, compress: true });
  doc.setProperties({ title: "NSUK asset labels", subject: `${width} x ${height} mm, one asset per page` });
  const crest = await crestDataUrl();
  const layout = labelLayout(size, crest !== null);

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) doc.addPage([width, height], orientation);
    const label = labels[i];
    doc.setTextColor(...INK);

    // A failed crest fetch leaves it out rather than block printing; the alias
    // embeds the image once however many labels there are.
    if (crest && layout.crest) {
      const c = layout.crest;
      doc.addImage(crest, "PNG", c.x, c.y, c.width, c.height, "nsuk-crest", "FAST");
    }
    if (layout.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(layout.title.size);
      doc.text(TITLE, width / 2, layout.title.baseline, { align: "center" });
    }

    drawQr(doc, label.barcode, layout.qr.x, layout.qr.y, layout.qr.size);

    // Asset code under the QR. Never truncated: it must agree with the QR.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(layout.code.size);
    const codeWidth = doc.getTextWidth(label.barcode);
    if (codeWidth > layout.code.maxWidth) doc.setFontSize((layout.code.size * layout.code.maxWidth) / codeWidth);
    doc.text(label.barcode, width / 2, layout.code.baseline, { align: "center" });
  }
  return doc;
}

/** Single and batch downloads share the chosen sticker size. */
export async function generateSingleLabel(label: LabelInput, size?: LabelSize): Promise<jsPDF> {
  return generateLabelSheet([label], size);
}

/** Printable asset register for audits / Bursary sign-off. */
export async function generateRegisterPdf(
  assets: AssetWithRefs[],
  opts: { unitName: string; campusName?: string | null; generatedBy?: string | null },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const crest = await crestDataUrl();
  const total = assets.reduce((sum, a) => sum + Number(a.value ?? 0), 0);

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, 297, 26, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, 297, 1.5, "F");

  const titleX = crest ? 32 : 12;
  if (crest) {
    doc.addImage(crest, "PNG", 11, 3, 19, 20);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Nasarawa State University, Keffi", titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Asset Register: ${opts.unitName}`, titleX, 19);

  doc.setFontSize(8);
  const stamp = new Date().toLocaleString("en-NG");
  doc.text(
    [opts.campusName, `Generated ${stamp}`, opts.generatedBy ? `By ${opts.generatedBy}` : null]
      .filter(Boolean)
      .join("   |   "),
    285,
    19,
    { align: "right" },
  );

  autoTable(doc, {
    startY: 34,
    head: [["#", "Asset code", "Asset", "Category", "Unit", "Location", "Condition", "Serial", "Value (NGN)"]],
    body: assets.map((a, i) => [
      String(i + 1),
      a.barcode,
      a.name,
      a.asset_categories?.name ?? "—",
      a.org_units?.name ?? "—",
      a.location ?? "—",
      a.condition,
      a.serial_number ?? "—",
      Number(a.value ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 }),
    ]),
    foot: [["", "", "", "", "", "", "", "TOTAL", total.toLocaleString("en-NG", { minimumFractionDigits: 2 })]],
    styles: { fontSize: 8, cellPadding: 1.8, textColor: INK },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: [250, 247, 240], textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    columnStyles: { 0: { cellWidth: 10 }, 8: { halign: "right" } },
    margin: { left: 10, right: 10 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`Page ${page}`, 285, 203, { align: "right" });
    },
  });

  return doc;
}

export type ScheduleGroup = {
  /** "Faculty of Administration", "Keffi (Main)" and so on. */
  title: string;
  assets: AssetWithRefs[];
};

/**
 * The physical asset schedule: the register broken into faculties, schools or
 * campuses, each with its own subtotal, and a grand total at the end.
 *
 * This is the document a Bursary or an auditor asks for. The plain register
 * answers "what do we have"; the schedule answers "what does each part of the
 * University hold, and what is it worth".
 */
export async function generateSchedulePdf(
  groups: ScheduleGroup[],
  opts: {
    groupedBy: string;
    scopeName: string;
    campusName?: string | null;
    generatedBy?: string | null;
  },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const crest = await crestDataUrl();

  const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2 });
  const grandCount = groups.reduce((n, g) => n + g.assets.length, 0);
  const grandValue = groups.reduce(
    (sum, g) => sum + g.assets.reduce((s, a) => s + Number(a.value ?? 0), 0),
    0,
  );

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, 297, 26, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 26, 297, 1.5, "F");

  const titleX = crest ? 32 : 12;
  if (crest) doc.addImage(crest, "PNG", 11, 3, 19, 20);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Nasarawa State University, Keffi", titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Physical Asset Schedule by ${opts.groupedBy}: ${opts.scopeName}`, titleX, 19);

  doc.setFontSize(8);
  const stamp = new Date().toLocaleString("en-NG");
  doc.text(
    [opts.campusName, `Generated ${stamp}`, opts.generatedBy ? `By ${opts.generatedBy}` : null]
      .filter(Boolean)
      .join("   |   "),
    285,
    19,
    { align: "right" },
  );

  let cursorY = 34;

  for (const group of groups) {
    const groupValue = group.assets.reduce((sum, a) => sum + Number(a.value ?? 0), 0);

    autoTable(doc, {
      startY: cursorY,
      head: [
        [
          {
            content: `${group.title}   (${group.assets.length} item${group.assets.length === 1 ? "" : "s"})`,
            colSpan: 7,
            styles: { halign: "left" as const },
          },
          {
            content: money(groupValue),
            colSpan: 1,
            styles: { halign: "right" as const },
          },
        ],
        ["#", "Asset code", "Asset", "Category", "Unit", "Location", "Condition", "Value (NGN)"],
      ],
      body: group.assets.map((a, i) => [
        String(i + 1),
        a.barcode,
        a.name,
        a.asset_categories?.name ?? "-",
        a.org_units?.name ?? "-",
        a.location ?? "-",
        a.condition,
        money(Number(a.value ?? 0)),
      ]),
      styles: { fontSize: 8, cellPadding: 1.8, textColor: INK },
      headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 247, 240] },
      columnStyles: { 0: { cellWidth: 10 }, 7: { halign: "right" } },
      margin: { left: 10, right: 10 },
      // A group heading alone at the foot of a page helps nobody.
      rowPageBreak: "avoid",
      didDrawPage: () => {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`Page ${doc.getNumberOfPages()}`, 285, 203, { align: "right" });
      },
    });

    const after = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    cursorY = after + 8;
    if (cursorY > 175) {
      doc.addPage();
      cursorY = 20;
    }
  }

  // The figure the University signs off against.
  autoTable(doc, {
    startY: cursorY,
    body: [
      [
        `TOTAL across ${groups.length} ${opts.groupedBy.toLowerCase()}${groups.length === 1 ? "" : "s"}`,
        `${grandCount.toLocaleString()} items`,
        money(grandValue),
      ],
    ],
    styles: { fontSize: 10, cellPadding: 3, fontStyle: "bold", textColor: INK },
    bodyStyles: { fillColor: [250, 247, 240] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left: 10, right: 10 },
  });

  return doc;
}

/** Trigger a browser download for a generated document. */
export function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
