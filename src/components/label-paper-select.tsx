"use client";

import { useState, useSyncExternalStore } from "react";
import {
  LABEL_SIZE_LIMITS,
  LABEL_SIZE_PRESETS,
  labelSizeId,
  labelSizeServerSnapshot,
  labelSizeSnapshot,
  parseLabelSize,
  saveLabelSize,
  subscribeLabelSize,
  DEFAULT_LABEL_SIZE,
} from "@/lib/label-paper";
import { DURABLE_QR_MM, labelLayout } from "@/lib/pdf";

const CUSTOM = "custom";
const mm = (value: number) => `${Number(value.toFixed(1))}`;

/**
 * Sticker size for every label printed on this device. The label lays itself
 * out to the size chosen here; this also says what that size leaves off.
 */
export default function LabelPaperSelect() {
  const current = useSyncExternalStore(subscribeLabelSize, labelSizeSnapshot, labelSizeServerSnapshot);
  const size = parseLabelSize(current) ?? DEFAULT_LABEL_SIZE;
  const isPreset = LABEL_SIZE_PRESETS.some((preset) => labelSizeId(preset) === current);

  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ width: String(size.width), height: String(size.height) });
  // Follow a size chosen elsewhere (another tab, a preset) into the custom fields.
  const [lastSeen, setLastSeen] = useState(current);
  if (current !== lastSeen) {
    setLastSeen(current);
    setDraft({ width: String(size.width), height: String(size.height) });
  }

  const showCustom = customOpen || !isPreset;
  const draftSize = parseLabelSize(`${draft.width}x${draft.height}`);
  const layout = labelLayout(size);
  const leftOff = [!layout.crest && "the logo", !layout.title && "the title"].filter(Boolean) as string[];
  const { min, max } = LABEL_SIZE_LIMITS;

  function choose(value: string) {
    if (value === CUSTOM) {
      setCustomOpen(true);
      return;
    }
    const preset = parseLabelSize(value);
    if (preset) {
      setCustomOpen(false);
      saveLabelSize(preset);
    }
  }

  function edit(field: "width" | "height", value: string) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    const parsed = parseLabelSize(`${next.width}x${next.height}`);
    if (parsed) saveLabelSize(parsed);
  }

  return (
    <div className="space-y-2 text-left">
      <label className="label" htmlFor="label-size">
        Label size
      </label>
      <select
        id="label-size"
        className="field"
        value={showCustom ? CUSTOM : current}
        onChange={(event) => choose(event.target.value)}
      >
        {LABEL_SIZE_PRESETS.map((preset) => (
          <option key={labelSizeId(preset)} value={labelSizeId(preset)}>
            {preset.width} × {preset.height} mm
            {labelSizeId(preset) === labelSizeId(DEFAULT_LABEL_SIZE) ? " (Xprinter XP-365B)" : ""}
          </option>
        ))}
        <option value={CUSTOM}>Custom size…</option>
      </select>

      {showCustom && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="label-width">Width (mm)</label>
            <input
              id="label-width"
              className="field"
              inputMode="decimal"
              value={draft.width}
              onChange={(event) => edit("width", event.target.value)}
            />
          </div>
          <span className="pb-2 text-nsuk-muted">×</span>
          <div className="flex-1">
            <label className="label" htmlFor="label-height">Height (mm)</label>
            <input
              id="label-height"
              className="field"
              inputMode="decimal"
              value={draft.height}
              onChange={(event) => edit("height", event.target.value)}
            />
          </div>
        </div>
      )}
      {showCustom && !draftSize && (
        <p role="alert" className="text-xs text-nsuk-danger">
          Enter a width and height between {min} and {max} mm. Labels keep printing at{" "}
          {size.width} × {size.height} mm until then.
        </p>
      )}

      <p className="text-xs text-nsuk-muted">
        QR prints at {mm(layout.qr.size)} mm.
        {leftOff.length > 0 && ` To keep it at ${DURABLE_QR_MM} mm or more, this size leaves off ${leftOff.join(" and ")}.`}
      </p>
      {!layout.durable && (
        <p role="alert" className="text-xs font-semibold text-nsuk-danger">
          Below {DURABLE_QR_MM} mm a worn QR stops scanning sooner. Use a larger sticker if you can.
        </p>
      )}
      <p className="text-xs text-nsuk-muted">
        One asset per sticker. In the printer properties, set paper width to {size.width} mm
        and height to {size.height} mm. In the PDF print window, choose Actual size (100%),
        one page per sheet, and turn off Fit to page. Check the preview before printing a batch.
      </p>
    </div>
  );
}
