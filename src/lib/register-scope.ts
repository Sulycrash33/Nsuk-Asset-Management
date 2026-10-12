import { descendantIds } from "@/lib/tree";
import type { SessionContext } from "@/lib/session";
import { filterDate, filterId, registerTerm, type RegisterFilters } from "@/lib/asset-query";
export function registerScope(params: Record<string, string | string[] | undefined>, session: SessionContext): RegisterFilters {
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const unit = filterId(one("unit")), campus = filterId(one("campus"));
  let unitIds: string[] | null = session.isAdmin ? null : session.scopedUnitIds;
  const chosen = unit ? descendantIds([unit], session.units) : campus ? session.units.filter(u => u.campus_id === campus).map(u => u.id) : null;
  if (chosen) unitIds = unitIds === null ? chosen : chosen.filter(id => unitIds!.includes(id));
  const condition = one("condition");
  return { unitIds, category: filterId(one("category")), condition: ["Working", "Faulty", "Under Repair", "Missing"].includes(condition ?? "") ? condition! : null,
    from: filterDate(one("from")), to: filterDate(one("to")), term: registerTerm(one("q")), sort: one("sort") ?? "" };
}
