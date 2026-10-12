export type DateOrder = "ymd" | "dmy" | "mdy";

/** Date-only parsing, independent of browser locale and time zone. */
export function parseAssetDate(input: string, order: DateOrder = "ymd"): string | null {
  const text = input.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  let year: number, month: number, day: number;
  if (iso) [, year, month, day] = iso.map(Number);
  else {
    if (order === "ymd") return null;
    const parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (!parts) return null;
    year = Number(parts[3]);
    day = Number(parts[order === "dmy" ? 1 : 2]);
    month = Number(parts[order === "dmy" ? 2 : 1]);
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseAssetValue(input: string): number | null {
  const raw = input.trim();
  if (!raw) return 0;
  const text = raw.replace(/^₦\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 && value <= 999999999999.99 ? value : null;
}

export async function fileFingerprint(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Same source row and destination unit keep the same key on a file retry. */
export async function importRowKey(fileHash: string, index: number, unitId: string): Promise<string> {
  return fileFingerprint(new TextEncoder().encode(JSON.stringify([fileHash, index, unitId])).buffer);
}
