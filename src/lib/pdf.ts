"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import type { AssetWithRefs } from "./types";
import { LABEL_PAPER } from "./label-paper";

const BLUE: [number, number, number] = [26, 60, 110];
const GOLD: [number, number, number] = [242, 183, 5];
const INK: [number, number, number] = [17, 17, 17];

/**
 * A label carries the University's crest and name, the QR and the asset code —
 * nothing about the item itself. The item name and its unit were taken off at
 * the University's request (3 Nov 2026); scanning the QR shows them.
 */
export type LabelInput = {
  barcode: string;
};

const UNIVERSITY_LINES = ["NASARAWA STATE", "UNIVERSITY, KEFFI"];

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


/**
 * Roll-printer PDF, one label per page: the QR on the left at 22 mm (measured:
 * smaller failed under wear), the crest and the University's name beside it,
 * and the asset code in full across the bottom.
 */
export async function generateLabelSheet(
  labels: LabelInput[],
): Promise<jsPDF> {
  if (!labels.length) throw new Error("Select at least one asset to label.");
  const { width, height } = LABEL_PAPER;
  const orientation = width >= height ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "mm", format: [width, height], orientation });
  doc.setProperties({ title: "NSUK asset labels", subject: `${width} x ${height} mm, one asset per page` });
  const pad = 2;
  const qrSize = 22;
  const qrY = 5;
  const columnX = pad + qrSize + 1;
  const columnWidth = width - columnX - pad;
  const columnCentre = columnX + columnWidth / 2;
  // The crest file is 219 x 230 px; keep its proportions.
  const crestHeight = 12;
  const crestWidth = (crestHeight * 219) / 230;
  const crest = await crestDataUrl();

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) doc.addPage([width, height], orientation);
    const label = labels[i];
    doc.setTextColor(...INK);

    // Include a four-module white quiet zone so nothing can crowd the QR.
    const qr = await QRCode.toDataURL(label.barcode, {
      margin: 4, width: 480, errorCorrectionLevel: "Q",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    doc.addImage(qr, "PNG", pad, qrY, qrSize, qrSize);

    // A failed crest fetch leaves the name alone rather than block printing.
    // The alias embeds the image once however many labels are printed.
    let nameY = qrY + 7;
    if (crest) {
      doc.addImage(crest, "PNG", columnCentre - crestWidth / 2, qrY + 0.5, crestWidth, crestHeight, "nsuk-crest");
      nameY = qrY + 0.5 + crestHeight + 3.6;
    }
    doc.setFont("helvetica", "bold");
    let nameSize = 9;
    doc.setFontSize(nameSize);
    const widest = Math.max(...UNIVERSITY_LINES.map((line) => doc.getTextWidth(line)));
    if (widest > columnWidth) {
      nameSize = (nameSize * columnWidth) / widest;
      doc.setFontSize(nameSize);
    }
    UNIVERSITY_LINES.forEach((line, n) => {
      doc.text(line, columnCentre, nameY + n * 3.6, { align: "center" });
    });

    // Never truncate the identifier: it must agree with the QR payload.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const codeWidth = doc.getTextWidth(label.barcode);
    if (codeWidth > width - 2 * pad) doc.setFontSize(14 * (width - 2 * pad) / codeWidth);
    doc.text(label.barcode, width / 2, height - 2.5, { align: "center" });
  }
  return doc;
}

/** Single and batch downloads share the exact 60 x 40 mm roll size. */
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
