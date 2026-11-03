/**
 * Label sticker size, in millimetres, width first. The label lays itself out
 * to whatever stock is in the printer (3 Nov 2026); 60 x 40 mm, the supplied
 * Xprinter XP-365B's stock, stays the default. The choice is remembered per
 * browser and holds no asset data.
 */
export type LabelSize = { width: number; height: number };

export const DEFAULT_LABEL_SIZE: LabelSize = { width: 60, height: 40 };

/** Common thermal and sheet label stock. Anything else is a custom size. */
export const LABEL_SIZE_PRESETS: readonly LabelSize[] = [
  { width: 40, height: 30 },
  { width: 50, height: 25 },
  { width: 50, height: 30 },
  { width: 58, height: 40 },
  { width: 60, height: 40 },
  { width: 70, height: 50 },
  { width: 80, height: 50 },
  { width: 100, height: 50 },
  { width: 100, height: 75 },
  { width: 100, height: 100 },
  { width: 100, height: 150 },
];

/** Below this a QR and its code cannot both be read; above it is a poster. */
export const LABEL_SIZE_LIMITS = { min: 20, max: 300 } as const;

/**
 * A new key on purpose: before #65 the browser kept a choice of three sizes
 * under "nsuk-label-paper", and an old value there must not quietly come back.
 */
export const LABEL_SIZE_KEY = "nsuk-label-size";

export function labelSizeId(size: LabelSize): string {
  return `${size.width}x${size.height}`;
}

/** Parse "WxH" in millimetres; anything malformed or out of range is null. */
export function parseLabelSize(value: string | null | undefined): LabelSize | null {
  const match = /^(\d{1,3}(?:\.\d)?)x(\d{1,3}(?:\.\d)?)$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const { min, max } = LABEL_SIZE_LIMITS;
  if (!(width >= min && width <= max && height >= min && height <= max)) return null;
  return { width, height };
}

// Holds the choice when browser storage is blocked, so printing still uses it.
let unsaved: string | null = null;
const listeners = new Set<() => void>();

function storedId(): string {
  if (unsaved) return unsaved;
  try {
    const value = window.localStorage.getItem(LABEL_SIZE_KEY);
    return parseLabelSize(value) ? (value as string) : labelSizeId(DEFAULT_LABEL_SIZE);
  } catch {
    return labelSizeId(DEFAULT_LABEL_SIZE);
  }
}

/** The size labels print at now. Safe outside a browser: it returns the default. */
export function readLabelSize(): LabelSize {
  if (typeof window === "undefined") return DEFAULT_LABEL_SIZE;
  return parseLabelSize(storedId()) ?? DEFAULT_LABEL_SIZE;
}

export function saveLabelSize(size: LabelSize): void {
  const id = labelSizeId(size);
  if (!parseLabelSize(id)) return;
  try {
    window.localStorage.setItem(LABEL_SIZE_KEY, id);
    unsaved = null;
  } catch {
    unsaved = id;
  }
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: the chosen size as a stable "WxH" string. */
export function subscribeLabelSize(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LABEL_SIZE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function labelSizeSnapshot(): string {
  return storedId();
}

export function labelSizeServerSnapshot(): string {
  return labelSizeId(DEFAULT_LABEL_SIZE);
}
