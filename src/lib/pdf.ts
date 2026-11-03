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
 * Only the asset code is required. The item details print in whatever room is
 * left beside the QR, in order, and are cut off with an ellipsis when it runs
 * out; scanning the QR always shows the full record.
 */
export type LabelInput = {
  barcode: string;
  name?: string | null;
  unitName?: string | null;
  categoryName?: string | null;
  campusName?: string | null;
};

const TITLE_LINES = ["NSUK ASSET", "MANAGEMENT SYSTEM"];

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
  while (cut.length > 1 && doc.getTextWidth(cut + "\u2026") > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + "\u2026";
}

/**
 * Roll-printer PDF, one label per page, laid out as the University asked
 * (3 Nov 2026): the crest at the top followed by "NSUK ASSET MANAGEMENT
 * SYSTEM", then the QR, then the asset code; the item's name and details fill
 * whatever room is left beside the QR. The QR stays 22 mm — measured, smaller
 * failed under wear — so the details give way, never the QR or the code.
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
  const crest = await crestDataUrl();
  // The crest file is 219 x 230 px; keep its proportions.
  const headerTop = 1.5;
  const crestHeight = 8;
  const crestWidth = crest ? (crestHeight * 219) / 230 : 0;
  const crestGap = crest ? 1.5 : 0;
  const qrSize = 22;
  const qrY = headerTop + crestHeight + 0.5;
  const columnX = pad + qrSize + 1;
  const columnWidth = width - columnX - pad;
  const columnBottom = qrY + qrSize - 0.5;

  // The header is the same on every label, so measure it once.
  doc.setFont("helvetica", "bold");
  let titleSize = 9;
  doc.setFontSize(titleSize);
  const titleWidth = Math.max(...TITLE_LINES.map((line) => doc.getTextWidth(line)));
  const headerRoom = width - 2 * pad - crestWidth - crestGap;
  if (titleWidth > headerRoom) titleSize = (titleSize * headerRoom) / titleWidth;
  const headerWidth = crestWidth + crestGap + Math.min(titleWidth, headerRoom);
  const headerX = (width - headerWidth) / 2;

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) doc.addPage([width, height], orientation);
    const label = labels[i];
    doc.setTextColor(...INK);

    // 1. Crest, followed by the system's name. A failed crest fetch leaves the
    // name alone rather than block printing; the alias embeds the image once
    // however many labels there are.
    if (crest) doc.addImage(crest, "PNG", headerX, headerTop, crestWidth, crestHeight, "nsuk-crest");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(titleSize);
    const titleX = headerX + crestWidth + crestGap;
    const firstBaseline = headerTop + crestHeight / 2 - 0.5;
    TITLE_LINES.forEach((line, n) => doc.text(line, titleX, firstBaseline + n * 3.6));

    // 2. QR, with a four-module white quiet zone so nothing can crowd it.
    const qr = await QRCode.toDataURL(label.barcode, {
      margin: 4, width: 480, errorCorrectionLevel: "Q",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    doc.addImage(qr, "PNG", pad, qrY, qrSize, qrSize);

    // 3. Asset code. Never truncated: it must agree with the QR payload.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const codeWidth = doc.getTextWidth(label.barcode);
    if (codeWidth > width - 2 * pad) doc.setFontSize((13 * (width - 2 * pad)) / codeWidth);
    doc.text(label.barcode, width / 2, height - 1.8, { align: "center" });

    // 4. Item details, in order, for as long as there is room beside the QR.
    let y = qrY + 3;
    const detail = (text: string | null | undefined, size: number, maxLines: number) => {
      if (!text) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      const lead = size * 0.3528 * 1.18;
      const room = Math.floor((columnBottom - y) / lead) + 1;
      const lines = doc.splitTextToSize(text, columnWidth) as string[];
      const shown = lines.slice(0, Math.max(0, Math.min(maxLines, room)));
      if (!shown.length) return;
      if (shown.length < lines.length) {
        shown[shown.length - 1] = fitText(doc, shown[shown.length - 1] + "\u2026", columnWidth);
      }
      for (const line of shown) {
        doc.text(line, columnX, y);
        y += lead;
      }
      y += 0.6;
    };
    detail(label.name, 9, 2);
    const unit = label.unitName?.split("\u203a").pop()?.trim() || label.unitName;
    detail(unit, 7.5, 2);
    detail(label.categoryName, 7.5, 1);
    detail(label.campusName, 7.5, 1);
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
