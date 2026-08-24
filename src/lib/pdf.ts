"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AssetWithRefs } from "./types";

const BLUE: [number, number, number] = [26, 60, 110];
const GOLD: [number, number, number] = [242, 183, 5];
const INK: [number, number, number] = [17, 17, 17];

export type LabelInput = {
  barcode: string;
  name: string;
  unitName: string;
  categoryName?: string | null;
  campusName?: string | null;
};

/**
 * The asset code as a QR symbol.
 *
 * QR rather than Code 128 because these labels are read with ordinary phone
 * cameras and have to survive years on dusty equipment. A QR reads at an angle
 * and in poor light, and error correction level Q means the symbol still
 * decodes with about a quarter of it scratched, scuffed or peeled away. A
 * damaged Code 128 simply stops reading.
 *
 * The payload is the printed code and nothing else, so what a scanner returns
 * is exactly what a person would type.
 */
async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 480,
    errorCorrectionLevel: "Q",
    color: { dark: "#111111", light: "#FFFFFF" },
  });
}

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


/** Shrink a line until it fits the width it has been given. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 4 && doc.getTextWidth(cut + "\u2026") > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + "\u2026";
}

/**
 * Printable label sheet: 2 columns x 5 rows of 95x55mm labels on A4.
 *
 * The layout is the one the University approved. Crest and system name at the
 * head, the Code 128 symbol across the middle, the readable code beneath it,
 * then the item and where it belongs. What is printed under the bars is
 * exactly what the bars encode, so a scan and a typed entry agree.
 */
export async function generateLabelSheet(labels: LabelInput[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const crest = await crestDataUrl();

  const cols = 2;
  const rows = 5;
  const labelW = 95;
  const labelH = 55;
  const marginX = (210 - cols * labelW) / 2;
  const marginY = (297 - rows * labelH) / 2;
  const perPage = cols * rows;
  const pad = 4;

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();

    const slot = i % perPage;
    const x = marginX + (slot % cols) * labelW;
    const y = marginY + Math.floor(slot / cols) * labelH;
    const label = labels[i];
    const centre = x + labelW / 2;
    const innerW = labelW - 2 * pad;

    // A dashed boundary to cut along.
    doc.setDrawColor(190, 200, 215);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, labelW, labelH);
    doc.setLineDashPattern([], 0);

    // Gold rule across the head, the University's colour.
    doc.setFillColor(...GOLD);
    doc.rect(x + pad, y + pad, innerW, 1.2, "F");

    if (crest) doc.addImage(crest, "PNG", centre - 4, y + 6, 8, 8);

    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text("NSUK ASSET MANAGEMENT SYSTEM", centre, y + 17.4, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.setTextColor(90, 97, 110);
    doc.text("Nasarawa State University, Keffi", centre, y + 20.4, { align: "center" });

    // The symbol is printed large on purpose. A QR is read by recovering whole
    // modules, so a scratch of a given size destroys more of a small symbol
    // than a large one: measured against a fixed speck of wear, 17mm failed
    // every time where 22mm mostly survived. The header was tightened to make
    // the room for it.
    const qr = await qrDataUrl(label.barcode);
    const qrSize = 22;
    doc.addImage(qr, "PNG", centre - qrSize / 2, y + 21.5, qrSize, qrSize);

    // The code in words, monospaced, so it can be read aloud or typed when a
    // label is too damaged to scan.
    doc.setFont("courier", "bold");
    doc.setFontSize(9.2);
    doc.setTextColor(...INK);
    doc.text(label.barcode, centre, y + 47.2, { align: "center" });

    doc.setDrawColor(201, 210, 224);
    doc.setLineWidth(0.3);
    doc.line(x + pad, y + 48.6, x + labelW - pad, y + 48.6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...INK);
    doc.text(fitText(doc, label.name, innerW), centre, y + 51.2, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.setTextColor(90, 97, 110);
    const unitLeaf = label.unitName.split("\u203a").pop()?.trim() || label.unitName;
    const footer = [unitLeaf, label.campusName, label.categoryName]
      .filter(Boolean)
      .join("  \u2022  ");
    doc.text(fitText(doc, footer, innerW), centre, y + 53.6, { align: "center" });
  }

  return doc;
}


/** Single-label PDF, used straight after one-by-one asset entry. */
export async function generateSingleLabel(label: LabelInput): Promise<jsPDF> {
  return generateLabelSheet([label]);
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
    head: [["#", "Barcode", "Asset", "Category", "Unit", "Location", "Condition", "Serial", "Value (NGN)"]],
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
