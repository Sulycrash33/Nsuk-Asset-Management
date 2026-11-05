/**
 * The asset code an asset would be given today, without its running number:
 * `NSU/<faculty or office>/<unit>/<item type>`. Mirrors `next_barcode` in the
 * database, which is the authority; this only decides whether to offer an
 * administrator a new code after a unit or category was corrected.
 */
type UnitLike = { id: string; parent_id: string | null; short_code: string | null };

const orGen = (code: string | null | undefined) => (code && code.trim() ? code : "GEN");

export function currentCodePrefix(
  unitId: string,
  units: UnitLike[],
  categoryCode: string | null | undefined,
): string | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  const unit = byId.get(unitId);
  if (!unit) return null;
  let top = unit;
  const seen = new Set<string>([top.id]);
  while (top.parent_id && byId.has(top.parent_id) && !seen.has(top.parent_id)) {
    top = byId.get(top.parent_id)!;
    seen.add(top.id);
  }
  // An asset recorded straight onto a faculty has no department of its own.
  const self = top.id === unit.id ? "GEN" : orGen(unit.short_code);
  const item = categoryCode && categoryCode.trim() ? categoryCode : "XX";
  return `NSU/${orGen(top.short_code)}/${self}/${item}`;
}

/** The code without its running number. */
export function codePrefix(barcode: string): string {
  return barcode.replace(/\/[^/]+$/, "");
}

/**
 * True when the asset's code names a unit or item type it no longer has.
 * Unknown units or a category whose code is not known answer false: the
 * database refuses a pointless re-issue anyway.
 */
export function codeIsOutOfDate(
  barcode: string,
  unitId: string,
  units: UnitLike[],
  categoryCode: string | null | undefined,
): boolean {
  const now = currentCodePrefix(unitId, units, categoryCode);
  return now !== null && codePrefix(barcode) !== now;
}
