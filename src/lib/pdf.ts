"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { encodeCode128, moduleCount } from "./code128";
import type { AssetWithRefs } from "./types";

const BLUE: [number, number, number] = [26, 60, 110];
const GOLD: [number, number, number] = [242, 183, 5];
const INK: [number, number, number] = [17, 17, 17];

export type LabelInput = {
  barcode: string;
  name: string;
  unitName: string;
  categoryName?: string | null;
};

/** Draw a Code 128 symbol as vector rects so it stays scannable at any zoom. */
function drawBarcode(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const modules = encodeCode128(text);
  const unit = width / moduleCount(modules);
  let cursor = x;
  doc.setFillColor(...INK);
  for (const m of modules) {
    const w = m.width * unit;
    if (m.bar) doc.rect(cursor, y, w, height, "F");
    cursor += w;
  }
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

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#FFFFFF" },
  });
}

/**
 * Printable label sheet — 2 columns x 6 rows of 90x42mm labels on A4.
 * Each label carries the QR, the Code 128 barcode and the readable code, so a
 * phone camera, a handheld scanner or a person can all identify the asset.
 */
export async function generateLabelSheet(labels: LabelInput[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const crest = await crestDataUrl();

  const cols = 2;
  const rows = 6;
  const labelW = 90;
  const labelH = 42;
  const marginX = (210 - cols * labelW) / 2;
  const marginY = (297 - rows * labelH) / 2;
  const perPage = cols * rows;

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();

    const slot = i % perPage;
    const x = marginX + (slot % cols) * labelW;
    const y = marginY + Math.floor(slot / cols) * labelH;
    const label = labels[i];

    // Card outline + gold spine so labels are easy to cut and spot on an item.
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.rect(x + 1.5, y + 1.5, labelW - 3, labelH - 3);
    doc.setFillColor(...GOLD);
    doc.rect(x + 1.5, y + 1.5, 2, labelH - 3, "F");

    const innerX = x + 6;
    const innerW = labelW - 10.5;

    // The crest sits above the barcode, so the header text is inset to clear it.
    const textX = crest ? innerX + 10 : innerX;
    const headerW = innerW - 24 - (crest ? 10 : 0);

    if (crest) {
      doc.addImage(crest, "PNG", x + 5, y + 3.5, 8.6, 9);
    }

    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("NSUK ASSET REGISTER", textX, y + 6.5);

    doc.setTextColor(...INK);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(label.name, headerW)[0] ?? "", textX, y + 11.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    const unitLeaf = label.unitName.split("\u203a").pop()?.trim() || label.unitName;
    doc.text(
      doc.splitTextToSize(
        [unitLeaf, label.categoryName].filter(Boolean).join("  \u2022  "),
        headerW,
      )[0] ?? "",
      textX,
      y + 15.5,
    );

    // QR sits on the right so the barcode gets the full label width on the left.
    const qr = await qrDataUrl(label.barcode);
    doc.addImage(qr, "PNG", x + labelW - 24, y + 6, 19, 19);

    drawBarcode(doc, label.barcode, innerX, y + 19, innerW - 24, 11);

    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(label.barcode, innerX, y + 35.5);
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
  doc.text(`Asset Register — ${opts.unitName}`, titleX, 19);

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

/** Trigger a browser download for a generated document. */
export function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
