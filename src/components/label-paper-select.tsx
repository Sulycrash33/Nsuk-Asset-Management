"use client";

export default function LabelPaperSelect() {
  return (
    <div className="space-y-2 text-left">
      <p className="font-semibold text-nsuk-blue">Xprinter XP-365B · 60 × 40 mm labels</p>
      <p className="text-xs text-nsuk-muted">
        One asset per sticker. In the printer properties, set paper width to 60 mm
        and height to 40 mm. In the PDF print window, choose Actual size (100%),
        one page per sheet, and turn off Fit to page. Check the preview before printing a batch.
      </p>
    </div>
  );
}
