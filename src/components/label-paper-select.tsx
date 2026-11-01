"use client";

import { useSyncExternalStore, useId } from "react";
import { LABEL_PAPERS, DEFAULT_LABEL_PAPER, readLabelPaper, saveLabelPaper } from "@/lib/label-paper";

const CHANGE_EVENT = "nsuk-label-paper-change";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export default function LabelPaperSelect() {
  const id = useId();
  const paper = useSyncExternalStore(subscribe, readLabelPaper, () => DEFAULT_LABEL_PAPER);
  return (
    <div className="space-y-1 text-left">
      <label htmlFor={id} className="label">Label size (width × height)</label>
      <select
        id={id}
        className="field"
        value={paper.id}
        onChange={(event) => {
          saveLabelPaper(event.target.value);
          window.dispatchEvent(new Event(CHANGE_EVENT));
        }}
      >
        {LABEL_PAPERS.map((option) => (
          <option key={option.id} value={option.id}>{option.width} × {option.height} mm</option>
        ))}
      </select>
      <p className="text-xs text-nsuk-muted">
        One asset per label. Match your printer paper to this size and print at Actual size (100%).
      </p>
    </div>
  );
}
