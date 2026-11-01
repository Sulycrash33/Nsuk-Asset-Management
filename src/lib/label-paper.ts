/** Label dimensions are in millimetres, width first. No asset data is stored. */
export const LABEL_PAPERS = [
  { id: "60x40", width: 60, height: 40 },
  { id: "80x50", width: 80, height: 50 },
  { id: "100x50", width: 100, height: 50 },
] as const;

export type LabelPaper = (typeof LABEL_PAPERS)[number];
export const DEFAULT_LABEL_PAPER = LABEL_PAPERS[0];
export const LABEL_PAPER_KEY = "nsuk-label-paper";
let unsavedPaper: LabelPaper | null = null;

export function labelPaper(id: string | null): LabelPaper {
  return LABEL_PAPERS.find((paper) => paper.id === id) ?? DEFAULT_LABEL_PAPER;
}

export function readLabelPaper(): LabelPaper {
  if (unsavedPaper) return unsavedPaper;
  try {
    return labelPaper(window.localStorage.getItem(LABEL_PAPER_KEY));
  } catch {
    return DEFAULT_LABEL_PAPER;
  }
}

export function saveLabelPaper(id: string): void {
  const paper = labelPaper(id);
  try {
    window.localStorage.setItem(LABEL_PAPER_KEY, paper.id);
    unsavedPaper = null;
  } catch {
    // Still allow printing at the chosen size when persistent storage is blocked.
    unsavedPaper = paper;
  }
}
