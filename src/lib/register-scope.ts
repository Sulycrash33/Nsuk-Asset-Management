import { descendantIds } from "@/lib/tree";
import type { SessionContext } from "@/lib/session";
import { filterDate, filterId, NEEDS_ATTENTION, registerTerm, type RegisterFilters } from "@/lib/asset-query";
export function registerScope(params: Record<string, string | string[] | undefined>, session: SessionContext): RegisterFilters {
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const unit = filterId(one("unit")), campus = filterId(one("campus"));
  // Every account reads the whole register, so no unit narrowing happens here;
  // row level security decides what is visible.
  const unitIds = unit ? descendantIds([unit], session.units) : campus ? session.units.filter(u => u.campus_id === campus).map(u => u.id) : null;
  const condition = one("condition");
  return { unitIds, category: filterId(one("category")), condition: ["Working", "Faulty", "Under Repair", "Missing", NEEDS_ATTENTION].includes(condition ?? "") ? condition! : null,
    from: filterDate(one("from")), to: filterDate(one("to")), term: registerTerm(one("q")), sort: one("sort") ?? "" };
}
